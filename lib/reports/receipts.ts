import {
  Comanda,
  GroupRental,
  PaymentMethod,
  ReceiptKind,
  ReceiptOrigin,
} from '@/lib/types';

export type { ReceiptOrigin, ReceiptKind };

export interface ReceiptLine {
  id: string;
  paidAtIso: string;
  dateKey: string; // YYYY-MM-DD no fuso America/Sao_Paulo
  origin: ReceiptOrigin;
  refId: string;
  refNumber: number;
  refLabel: string;
  method: PaymentMethod;
  amountCents: number;
  operatorName: string;
  operatorUid: string;
  jointPaymentKey?: string;
  sourcePaymentId?: string;
  refundId?: string;
  reason?: string;
  kind?: ReceiptKind;
}

export interface ReceiptIssue {
  id: string;
  origin: ReceiptOrigin | 'desconhecida';
  refId: string;
  refNumber: number;
  refLabel: string;
  reason: string;
}

export interface BuildReceiptLinesResult {
  lines: ReceiptLine[];
  issues: ReceiptIssue[];
}

function buildDeterministicIdWithPrefix(
  prefix: string,
  hashSeed: string,
  refId: string,
  key: string
): string {
  const safeRef = refId.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeKey = key.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const raw = `${prefix}_${safeRef}_${safeKey}`;
  if (raw.length <= 120) {
    return raw;
  }

  let hash = 2166136261;
  for (let i = 0; i < hashSeed.length; i++) {
    hash ^= hashSeed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hexHash = (hash >>> 0).toString(16).padStart(8, '0');
  return `${prefix}_${safeRef.slice(0, 44)}_${safeKey.slice(0, 44)}_${hexHash}`.slice(0, 128);
}

/**
 * Gera um identificador determinístico para documentos na coleção append-only `receipts`.
 * Garante idempotência entre transações ao vivo e backfill histórico sem duplicar lançamentos.
 */
export function buildDeterministicReceiptId(
  origin: ReceiptOrigin,
  refId: string,
  paymentKey: string
): string {
  const prefix = origin === 'comanda' ? 'rcpt_cmd' : 'rcpt_loc';
  return buildDeterministicIdWithPrefix(prefix, `${origin}:${refId}:${paymentKey}`, refId, paymentKey);
}

/**
 * Gera um identificador determinístico para documentos de estorno na coleção `receipts`.
 * Garante idempotência por clientNonce sem nunca colidir com recebimentos originais.
 */
export function buildDeterministicRefundReceiptId(
  origin: ReceiptOrigin,
  refId: string,
  refundKey: string
): string {
  const prefix = origin === 'comanda' ? 'rcpt_est_cmd' : 'rcpt_est_loc';
  return buildDeterministicIdWithPrefix(
    prefix,
    `estorno:${origin}:${refId}:${refundKey}`,
    refId,
    refundKey
  );
}

const VALID_METHODS = new Set<PaymentMethod>(['dinheiro', 'pix', 'debito', 'credito']);

const SAO_PAULO_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function formatValidDateKeySaoPaulo(date: Date): string {
  return SAO_PAULO_DATE_FORMATTER.format(date);
}

function deriveJointPaymentKey(clientNonce?: unknown): string | undefined {
  if (typeof clientNonce !== 'string') return undefined;
  const trimmed = clientNonce.trim();
  if (!trimmed) return undefined;
  return trimmed.endsWith('_bar') ? trimmed.slice(0, -4) : trimmed;
}

function parseValidTimestamp(rawTimestamp: unknown): { ok: true; date: Date; iso: string } | { ok: false; reason: string } {
  if (typeof rawTimestamp !== 'string' || !rawTimestamp.trim()) {
    return { ok: false, reason: 'Timestamp de pagamento ausente ou vazio.' };
  }
  const parsed = new Date(rawTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, reason: `Data/hora de pagamento inválida: "${rawTimestamp}".` };
  }
  return { ok: true, date: parsed, iso: parsed.toISOString() };
}

function validateAmountCents(rawAmountCents: unknown): { ok: true; value: number } | { ok: false; reason: string } {
  if (typeof rawAmountCents !== 'number' || !Number.isFinite(rawAmountCents)) {
    return { ok: false, reason: 'Valor em centavos ausente ou não numérico.' };
  }
  if (!Number.isInteger(rawAmountCents)) {
    return { ok: false, reason: `Valor em centavos não inteiro (${rawAmountCents}).` };
  }
  if (rawAmountCents <= 0) {
    return { ok: false, reason: `Valor em centavos deve ser maior que zero (${rawAmountCents}).` };
  }
  return { ok: true, value: rawAmountCents };
}

function validatePaymentMethod(rawMethod: unknown): rawMethod is PaymentMethod {
  return typeof rawMethod === 'string' && VALID_METHODS.has(rawMethod as PaymentMethod);
}

/**
 * Constrói a lista canônica de lançamentos recebidos a partir de Comandas (Bar e cozinha)
 * e Locações em Grupo (parte da quadra).
 *
 * Regras:
 * - Valores estritamente em centavos inteiros.
 * - Troco nunca entra como receita (usa apenas amountCents efetivamente abatido).
 * - Em pagamento conjunto, usa apenas GroupRental.payments[].amountCents (parte da quadra);
 *   a parte do bar já existe em Comanda.payments[] com sufixo "_bar" no clientNonce.
 *   linkedBarPayment é ignorado no somatório para evitar dupla contagem.
 * - Registros com data, valor ou forma de pagamento inválidos vão para `issues`
 *   e jamais recebem fallback como "1970-01-01".
 */
export function buildReceiptLines(
  comandas: Comanda[],
  groupRentals: GroupRental[]
): BuildReceiptLinesResult {
  const lines: ReceiptLine[] = [];
  const issues: ReceiptIssue[] = [];

  for (const cmd of comandas || []) {
    const payments = Array.isArray(cmd.payments) ? cmd.payments : [];
    const cmdLabel = cmd.table ? `${cmd.name} (${cmd.table})` : cmd.name;

    payments.forEach((p, idx) => {
      const paymentId = typeof p?.id === 'string' && p.id.trim() ? p.id.trim() : `${cmd.id}-pay-${idx}`;

      if (!p || typeof p !== 'object') {
        issues.push({
          id: paymentId,
          origin: 'comanda',
          refId: cmd.id,
          refNumber: cmd.number,
          refLabel: cmdLabel,
          reason: 'Registro de pagamento malformado.',
        });
        return;
      }

      const tsResult = parseValidTimestamp(p.timestamp);
      if (!tsResult.ok) {
        issues.push({
          id: paymentId,
          origin: 'comanda',
          refId: cmd.id,
          refNumber: cmd.number,
          refLabel: cmdLabel,
          reason: tsResult.reason,
        });
        return;
      }

      const amountResult = validateAmountCents(p.amountCents);
      if (!amountResult.ok) {
        issues.push({
          id: paymentId,
          origin: 'comanda',
          refId: cmd.id,
          refNumber: cmd.number,
          refLabel: cmdLabel,
          reason: amountResult.reason,
        });
        return;
      }

      if (!validatePaymentMethod(p.method)) {
        issues.push({
          id: paymentId,
          origin: 'comanda',
          refId: cmd.id,
          refNumber: cmd.number,
          refLabel: cmdLabel,
          reason: `Forma de pagamento desconhecida: "${String((p as { method?: unknown }).method)}".`,
        });
        return;
      }

      const jointPaymentKey = deriveJointPaymentKey(p.clientNonce);

      lines.push({
        id: `comanda:${cmd.id}:${paymentId}`,
        paidAtIso: tsResult.iso,
        dateKey: formatValidDateKeySaoPaulo(tsResult.date),
        origin: 'comanda',
        refId: cmd.id,
        refNumber: cmd.number,
        refLabel: cmdLabel,
        method: p.method,
        amountCents: amountResult.value,
        operatorName: typeof p.operator === 'string' && p.operator.trim() ? p.operator.trim() : 'Não informado',
        operatorUid: typeof p.operatorUid === 'string' ? p.operatorUid : '',
        ...(jointPaymentKey ? { jointPaymentKey } : {}),
        sourcePaymentId: paymentId,
        kind: 'recebimento',
      });
    });

    const refunds = Array.isArray(cmd.refunds) ? cmd.refunds : [];
    refunds.forEach((r, idx) => {
      const refundId = typeof r?.id === 'string' && r.id.trim() ? r.id.trim() : `${cmd.id}-ref-${idx}`;
      if (!r || typeof r !== 'object') {
        issues.push({
          id: refundId,
          origin: 'comanda',
          refId: cmd.id,
          refNumber: cmd.number,
          refLabel: cmdLabel,
          reason: 'Registro de estorno malformado.',
        });
        return;
      }

      const tsResult = parseValidTimestamp(r.timestamp);
      if (!tsResult.ok) {
        issues.push({
          id: refundId,
          origin: 'comanda',
          refId: cmd.id,
          refNumber: cmd.number,
          refLabel: cmdLabel,
          reason: tsResult.reason,
        });
        return;
      }

      const amountResult = validateAmountCents(r.amountCents);
      if (!amountResult.ok) {
        issues.push({
          id: refundId,
          origin: 'comanda',
          refId: cmd.id,
          refNumber: cmd.number,
          refLabel: cmdLabel,
          reason: amountResult.reason,
        });
        return;
      }

      if (!validatePaymentMethod(r.method)) {
        issues.push({
          id: refundId,
          origin: 'comanda',
          refId: cmd.id,
          refNumber: cmd.number,
          refLabel: cmdLabel,
          reason: `Forma de pagamento desconhecida no estorno: "${String((r as { method?: unknown }).method)}".`,
        });
        return;
      }

      lines.push({
        id: `comanda:${cmd.id}:estorno:${refundId}`,
        paidAtIso: tsResult.iso,
        dateKey: formatValidDateKeySaoPaulo(tsResult.date),
        origin: 'comanda',
        refId: cmd.id,
        refNumber: cmd.number,
        refLabel: cmdLabel,
        method: r.method,
        amountCents: amountResult.value,
        operatorName: typeof r.operator === 'string' && r.operator.trim() ? r.operator.trim() : 'Não informado',
        operatorUid: typeof r.operatorUid === 'string' ? r.operatorUid : '',
        ...(typeof r.jointPaymentId === 'string' && r.jointPaymentId.trim()
          ? { jointPaymentKey: r.jointPaymentId.trim() }
          : {}),
        sourcePaymentId: r.sourcePaymentId,
        refundId,
        reason: typeof r.reason === 'string' ? r.reason.trim() : undefined,
        kind: 'estorno',
      });
    });
  }

  for (const rental of groupRentals || []) {
    const payments = Array.isArray(rental.payments) ? rental.payments : [];
    const rentalLabel = `${rental.groupName} (${rental.space})`;

    payments.forEach((p, idx) => {
      const paymentId = typeof p?.id === 'string' && p.id.trim() ? p.id.trim() : `${rental.id}-pay-${idx}`;

      if (!p || typeof p !== 'object') {
        issues.push({
          id: paymentId,
          origin: 'locacao',
          refId: rental.id,
          refNumber: rental.number,
          refLabel: rentalLabel,
          reason: 'Registro de pagamento malformado.',
        });
        return;
      }

      const tsResult = parseValidTimestamp(p.timestamp);
      if (!tsResult.ok) {
        issues.push({
          id: paymentId,
          origin: 'locacao',
          refId: rental.id,
          refNumber: rental.number,
          refLabel: rentalLabel,
          reason: tsResult.reason,
        });
        return;
      }

      // Usa SOMENTE amountCents (parte da quadra). Nunca soma linkedBarPayment.
      const amountResult = validateAmountCents(p.amountCents);
      if (!amountResult.ok) {
        issues.push({
          id: paymentId,
          origin: 'locacao',
          refId: rental.id,
          refNumber: rental.number,
          refLabel: rentalLabel,
          reason: amountResult.reason,
        });
        return;
      }

      if (!validatePaymentMethod(p.method)) {
        issues.push({
          id: paymentId,
          origin: 'locacao',
          refId: rental.id,
          refNumber: rental.number,
          refLabel: rentalLabel,
          reason: `Forma de pagamento desconhecida: "${String((p as { method?: unknown }).method)}".`,
        });
        return;
      }

      const jointPaymentKey = deriveJointPaymentKey(p.clientNonce);

      lines.push({
        id: `locacao:${rental.id}:${paymentId}`,
        paidAtIso: tsResult.iso,
        dateKey: formatValidDateKeySaoPaulo(tsResult.date),
        origin: 'locacao',
        refId: rental.id,
        refNumber: rental.number,
        refLabel: rentalLabel,
        method: p.method,
        amountCents: amountResult.value,
        operatorName: typeof p.operator === 'string' && p.operator.trim() ? p.operator.trim() : 'Não informado',
        operatorUid: typeof p.operatorUid === 'string' ? p.operatorUid : '',
        ...(jointPaymentKey ? { jointPaymentKey } : {}),
        sourcePaymentId: paymentId,
        kind: 'recebimento',
      });
    });

    const refunds = Array.isArray(rental.refunds) ? rental.refunds : [];
    refunds.forEach((r, idx) => {
      const refundId = typeof r?.id === 'string' && r.id.trim() ? r.id.trim() : `${rental.id}-ref-${idx}`;
      if (!r || typeof r !== 'object') {
        issues.push({
          id: refundId,
          origin: 'locacao',
          refId: rental.id,
          refNumber: rental.number,
          refLabel: rentalLabel,
          reason: 'Registro de estorno malformado.',
        });
        return;
      }

      const tsResult = parseValidTimestamp(r.timestamp);
      if (!tsResult.ok) {
        issues.push({
          id: refundId,
          origin: 'locacao',
          refId: rental.id,
          refNumber: rental.number,
          refLabel: rentalLabel,
          reason: tsResult.reason,
        });
        return;
      }

      const amountResult = validateAmountCents(r.amountCents);
      if (!amountResult.ok) {
        issues.push({
          id: refundId,
          origin: 'locacao',
          refId: rental.id,
          refNumber: rental.number,
          refLabel: rentalLabel,
          reason: amountResult.reason,
        });
        return;
      }

      if (!validatePaymentMethod(r.method)) {
        issues.push({
          id: refundId,
          origin: 'locacao',
          refId: rental.id,
          refNumber: rental.number,
          refLabel: rentalLabel,
          reason: `Forma de pagamento desconhecida no estorno: "${String((r as { method?: unknown }).method)}".`,
        });
        return;
      }

      lines.push({
        id: `locacao:${rental.id}:estorno:${refundId}`,
        paidAtIso: tsResult.iso,
        dateKey: formatValidDateKeySaoPaulo(tsResult.date),
        origin: 'locacao',
        refId: rental.id,
        refNumber: rental.number,
        refLabel: rentalLabel,
        method: r.method,
        amountCents: amountResult.value,
        operatorName: typeof r.operator === 'string' && r.operator.trim() ? r.operator.trim() : 'Não informado',
        operatorUid: typeof r.operatorUid === 'string' ? r.operatorUid : '',
        ...(typeof r.jointPaymentId === 'string' && r.jointPaymentId.trim()
          ? { jointPaymentKey: r.jointPaymentId.trim() }
          : {}),
        sourcePaymentId: r.sourcePaymentId,
        refundId,
        reason: typeof r.reason === 'string' ? r.reason.trim() : undefined,
        kind: 'estorno',
      });
    });
  }

  return { lines, issues };
}
