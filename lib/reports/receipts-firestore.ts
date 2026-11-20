import {
  collection,
  doc,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  QueryDocumentSnapshot,
  startAfter,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { sanitizeForFirestore } from '@/lib/firestore-transactions';
import { getSaoPauloDateKey, SAO_PAULO_TZ } from '@/lib/formatters';
import { addDaysToDateKey } from './aggregate';
import {
  Comanda,
  GroupRental,
  PaymentMethod,
  ReceiptDocument,
  ReceiptKind,
  ReceiptOrigin,
} from '@/lib/types';
import {
  buildDeterministicReceiptId,
  buildReceiptLines,
  ReceiptIssue,
  ReceiptLine,
} from './receipts';

const VALID_METHODS = new Set<PaymentMethod>(['dinheiro', 'pix', 'debito', 'credito']);
const VALID_ORIGINS = new Set<ReceiptOrigin>(['comanda', 'locacao']);
const VALID_KINDS = new Set<ReceiptKind>(['recebimento', 'estorno']);

export interface RawReceiptDoc {
  id: string;
  data: Record<string, unknown>;
}

export interface PageFetchResult<T> {
  items: T[];
  hasMore: boolean;
}

/**
 * Driver genérico de paginação exaustiva: busca TODAS as páginas até o fim do intervalo,
 * nunca aplicando limit silencioso sobre o resultado final.
 */
export async function paginateAll<T, C = unknown>(
  fetchPage: (cursor: C | null, pageSize: number) => Promise<{
    items: T[];
    nextCursor: C | null;
    rawCount: number;
  }>,
  pageSize: number = 500
): Promise<{ items: T[]; pagesFetched: number }> {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const collected: T[] = [];
  let cursor: C | null = null;
  let pagesFetched = 0;

  while (true) {
    const page = await fetchPage(cursor, safePageSize);
    pagesFetched += 1;
    collected.push(...page.items);

    if (page.rawCount < safePageSize || page.nextCursor === null) {
      break;
    }
    cursor = page.nextCursor;
  }

  return { items: collected, pagesFetched };
}

function parseFirestoreDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  if (typeof raw === 'object') {
    const candidate = raw as { toDate?: () => Date; seconds?: unknown; nanoseconds?: unknown };
    if (typeof candidate.toDate === 'function') {
      const dt = candidate.toDate();
      return dt instanceof Date && !Number.isNaN(dt.getTime()) ? dt : null;
    }
    if (typeof candidate.seconds === 'number' && Number.isFinite(candidate.seconds)) {
      const ms = candidate.seconds * 1000 + (typeof candidate.nanoseconds === 'number' ? Math.floor(candidate.nanoseconds / 1e6) : 0);
      const dt = new Date(ms);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
  }
  if (typeof raw === 'string' && raw.trim()) {
    const dt = new Date(raw);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

/**
 * Converte uma chave de data `YYYY-MM-DD` no instante UTC exato correspondente a
 * `00:00:00.000` em `America/Sao_Paulo` (suportando inclusive datas históricas com horário de verão).
 */
export function getSaoPauloDayStartUtc(dateKey: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error(`Chave de data inválida para America/Sao_Paulo: "${dateKey}".`);
  }
  const [year, month, day] = dateKey.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    throw new Error(`Data inexistente no calendário: "${dateKey}".`);
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  // Palpite inicial em UTC-3 (fuso padrão de São Paulo)
  let utcMs = Date.UTC(year, month - 1, day, 3, 0, 0, 0);
  const targetLocalAsUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);

  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = formatter.formatToParts(new Date(utcMs));
    const getPart = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0');
    const localYear = getPart('year');
    const localMonth = getPart('month');
    const localDay = getPart('day');
    const localHour = getPart('hour');
    const localMinute = getPart('minute');
    const localSecond = getPart('second');

    const observedLocalAsUtcMs = Date.UTC(
      localYear,
      localMonth - 1,
      localDay,
      localHour,
      localMinute,
      localSecond,
      0
    );
    const diffMs = targetLocalAsUtcMs - observedLocalAsUtcMs;
    if (diffMs === 0) break;
    utcMs += diffMs;
  }

  return new Date(utcMs);
}

/**
 * Calcula o intervalo semiaberto `[startUtc, endExclusiveUtc)` em UTC correspondente
 * ao período fechado `[startDateKey, endDateKey]` no fuso `America/Sao_Paulo`.
 * - `startUtc`: 00:00:00.000 de `startDateKey` em São Paulo (inclusive)
 * - `endExclusiveUtc`: 00:00:00.000 do dia seguinte a `endDateKey` em São Paulo (exclusivo)
 */
export function getSaoPauloDateRangeBounds(
  startDateKey: string,
  endDateKey: string
): { startUtc: Date; endExclusiveUtc: Date } {
  const startUtc = getSaoPauloDayStartUtc(startDateKey);
  const nextAfterEndKey = addDaysToDateKey(endDateKey, 1);
  const endExclusiveUtc = getSaoPauloDayStartUtc(nextAfterEndKey);
  return { startUtc, endExclusiveUtc };
}

/**
 * Converte documentos da coleção `receipts` em linhas canônicas de relatório.
 * O dia (`dateKey`) é sempre derivado de `paidAt` em `America/Sao_Paulo`.
 * Documentos legados que armazenam `dateKey` continuam compatíveis; se `dateKey` estiver
 * presente mas malformado ou divergente de `paidAt`, o registro vai para `issues`.
 */
export function mapReceiptDocsToLines(rawDocs: RawReceiptDoc[]): {
  lines: ReceiptLine[];
  issues: ReceiptIssue[];
} {
  const lines: ReceiptLine[] = [];
  const issues: ReceiptIssue[] = [];
  const seenIds = new Set<string>();

  for (const item of rawDocs || []) {
    const docId = item?.id || 'sem-id';
    if (seenIds.has(docId)) continue;
    seenIds.add(docId);

    const d = item?.data;
    if (!d || typeof d !== 'object') {
      issues.push({
        id: docId,
        origin: 'desconhecida',
        refId: docId,
        refNumber: 0,
        refLabel: `Receipt ${docId}`,
        reason: 'Documento de recebimento malformado.',
      });
      continue;
    }

    const originRaw = d.origin;
    const origin: ReceiptOrigin | 'desconhecida' =
      typeof originRaw === 'string' && VALID_ORIGINS.has(originRaw as ReceiptOrigin)
        ? (originRaw as ReceiptOrigin)
        : 'desconhecida';

    const refId = typeof d.refId === 'string' && d.refId.trim() ? d.refId.trim() : docId;
    const refNumber =
      typeof d.refNumber === 'number' && Number.isInteger(d.refNumber) && d.refNumber > 0
        ? d.refNumber
        : 0;
    const refLabel =
      typeof d.refLabel === 'string' && d.refLabel.trim()
        ? d.refLabel.trim()
        : `Registro ${refId}`;

    if (origin === 'desconhecida') {
      issues.push({
        id: docId,
        origin,
        refId,
        refNumber,
        refLabel,
        reason: `Origem inválida no recibo: "${String(originRaw)}".`,
      });
      continue;
    }

    if (refNumber <= 0) {
      issues.push({
        id: docId,
        origin,
        refId,
        refNumber: 0,
        refLabel,
        reason: 'Número de referência inválido ou ausente no recibo.',
      });
      continue;
    }

    const kindRaw = d.kind;
    if (typeof kindRaw !== 'string' || !VALID_KINDS.has(kindRaw as ReceiptKind)) {
      issues.push({
        id: docId,
        origin,
        refId,
        refNumber,
        refLabel,
        reason: `Tipo de lançamento inválido: "${String(kindRaw)}".`,
      });
      continue;
    }
    const kind = kindRaw as ReceiptKind;

    const methodRaw = d.method;
    if (typeof methodRaw !== 'string' || !VALID_METHODS.has(methodRaw as PaymentMethod)) {
      issues.push({
        id: docId,
        origin,
        refId,
        refNumber,
        refLabel,
        reason: `Forma de pagamento inválida no recibo: "${String(methodRaw)}".`,
      });
      continue;
    }
    const method = methodRaw as PaymentMethod;

    const amountRaw = d.amountCents;
    if (
      typeof amountRaw !== 'number' ||
      !Number.isFinite(amountRaw) ||
      !Number.isInteger(amountRaw) ||
      amountRaw <= 0
    ) {
      issues.push({
        id: docId,
        origin,
        refId,
        refNumber,
        refLabel,
        reason: `Valor em centavos inválido no recibo (${String(amountRaw)}).`,
      });
      continue;
    }

    const paidAtDate = parseFirestoreDate(d.paidAt);
    if (!paidAtDate) {
      issues.push({
        id: docId,
        origin,
        refId,
        refNumber,
        refLabel,
        reason: 'Campo paidAt ausente ou inválido no recibo.',
      });
      continue;
    }

    const computedDateKey = getSaoPauloDateKey(paidAtDate);
    if (d.dateKey !== undefined && d.dateKey !== null) {
      const storedDateKey = typeof d.dateKey === 'string' ? d.dateKey.trim() : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(storedDateKey)) {
        issues.push({
          id: docId,
          origin,
          refId,
          refNumber,
          refLabel,
          reason: `dateKey legado inválido: "${String(d.dateKey)}".`,
        });
        continue;
      }

      if (storedDateKey !== computedDateKey) {
        issues.push({
          id: docId,
          origin,
          refId,
          refNumber,
          refLabel,
          reason: `Inconsistência de data: dateKey="${storedDateKey}" diverge de paidAt em America/Sao_Paulo ("${computedDateKey}").`,
        });
        continue;
      }
    }

    const staffName =
      typeof d.staffName === 'string' && d.staffName.trim() ? d.staffName.trim() : 'Não informado';
    const staffUid = typeof d.staffUid === 'string' ? d.staffUid : '';
    const jointPaymentKey =
      typeof d.jointPaymentId === 'string' && d.jointPaymentId.trim()
        ? d.jointPaymentId.trim()
        : undefined;
    const sourcePaymentId =
      typeof d.sourcePaymentId === 'string' && d.sourcePaymentId.trim()
        ? d.sourcePaymentId.trim()
        : undefined;
    const refundId =
      typeof d.refundId === 'string' && d.refundId.trim() ? d.refundId.trim() : undefined;
    const reason =
      typeof d.reason === 'string' && d.reason.trim() ? d.reason.trim() : undefined;

    lines.push({
      id: docId,
      paidAtIso: paidAtDate.toISOString(),
      dateKey: computedDateKey,
      origin,
      refId,
      refNumber,
      refLabel,
      method,
      amountCents: amountRaw,
      operatorName: staffName,
      operatorUid: staffUid,
      ...(jointPaymentKey ? { jointPaymentKey } : {}),
      ...(sourcePaymentId ? { sourcePaymentId } : {}),
      ...(refundId ? { refundId } : {}),
      ...(reason ? { reason } : {}),
      kind,
    });
  }

  return { lines, issues };
}

/**
 * Consulta paginada na coleção `receipts` pelo intervalo de `paidAt` no fuso `America/Sao_Paulo`:
 * `[início de startDateKey (inclusive), início do dia seguinte a endDateKey (exclusivo))`.
 * Busca TODAS as páginas do período sem limite silencioso.
 * Propaga erro em caso de falha de permissão ou consulta.
 */
export async function fetchReceiptsByDateRange(
  startDateKey: string,
  endDateKey: string,
  pageSize: number = 500
): Promise<{
  lines: ReceiptLine[];
  issues: ReceiptIssue[];
  pagesFetched: number;
  totalDocsFetched: number;
}> {
  if (!startDateKey || !endDateKey || startDateKey > endDateKey) {
    return { lines: [], issues: [], pagesFetched: 0, totalDocsFetched: 0 };
  }

  const { startUtc, endExclusiveUtc } = getSaoPauloDateRangeBounds(startDateKey, endDateKey);
  const startTimestamp = Timestamp.fromDate(startUtc);
  const endExclusiveTimestamp = Timestamp.fromDate(endExclusiveUtc);
  const receiptsCol = collection(db, 'receipts');

  const { items: rawDocs, pagesFetched } = await paginateAll<
    RawReceiptDoc,
    QueryDocumentSnapshot
  >(async (cursor, size) => {
    const q = cursor
      ? query(
          receiptsCol,
          where('paidAt', '>=', startTimestamp),
          where('paidAt', '<', endExclusiveTimestamp),
          orderBy('paidAt', 'asc'),
          startAfter(cursor),
          limit(size)
        )
      : query(
          receiptsCol,
          where('paidAt', '>=', startTimestamp),
          where('paidAt', '<', endExclusiveTimestamp),
          orderBy('paidAt', 'asc'),
          limit(size)
        );

    const snap = await getDocs(q);
    const items: RawReceiptDoc[] = snap.docs.map(d => ({
      id: d.id,
      data: d.data() as Record<string, unknown>,
    }));
    const lastVisible = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    return {
      items,
      nextCursor: lastVisible,
      rawCount: snap.size,
    };
  }, pageSize);

  const { lines, issues } = mapReceiptDocsToLines(rawDocs);

  return {
    lines,
    issues,
    pagesFetched,
    totalDocsFetched: rawDocs.length,
  };
}

export interface PlannedBackfillReceipt {
  receiptDoc: Omit<ReceiptDocument, 'paidAt'> & { paidAtDate: Date };
}

export interface BackfillPlanResult {
  toCreate: PlannedBackfillReceipt[];
  skippedExistingCount: number;
  invalidIssues: ReceiptIssue[];
}

/**
 * Planejamento puro e determinístico do backfill a partir de comandas e locações antigas.
 * - Usa os mesmos IDs determinísticos das transações ao vivo (idempotente).
 * - Nunca inventa data nem valor para registros corrompidos (`invalidIssues`).
 * - Ignora `linkedBarPayment` nas locações porque a parcela do bar já existe em `Comanda.payments[]`.
 */
export function planHistoricalBackfill(params: {
  comandas: Comanda[];
  groupRentals: GroupRental[];
  existingReceiptIds: Set<string>;
  adminUid: string;
  adminName: string;
}): BackfillPlanResult {
  const { comandas, groupRentals, existingReceiptIds, adminUid, adminName } = params;
  const toCreate: PlannedBackfillReceipt[] = [];
  const invalidIssues: ReceiptIssue[] = [];
  let skippedExistingCount = 0;

  // Mapear payments originais para recuperar paymentKey (clientNonce || id) e validar linkedBarPayment
  const comandaPaymentKeyByComposite = new Map<string, { paymentKey: string; sourcePaymentId: string; isJointBar: boolean; jointId?: string }>();
  const rentalPaymentKeyByComposite = new Map<string, { paymentKey: string; sourcePaymentId: string; isJoint: boolean }>();

  for (const cmd of comandas || []) {
    for (const p of cmd.payments || []) {
      if (!p || typeof p !== 'object') continue;
      const sourcePaymentId = typeof p.id === 'string' && p.id.trim() ? p.id.trim() : '';
      const nonce = typeof p.clientNonce === 'string' && p.clientNonce.trim() ? p.clientNonce.trim() : '';
      const paymentKey = nonce || sourcePaymentId;
      if (paymentKey) {
        const isJointBar = nonce.endsWith('_bar') && nonce.length > 4;
        comandaPaymentKeyByComposite.set(`comanda:${cmd.id}:${sourcePaymentId || paymentKey}`, {
          paymentKey,
          sourcePaymentId: sourcePaymentId || paymentKey,
          isJointBar,
          jointId: isJointBar ? nonce.slice(0, -4) : undefined,
        });
      }
    }
  }

  for (const rental of groupRentals || []) {
    for (const p of rental.payments || []) {
      if (!p || typeof p !== 'object') continue;
      const sourcePaymentId = typeof p.id === 'string' && p.id.trim() ? p.id.trim() : '';
      const nonce = typeof p.clientNonce === 'string' && p.clientNonce.trim() ? p.clientNonce.trim() : '';
      const paymentKey = nonce || sourcePaymentId;
      if (paymentKey) {
        const isJoint = Boolean(p.linkedBarPayment && p.linkedBarPayment.amountCents > 0);
        rentalPaymentKeyByComposite.set(`locacao:${rental.id}:${sourcePaymentId || paymentKey}`, {
          paymentKey,
          sourcePaymentId: sourcePaymentId || paymentKey,
          isJoint,
        });
      }
    }
  }

  const { lines, issues } = buildReceiptLines(comandas, groupRentals);
  invalidIssues.push(...issues);

  const plannedIds = new Set<string>();

  for (const line of lines) {
    if (line.kind === 'estorno') {
      continue;
    }
    if (!line.refId || !Number.isInteger(line.refNumber) || line.refNumber <= 0) {
      invalidIssues.push({
        id: line.id,
        origin: line.origin,
        refId: line.refId || 'sem-id',
        refNumber: line.refNumber || 0,
        refLabel: line.refLabel || 'Sem identificação',
        reason: 'Documento de origem sem ID ou número válido.',
      });
      continue;
    }

    const meta =
      line.origin === 'comanda'
        ? comandaPaymentKeyByComposite.get(line.id)
        : rentalPaymentKeyByComposite.get(line.id);

    if (!meta) {
      invalidIssues.push({
        id: line.id,
        origin: line.origin,
        refId: line.refId,
        refNumber: line.refNumber,
        refLabel: line.refLabel,
        reason: 'Pagamento sem identificador (id ou clientNonce) para geração determinística.',
      });
      continue;
    }

    const paidAtDate = new Date(line.paidAtIso);
    if (Number.isNaN(paidAtDate.getTime())) {
      invalidIssues.push({
        id: meta.sourcePaymentId,
        origin: line.origin,
        refId: line.refId,
        refNumber: line.refNumber,
        refLabel: line.refLabel,
        reason: 'Data/hora do pagamento inválida.',
      });
      continue;
    }

    const receiptId = buildDeterministicReceiptId(line.origin, line.refId, meta.paymentKey);
    if (existingReceiptIds.has(receiptId) || plannedIds.has(receiptId)) {
      skippedExistingCount += 1;
      continue;
    }
    plannedIds.add(receiptId);

    let jointPaymentId: string | undefined;
    if (line.origin === 'comanda') {
      const cmdMeta = meta as { isJointBar: boolean; jointId?: string };
      if (cmdMeta.isJointBar && cmdMeta.jointId) {
        jointPaymentId = cmdMeta.jointId;
      }
    } else {
      const locMeta = meta as { isJoint: boolean; paymentKey: string };
      if (locMeta.isJoint) {
        jointPaymentId = locMeta.paymentKey;
      }
    }

    toCreate.push({
      receiptDoc: {
        id: receiptId,
        origin: line.origin,
        refId: line.refId,
        refNumber: line.refNumber,
        refLabel: line.refLabel.slice(0, 200),
        method: line.method,
        amountCents: line.amountCents,
        paidAtDate,
        staffUid: line.operatorUid || adminUid,
        staffName: (line.operatorName || adminName).slice(0, 128),
        ...(jointPaymentId ? { jointPaymentId } : {}),
        sourcePaymentId: meta.sourcePaymentId,
        kind: 'recebimento',
      },
    });
  }

  return {
    toCreate,
    skippedExistingCount,
    invalidIssues,
  };
}

export interface BackfillExecutionResult {
  createdCount: number;
  skippedExistingCount: number;
  invalidRecordsCount: number;
  invalidIssues: ReceiptIssue[];
}

/**
 * Executa o backfill administrativo idempotente da coleção `receipts` a partir do histórico
 * de `comandas` e `group_rentals`. Apenas administradores possuem permissão nas regras.
 */
export async function backfillReceiptsFromHistory(params: {
  comandas: Comanda[];
  groupRentals: GroupRental[];
  adminUid: string;
  adminName: string;
}): Promise<BackfillExecutionResult> {
  const receiptsCol = collection(db, 'receipts');

  // 1. Paginar todos os IDs já presentes em `receipts` para evitar sobrescrita / duplicação
  const { items: existingIds } = await paginateAll<string, QueryDocumentSnapshot>(
    async (cursor, size) => {
      const q = cursor
        ? query(receiptsCol, orderBy(documentId(), 'asc'), startAfter(cursor), limit(size))
        : query(receiptsCol, orderBy(documentId(), 'asc'), limit(size));
      const snap = await getDocs(q);
      const lastVisible = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      return {
        items: snap.docs.map(d => d.id),
        nextCursor: lastVisible,
        rawCount: snap.size,
      };
    },
    500
  );

  const existingReceiptIds = new Set(existingIds);

  // 2. Planejar criações sem inventar datas ou valores
  const plan = planHistoricalBackfill({
    ...params,
    existingReceiptIds,
  });

  // 3. Persistir em lotes (até 400 operações por WriteBatch, limite seguro abaixo de 500)
  const BATCH_CHUNK_SIZE = 400;
  let createdCount = 0;

  for (let i = 0; i < plan.toCreate.length; i += BATCH_CHUNK_SIZE) {
    const chunk = plan.toCreate.slice(i, i + BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const item of chunk) {
      const { paidAtDate, ...rest } = item.receiptDoc;
      const docRef = doc(db, 'receipts', rest.id);
      const payload: ReceiptDocument = {
        ...rest,
        paidAt: Timestamp.fromDate(paidAtDate),
      };
      batch.set(docRef, sanitizeForFirestore(payload));
    }

    await batch.commit();
    createdCount += chunk.length;
  }

  return {
    createdCount,
    skippedExistingCount: plan.skippedExistingCount,
    invalidRecordsCount: plan.invalidIssues.length,
    invalidIssues: plan.invalidIssues,
  };
}
