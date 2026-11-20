import {
  doc,
  runTransaction,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  Comanda,
  ComandaItem,
  PaymentRecord,
  ComandaHistoryEntry,
  PaymentMethod,
  Product,
  CourtSpace,
  GroupRental,
  GroupParticipant,
  GroupRentalPayment,
  GroupRentalHistoryEntry,
  GroupPaymentAllocation,
  ReceiptDocument,
} from './types';
import { buildDeterministicReceiptId } from './reports/receipts';

export const methodLabels: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  debito: 'Cartão de Débito',
  credito: 'Cartão de Crédito',
};

/**
 * Verifica se o cliente está online antes de permitir operações financeiras.
 */
function assertOnline(operationName: string) {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    throw new Error(
      `A operação "${operationName}" exige conexão com o servidor para garantir integridade e sincronização entre operadores.`
    );
  }
}

/**
 * Calcula totais estritamente em centavos inteiros com base no registro real do banco.
 */
export function calculateServerComandaTotals(comanda: Comanda) {
  const totalConsumptionCents = (comanda.items || []).reduce((sum, item) => {
    const qty = Math.max(0, Math.floor(item.quantity || 0));
    const price = Math.max(0, Math.floor(item.priceCents || 0));
    return sum + qty * price;
  }, 0);

  const totalPaidCents = (comanda.payments || []).reduce((sum, pay) => {
    const amt = Math.max(0, Math.floor(pay.amountCents || 0));
    return sum + amt;
  }, 0);

  const balanceCents = Math.max(0, totalConsumptionCents - totalPaidCents);

  return { totalConsumptionCents, totalPaidCents, balanceCents };
}

/**
 * Remove recursivamente todas as propriedades com valor `undefined` de objetos e arrays.
 * Preserva:
 * - Valores numéricos válidos (incluindo 0)
 * - Booleanos (incluindo false)
 * - Strings (incluindo "")
 * - null
 * - Tipos especiais do Firestore (Timestamp, serverTimestamp / FieldValue, DocumentReference, Date, etc.)
 * Trata objetos aninhados e objetos contidos dentro de arrays.
 * Não utiliza JSON.parse(JSON.stringify) para evitar perda de tipos especiais do Firestore.
 */
export function sanitizeForFirestore<T>(val: T): T {
  if (val === undefined) {
    return undefined as unknown as T;
  }
  if (val === null || typeof val !== 'object') {
    return val;
  }

  // Arrays: filtra itens undefined e sanitiza cada elemento recursivamente
  if (Array.isArray(val)) {
    return val
      .filter(item => item !== undefined)
      .map(item => sanitizeForFirestore(item)) as unknown as T;
  }

  // Verifica se é objeto customizado (Firestore Timestamp, FieldValue, Date, etc.)
  // Objetos literais planos têm prototype Object.prototype ou null
  const proto = Object.getPrototypeOf(val);
  const isPlainObject = proto === Object.prototype || proto === null;
  if (!isPlainObject) {
    // Preserva instâncias especiais (ex: Timestamp, serverTimestamp / FieldValue, Date)
    return val;
  }

  const result: Record<string, unknown> = {};
  for (const [key, propVal] of Object.entries(val as Record<string, unknown>)) {
    if (propVal !== undefined) {
      result[key] = sanitizeForFirestore(propVal);
    }
  }
  return result as T;
}

/**
 * Criação transacional de comanda com numeração atômica garantida via contador global.
 * Impede que dois operadores gerem o mesmo número de comanda simultaneamente.
 */
export async function atomicCreateComanda(params: {
  id: string;
  type: 'individual' | 'mesa';
  name: string;
  table?: string;
  responsible?: string;
  operatorUid: string;
  operatorName: string;
}): Promise<Comanda> {
  const counterRef = doc(db, 'metadata', 'comandas_counter');
  const comandaRef = doc(db, 'comandas', params.id);

  return runTransaction(db, async transaction => {
    const counterSnap = await transaction.get(counterRef);

    let nextNumber = 101;
    if (counterSnap.exists()) {
      const current = counterSnap.data().lastNumber;
      if (typeof current === 'number' && Number.isInteger(current)) {
        nextNumber = current + 1;
      }
    }

    const nowIso = new Date().toISOString();

    const historyEntry: ComandaHistoryEntry = {
      id: `hist-open-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: nowIso,
      operator: params.operatorName,
      operatorUid: params.operatorUid,
      type: 'abertura',
      description: `Comanda nº ${nextNumber} aberta como ${params.type === 'mesa' ? 'Mesa' : 'Individual'} (${params.name})`,
    };

    const newComanda: Comanda = {
      id: params.id,
      number: nextNumber,
      type: params.type,
      name: params.name.trim(),
      status: 'aberta',
      openedAt: nowIso,
      items: [],
      payments: [],
      history: [historyEntry],
      lastModifiedByUid: params.operatorUid,
      lastModifiedAt: nowIso,
      ...(params.table?.trim() ? { table: params.table.trim() } : {}),
      ...(params.responsible?.trim() ? { responsible: params.responsible.trim() } : {}),
    };

    transaction.set(counterRef, sanitizeForFirestore({
      lastNumber: nextNumber,
      updatedAt: nowIso,
    }));

    transaction.set(comandaRef, sanitizeForFirestore(newComanda));

    return newComanda;
  });
}

/**
 * Inclusão atômica de item na comanda com validação de status no servidor.
 */
export async function atomicAddItem(params: {
  comandaId: string;
  product: Product;
  quantity: number;
  notes?: string;
  operatorUid: string;
  operatorName: string;
}): Promise<void> {
  const comandaRef = doc(db, 'comandas', params.comandaId);

  await runTransaction(db, async transaction => {
    const snap = await transaction.get(comandaRef);
    if (!snap.exists()) {
      throw new Error('Comanda não encontrada no servidor.');
    }

    const comanda = snap.data() as Comanda;
    if (comanda.status !== 'aberta') {
      throw new Error('Não é possível adicionar itens a uma comanda encerrada.');
    }

    const qty = Math.floor(params.quantity);
    if (qty <= 0) {
      throw new Error('Quantidade inválida para o item.');
    }

    const nowIso = new Date().toISOString();
    const cleanNotes = params.notes?.trim() || undefined;

    const existingIndex = comanda.items.findIndex(
      it => it.productId === params.product.id && it.notes === cleanNotes
    );

    let updatedItems: ComandaItem[];
    if (existingIndex >= 0) {
      updatedItems = comanda.items.map((it, idx) => {
        if (idx === existingIndex) {
          return {
            ...it,
            quantity: it.quantity + qty,
          };
        }
        return it;
      });
    } else {
      const newItem: ComandaItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        productId: params.product.id,
        name: params.product.name,
        category: params.product.category,
        priceCents: params.product.priceCents,
        quantity: qty,
        addedAt: nowIso,
        addedByUid: params.operatorUid,
        addedByName: params.operatorName,
        ...(cleanNotes ? { notes: cleanNotes } : {}),
      };
      updatedItems = [...comanda.items, newItem];
    }

    const historyEntry: ComandaHistoryEntry = {
      id: `hist-item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: nowIso,
      operator: params.operatorName,
      operatorUid: params.operatorUid,
      type: 'item_adicionado',
      description: `Lançado: ${qty}x ${params.product.name}`,
      ...(cleanNotes ? { details: `Obs: ${cleanNotes}` } : {}),
    };

    transaction.set(comandaRef, sanitizeForFirestore({
      ...comanda,
      items: updatedItems,
      history: [...comanda.history, historyEntry],
      lastModifiedByUid: params.operatorUid,
      lastModifiedAt: nowIso,
    }));
  });
}

/**
 * Ajuste ou remoção atômica de quantidade de item com registro de motivo.
 */
export async function atomicUpdateItemQuantity(params: {
  comandaId: string;
  itemId: string;
  quantity: number;
  reason: string;
  operatorUid: string;
  operatorName: string;
}): Promise<void> {
  const comandaRef = doc(db, 'comandas', params.comandaId);

  await runTransaction(db, async transaction => {
    const snap = await transaction.get(comandaRef);
    if (!snap.exists()) {
      throw new Error('Comanda não encontrada no servidor.');
    }

    const comanda = snap.data() as Comanda;
    if (comanda.status !== 'aberta') {
      throw new Error('Não é possível alterar itens de uma comanda encerrada.');
    }

    const targetItem = comanda.items.find(it => it.id === params.itemId);
    if (!targetItem) {
      throw new Error('Item não encontrado na comanda.');
    }

    const cleanReason = params.reason.trim();
    if (!cleanReason) {
      throw new Error('O motivo do ajuste é obrigatório.');
    }

    const newQty = Math.max(0, Math.floor(params.quantity));
    const nowIso = new Date().toISOString();

    let updatedItems: ComandaItem[];
    let historyEntry: ComandaHistoryEntry;

    if (newQty === 0) {
      updatedItems = comanda.items.filter(it => it.id !== params.itemId);
      historyEntry = {
        id: `hist-del-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: nowIso,
        operator: params.operatorName,
        operatorUid: params.operatorUid,
        type: 'item_removido',
        description: `Cancelado: ${targetItem.quantity}x ${targetItem.name}`,
        details: `Motivo: ${cleanReason}`,
      };
    } else {
      updatedItems = comanda.items.map(it =>
        it.id === params.itemId ? { ...it, quantity: newQty } : it
      );
      historyEntry = {
        id: `hist-adj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: nowIso,
        operator: params.operatorName,
        operatorUid: params.operatorUid,
        type: 'item_removido',
        description: `Quantidade ajustada de ${targetItem.name}: de ${targetItem.quantity} para ${newQty}`,
        details: `Motivo: ${cleanReason}`,
      };
    }

    transaction.set(comandaRef, sanitizeForFirestore({
      ...comanda,
      items: updatedItems,
      history: [...comanda.history, historyEntry],
      lastModifiedByUid: params.operatorUid,
      lastModifiedAt: nowIso,
    }));
  });
}

/**
 * Transferência atômica entre comandas: valida e atualiza origem e destino na MESMA transação.
 * Impede que transferências concorrentes percam itens ou dupliquem lançamentos.
 */
export async function atomicTransferItems(params: {
  sourceId: string;
  targetId: string;
  transfers: { itemId: string; quantity: number }[];
  operatorUid: string;
  operatorName: string;
}): Promise<void> {
  assertOnline('Transferência entre Comandas');

  const sourceRef = doc(db, 'comandas', params.sourceId);
  const targetRef = doc(db, 'comandas', params.targetId);

  await runTransaction(db, async transaction => {
    // 1. Leituras estritas primeiro
    const [sourceSnap, targetSnap] = await Promise.all([
      transaction.get(sourceRef),
      transaction.get(targetRef),
    ]);

    if (!sourceSnap.exists() || !targetSnap.exists()) {
      throw new Error('Comanda de origem ou destino não encontrada no servidor.');
    }

    const source = sourceSnap.data() as Comanda;
    const target = targetSnap.data() as Comanda;

    if (source.status !== 'aberta' || target.status !== 'aberta') {
      throw new Error('Ambas as comandas devem estar abertas para efetuar transferência.');
    }

    // 2. Validação da disponibilidade exata de cada item na origem
    let updatedSourceItems = [...source.items];
    let updatedTargetItems = [...target.items];
    const transferredDescriptions: string[] = [];
    const nowIso = new Date().toISOString();

    for (const t of params.transfers) {
      const qtyToTransfer = Math.floor(t.quantity);
      if (qtyToTransfer <= 0) continue;

      const sourceItemIndex = updatedSourceItems.findIndex(it => it.id === t.itemId);
      if (sourceItemIndex === -1) {
        throw new Error('Item a ser transferido não se encontra mais na comanda de origem.');
      }

      const sourceItem = updatedSourceItems[sourceItemIndex];
      if (sourceItem.quantity < qtyToTransfer) {
        throw new Error(
          `Quantidade insuficiente de "${sourceItem.name}" na origem: disponível ${sourceItem.quantity}, solicitado ${qtyToTransfer}. Outro operador pode ter alterado o item.`
        );
      }

      // Decrementar ou remover da origem
      if (sourceItem.quantity === qtyToTransfer) {
        updatedSourceItems.splice(sourceItemIndex, 1);
      } else {
        updatedSourceItems[sourceItemIndex] = {
          ...sourceItem,
          quantity: sourceItem.quantity - qtyToTransfer,
        };
      }

      // Acrescentar ou agrupar no destino
      const targetItemIndex = updatedTargetItems.findIndex(
        it => it.productId === sourceItem.productId && it.notes === sourceItem.notes
      );

      if (targetItemIndex >= 0) {
        updatedTargetItems[targetItemIndex] = {
          ...updatedTargetItems[targetItemIndex],
          quantity: updatedTargetItems[targetItemIndex].quantity + qtyToTransfer,
        };
      } else {
        const newTargetItem: ComandaItem = {
          id: `item-transf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          productId: sourceItem.productId,
          name: sourceItem.name,
          category: sourceItem.category,
          priceCents: sourceItem.priceCents,
          quantity: qtyToTransfer,
          addedAt: nowIso,
          addedByUid: params.operatorUid,
          addedByName: params.operatorName,
          ...(sourceItem.notes ? { notes: sourceItem.notes } : {}),
        };
        updatedTargetItems.push(newTargetItem);
      }

      transferredDescriptions.push(`${qtyToTransfer}x ${sourceItem.name}`);
    }

    if (transferredDescriptions.length === 0) {
      throw new Error('Nenhum item válido selecionado para transferência.');
    }

    const summaryText = transferredDescriptions.join(', ');

    const sourceHistory: ComandaHistoryEntry = {
      id: `hist-transf-src-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: nowIso,
      operator: params.operatorName,
      operatorUid: params.operatorUid,
      type: 'item_transferido',
      description: `Transferido para comanda nº ${target.number}: ${summaryText}`,
    };

    const targetHistory: ComandaHistoryEntry = {
      id: `hist-transf-tgt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: nowIso,
      operator: params.operatorName,
      operatorUid: params.operatorUid,
      type: 'item_transferido',
      description: `Recebido da comanda nº ${source.number}: ${summaryText}`,
    };

    // 3. Gravações atômicas coordenadas
    transaction.set(sourceRef, sanitizeForFirestore({
      ...source,
      items: updatedSourceItems,
      history: [...source.history, sourceHistory],
      lastModifiedByUid: params.operatorUid,
      lastModifiedAt: nowIso,
    }));

    transaction.set(targetRef, sanitizeForFirestore({
      ...target,
      items: updatedTargetItems,
      history: [...target.history, targetHistory],
      lastModifiedByUid: params.operatorUid,
      lastModifiedAt: nowIso,
    }));
  });
}

/**
 * Registro atômico de pagamento com chave de idempotência e validação estrita de saldo.
 * Se o mesmo operationId for submetido novamente (retry de rede), não duplica o recebimento.
 */
export async function atomicRegisterPayment(params: {
  comandaId: string;
  method: PaymentMethod;
  amountCents: number;
  tenderedCents?: number;
  operationId: string;
  operatorUid: string;
  operatorName: string;
}): Promise<{ changeCents: number; alreadyProcessed: boolean; payment: PaymentRecord }> {
  assertOnline('Registro de Pagamento');

  const comandaRef = doc(db, 'comandas', params.comandaId);
  const receiptId = buildDeterministicReceiptId('comanda', params.comandaId, params.operationId);
  const receiptRef = doc(db, 'receipts', receiptId);

  return runTransaction(db, async transaction => {
    const [snap, receiptSnap] = await Promise.all([
      transaction.get(comandaRef),
      transaction.get(receiptRef),
    ]);
    if (!snap.exists()) {
      throw new Error('Comanda não encontrada no servidor.');
    }

    const comanda = snap.data() as Comanda;

    // 1. CHECAGEM DE IDEMPOTÊNCIA: Verificar se este operationId já foi persistido no banco
    const existing = (comanda.payments || []).find(
      p => p.id === params.operationId || p.clientNonce === params.operationId
    );
    if (existing) {
      return {
        changeCents: existing.changeCents || 0,
        alreadyProcessed: true,
        payment: existing,
      };
    }

    if (comanda.status !== 'aberta') {
      throw new Error('Não é possível registrar pagamentos em comanda já encerrada.');
    }

    // 2. CONCORRÊNCIA E SALDO EM TEMPO REAL: Calcular saldo diretamente do servidor
    const { balanceCents } = calculateServerComandaTotals(comanda);

    if (balanceCents <= 0) {
      throw new Error('Esta comanda já está totalmente quitada.');
    }

    if (params.amountCents > balanceCents) {
      throw new Error(
        `O valor do pagamento (R$ ${(params.amountCents / 100).toFixed(
          2
        )}) ultrapassa o saldo atual de R$ ${(balanceCents / 100).toFixed(
          2
        )}. Outro pagamento pode ter sido registrado simultaneamente.`
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();
    let changeCents = 0;
    let tenderedCents = params.tenderedCents;

    if (params.method === 'dinheiro') {
      if (typeof tenderedCents !== 'number' || tenderedCents < params.amountCents) {
        tenderedCents = params.amountCents;
      }
      changeCents = Math.max(0, tenderedCents - params.amountCents);
    } else {
      tenderedCents = undefined;
      changeCents = 0;
    }

    const newPayment: PaymentRecord = {
      id: params.operationId,
      method: params.method,
      amountCents: params.amountCents,
      timestamp: nowIso,
      operator: params.operatorName,
      operatorUid: params.operatorUid,
      clientNonce: params.operationId,
      ...(params.method === 'dinheiro' && typeof tenderedCents === 'number'
        ? { tenderedCents }
        : {}),
      ...(params.method === 'dinheiro' && changeCents > 0
        ? { changeCents }
        : {}),
    };

    const historyEntry: ComandaHistoryEntry = {
      id: `hist-pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: nowIso,
      operator: params.operatorName,
      operatorUid: params.operatorUid,
      type: 'pagamento',
      description: `Pagamento de R$ ${(params.amountCents / 100).toFixed(2)} via ${methodLabels[params.method]}`,
      ...(changeCents > 0 ? { details: `Troco devolvido: R$ ${(changeCents / 100).toFixed(2)}` } : {}),
    };

    transaction.set(comandaRef, sanitizeForFirestore({
      ...comanda,
      payments: [...(comanda.payments || []), newPayment],
      history: [...(comanda.history || []), historyEntry],
      lastModifiedByUid: params.operatorUid,
      lastModifiedAt: nowIso,
    }));

    if (!receiptSnap.exists()) {
      const refLabel = comanda.table ? `${comanda.name} (${comanda.table})` : comanda.name;
      const receiptDoc: ReceiptDocument = {
        id: receiptId,
        origin: 'comanda',
        refId: comanda.id,
        refNumber: comanda.number,
        refLabel,
        method: params.method,
        amountCents: params.amountCents, // Troco nunca entra como receita
        paidAt: serverTimestamp(),
        staffUid: params.operatorUid,
        staffName: params.operatorName,
        sourcePaymentId: newPayment.id,
        kind: 'recebimento',
      };
      transaction.set(receiptRef, sanitizeForFirestore(receiptDoc));
    }

    return {
      changeCents,
      alreadyProcessed: false,
      payment: newPayment,
    };
  });
}

/**
 * Consulta se uma operação de pagamento incerta foi efetivada no banco.
 */
export async function checkPaymentOperationStatus(
  comandaId: string,
  operationId: string
): Promise<{ processed: boolean; payment?: PaymentRecord }> {
  const comandaRef = doc(db, 'comandas', comandaId);
  const snap = await getDoc(comandaRef);
  if (!snap.exists()) {
    return { processed: false };
  }
  const comanda = snap.data() as Comanda;
  const payment = (comanda.payments || []).find(
    p => p.id === operationId || p.clientNonce === operationId
  );
  return {
    processed: !!payment,
    payment,
  };
}

/**
 * Encerramento atômico de comanda: rejeita se houver saldo pendente no banco.
 */
export async function atomicCloseComanda(params: {
  comandaId: string;
  operatorUid: string;
  operatorName: string;
}): Promise<void> {
  assertOnline('Encerramento de Comanda');

  const comandaRef = doc(db, 'comandas', params.comandaId);

  await runTransaction(db, async transaction => {
    const snap = await transaction.get(comandaRef);
    if (!snap.exists()) {
      throw new Error('Comanda não encontrada no servidor.');
    }

    const comanda = snap.data() as Comanda;
    if (comanda.status === 'encerrada') {
      return; // Já encerrada
    }

    const { balanceCents } = calculateServerComandaTotals(comanda);
    if (balanceCents > 0) {
      throw new Error(
        `Não é possível encerrar uma comanda com saldo pendente de R$ ${(balanceCents / 100).toFixed(
          2
        )}. Registre a quitação antes de encerrar.`
      );
    }

    const nowIso = new Date().toISOString();

    const historyEntry: ComandaHistoryEntry = {
      id: `hist-close-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: nowIso,
      operator: params.operatorName,
      operatorUid: params.operatorUid,
      type: 'encerramento',
      description: `Comanda encerrada com conta totalmente quitada.`,
    };

    transaction.set(comandaRef, sanitizeForFirestore({
      ...comanda,
      status: 'encerrada',
      closedAt: nowIso,
      history: [...comanda.history, historyEntry],
      lastModifiedByUid: params.operatorUid,
      lastModifiedAt: nowIso,
    }));
  });
}

// ============================================================================
// OPERAÇÕES TRANSACIONAIS DE LOCAÇÃO EM GRUPO (FECHAMENTO POR PARTICIPANTES)
// ============================================================================

/**
 * Divide o valor total da locação em centavos inteiros de forma exata.
 * Distribui eventuais centavos restantes explicitamente nos primeiros participantes,
 * garantindo que a soma dos centavos seja rigorosamente idêntica ao valor total.
 */
export function calculateEqualDivisionCents(totalAmountCents: number, count: number): number[] {
  if (count <= 0) return [];
  const validTotal = Math.max(0, Math.floor(totalAmountCents));
  const base = Math.floor(validTotal / count);
  const remainder = validTotal % count;
  const result: number[] = [];

  for (let i = 0; i < count; i++) {
    result.push(base + (i < remainder ? 1 : 0));
  }

  return result;
}

/**
 * Calcula totais consolidados de uma locação em grupo.
 */
export function calculateGroupRentalTotals(rental: GroupRental) {
  const totalAmountCents = Math.max(0, Math.floor(rental.totalAmountCents || 0));
  const participants = rental.participants || [];

  const totalDueCents = participants.reduce((sum, p) => sum + Math.max(0, Math.floor(p.dueAmountCents || 0)), 0);
  const totalPaidCents = participants.reduce((sum, p) => sum + Math.max(0, Math.floor(p.paidAmountCents || 0)), 0);
  const pendingBalanceCents = Math.max(0, totalAmountCents - totalPaidCents);

  const paidParticipantsCount = participants.filter(p => p.status === 'pago').length;
  const totalParticipantsCount = participants.length;

  return {
    totalAmountCents,
    totalDueCents,
    totalPaidCents,
    pendingBalanceCents,
    paidParticipantsCount,
    totalParticipantsCount,
    isFullyPaid: pendingBalanceCents === 0,
  };
}

/**
 * Lê o maior número de locação já existente no Firestore para inicializar ou reconciliar o contador
 */
export async function getHighestExistingGroupRentalNumber(): Promise<number> {
  try {
    const q = query(collection(db, 'group_rentals'), orderBy('number', 'desc'), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const highestDoc = snap.docs[0].data();
      if (typeof highestDoc.number === 'number' && Number.isInteger(highestDoc.number)) {
        return highestDoc.number;
      }
    }
  } catch {
    // fallback seguro
  }
  return 500;
}

/**
 * Criação transacional de locação em grupo com numeração atômica garantida e unificada.
 */
export async function atomicCreateGroupRental(params: {
  id: string;
  groupName: string;
  date: string;
  time: string;
  space: CourtSpace;
  totalAmountCents: number;
  participantsCount: number;
  operatorUid: string;
  operatorName: string;
}): Promise<GroupRental> {
  assertOnline('Criação de Locação em Grupo');

  const count = Math.max(1, Math.min(60, Math.floor(params.participantsCount)));
  const totalCents = Math.max(1, Math.floor(params.totalAmountCents));

  const counterRef = doc(db, 'metadata', 'group_rentals_counter');
  const rentalRef = doc(db, 'group_rentals', params.id);

  const highestExisting = await getHighestExistingGroupRentalNumber();

  return runTransaction(db, async transaction => {
    const counterSnap = await transaction.get(counterRef);

    let currentLast = highestExisting;
    if (counterSnap.exists()) {
      const current = counterSnap.data().lastNumber;
      if (typeof current === 'number' && Number.isInteger(current)) {
        currentLast = Math.max(currentLast, current);
      }
    }

    const nextNumber = currentLast + 1;
    const divisionCents = calculateEqualDivisionCents(totalCents, count);
    const nowIso = new Date().toISOString();

    const participants: GroupParticipant[] = divisionCents.map((dueCents, index) => ({
      id: `p-${index + 1}`,
      name: `Participante ${index + 1}`,
      dueAmountCents: dueCents,
      paidAmountCents: 0,
      status: 'pendente',
    }));

    const historyEntry: GroupRentalHistoryEntry = {
      id: `hist-gr-open-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: nowIso,
      operator: params.operatorName,
      operatorUid: params.operatorUid,
      type: 'criacao',
      description: `Locação nº ${nextNumber} aberta para "${params.groupName.trim()}" (${params.space}). R$ ${(
        totalCents / 100
      ).toFixed(2)} divididos entre ${count} participantes.`,
    };

    const newRental: GroupRental = {
      id: params.id,
      number: nextNumber,
      groupName: params.groupName.trim(),
      date: params.date,
      time: params.time.trim(),
      space: params.space,
      totalAmountCents: totalCents,
      status: 'aberta',
      participants,
      payments: [],
      history: [historyEntry],
      createdAt: nowIso,
      createdByUid: params.operatorUid,
      createdByName: params.operatorName,
      lastModifiedAt: nowIso,
      lastModifiedByUid: params.operatorUid,
    };

    transaction.set(counterRef, sanitizeForFirestore({
      lastNumber: nextNumber,
      updatedAt: nowIso,
    }));

    transaction.set(rentalRef, sanitizeForFirestore(newRental));

    return newRental;
  });
}

/**
 * Atualiza rapidamente o nome/apelido de um participante.
 */
export async function atomicUpdateParticipantName(params: {
  rentalId: string;
  participantId: string;
  newName: string;
  operatorUid: string;
  operatorName: string;
}): Promise<void> {
  const rentalRef = doc(db, 'group_rentals', params.rentalId);

  await runTransaction(db, async transaction => {
    const snap = await transaction.get(rentalRef);
    if (!snap.exists()) {
      throw new Error('Locação em grupo não encontrada no servidor.');
    }

    const rental = snap.data() as GroupRental;
    const cleanName = params.newName.trim();
    if (!cleanName) {
      throw new Error('O nome do participante não pode ser vazio.');
    }

    const participant = rental.participants.find(p => p.id === params.participantId);
    if (!participant) {
      throw new Error('Participante não encontrado nesta locação.');
    }

    if (participant.name === cleanName) {
      return; // Nada mudou
    }

    const oldName = participant.name;
    const updatedParticipants = rental.participants.map(p =>
      p.id === params.participantId ? { ...p, name: cleanName } : p
    );

    const nowIso = new Date().toISOString();
    const historyEntry: GroupRentalHistoryEntry = {
      id: `hist-gr-rename-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: nowIso,
      operator: params.operatorName,
      operatorUid: params.operatorUid,
      type: 'ajuste_divisao',
      description: `Participante "${oldName}" renomeado para "${cleanName}"`,
    };

    transaction.set(rentalRef, sanitizeForFirestore({
      ...rental,
      participants: updatedParticipants,
      history: [...(rental.history || []), historyEntry],
      lastModifiedAt: nowIso,
      lastModifiedByUid: params.operatorUid,
    }));
  });
}

/**
 * Ajusta partes individuais dos participantes.
 * Bloqueia se a soma não corresponder ao total da locação, ou se tentar reduzir
 * o valor de um participante abaixo do que ele já pagou.
 * Bloqueia redistribuição automática após início dos pagamentos.
 */
export async function atomicAdjustGroupDivision(params: {
  rentalId: string;
  newDueAmounts: { participantId: string; dueAmountCents: number }[];
  operatorUid: string;
  operatorName: string;
}): Promise<void> {
  assertOnline('Ajuste de Divisão');

  const rentalRef = doc(db, 'group_rentals', params.rentalId);

  await runTransaction(db, async transaction => {
    const snap = await transaction.get(rentalRef);
    if (!snap.exists()) {
      throw new Error('Locação em grupo não encontrada.');
    }

    const rental = snap.data() as GroupRental;
    if (rental.status !== 'aberta') {
      throw new Error('Não é possível alterar divisões de uma locação já finalizada.');
    }

    // Validar soma total das novas partes
    const sumNewDues = params.newDueAmounts.reduce((sum, item) => sum + Math.max(0, Math.floor(item.dueAmountCents)), 0);
    if (sumNewDues !== rental.totalAmountCents) {
      throw new Error(
        `A soma das partes (R$ ${(sumNewDues / 100).toFixed(2)}) deve ser exatamente igual ao total da locação (R$ ${(
          rental.totalAmountCents / 100
        ).toFixed(2)}). Diferença: R$ ${((rental.totalAmountCents - sumNewDues) / 100).toFixed(2)}.`
      );
    }

    // Validar integridade contra valores já pagos
    const updatedParticipants: GroupParticipant[] = rental.participants.map(p => {
      const target = params.newDueAmounts.find(item => item.participantId === p.id);
      if (!target) return p;

      const newDue = Math.max(0, Math.floor(target.dueAmountCents));
      if (newDue < p.paidAmountCents) {
        throw new Error(
          `O participante "${p.name}" já pagou R$ ${(p.paidAmountCents / 100).toFixed(
            2
          )}. Sua parte não pode ser reduzida para R$ ${(newDue / 100).toFixed(2)}.`
        );
      }

      let newStatus: import('./types').ParticipantStatus = 'pendente';
      if (p.paidAmountCents >= newDue && newDue > 0) {
        newStatus = 'pago';
      } else if (p.paidAmountCents > 0) {
        newStatus = 'parcial';
      }

      return {
        ...p,
        dueAmountCents: newDue,
        status: newStatus,
      };
    });

    const nowIso = new Date().toISOString();
    const historyEntry: GroupRentalHistoryEntry = {
      id: `hist-gr-adj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: nowIso,
      operator: params.operatorName,
      operatorUid: params.operatorUid,
      type: 'ajuste_divisao',
      description: `Divisão de valores entre participantes reajustada com validação de soma.`,
    };

    transaction.set(rentalRef, sanitizeForFirestore({
      ...rental,
      participants: updatedParticipants,
      history: [...(rental.history || []), historyEntry],
      lastModifiedAt: nowIso,
      lastModifiedByUid: params.operatorUid,
    }));
  });
}

/**
 * Vincula ou desvincula uma comanda individual de bar a um participante.
 */
export async function atomicLinkBarComanda(params: {
  rentalId: string;
  participantId: string;
  comandaId?: string | null;
  operatorUid: string;
  operatorName: string;
}): Promise<void> {
  const rentalRef = doc(db, 'group_rentals', params.rentalId);

  await runTransaction(db, async transaction => {
    const snap = await transaction.get(rentalRef);
    if (!snap.exists()) {
      throw new Error('Locação em grupo não encontrada.');
    }

    const rental = snap.data() as GroupRental;
    const participant = rental.participants.find(p => p.id === params.participantId);
    if (!participant) {
      throw new Error('Participante não encontrado.');
    }

    let comandaNumberDesc = '';
    if (params.comandaId) {
      const comandaRef = doc(db, 'comandas', params.comandaId);
      const cmdSnap = await transaction.get(comandaRef);
      if (!cmdSnap.exists()) {
        throw new Error('Comanda de bar vinculada não encontrada.');
      }
      const cmd = cmdSnap.data() as Comanda;
      if (cmd.status !== 'aberta') {
        throw new Error('A comanda informada já está encerrada.');
      }
      comandaNumberDesc = `Comanda #${cmd.number} (${cmd.name})`;
    }

    const updatedParticipants = rental.participants.map(p => {
      if (p.id === params.participantId) {
        const item: GroupParticipant = {
          id: p.id,
          name: p.name,
          dueAmountCents: p.dueAmountCents,
          paidAmountCents: p.paidAmountCents,
          status: p.status,
          ...(params.comandaId ? { linkedComandaId: params.comandaId } : {}),
        };
        return item;
      }
      return p;
    });

    const nowIso = new Date().toISOString();
    const historyEntry: GroupRentalHistoryEntry = {
      id: `hist-gr-link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: nowIso,
      operator: params.operatorName,
      operatorUid: params.operatorUid,
      type: 'vinculo_bar',
      description: params.comandaId
        ? `Participante "${participant.name}" vinculado à ${comandaNumberDesc}`
        : `Vínculo de comanda do bar removido de "${participant.name}"`,
    };

    transaction.set(rentalRef, sanitizeForFirestore({
      ...rental,
      participants: updatedParticipants,
      history: [...(rental.history || []), historyEntry],
      lastModifiedAt: nowIso,
      lastModifiedByUid: params.operatorUid,
    }));
  });
}

/**
 * Registro transacional de recebimento de locação em grupo com integridade multi-participante,
 * proteção contra repetição (clientNonce), e opção de quitação conjunta e atômica com comanda de bar.
 */
export async function atomicRegisterGroupPayment(params: {
  rentalId: string;
  clientNonce: string;
  method: PaymentMethod;
  tenderedCents?: number;
  payerName?: string;
  operatorUid: string;
  operatorName: string;
  allocations: { participantId: string; amountCents: number }[];
  linkedBarPayment?: {
    participantId: string;
    comandaId: string;
    amountCents: number;
  };
}): Promise<{
  changeCents: number;
  alreadyProcessed: boolean;
  payment?: GroupRentalPayment;
}> {
  assertOnline('Recebimento de Locação em Grupo');

  const rentalRef = doc(db, 'group_rentals', params.rentalId);
  const rentalReceiptId = buildDeterministicReceiptId('locacao', params.rentalId, params.clientNonce);
  const rentalReceiptRef = doc(db, 'receipts', rentalReceiptId);

  const hasLinkedBar = !!(params.linkedBarPayment?.comandaId && params.linkedBarPayment.amountCents > 0);
  const barComandaRef = hasLinkedBar
    ? doc(db, 'comandas', params.linkedBarPayment!.comandaId)
    : null;
  const barReceiptId = hasLinkedBar
    ? buildDeterministicReceiptId('comanda', params.linkedBarPayment!.comandaId, `${params.clientNonce}_bar`)
    : null;
  const barReceiptRef = barReceiptId ? doc(db, 'receipts', barReceiptId) : null;

  return runTransaction(db, async transaction => {
    // 1. Todas as leituras acontecem antes de qualquer escrita (Firestore transaction requirement)
    const [rentalSnap, rentalReceiptSnap, barSnap, barReceiptSnap] = await Promise.all([
      transaction.get(rentalRef),
      transaction.get(rentalReceiptRef),
      barComandaRef ? transaction.get(barComandaRef) : Promise.resolve(null),
      barReceiptRef ? transaction.get(barReceiptRef) : Promise.resolve(null),
    ]);

    if (!rentalSnap.exists()) {
      throw new Error('Locação em grupo não encontrada no servidor.');
    }

    const rental = rentalSnap.data() as GroupRental;

    // Idempotência: verificar se este clientNonce já foi registrado
    const existingPayment = (rental.payments || []).find(
      p => p.id === params.clientNonce || p.clientNonce === params.clientNonce
    );
    if (existingPayment) {
      return {
        changeCents: existingPayment.changeCents || 0,
        alreadyProcessed: true,
        payment: existingPayment,
      };
    }

    if (rental.status !== 'aberta') {
      throw new Error('Não é possível receber pagamentos em uma locação já finalizada ou cancelada.');
    }

    // 2. Validar alocações da locação
    if (!params.allocations || params.allocations.length === 0) {
      throw new Error('Nenhum participante selecionado para recebimento.');
    }

    let totalRentalAmountPaid = 0;
    const validatedAllocations: GroupPaymentAllocation[] = [];

    // Mapear participantes atuais
    const participantMap = new Map<string, GroupParticipant>();
    rental.participants.forEach(p => participantMap.set(p.id, { ...p }));

    for (const alloc of params.allocations) {
      const part = participantMap.get(alloc.participantId);
      if (!part) {
        throw new Error(`Participante com ID "${alloc.participantId}" não existe nesta locação.`);
      }

      const amt = Math.max(0, Math.floor(alloc.amountCents));
      if (amt <= 0) {
        throw new Error(`O valor a pagar para "${part.name}" deve ser maior que zero.`);
      }

      const pendingForPart = part.dueAmountCents - part.paidAmountCents;
      if (amt > pendingForPart) {
        throw new Error(
          `O valor informado de R$ ${(amt / 100).toFixed(2)} para "${part.name}" ultrapassa seu saldo de R$ ${(
            pendingForPart / 100
          )}. Dois operadores podem ter lançado simultaneamente.`
        );
      }

      // Atualizar no mapa local da transação
      part.paidAmountCents += amt;
      part.status = part.paidAmountCents >= part.dueAmountCents ? 'pago' : 'parcial';
      participantMap.set(part.id, part);

      totalRentalAmountPaid += amt;
      validatedAllocations.push({
        participantId: part.id,
        participantName: part.name,
        amountCents: amt,
      });
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // 3. Se houver pagamento vinculado de bar, validar comanda já lida no mesmo ciclo atômico
    let barComandaToUpdate: Comanda | null = null;
    let barPaymentAmountCents = 0;
    let barPaymentRecord: PaymentRecord | null = null;

    if (barComandaRef && params.linkedBarPayment && params.linkedBarPayment.amountCents > 0) {
      if (!barSnap || !barSnap.exists()) {
        throw new Error('Comanda de consumo do bar vinculada não encontrada.');
      }

      const barComanda = barSnap.data() as Comanda;
      if (barComanda.status !== 'aberta') {
        throw new Error(`A Comanda #${barComanda.number} do bar já foi encerrada.`);
      }

      const { balanceCents: barBalance } = calculateServerComandaTotals(barComanda);
      const requestedBarAmount = Math.max(0, Math.floor(params.linkedBarPayment.amountCents));

      if (requestedBarAmount > barBalance) {
        throw new Error(
          `O valor de consumo de R$ ${(requestedBarAmount / 100).toFixed(2)} ultrapassa o saldo atual de R$ ${(
            barBalance / 100
          ).toFixed(2)} da Comanda #${barComanda.number} do bar.`
        );
      }

      barPaymentAmountCents = requestedBarAmount;

      barPaymentRecord = {
        id: `pay-bar-link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        clientNonce: `${params.clientNonce}_bar`,
        method: params.method,
        amountCents: barPaymentAmountCents,
        operator: params.operatorName,
        operatorUid: params.operatorUid,
        timestamp: nowIso,
      };

      const barHistory: ComandaHistoryEntry = {
        id: `hist-bar-link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: nowIso,
        operator: params.operatorName,
        operatorUid: params.operatorUid,
        type: 'pagamento',
        description: `Recebimento de R$ ${(barPaymentAmountCents / 100).toFixed(2)} (${
          methodLabels[params.method]
        }) recebido em conjunto com a Locação nº ${rental.number}`,
        ...(params.payerName?.trim() ? { details: `Pago por: ${params.payerName.trim()}` } : {}),
      };

      const newBarPayments = [...(barComanda.payments || []), barPaymentRecord];
      const newBarBalance = barBalance - barPaymentAmountCents;

      barComandaToUpdate = {
        ...barComanda,
        payments: newBarPayments,
        status: newBarBalance === 0 ? 'encerrada' : 'aberta',
        ...(newBarBalance === 0 ? { closedAt: nowIso } : {}),
        history: [...(barComanda.history || []), barHistory],
        lastModifiedAt: nowIso,
        lastModifiedByUid: params.operatorUid,
      };
      if (newBarBalance !== 0 && 'closedAt' in barComandaToUpdate) {
        delete (barComandaToUpdate as any).closedAt;
      }
    }

    // 4. Calcular troco e validações de dinheiro
    const totalTransactionCashRequired = totalRentalAmountPaid + barPaymentAmountCents;
    let changeCents = 0;

    if (params.method === 'dinheiro') {
      const tendered = Math.max(0, Math.floor(params.tenderedCents || totalTransactionCashRequired));
      if (tendered < totalTransactionCashRequired) {
        throw new Error(
          `O valor entregue de R$ ${(tendered / 100).toFixed(2)} é inferior ao total da operação de R$ ${(
            totalTransactionCashRequired / 100
          ).toFixed(2)}.`
        );
      }
      changeCents = tendered - totalTransactionCashRequired;
    }

    // 5. Atualizar lista de participantes e status da locação
    const updatedParticipantsList: GroupParticipant[] = rental.participants.map(p => {
      const updated = participantMap.get(p.id) || p;
      const cleanItem: GroupParticipant = {
        id: updated.id,
        name: updated.name,
        dueAmountCents: updated.dueAmountCents,
        paidAmountCents: updated.paidAmountCents,
        status: updated.status,
        ...(updated.linkedComandaId ? { linkedComandaId: updated.linkedComandaId } : {}),
      };
      return cleanItem;
    });

    const newTotalPaid = updatedParticipantsList.reduce((sum, p) => sum + p.paidAmountCents, 0);
    const isRentalNowFullyPaid = newTotalPaid >= rental.totalAmountCents;

    const paymentId = params.clientNonce;
    const newGroupPayment: GroupRentalPayment = {
      id: paymentId,
      clientNonce: params.clientNonce,
      timestamp: nowIso,
      method: params.method,
      amountCents: totalRentalAmountPaid,
      operator: params.operatorName,
      operatorUid: params.operatorUid,
      allocations: validatedAllocations,
      ...(params.method === 'dinheiro' && typeof params.tenderedCents === 'number'
        ? { tenderedCents: params.tenderedCents }
        : {}),
      ...(params.method === 'dinheiro' && changeCents > 0
        ? { changeCents }
        : {}),
      ...(params.payerName?.trim()
        ? { payerName: params.payerName.trim() }
        : {}),
      ...(barComandaToUpdate && barPaymentAmountCents > 0
        ? {
            linkedBarPayment: {
              comandaId: barComandaToUpdate.id,
              comandaNumber: barComandaToUpdate.number,
              amountCents: barPaymentAmountCents,
            },
          }
        : {}),
    };

    const participantsNames = validatedAllocations.map(a => a.participantName).join(', ');
    const descParts = [
      `Recebimento de R$ ${(totalRentalAmountPaid / 100).toFixed(2)} via ${methodLabels[params.method]}`,
      `Participante(s): ${participantsNames}`,
    ];
    if (params.payerName?.trim()) {
      descParts.push(`Pagador: "${params.payerName.trim()}"`);
    }
    if (barComandaToUpdate) {
      descParts.push(`+ R$ ${(barPaymentAmountCents / 100).toFixed(2)} do Bar (Comanda #${barComandaToUpdate.number})`);
    }

    const historyEntry: GroupRentalHistoryEntry = {
      id: `hist-gr-pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: nowIso,
      operator: params.operatorName,
      operatorUid: params.operatorUid,
      type: 'pagamento',
      description: descParts.join(' | '),
      ...(params.method === 'dinheiro' && changeCents > 0
        ? { details: `Troco em dinheiro: R$ ${(changeCents / 100).toFixed(2)}` }
        : {}),
    };

    const updatedRental: GroupRental = {
      ...rental,
      participants: updatedParticipantsList,
      payments: [...(rental.payments || []), newGroupPayment],
      history: [...(rental.history || []), historyEntry],
      status: isRentalNowFullyPaid ? 'quitada' : 'aberta',
      ...(isRentalNowFullyPaid ? { closedAt: nowIso } : {}),
      lastModifiedAt: nowIso,
      lastModifiedByUid: params.operatorUid,
    };
    if (!isRentalNowFullyPaid && 'closedAt' in updatedRental) {
      delete (updatedRental as any).closedAt;
    }

    // 6. Gravações atômicas coordenadas + livro `receipts` com mesmo paidAt (serverTimestamp) e jointPaymentId
    const isJointOperation = Boolean(barComandaToUpdate && barPaymentAmountCents > 0 && barPaymentRecord);
    const sharedServerPaidAt = serverTimestamp();

    if (barComandaToUpdate && barComandaRef) {
      transaction.set(barComandaRef, sanitizeForFirestore(barComandaToUpdate));
    }
    transaction.set(rentalRef, sanitizeForFirestore(updatedRental));

    if (!rentalReceiptSnap.exists()) {
      const rentalReceiptDoc: ReceiptDocument = {
        id: rentalReceiptId,
        origin: 'locacao',
        refId: rental.id,
        refNumber: rental.number,
        refLabel: `${rental.groupName} (${rental.space})`,
        method: params.method,
        amountCents: totalRentalAmountPaid, // Somente parcela da quadra; troco nunca entra
        paidAt: sharedServerPaidAt,
        staffUid: params.operatorUid,
        staffName: params.operatorName,
        ...(isJointOperation ? { jointPaymentId: params.clientNonce } : {}),
        sourcePaymentId: newGroupPayment.id,
        kind: 'recebimento',
      };
      transaction.set(rentalReceiptRef, sanitizeForFirestore(rentalReceiptDoc));
    }

    if (isJointOperation && barComandaToUpdate && barPaymentRecord && barReceiptRef && barReceiptId && (!barReceiptSnap || !barReceiptSnap.exists())) {
      const barRefLabel = barComandaToUpdate.table
        ? `${barComandaToUpdate.name} (${barComandaToUpdate.table})`
        : barComandaToUpdate.name;
      const barReceiptDoc: ReceiptDocument = {
        id: barReceiptId,
        origin: 'comanda',
        refId: barComandaToUpdate.id,
        refNumber: barComandaToUpdate.number,
        refLabel: barRefLabel,
        method: params.method,
        amountCents: barPaymentAmountCents,
        paidAt: sharedServerPaidAt,
        staffUid: params.operatorUid,
        staffName: params.operatorName,
        jointPaymentId: params.clientNonce,
        sourcePaymentId: barPaymentRecord.id,
        kind: 'recebimento',
      };
      transaction.set(barReceiptRef, sanitizeForFirestore(barReceiptDoc));
    }

    return {
      changeCents,
      alreadyProcessed: false,
      payment: newGroupPayment,
    };
  });
}

/**
 * Encerramento manual da locação: exige que o saldo seja estritamente zero.
 */
export async function atomicCloseGroupRental(params: {
  rentalId: string;
  operatorUid: string;
  operatorName: string;
}): Promise<void> {
  assertOnline('Encerramento de Locação em Grupo');

  const rentalRef = doc(db, 'group_rentals', params.rentalId);

  await runTransaction(db, async transaction => {
    const snap = await transaction.get(rentalRef);
    if (!snap.exists()) {
      throw new Error('Locação em grupo não encontrada.');
    }

    const rental = snap.data() as GroupRental;
    if (rental.status === 'quitada') {
      return; // Já quitada
    }

    const { pendingBalanceCents } = calculateGroupRentalTotals(rental);
    if (pendingBalanceCents > 0) {
      throw new Error(
        `Não é possível encerrar uma locação com saldo pendente de R$ ${(pendingBalanceCents / 100).toFixed(
          2
        )}. Todos os participantes devem quitar suas partes primeiro.`
      );
    }

    const nowIso = new Date().toISOString();
    const historyEntry: GroupRentalHistoryEntry = {
      id: `hist-gr-close-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: nowIso,
      operator: params.operatorName,
      operatorUid: params.operatorUid,
      type: 'encerramento',
      description: `Locação encerrada e arquivada como quitada.`,
    };

    transaction.set(rentalRef, sanitizeForFirestore({
      ...rental,
      status: 'quitada',
      closedAt: nowIso,
      history: [...(rental.history || []), historyEntry],
      lastModifiedAt: nowIso,
      lastModifiedByUid: params.operatorUid,
    }));
  });
}

/**
 * Consulta se uma operação de pagamento de locação incerta foi efetivada no banco.
 */
export async function checkGroupPaymentOperationStatus(
  rentalId: string,
  operationId: string
): Promise<{ processed: boolean; payment?: GroupRentalPayment }> {
  const rentalRef = doc(db, 'group_rentals', rentalId);
  const snap = await getDoc(rentalRef);
  if (!snap.exists()) {
    return { processed: false };
  }
  const rental = snap.data() as GroupRental;
  const payment = (rental.payments || []).find(
    p => p.id === operationId || p.clientNonce === operationId
  );
  return {
    processed: !!payment,
    payment,
  };
}

