import { Comanda, Product, ComandaItem, PaymentRecord, ComandaHistoryEntry } from './types';
import { INITIAL_PRODUCTS } from './mock-data';
import { calculateComandaTotals, formatCents } from './formatters';

const DEMO_COMANDA_SIGNATURES: ReadonlyMap<string, string> = new Map([
  ['cmd-101', 'Turma do Beach Tennis'],
  ['cmd-102', 'Lucas Silveira'],
  ['cmd-103', 'Pelada Society — Quarta Show'],
  ['cmd-104', 'Mariana Costa'],
  ['cmd-105', 'Carlos Henrique (Ontem)'],
  ['cmd-106', 'Diogo Alcantara (Aberta Ontem)'],
]);

/**
 * Identifica se uma comanda salva anteriormente no localStorage corresponde
 * aos dados fixos de demonstração (INITIAL_COMANDAS) de versões antigas.
 * Preserva backups operacionais reais criados no navegador.
 */
export function isDemoComanda(comanda: Comanda): boolean {
  if (!comanda || typeof comanda !== 'object') return false;
  if (comanda.lastModifiedByUid) return false;

  const expectedDemoName = DEMO_COMANDA_SIGNATURES.get(comanda.id);
  if (!expectedDemoName || comanda.name !== expectedDemoName) {
    return false;
  }

  const hasRealPaymentOperator = (comanda.payments || []).some(
    p => Boolean(p.operatorUid) || (Boolean(p.operator) && p.operator !== 'Operador de demonstração')
  );
  if (hasRealPaymentOperator) return false;

  const hasRealHistoryOperator = (comanda.history || []).some(
    h => Boolean(h.operatorUid) || (Boolean(h.operator) && h.operator !== 'Operador de demonstração')
  );
  if (hasRealHistoryOperator) return false;

  return true;
}

/**
 * Filtra apenas comandas de operação real (exclui registros legados de demonstração).
 */
export function filterRealBackupComandas(comandas: Comanda[]): Comanda[] {
  return (comandas || []).filter(c => !isDemoComanda(c));
}

/**
 * Lê comandas de backup operacional real do localStorage sem semear dados fictícios.
 * Retorna lista vazia se não houver backup local ou se o conteúdo for apenas demonstração.
 */
export function loadRealLocalBackupComandas(): Comanda[] {
  if (typeof window === 'undefined') return [];
  try {
    const hasLocalKey =
      localStorage.getItem(STORAGE_KEY_COMANDAS) !== null ||
      localStorage.getItem(LEGACY_STORAGE_KEY_COMANDAS) !== null;
    if (!hasLocalKey) return [];

    const local = loadComandasFromStorage();
    if (local.status !== 'ok') return [];
    return filterRealBackupComandas(local.comandas);
  } catch {
    return [];
  }
}

export const STORAGE_VERSION = 'v2_cents';
export const STORAGE_KEY_COMANDAS = 'engenho_bola_comandas_v2';
export const LEGACY_STORAGE_KEY_COMANDAS = 'engenho_bola_comandas_v1';
export const STORAGE_KEY_PRODUCTS = 'engenho_bola_products_v2';
export const STORAGE_KEY_CORRUPTED_BACKUP = 'engenho_bola_comandas_corrupted_backup';

export interface StorageEnvelope {
  version: typeof STORAGE_VERSION;
  savedAt: string;
  comandas: Comanda[];
}

export type StorageLoadResult =
  | { status: 'ok'; comandas: Comanda[]; migratedFromLegacy?: boolean }
  | {
      status: 'corrupted';
      error: string;
      reason:
        | 'v2_invalid_json'
        | 'v2_unknown_version'
        | 'v2_schema_invalid'
        | 'v1_invalid_json'
        | 'v1_schema_invalid';
      rawContent?: string;
      sourceKey: string;
    };

export interface RecoveryResult {
  success: boolean;
  recoveredComandas?: Comanda[];
  unrecoverableCount?: number;
  unrecoverableDetails?: string[];
  message: string;
  error?: string;
}

/**
 * Validação estrita da estrutura e dos tipos numéricos de uma comanda.
 * Nenhuma coerção arbitrária: se um número for NaN, negativo ou inválido, retorna false.
 */
export function validateComanda(comanda: unknown): comanda is Comanda {
  if (!comanda || typeof comanda !== 'object') return false;
  const c = comanda as Record<string, unknown>;

  if (typeof c.id !== 'string' || !c.id.trim()) return false;
  if (typeof c.number !== 'number' || !Number.isInteger(c.number) || c.number <= 0) return false;
  if (c.type !== 'individual' && c.type !== 'mesa') return false;
  if (typeof c.name !== 'string' || !c.name.trim()) return false;
  if (c.status !== 'aberta' && c.status !== 'encerrada') return false;
  if (typeof c.openedAt !== 'string' || isNaN(new Date(c.openedAt).getTime())) return false;
  if (c.closedAt !== undefined && (typeof c.closedAt !== 'string' || isNaN(new Date(c.closedAt).getTime()))) return false;
  if (c.table !== undefined && typeof c.table !== 'string') return false;
  if (c.responsible !== undefined && typeof c.responsible !== 'string') return false;

  if (!Array.isArray(c.items) || !Array.isArray(c.payments) || !Array.isArray(c.history)) {
    return false;
  }

  // Validar itens
  for (const item of c.items as Record<string, unknown>[]) {
    if (!item || typeof item !== 'object') return false;
    if (typeof item.id !== 'string' || !item.id.trim()) return false;
    if (typeof item.productId !== 'string' || !item.productId.trim()) return false;
    if (typeof item.name !== 'string' || !item.name.trim()) return false;
    if (typeof item.category !== 'string') return false;

    // Quantidade deve ser número inteiro estritamente positivo
    if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      return false;
    }

    // Preço em centavos deve ser inteiro finito não-negativo
    if (
      typeof item.priceCents !== 'number' ||
      !Number.isInteger(item.priceCents) ||
      item.priceCents < 0
    ) {
      return false;
    }

    if (typeof item.addedAt !== 'string' || isNaN(new Date(item.addedAt).getTime())) {
      return false;
    }
  }

  // Validar pagamentos
  for (const p of c.payments as Record<string, unknown>[]) {
    if (!p || typeof p !== 'object') return false;
    if (typeof p.id !== 'string' || !p.id.trim()) return false;
    if (p.method !== 'dinheiro' && p.method !== 'pix' && p.method !== 'debito' && p.method !== 'credito') {
      return false;
    }

    // Valor abatido deve ser inteiro maior que zero
    if (
      typeof p.amountCents !== 'number' ||
      !Number.isInteger(p.amountCents) ||
      p.amountCents <= 0
    ) {
      return false;
    }

    if (p.tenderedCents !== undefined) {
      if (typeof p.tenderedCents !== 'number' || !Number.isInteger(p.tenderedCents) || p.tenderedCents < p.amountCents) {
        return false;
      }
    }

    if (p.changeCents !== undefined) {
      if (typeof p.changeCents !== 'number' || !Number.isInteger(p.changeCents) || p.changeCents < 0) {
        return false;
      }
    }

    if (typeof p.timestamp !== 'string' || isNaN(new Date(p.timestamp).getTime())) {
      return false;
    }
  }

  // Validar estornos opcionais
  if (c.refunds !== undefined) {
    if (!Array.isArray(c.refunds)) return false;
    for (const r of c.refunds as Record<string, unknown>[]) {
      if (!r || typeof r !== 'object') return false;
      if (typeof r.id !== 'string' || !r.id.trim()) return false;
      if (typeof r.clientNonce !== 'string' || !r.clientNonce.trim()) return false;
      if (typeof r.receiptId !== 'string' || !r.receiptId.trim()) return false;
      if (typeof r.sourcePaymentId !== 'string' || !r.sourcePaymentId.trim()) return false;
      if (r.method !== 'dinheiro' && r.method !== 'pix' && r.method !== 'debito' && r.method !== 'credito') {
        return false;
      }
      if (typeof r.amountCents !== 'number' || !Number.isInteger(r.amountCents) || r.amountCents <= 0) {
        return false;
      }
      if (typeof r.reason !== 'string' || !r.reason.trim()) return false;
      if (typeof r.timestamp !== 'string' || isNaN(new Date(r.timestamp).getTime())) return false;
    }
  }

  if (c.clientRev !== undefined && (typeof c.clientRev !== 'number' || !Number.isInteger(c.clientRev) || c.clientRev < 1)) {
    return false;
  }
  if (c.revSeq !== undefined && (typeof c.revSeq !== 'number' || !Number.isInteger(c.revSeq) || c.revSeq < 1)) {
    return false;
  }

  // Validar histórico
  for (const h of c.history as Record<string, unknown>[]) {
    if (!h || typeof h !== 'object') return false;
    if (typeof h.id !== 'string' || !h.id.trim()) return false;
    if (typeof h.description !== 'string' || !h.description.trim()) return false;
    if (typeof h.timestamp !== 'string' || isNaN(new Date(h.timestamp).getTime())) return false;
  }

  return true;
}

/**
 * Validação e migração estrita de comandas legadas (v1 em Reais decimais).
 * Não inventa números; se faltarem dados essenciais, rejeita.
 */
function tryMigrateLegacyComanda(raw: any, index: number): Comanda | null {
  if (!raw || typeof raw !== 'object') return null;

  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : null;
  const number = typeof raw.number === 'number' && Number.isInteger(raw.number) && raw.number > 0
    ? raw.number
    : null;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : null;
  const type = raw.type === 'mesa' || raw.type === 'individual' ? raw.type : null;
  const status = raw.status === 'aberta' || raw.status === 'encerrada' ? raw.status : null;
  const openedAt = typeof raw.openedAt === 'string' && !isNaN(new Date(raw.openedAt).getTime())
    ? raw.openedAt
    : null;

  if (!id || !number || !name || !type || !status || !openedAt) {
    return null;
  }

  if (!Array.isArray(raw.items) || !Array.isArray(raw.payments)) {
    return null;
  }

  const items: ComandaItem[] = [];
  for (let i = 0; i < raw.items.length; i++) {
    const it = raw.items[i];
    if (!it || typeof it !== 'object') return null;

    const itId = typeof it.id === 'string' && it.id.trim() ? it.id.trim() : `item-v1-${index}-${i}`;
    const prodId = typeof it.productId === 'string' && it.productId.trim() ? it.productId.trim() : `prod-v1-${i}`;
    const itName = typeof it.name === 'string' && it.name.trim() ? it.name.trim() : null;
    if (!itName) return null;

    const quantity = typeof it.quantity === 'number' && Number.isInteger(it.quantity) && it.quantity > 0
      ? it.quantity
      : null;
    if (quantity === null) return null;

    let priceCents: number | null = null;
    if (typeof it.priceCents === 'number' && Number.isInteger(it.priceCents) && it.priceCents >= 0) {
      priceCents = it.priceCents;
    } else if (typeof it.price === 'number' && Number.isFinite(it.price) && it.price >= 0) {
      priceCents = Math.round(it.price * 100);
    }
    if (priceCents === null) return null;

    items.push({
      id: itId,
      productId: prodId,
      name: itName,
      category: typeof it.category === 'string' ? it.category : 'Outros',
      priceCents,
      price: priceCents / 100,
      quantity,
      notes: typeof it.notes === 'string' ? it.notes : undefined,
      addedAt: typeof it.addedAt === 'string' && !isNaN(new Date(it.addedAt).getTime()) ? it.addedAt : openedAt,
    });
  }

  const payments: PaymentRecord[] = [];
  for (let pIdx = 0; pIdx < raw.payments.length; pIdx++) {
    const p = raw.payments[pIdx];
    if (!p || typeof p !== 'object') return null;

    const pId = typeof p.id === 'string' && p.id.trim() ? p.id.trim() : `pay-v1-${index}-${pIdx}`;
    const method = (p.method === 'dinheiro' || p.method === 'pix' || p.method === 'debito' || p.method === 'credito')
      ? p.method
      : null;
    if (!method) return null;

    let amountCents: number | null = null;
    if (typeof p.amountCents === 'number' && Number.isInteger(p.amountCents) && p.amountCents > 0) {
      amountCents = p.amountCents;
    } else if (typeof p.amount === 'number' && Number.isFinite(p.amount) && p.amount > 0) {
      amountCents = Math.round(p.amount * 100);
    }
    if (amountCents === null) return null;

    let tenderedCents: number | undefined;
    if (typeof p.tenderedCents === 'number' && Number.isInteger(p.tenderedCents) && p.tenderedCents >= amountCents) {
      tenderedCents = p.tenderedCents;
    } else if (typeof p.tendered === 'number' && Number.isFinite(p.tendered) && p.tendered * 100 >= amountCents) {
      tenderedCents = Math.round(p.tendered * 100);
    }

    let changeCents: number | undefined;
    if (typeof p.changeCents === 'number' && Number.isInteger(p.changeCents) && p.changeCents >= 0) {
      changeCents = p.changeCents;
    } else if (typeof p.change === 'number' && Number.isFinite(p.change) && p.change >= 0) {
      changeCents = Math.round(p.change * 100);
    }

    payments.push({
      id: pId,
      method,
      amountCents,
      amount: amountCents / 100,
      tenderedCents,
      tendered: tenderedCents !== undefined ? tenderedCents / 100 : undefined,
      changeCents,
      change: changeCents !== undefined ? changeCents / 100 : undefined,
      timestamp: typeof p.timestamp === 'string' && !isNaN(new Date(p.timestamp).getTime()) ? p.timestamp : openedAt,
      operator: typeof p.operator === 'string' ? p.operator : 'Operador de demonstração',
      clientNonce: typeof p.clientNonce === 'string' ? p.clientNonce : undefined,
    });
  }

  const history: ComandaHistoryEntry[] = Array.isArray(raw.history)
    ? raw.history.map((h: any, hIdx: number) => ({
        id: typeof h?.id === 'string' ? h.id : `hist-v1-${index}-${hIdx}`,
        timestamp: typeof h?.timestamp === 'string' && !isNaN(new Date(h.timestamp).getTime()) ? h.timestamp : openedAt,
        operator: typeof h?.operator === 'string' ? h.operator : 'Operador de demonstração',
        type: h?.type || 'abertura',
        description: typeof h?.description === 'string' ? h.description : 'Ação registrada',
        details: typeof h?.details === 'string' ? h.details : undefined,
      }))
    : [
        {
          id: `hist-v1-${index}-open`,
          timestamp: openedAt,
          operator: 'Operador de demonstração',
          type: 'abertura',
          description: `Comanda #${number} aberta para ${name}.`,
        },
      ];

  const result: Comanda = {
    id,
    number,
    type,
    name,
    table: typeof raw.table === 'string' && raw.table.trim() ? raw.table.trim() : undefined,
    responsible: typeof raw.responsible === 'string' && raw.responsible.trim() ? raw.responsible.trim() : undefined,
    status,
    openedAt,
    closedAt: typeof raw.closedAt === 'string' && !isNaN(new Date(raw.closedAt).getTime()) ? raw.closedAt : undefined,
    items,
    payments,
    history,
  };

  return validateComanda(result) ? result : null;
}

/**
 * Lê e valida os dados do armazenamento local.
 * Primeira execução limpa retorna lista vazia (nunca semeia comandas fictícias).
 * Qualquer situação inválida (JSON corrompido, versão desconhecida, campos inválidos) gera 'corrupted' preservando o original.
 */
export function loadComandasFromStorage(): StorageLoadResult {
  if (typeof window === 'undefined') {
    return { status: 'ok', comandas: [] };
  }

  try {
    // 1. Tentar ler versão atual v2
    const rawV2 = localStorage.getItem(STORAGE_KEY_COMANDAS);
    if (rawV2 !== null) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawV2);
      } catch {
        return {
          status: 'corrupted',
          error: 'Formato JSON inválido no armazenamento local (chave v2).',
          reason: 'v2_invalid_json',
          rawContent: rawV2,
          sourceKey: STORAGE_KEY_COMANDAS,
        };
      }

      // Validação do envelope v2
      if (!parsed || typeof parsed !== 'object') {
        return {
          status: 'corrupted',
          error: 'O conteúdo armazenado na chave v2 não é um objeto envelope válido.',
          reason: 'v2_schema_invalid',
          rawContent: rawV2,
          sourceKey: STORAGE_KEY_COMANDAS,
        };
      }

      const envelopeObj = parsed as Record<string, unknown>;

      // Versão desconhecida ou ausente
      if (envelopeObj.version !== STORAGE_VERSION) {
        return {
          status: 'corrupted',
          error: `Envelope com versão desconhecida ("${String(envelopeObj.version || 'sem versão')}"). Versão esperada: "${STORAGE_VERSION}".`,
          reason: 'v2_unknown_version',
          rawContent: rawV2,
          sourceKey: STORAGE_KEY_COMANDAS,
        };
      }

      if (!Array.isArray(envelopeObj.comandas)) {
        return {
          status: 'corrupted',
          error: 'Estrutura corrompida: o campo "comandas" no envelope v2 não é uma lista.',
          reason: 'v2_schema_invalid',
          rawContent: rawV2,
          sourceKey: STORAGE_KEY_COMANDAS,
        };
      }

      for (let i = 0; i < envelopeObj.comandas.length; i++) {
        const item = envelopeObj.comandas[i];
        if (!validateComanda(item)) {
          const num = (item as any)?.number || (item as any)?.id || `#${i + 1}`;
          return {
            status: 'corrupted',
            error: `A comanda ${num} contém campos, tipos ou valores financeiros inválidos.`,
            reason: 'v2_schema_invalid',
            rawContent: rawV2,
            sourceKey: STORAGE_KEY_COMANDAS,
          };
        }
      }

      return { status: 'ok', comandas: envelopeObj.comandas as Comanda[] };
    }

    // 2. Chave v2 não existe: verificar chave legada v1
    const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY_COMANDAS);
    if (rawV1 !== null) {
      let parsedV1: unknown;
      try {
        parsedV1 = JSON.parse(rawV1);
      } catch {
        return {
          status: 'corrupted',
          error: 'Formato JSON inválido na chave legada v1.',
          reason: 'v1_invalid_json',
          rawContent: rawV1,
          sourceKey: LEGACY_STORAGE_KEY_COMANDAS,
        };
      }

      if (!Array.isArray(parsedV1)) {
        return {
          status: 'corrupted',
          error: 'Estrutura corrompida na versão legada v1 (não é uma lista).',
          reason: 'v1_schema_invalid',
          rawContent: rawV1,
          sourceKey: LEGACY_STORAGE_KEY_COMANDAS,
        };
      }

      // Migração estrita sem inventar dados
      const migrated: Comanda[] = [];
      for (let i = 0; i < parsedV1.length; i++) {
        const cmdMigrated = tryMigrateLegacyComanda(parsedV1[i], i);
        if (!cmdMigrated) {
          const num = (parsedV1[i] as any)?.number || `#${i + 1}`;
          return {
            status: 'corrupted',
            error: `A comanda legada ${num} contém registros corrompidos ou inconsistentes que impedem a migração segura.`,
            reason: 'v1_schema_invalid',
            rawContent: rawV1,
            sourceKey: LEGACY_STORAGE_KEY_COMANDAS,
          };
        }
        migrated.push(cmdMigrated);
      }

      // Se todas foram migradas com sucesso, persiste na v2 (mantendo v1 intacta para segurança)
      const saveRes = saveComandasToStorage(migrated);
      if (!saveRes.success) {
        return {
          status: 'corrupted',
          error: `Falha ao salvar a migração da versão v1 para v2: ${saveRes.error}`,
          reason: 'v1_schema_invalid',
          rawContent: rawV1,
          sourceKey: LEGACY_STORAGE_KEY_COMANDAS,
        };
      }

      return { status: 'ok', comandas: migrated, migratedFromLegacy: true };
    }

    // 3. Primeira execução limpa: nenhuma chave (v2 ou v1) existia -> nunca semear comandas fictícias
    return { status: 'ok', comandas: [] };
  } catch (e) {
    return {
      status: 'corrupted',
      error: e instanceof Error ? e.message : 'Falha inesperada ao ler o armazenamento local.',
      reason: 'v2_schema_invalid',
      sourceKey: STORAGE_KEY_COMANDAS,
    };
  }
}

/**
 * Salva com validação explícita no formato envelope v2.
 */
export function saveComandasToStorage(comandas: Comanda[]): { success: boolean; error?: string } {
  if (typeof window === 'undefined') return { success: true };

  try {
    const envelope: StorageEnvelope = {
      version: STORAGE_VERSION,
      savedAt: new Date().toISOString(),
      comandas,
    };
    const serialized = JSON.stringify(envelope);
    localStorage.setItem(STORAGE_KEY_COMANDAS, serialized);
    return { success: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.name === 'QuotaExceededError'
          ? 'Cota de armazenamento local do navegador excedida.'
          : err.message
        : 'Erro desconhecido ao salvar no navegador.';
    return { success: false, error: message };
  }
}

/**
 * Recuperação de dados sem inventar valores ou datas falsas.
 * Separa claramente registros íntegros de registros irrecuperáveis.
 * NUNCA restaura exemplos automaticamente em caso de falha.
 */
export function attemptRecoverStorage(): RecoveryResult {
  if (typeof window === 'undefined') {
    return { success: false, message: 'Ambiente sem acesso ao navegador.' };
  }

  const raw =
    localStorage.getItem(STORAGE_KEY_COMANDAS) ||
    localStorage.getItem(LEGACY_STORAGE_KEY_COMANDAS) ||
    localStorage.getItem(STORAGE_KEY_CORRUPTED_BACKUP);

  if (!raw) {
    return {
      success: false,
      message: 'Nenhum dado encontrado para recuperação.',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      success: false,
      message: 'O conteúdo armazenado não é um JSON válido. Não foi possível extrair comandas estruturadas.',
      unrecoverableDetails: ['Erro de sintaxe JSON no arquivo original.'],
    };
  }

  let candidates: unknown[] | null = null;
  if (Array.isArray(parsed)) {
    candidates = parsed;
  } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).comandas)) {
    candidates = (parsed as any).comandas;
  }

  if (!candidates || candidates.length === 0) {
    return {
      success: false,
      message: 'A estrutura de dados não contém uma lista de comandas reconhecível.',
      unrecoverableDetails: ['Não foi encontrada uma lista de comandas no JSON.'],
    };
  }

  const recoveredList: Comanda[] = [];
  const unrecoverableList: string[] = [];

  for (let idx = 0; idx < candidates.length; idx++) {
    const candidate = candidates[idx];
    if (validateComanda(candidate)) {
      recoveredList.push(candidate);
      continue;
    }

    // Tentar migrar se for formato v1
    const migrated = tryMigrateLegacyComanda(candidate, idx);
    if (migrated && validateComanda(migrated)) {
      recoveredList.push(migrated);
      continue;
    }

    const identifier =
      (candidate as any)?.number
        ? `Comanda #${(candidate as any).number}`
        : (candidate as any)?.name
        ? `Comanda "${(candidate as any).name}"`
        : `Registro na posição ${idx + 1}`;

    unrecoverableList.push(`${identifier}: campos obrigatórios, quantidades ou valores financeiros ausentes ou inválidos.`);
  }

  if (recoveredList.length === 0) {
    return {
      success: false,
      message: 'Nenhuma comanda pôde ser recuperada sem corromper a integridade dos dados.',
      unrecoverableDetails: unrecoverableList,
    };
  }

  // Backup do dado bruto original antes de gravar
  try {
    localStorage.setItem(STORAGE_KEY_CORRUPTED_BACKUP, raw);
  } catch {
    // ignore
  }

  // Validação estrita de cada comanda antes de salvar
  const allValid = recoveredList.every(validateComanda);
  if (!allValid) {
    return {
      success: false,
      message: 'Erro interno: dados recuperados não passaram na validação estrita.',
      unrecoverableDetails: unrecoverableList,
    };
  }

  // Salvar a recuperação
  const saveRes = saveComandasToStorage(recoveredList);
  if (!saveRes.success) {
    return {
      success: false,
      message: `Não foi possível salvar os registros recuperados no armazenamento: ${saveRes.error}`,
      unrecoverableDetails: unrecoverableList,
    };
  }

  const message =
    unrecoverableList.length > 0
      ? `${recoveredList.length} comanda(s) recuperada(s) com sucesso. ${unrecoverableList.length} registro(s) com dados inválidos não puderam ser recuperados e foram preservados no backup.`
      : `Todas as ${recoveredList.length} comandas foram recuperadas e validadas com sucesso!`;

  return {
    success: true,
    recoveredComandas: recoveredList,
    unrecoverableCount: unrecoverableList.length,
    unrecoverableDetails: unrecoverableList,
    message,
  };
}

/**
 * Retorna o dado bruto armazenado atualmente para fins de exportação de segurança.
 */
export function getRawStorageDataForExport(): { filename: string; content: string } {
  if (typeof window === 'undefined') {
    return { filename: 'engenho_bola_backup.json', content: '' };
  }

  const rawV2 = localStorage.getItem(STORAGE_KEY_COMANDAS);
  const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY_COMANDAS);
  const rawBackup = localStorage.getItem(STORAGE_KEY_CORRUPTED_BACKUP);

  const content = rawV2 || rawV1 || rawBackup || JSON.stringify({ version: STORAGE_VERSION, comandas: [] }, null, 2);
  const now = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    filename: `engenho_bola_backup_dados_${now}.json`,
    content,
  };
}

/**
 * Reinicia o armazenamento local para lista vazia de comandas apenas após confirmação explícita.
 * Trata erros de armazenamento: NÃO apaga registros originais antes de confirmar a gravação.
 */
export function restoreDefaultsConfirmed(): {
  success: boolean;
  comandas?: Comanda[];
  products?: Product[];
  error?: string;
} {
  // 1. Tentar gravar lista vazia primeiro (não apaga nada antes da gravação ter sucesso!)
  const saveComandasRes = saveComandasToStorage([]);
  if (!saveComandasRes.success) {
    return {
      success: false,
      error: `Não foi possível reiniciar o armazenamento de comandas: ${saveComandasRes.error}. Os dados existentes foram mantidos intactos.`,
    };
  }

  const saveProductsRes = saveProductsToStorage(INITIAL_PRODUCTS);
  if (!saveProductsRes.success) {
    return {
      success: false,
      error: `Não foi possível gravar os produtos base: ${saveProductsRes.error}.`,
    };
  }

  // 2. Somente após a confirmação do salvamento, limpa chaves legadas e backup
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY_COMANDAS);
      localStorage.removeItem(STORAGE_KEY_CORRUPTED_BACKUP);
    } catch {
      // ignore
    }
  }

  return {
    success: true,
    comandas: [],
    products: INITIAL_PRODUCTS,
  };
}

export function loadProductsFromStorage(): Product[] {
  if (typeof window === 'undefined') return INITIAL_PRODUCTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PRODUCTS);
    if (!raw) {
      saveProductsToStorage(INITIAL_PRODUCTS);
      return INITIAL_PRODUCTS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((p: any) => ({
        ...p,
        priceCents:
          typeof p.priceCents === 'number' && Number.isInteger(p.priceCents)
            ? p.priceCents
            : Math.round((p.price || 0) * 100),
      }));
    }
    return INITIAL_PRODUCTS;
  } catch {
    return INITIAL_PRODUCTS;
  }
}

export function saveProductsToStorage(products: Product[]): { success: boolean; error?: string } {
  if (typeof window === 'undefined') return { success: true };
  try {
    localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(products));
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Erro ao salvar produtos' };
  }
}

export function resetStorageToDefaults(): { comandas: Comanda[]; products: Product[]; success: boolean; error?: string } {
  const res = restoreDefaultsConfirmed();
  return {
    comandas: res.comandas || [],
    products: res.products || INITIAL_PRODUCTS,
    success: res.success,
    error: res.error,
  };
}

export function getNextComandaNumber(comandas: Comanda[]): number {
  if (comandas.length === 0) return 101;
  const maxNum = Math.max(...comandas.map(c => c.number || 100));
  return maxNum + 1;
}

export function createNewComandaHelper(
  comandas: Comanda[],
  params: {
    type: 'individual' | 'mesa';
    name: string;
    table?: string;
    responsible?: string;
  }
): Comanda {
  const number = getNextComandaNumber(comandas);
  const now = new Date().toISOString();
  const id = `cmd-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const desc =
    params.type === 'individual'
      ? `Comanda individual #${number} aberta para ${params.name}${params.table ? ` (vinculada à ${params.table})` : ' (sem mesa)'}.`
      : `Comanda por mesa #${number} aberta para ${params.table || params.name}${params.responsible ? ` (Responsável: ${params.responsible})` : ''}.`;

  const newComanda: Comanda = {
    id,
    number,
    type: params.type,
    name: params.name,
    table: params.table?.trim() ? params.table.trim() : undefined,
    responsible: params.responsible?.trim() ? params.responsible.trim() : undefined,
    status: 'aberta',
    openedAt: now,
    items: [],
    payments: [],
    history: [
      {
        id: `hist-${Date.now()}-open`,
        timestamp: now,
        operator: 'Operador de demonstração',
        type: 'abertura',
        description: desc,
      },
    ],
  };

  return newComanda;
}

export function addItemHelper(
  comanda: Comanda,
  product: Product,
  quantity: number,
  notes?: string
): { success: boolean; comanda?: Comanda; error?: string } {
  if (comanda.status === 'encerrada') {
    return { success: false, error: 'Não é possível lançar itens em uma comanda encerrada.' };
  }

  // Validação estrita de quantidade: número inteiro positivo
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
    return { success: false, error: 'A quantidade deve ser um número inteiro maior que zero.' };
  }

  const priceCents =
    typeof product.priceCents === 'number' && Number.isInteger(product.priceCents)
      ? product.priceCents
      : typeof product.price === 'number'
      ? Math.round(product.price * 100)
      : 0;

  if (priceCents < 0 || !Number.isFinite(priceCents)) {
    return { success: false, error: 'Preço do produto inválido.' };
  }

  const now = new Date().toISOString();
  const newItem: ComandaItem = {
    id: `item-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    productId: product.id,
    name: product.name,
    category: product.category,
    priceCents,
    price: priceCents / 100,
    quantity,
    notes: notes?.trim() ? notes.trim() : undefined,
    addedAt: now,
  };

  const updatedItems = [...comanda.items, newItem];
  const subtotalCents = priceCents * quantity;

  const historyEntry: ComandaHistoryEntry = {
    id: `hist-${Date.now()}-add`,
    timestamp: now,
    operator: 'Operador de demonstração',
    type: 'item_adicionado',
    description: `Lançado ${quantity}x ${product.name} (${formatCents(subtotalCents)}).`,
    details: notes?.trim() ? `Obs: ${notes.trim()}` : undefined,
  };

  return {
    success: true,
    comanda: {
      ...comanda,
      items: updatedItems,
      history: [...comanda.history, historyEntry],
    },
  };
}

export function updateItemQuantityHelper(
  comanda: Comanda,
  itemId: string,
  newQuantity: number,
  reason: string
): { success: boolean; comanda?: Comanda; error?: string } {
  if (comanda.status === 'encerrada') {
    return { success: false, error: 'Comanda encerrada não pode ser alterada.' };
  }

  if (!Number.isFinite(newQuantity) || !Number.isInteger(newQuantity) || newQuantity < 0) {
    return { success: false, error: 'A quantidade deve ser um número inteiro não-negativo.' };
  }

  const itemIndex = comanda.items.findIndex(it => it.id === itemId);
  if (itemIndex === -1) {
    return { success: false, error: 'Item não encontrado na comanda.' };
  }

  const currentItem = comanda.items[itemIndex];
  if (newQuantity === currentItem.quantity) {
    return { success: true, comanda };
  }

  // Projetar itens com centavos inteiros
  const projectedItems = [...comanda.items];
  if (newQuantity <= 0) {
    projectedItems.splice(itemIndex, 1);
  } else {
    projectedItems[itemIndex] = { ...currentItem, quantity: newQuantity };
  }

  const { totalPaidCents } = calculateComandaTotals(comanda);
  const projectedTotalCents = projectedItems.reduce((acc, it) => {
    const c = typeof it.priceCents === 'number' ? it.priceCents : Math.round((it.price || 0) * 100);
    return acc + c * it.quantity;
  }, 0);

  if (projectedTotalCents < totalPaidCents) {
    return {
      success: false,
      error: `Não é possível reduzir/remover este item pois o valor total da comanda (${formatCents(
        projectedTotalCents
      )}) ficaria menor do que o valor já recebido (${formatCents(
        totalPaidCents
      )}). Estornos serão implementados na próxima etapa.`,
    };
  }

  const now = new Date().toISOString();
  let historyEntry: ComandaHistoryEntry;

  if (newQuantity <= 0) {
    historyEntry = {
      id: `hist-${Date.now()}-remove`,
      timestamp: now,
      operator: 'Operador de demonstração',
      type: 'item_removido',
      description: `Item removido: ${currentItem.quantity}x ${currentItem.name}.`,
      details: `Motivo informado: "${reason.trim() || 'Não especificado'}"`,
    };
  } else {
    const diff = newQuantity - currentItem.quantity;
    historyEntry = {
      id: `hist-${Date.now()}-update`,
      timestamp: now,
      operator: 'Operador de demonstração',
      type: diff < 0 ? 'item_removido' : 'item_adicionado',
      description: `Quantidade ajustada de ${currentItem.name}: de ${currentItem.quantity} para ${newQuantity}.`,
      details: reason.trim() ? `Motivo informado: "${reason.trim()}"` : undefined,
    };
  }

  return {
    success: true,
    comanda: {
      ...comanda,
      items: projectedItems,
      history: [...comanda.history, historyEntry],
    },
  };
}

export function transferItemsHelper(
  sourceComanda: Comanda,
  targetComanda: Comanda,
  transfers: { itemId: string; quantity: number }[]
): {
  success: boolean;
  updatedSource?: Comanda;
  updatedTarget?: Comanda;
  error?: string;
} {
  if (sourceComanda.status === 'encerrada' || targetComanda.status === 'encerrada') {
    return { success: false, error: 'Apenas comandas abertas podem transferir ou receber itens.' };
  }
  if (sourceComanda.id === targetComanda.id) {
    return { success: false, error: 'A comanda de destino não pode ser a mesma de origem.' };
  }

  // Validar quantidades inteiras
  for (const t of transfers) {
    if (!Number.isFinite(t.quantity) || !Number.isInteger(t.quantity) || t.quantity < 0) {
      return { success: false, error: 'Quantidade de transferência inválida.' };
    }
  }

  const initialSourceTotals = calculateComandaTotals(sourceComanda);
  const initialTargetTotals = calculateComandaTotals(targetComanda);
  const initialCombinedTotalCents = initialSourceTotals.totalConsumedCents + initialTargetTotals.totalConsumedCents;

  const newSourceItems = [...sourceComanda.items];
  const itemsToAddTarget: ComandaItem[] = [];
  const transferDescriptions: string[] = [];
  const now = new Date().toISOString();

  for (const t of transfers) {
    if (t.quantity <= 0) continue;
    const sIndex = newSourceItems.findIndex(it => it.id === t.itemId);
    if (sIndex === -1) {
      return { success: false, error: 'Item não encontrado na comanda de origem.' };
    }
    const item = newSourceItems[sIndex];
    if (t.quantity > item.quantity) {
      return {
        success: false,
        error: `Quantidade a transferir de ${item.name} excede o total disponível (${item.quantity}).`,
      };
    }

    const priceCents =
      typeof item.priceCents === 'number' ? item.priceCents : Math.round((item.price || 0) * 100);

    itemsToAddTarget.push({
      id: `item-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      productId: item.productId,
      name: item.name,
      category: item.category,
      priceCents,
      price: priceCents / 100,
      quantity: t.quantity,
      notes: item.notes,
      addedAt: now,
    });

    transferDescriptions.push(`${t.quantity}x ${item.name}`);

    if (t.quantity === item.quantity) {
      newSourceItems.splice(sIndex, 1);
    } else {
      newSourceItems[sIndex] = {
        ...item,
        quantity: item.quantity - t.quantity,
      };
    }
  }

  if (itemsToAddTarget.length === 0) {
    return { success: false, error: 'Nenhum item selecionado para transferência.' };
  }

  // Checar se o novo total da origem ficaria menor que o total pago nela
  const newSourceTotalCents = newSourceItems.reduce((acc, it) => {
    const c = typeof it.priceCents === 'number' ? it.priceCents : Math.round((it.price || 0) * 100);
    return acc + c * it.quantity;
  }, 0);

  if (newSourceTotalCents < initialSourceTotals.totalPaidCents) {
    return {
      success: false,
      error: `Transferência bloqueada: a comanda de origem ficaria com consumo total de ${formatCents(
        newSourceTotalCents
      )}, menor do que o valor já pago nela (${formatCents(initialSourceTotals.totalPaidCents)}).`,
    };
  }

  const itemsListSummary = transferDescriptions.join(', ');

  const updatedSource: Comanda = {
    ...sourceComanda,
    items: newSourceItems,
    history: [
      ...sourceComanda.history,
      {
        id: `hist-${Date.now()}-transf-out`,
        timestamp: now,
        operator: 'Operador de demonstração',
        type: 'item_transferido',
        description: `Transferido para Comanda #${targetComanda.number} (${targetComanda.name}): ${itemsListSummary}.`,
      },
    ],
  };

  const updatedTarget: Comanda = {
    ...targetComanda,
    items: [...targetComanda.items, ...itemsToAddTarget],
    history: [
      ...targetComanda.history,
      {
        id: `hist-${Date.now()}-transf-in`,
        timestamp: now,
        operator: 'Operador de demonstração',
        type: 'item_transferido',
        description: `Recebido da Comanda #${sourceComanda.number} (${sourceComanda.name}): ${itemsListSummary}.`,
      },
    ],
  };

  // Invariante matemática
  const finalSourceTotals = calculateComandaTotals(updatedSource);
  const finalTargetTotals = calculateComandaTotals(updatedTarget);
  const finalCombinedTotalCents = finalSourceTotals.totalConsumedCents + finalTargetTotals.totalConsumedCents;

  if (finalCombinedTotalCents !== initialCombinedTotalCents) {
    return {
      success: false,
      error: 'Erro de integridade matemática: o valor total combinado foi divergente durante a transferência.',
    };
  }

  return {
    success: true,
    updatedSource,
    updatedTarget,
  };
}

export function registerPaymentHelper(
  comanda: Comanda,
  params: {
    method: 'dinheiro' | 'pix' | 'debito' | 'credito';
    amountCents: number;
    tenderedCents?: number;
    clientNonce?: string;
  }
): {
  success: boolean;
  comanda?: Comanda;
  changeCents?: number;
  error?: string;
} {
  if (comanda.status === 'encerrada') {
    return { success: false, error: 'Esta comanda já foi encerrada.' };
  }

  const { balanceCents } = calculateComandaTotals(comanda);

  if (balanceCents <= 0) {
    return { success: false, error: 'A comanda não possui saldo pendente para pagamento.' };
  }

  if (!Number.isFinite(params.amountCents) || !Number.isInteger(params.amountCents) || params.amountCents <= 0) {
    return { success: false, error: 'O valor do pagamento deve ser um número inteiro de centavos maior que zero.' };
  }

  // Proteção contra duplicação na lógica
  if (params.clientNonce) {
    const existingPayment = comanda.payments.find(p => p.clientNonce === params.clientNonce);
    if (existingPayment) {
      return { success: false, error: 'Duplicidade detectada: este pagamento já foi registrado.' };
    }
  }

  if (params.amountCents > balanceCents) {
    return {
      success: false,
      error: `O valor a ser abatido (${formatCents(params.amountCents)}) não pode ultrapassar o saldo pendente de ${formatCents(
        balanceCents
      )}.`,
    };
  }

  let finalAmountCents = params.amountCents;
  let changeCents: number | undefined = undefined;

  if (params.method === 'dinheiro') {
    const tenderedCents = params.tenderedCents ?? params.amountCents;
    if (!Number.isFinite(tenderedCents) || !Number.isInteger(tenderedCents) || tenderedCents < params.amountCents) {
      return {
        success: false,
        error: `O valor entregue pelo cliente em dinheiro (${formatCents(
          tenderedCents
        )}) é menor do que o valor a abater (${formatCents(params.amountCents)}).`,
      };
    }

    finalAmountCents = params.amountCents;
    changeCents = tenderedCents - params.amountCents;
  }

  const now = new Date().toISOString();
  const paymentRecord: PaymentRecord = {
    id: `pay-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    method: params.method,
    amountCents: finalAmountCents,
    amount: finalAmountCents / 100,
    tenderedCents: params.method === 'dinheiro' ? (params.tenderedCents ?? finalAmountCents) : undefined,
    tendered: params.method === 'dinheiro' ? (params.tenderedCents ?? finalAmountCents) / 100 : undefined,
    changeCents: params.method === 'dinheiro' ? (changeCents ?? 0) : undefined,
    change: params.method === 'dinheiro' ? (changeCents ?? 0) / 100 : undefined,
    timestamp: now,
    operator: 'Operador de demonstração',
    clientNonce: params.clientNonce,
  };

  const newBalanceCents = balanceCents - finalAmountCents;

  const methodNames: Record<string, string> = {
    dinheiro: 'Dinheiro',
    pix: 'Pix',
    debito: 'Cartão de Débito',
    credito: 'Cartão de Crédito',
  };

  const historyDesc =
    params.method === 'dinheiro' && changeCents && changeCents > 0
      ? `Pagamento de ${formatCents(finalAmountCents)} recebido em Dinheiro (Entregue: ${formatCents(
          params.tenderedCents || finalAmountCents
        )} | Troco: ${formatCents(changeCents)}).`
      : `Pagamento de ${formatCents(finalAmountCents)} recebido via ${methodNames[params.method]}.`;

  const historyDetails =
    newBalanceCents === 0
      ? 'Conta quitada integralmente! Saldo restante: R$ 0,00.'
      : `Saldo restante após pagamento: ${formatCents(newBalanceCents)}.`;

  const updatedPayments = [...comanda.payments, paymentRecord];
  const updatedHistory = [
    ...comanda.history,
    {
      id: `hist-${Date.now()}-pay`,
      timestamp: now,
      operator: 'Operador de demonstração',
      type: 'pagamento' as const,
      description: historyDesc,
      details: historyDetails,
    },
  ];

  return {
    success: true,
    changeCents,
    comanda: {
      ...comanda,
      payments: updatedPayments,
      history: updatedHistory,
    },
  };
}

export function closeComandaHelper(comanda: Comanda): {
  success: boolean;
  comanda?: Comanda;
  error?: string;
} {
  if (comanda.status === 'encerrada') {
    return { success: false, error: 'A comanda já está encerrada.' };
  }

  const { balanceCents } = calculateComandaTotals(comanda);
  if (balanceCents > 0) {
    return {
      success: false,
      error: `Não é possível encerrar uma comanda com saldo pendente de ${formatCents(
        balanceCents
      )}. Registre a quitação antes de encerrar.`,
    };
  }

  const now = new Date().toISOString();
  const historyEntry: ComandaHistoryEntry = {
    id: `hist-${Date.now()}-close`,
    timestamp: now,
    operator: 'Operador de demonstração',
    type: 'encerramento',
    description: 'Comanda encerrada com sucesso.',
    details: 'Conta quitada sem pendências financeiras.',
  };

  return {
    success: true,
    comanda: {
      ...comanda,
      status: 'encerrada',
      closedAt: now,
      history: [...comanda.history, historyEntry],
    },
  };
}
