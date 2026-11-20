import {
  Comanda,
  ComandaHistoryEntry,
  ComandaRefund,
  GroupParticipant,
  GroupPaymentAllocation,
  GroupRental,
  GroupRentalHistoryEntry,
  GroupRentalRefund,
  ParticipantStatus,
  PaymentMethod,
  ReceiptDocument,
} from './types';
import { calculateComandaTotals, formatCents } from './formatters';
import { buildDeterministicRefundReceiptId } from './reports/receipts';

/**
 * Revisão mínima de cliente exigida pelas regras do Firestore para gravar em documentos
 * que já possuem estornos registrados (`refunds.size() > 0`).
 * A cada escrita o app também incrementa `revSeq` para impedir que clientes antigos
 * (que fazem spread `{ ...comanda }` sem conhecer estornos) reaproveitem a marca estática.
 */
export const CURRENT_CLIENT_REV = 2;

export const STALE_CLIENT_ERROR_MESSAGE =
  'Sua tela está desatualizada para esta operação. Atualize a página para continuar.';

export const MIN_REFUND_REASON_LENGTH = 3;
export const MAX_REFUND_REASON_LENGTH = 300;

const METHOD_NAMES_PT: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  debito: 'Cartão de Débito',
  credito: 'Cartão de Crédito',
};

/**
 * Gera os campos de controle de versão (`clientRev` e `revSeq`) para qualquer escrita
 * em `comandas` ou `group_rentals`.
 */
export function nextClientRevFields(doc?: { revSeq?: unknown } | null): {
  clientRev: number;
  revSeq: number;
} {
  const currentSeq =
    typeof doc?.revSeq === 'number' && Number.isInteger(doc.revSeq) && doc.revSeq >= 1
      ? doc.revSeq
      : 0;
  return {
    clientRev: CURRENT_CLIENT_REV,
    revSeq: currentSeq + 1,
  };
}

export function isPermissionDeniedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const candidate = err as { code?: unknown; message?: unknown };
  if (typeof candidate.code === 'string' && candidate.code.includes('permission-denied')) {
    return true;
  }
  if (typeof candidate.message === 'string') {
    const msg = candidate.message.toLowerCase();
    return (
      msg.includes('permission-denied') ||
      msg.includes('missing or insufficient permissions')
    );
  }
  return false;
}

/**
 * Traduz erros de permissão do Firestore quando o documento possui estornos ou
 * revisão superior à suportada pela versão da página aberta no dispositivo.
 */
export function translateStaleClientError(
  err: unknown,
  context?: {
    hasRefunds?: boolean;
    docClientRev?: number;
    fallbackMessage?: string;
  }
): string {
  const isPermDenied = isPermissionDeniedError(err);
  const higherRev =
    typeof context?.docClientRev === 'number' && context.docClientRev > CURRENT_CLIENT_REV;

  if (isPermDenied && (context?.hasRefunds || higherRev)) {
    return STALE_CLIENT_ERROR_MESSAGE;
  }

  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }

  return context?.fallbackMessage || 'Erro ao processar operação no banco de dados.';
}

export interface PaymentRefundSummary<TRefund> {
  originalAmountCents: number;
  refundedCents: number;
  refundableCents: number;
  refunds: TRefund[];
}

export function getComandaPaymentRefundSummary(
  comanda: Pick<Comanda, 'payments' | 'refunds'>,
  sourcePaymentId: string
): PaymentRefundSummary<ComandaRefund> | null {
  const payment = (comanda.payments || []).find(p => p.id === sourcePaymentId);
  if (!payment) return null;

  const originalAmountCents =
    typeof payment.amountCents === 'number' && Number.isInteger(payment.amountCents)
      ? payment.amountCents
      : 0;

  const refunds = (comanda.refunds || []).filter(r => r.sourcePaymentId === sourcePaymentId);
  const refundedCents = refunds.reduce(
    (sum, r) => sum + (Number.isInteger(r.amountCents) && r.amountCents > 0 ? r.amountCents : 0),
    0
  );

  return {
    originalAmountCents,
    refundedCents,
    refundableCents: Math.max(0, originalAmountCents - refundedCents),
    refunds,
  };
}

export interface GroupParticipantRefundBound {
  participantId: string;
  participantName: string;
  originalAllocatedCents: number;
  refundedCents: number;
  refundableCents: number;
  currentPaidCents: number;
}

export interface GroupPaymentRefundSummary extends PaymentRefundSummary<GroupRentalRefund> {
  participantBounds: GroupParticipantRefundBound[];
}

export function getGroupPaymentRefundSummary(
  rental: Pick<GroupRental, 'participants' | 'payments' | 'refunds'>,
  sourcePaymentId: string
): GroupPaymentRefundSummary | null {
  const payment = (rental.payments || []).find(p => p.id === sourcePaymentId);
  if (!payment) return null;

  const originalAmountCents =
    typeof payment.amountCents === 'number' && Number.isInteger(payment.amountCents)
      ? payment.amountCents
      : 0;

  const refunds = (rental.refunds || []).filter(r => r.sourcePaymentId === sourcePaymentId);
  const refundedCents = refunds.reduce(
    (sum, r) => sum + (Number.isInteger(r.amountCents) && r.amountCents > 0 ? r.amountCents : 0),
    0
  );

  const refundedByParticipant = new Map<string, number>();
  for (const r of refunds) {
    for (const alloc of r.allocations || []) {
      const prev = refundedByParticipant.get(alloc.participantId) || 0;
      refundedByParticipant.set(alloc.participantId, prev + alloc.amountCents);
    }
  }

  const participantsById = new Map<string, GroupParticipant>();
  for (const p of rental.participants || []) {
    participantsById.set(p.id, p);
  }

  const participantBounds: GroupParticipantRefundBound[] = (payment.allocations || []).map(alloc => {
    const part = participantsById.get(alloc.participantId);
    const currentPaidCents = part ? Math.max(0, Math.floor(part.paidAmountCents || 0)) : 0;
    const refundedForPart = refundedByParticipant.get(alloc.participantId) || 0;
    const remainingFromPayment = Math.max(0, alloc.amountCents - refundedForPart);
    const refundableForPart = Math.min(remainingFromPayment, currentPaidCents);
    return {
      participantId: alloc.participantId,
      participantName: part?.name || alloc.participantName,
      originalAllocatedCents: alloc.amountCents,
      refundedCents: refundedForPart,
      refundableCents: refundableForPart,
      currentPaidCents,
    };
  });

  const maxFromParticipants = participantBounds.reduce((sum, b) => sum + b.refundableCents, 0);
  const refundableCents = Math.min(
    Math.max(0, originalAmountCents - refundedCents),
    maxFromParticipants
  );

  return {
    originalAmountCents,
    refundedCents,
    refundableCents,
    refunds,
    participantBounds,
  };
}

export function validateRefundReason(rawReason: string): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = typeof rawReason === 'string' ? rawReason.trim() : '';
  if (trimmed.length < MIN_REFUND_REASON_LENGTH) {
    return {
      ok: false,
      error: `Informe um motivo válido para o estorno (mínimo de ${MIN_REFUND_REASON_LENGTH} caracteres).`,
    };
  }
  if (trimmed.length > MAX_REFUND_REASON_LENGTH) {
    return {
      ok: false,
      error: `O motivo do estorno deve ter no máximo ${MAX_REFUND_REASON_LENGTH} caracteres.`,
    };
  }
  return { ok: true, value: trimmed };
}

function validateRefundNonce(rawNonce: string): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = typeof rawNonce === 'string' ? rawNonce.trim() : '';
  if (!trimmed || trimmed.length > 100) {
    return { ok: false, error: 'Chave de idempotência do estorno ausente ou inválida.' };
  }
  return { ok: true, value: trimmed };
}

export interface ComandaRefundTransitionInput {
  comanda: Comanda;
  sourcePaymentId: string;
  amountCents: number;
  reason: string;
  clientNonce: string;
  adminUid: string;
  adminName: string;
  nowIso?: string;
}

export type ComandaRefundTransitionResult =
  | {
      ok: true;
      idempotent: boolean;
      updatedComanda: Comanda;
      refund: ComandaRefund;
      receiptId: string;
      receiptPayload: Omit<ReceiptDocument, 'paidAt'>;
      reopened: boolean;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Calcula de forma pura e determinística a transição de estorno de um pagamento de comanda.
 * - Nunca edita nem remove o pagamento original em `payments[]`.
 * - Garante idempotência por `clientNonce`.
 * - Limita o estorno ao saldo estornável do pagamento original (`amountCents - estornosAnteriores`).
 * - Troco original não aumenta o teto estornável.
 * - Comanda encerrada é reaberta (`status: 'aberta'`, `closedAt` removido).
 */
export function buildComandaRefundTransition(
  input: ComandaRefundTransitionInput
): ComandaRefundTransitionResult {
  const { comanda, sourcePaymentId, amountCents, adminUid, adminName } = input;
  const nowIso = input.nowIso || new Date().toISOString();

  if (!adminUid || !adminUid.trim()) {
    return { ok: false, error: 'Administrador não identificado para registrar estorno.' };
  }

  const nonceCheck = validateRefundNonce(input.clientNonce);
  if (!nonceCheck.ok) return nonceCheck;
  const clientNonce = nonceCheck.value;

  const existingRefunds = Array.isArray(comanda.refunds) ? comanda.refunds : [];
  const existingByNonce = existingRefunds.find(r => r.clientNonce === clientNonce);
  if (existingByNonce) {
    const cmdLabel = comanda.table ? `${comanda.name} (${comanda.table})` : comanda.name;
    return {
      ok: true,
      idempotent: true,
      updatedComanda: comanda,
      refund: existingByNonce,
      receiptId: existingByNonce.receiptId,
      receiptPayload: {
        id: existingByNonce.receiptId,
        origin: 'comanda',
        refId: comanda.id,
        refNumber: comanda.number,
        refLabel: cmdLabel.slice(0, 200),
        method: existingByNonce.method,
        amountCents: existingByNonce.amountCents,
        staffUid: existingByNonce.operatorUid,
        staffName: existingByNonce.operator.slice(0, 128),
        ...(existingByNonce.jointPaymentId ? { jointPaymentId: existingByNonce.jointPaymentId } : {}),
        sourcePaymentId: existingByNonce.sourcePaymentId,
        refundId: existingByNonce.id,
        reason: existingByNonce.reason,
        kind: 'estorno',
      },
      reopened: false,
    };
  }

  const reasonCheck = validateRefundReason(input.reason);
  if (!reasonCheck.ok) return reasonCheck;
  const reason = reasonCheck.value;

  if (!Number.isFinite(amountCents) || !Number.isInteger(amountCents) || amountCents <= 0) {
    return {
      ok: false,
      error: 'O valor do estorno deve ser um número inteiro de centavos maior que zero.',
    };
  }

  const originalPayment = (comanda.payments || []).find(p => p.id === sourcePaymentId);
  if (!originalPayment) {
    return { ok: false, error: 'Pagamento original não encontrado nesta comanda.' };
  }

  const summary = getComandaPaymentRefundSummary(comanda, sourcePaymentId);
  if (!summary || summary.refundableCents <= 0) {
    return { ok: false, error: 'Este pagamento já foi totalmente estornado.' };
  }

  if (amountCents > summary.refundableCents) {
    return {
      ok: false,
      error: `O valor do estorno (${formatCents(amountCents)}) excede o saldo estornável deste pagamento (${formatCents(
        summary.refundableCents
      )}).`,
    };
  }

  const safeAdminName = (adminName || 'Administrador').trim().slice(0, 128) || 'Administrador';
  const receiptId = buildDeterministicRefundReceiptId('comanda', comanda.id, clientNonce);
  const refundId = `ref_${clientNonce}`;

  const rawNonce = typeof originalPayment.clientNonce === 'string' ? originalPayment.clientNonce.trim() : '';
  const jointPaymentId =
    rawNonce.endsWith('_bar') && rawNonce.length > 4 ? rawNonce.slice(0, -4) : undefined;

  const refund: ComandaRefund = {
    id: refundId,
    clientNonce,
    receiptId,
    sourcePaymentId: originalPayment.id,
    method: originalPayment.method,
    amountCents,
    reason,
    timestamp: nowIso,
    operator: safeAdminName,
    operatorUid: adminUid,
    ...(jointPaymentId ? { jointPaymentId } : {}),
  };

  const wasClosed = comanda.status === 'encerrada';
  const updatedRefunds = [...existingRefunds, refund];
  const projectedTotals = calculateComandaTotals({
    items: comanda.items,
    payments: comanda.payments,
    refunds: updatedRefunds,
  });

  const historyEntry: ComandaHistoryEntry = {
    id: `hist_ref_${clientNonce}`,
    timestamp: nowIso,
    operator: safeAdminName,
    operatorUid: adminUid,
    type: 'estorno',
    description: `Estorno de ${formatCents(amountCents)} via ${METHOD_NAMES_PT[originalPayment.method]} (ref. pagamento ${originalPayment.id}).`,
    details: `Motivo: ${reason}${wasClosed ? ' | Comanda reaberta automaticamente.' : ''} | Saldo pendente: ${formatCents(projectedTotals.balanceCents)}.`,
  };

  const { closedAt: _removedClosedAt, ...comandaWithoutClosedAt } = comanda;
  void _removedClosedAt;

  const updatedComanda: Comanda = {
    ...comandaWithoutClosedAt,
    status: 'aberta',
    refunds: updatedRefunds,
    history: [...(comanda.history || []), historyEntry],
    lastModifiedAt: nowIso,
    lastModifiedByUid: adminUid,
    ...nextClientRevFields(comanda),
  };

  const cmdLabel = comanda.table ? `${comanda.name} (${comanda.table})` : comanda.name;

  const receiptPayload: Omit<ReceiptDocument, 'paidAt'> = {
    id: receiptId,
    origin: 'comanda',
    refId: comanda.id,
    refNumber: comanda.number,
    refLabel: cmdLabel.slice(0, 200),
    method: originalPayment.method,
    amountCents,
    staffUid: adminUid,
    staffName: safeAdminName,
    ...(jointPaymentId ? { jointPaymentId } : {}),
    sourcePaymentId: originalPayment.id,
    refundId,
    reason,
    kind: 'estorno',
  };

  return {
    ok: true,
    idempotent: false,
    updatedComanda,
    refund,
    receiptId,
    receiptPayload,
    reopened: wasClosed,
  };
}

export interface GroupRentalRefundTransitionInput {
  rental: GroupRental;
  sourcePaymentId: string;
  allocations: { participantId: string; amountCents: number }[];
  reason: string;
  clientNonce: string;
  adminUid: string;
  adminName: string;
  nowIso?: string;
}

export type GroupRentalRefundTransitionResult =
  | {
      ok: true;
      idempotent: boolean;
      updatedRental: GroupRental;
      refund: GroupRentalRefund;
      receiptId: string;
      receiptPayload: Omit<ReceiptDocument, 'paidAt'>;
      reopened: boolean;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Calcula de forma pura e determinística a transição de estorno de um pagamento de locação em grupo.
 * - Bloqueia estorno se a locação estiver `cancelada`.
 * - Estorna somente a parcela da quadra (nunca altera automaticamente uma comanda de bar vinculada).
 * - Atualiza `participants[].paidAmountCents` e `status` (`pendente` / `parcial` / `pago`).
 * - Locação `quitada` é reaberta (`status: 'aberta'`, `closedAt` removido).
 */
export function buildGroupRentalRefundTransition(
  input: GroupRentalRefundTransitionInput
): GroupRentalRefundTransitionResult {
  const { rental, sourcePaymentId, allocations, adminUid, adminName } = input;
  const nowIso = input.nowIso || new Date().toISOString();

  if (!adminUid || !adminUid.trim()) {
    return { ok: false, error: 'Administrador não identificado para registrar estorno.' };
  }

  if (rental.status === 'cancelada') {
    return {
      ok: false,
      error: 'Não é possível registrar estorno em uma locação cancelada.',
    };
  }

  const nonceCheck = validateRefundNonce(input.clientNonce);
  if (!nonceCheck.ok) return nonceCheck;
  const clientNonce = nonceCheck.value;

  const existingRefunds = Array.isArray(rental.refunds) ? rental.refunds : [];
  const existingByNonce = existingRefunds.find(r => r.clientNonce === clientNonce);
  if (existingByNonce) {
    const rentalLabel = `${rental.groupName} (${rental.space})`;
    return {
      ok: true,
      idempotent: true,
      updatedRental: rental,
      refund: existingByNonce,
      receiptId: existingByNonce.receiptId,
      receiptPayload: {
        id: existingByNonce.receiptId,
        origin: 'locacao',
        refId: rental.id,
        refNumber: rental.number,
        refLabel: rentalLabel.slice(0, 200),
        method: existingByNonce.method,
        amountCents: existingByNonce.amountCents,
        staffUid: existingByNonce.operatorUid,
        staffName: existingByNonce.operator.slice(0, 128),
        ...(existingByNonce.jointPaymentId ? { jointPaymentId: existingByNonce.jointPaymentId } : {}),
        sourcePaymentId: existingByNonce.sourcePaymentId,
        refundId: existingByNonce.id,
        reason: existingByNonce.reason,
        kind: 'estorno',
      },
      reopened: false,
    };
  }

  const reasonCheck = validateRefundReason(input.reason);
  if (!reasonCheck.ok) return reasonCheck;
  const reason = reasonCheck.value;

  const originalPayment = (rental.payments || []).find(p => p.id === sourcePaymentId);
  if (!originalPayment) {
    return { ok: false, error: 'Pagamento original não encontrado nesta locação.' };
  }

  const summary = getGroupPaymentRefundSummary(rental, sourcePaymentId);
  if (!summary || summary.refundableCents <= 0) {
    return { ok: false, error: 'Este pagamento já foi totalmente estornado.' };
  }

  if (!Array.isArray(allocations) || allocations.length === 0) {
    return { ok: false, error: 'Selecione ao menos um participante com valor válido para estornar.' };
  }

  const boundsByParticipant = new Map(
    summary.participantBounds.map(b => [b.participantId, b])
  );
  const seenParticipants = new Set<string>();
  const resolvedAllocations: GroupPaymentAllocation[] = [];
  let totalRefundCents = 0;

  for (const item of allocations) {
    if (!item || typeof item.participantId !== 'string' || !item.participantId.trim()) {
      return { ok: false, error: 'Participante inválido na distribuição do estorno.' };
    }
    if (seenParticipants.has(item.participantId)) {
      return { ok: false, error: 'Participante duplicado na distribuição do estorno.' };
    }
    seenParticipants.add(item.participantId);

    if (
      !Number.isFinite(item.amountCents) ||
      !Number.isInteger(item.amountCents) ||
      item.amountCents <= 0
    ) {
      return {
        ok: false,
        error: 'O valor estornado por participante deve ser inteiro e maior que zero.',
      };
    }

    const bound = boundsByParticipant.get(item.participantId);
    if (!bound) {
      return {
        ok: false,
        error: 'O participante selecionado não faz parte deste pagamento original.',
      };
    }

    if (item.amountCents > bound.refundableCents) {
      return {
        ok: false,
        error: `O estorno para ${bound.participantName} (${formatCents(
          item.amountCents
        )}) excede o saldo estornável dele neste pagamento (${formatCents(bound.refundableCents)}).`,
      };
    }

    resolvedAllocations.push({
      participantId: bound.participantId,
      participantName: bound.participantName,
      amountCents: item.amountCents,
    });
    totalRefundCents += item.amountCents;
  }

  if (totalRefundCents <= 0) {
    return { ok: false, error: 'O valor total do estorno deve ser maior que zero.' };
  }

  if (totalRefundCents > summary.refundableCents) {
    return {
      ok: false,
      error: `O valor total do estorno (${formatCents(
        totalRefundCents
      )}) excede o saldo estornável deste pagamento (${formatCents(summary.refundableCents)}).`,
    };
  }

  const deductionMap = new Map(resolvedAllocations.map(a => [a.participantId, a.amountCents]));
  const updatedParticipants: GroupParticipant[] = (rental.participants || []).map(p => {
    const deduct = deductionMap.get(p.id) || 0;
    if (deduct <= 0) return p;

    const newPaid = Math.max(0, p.paidAmountCents - deduct);
    let newStatus: ParticipantStatus = 'pendente';
    if (newPaid >= p.dueAmountCents && p.dueAmountCents > 0) {
      newStatus = 'pago';
    } else if (newPaid > 0) {
      newStatus = 'parcial';
    } else if (p.dueAmountCents === 0) {
      newStatus = 'pago';
    }

    return {
      ...p,
      paidAmountCents: newPaid,
      status: newStatus,
    };
  });

  const safeAdminName = (adminName || 'Administrador').trim().slice(0, 128) || 'Administrador';
  const receiptId = buildDeterministicRefundReceiptId('locacao', rental.id, clientNonce);
  const refundId = `ref_${clientNonce}`;

  const rawNonce = typeof originalPayment.clientNonce === 'string' ? originalPayment.clientNonce.trim() : '';
  const hasLinkedBar = Boolean(
    originalPayment.linkedBarPayment && originalPayment.linkedBarPayment.amountCents > 0
  );
  const jointPaymentId = hasLinkedBar ? rawNonce || originalPayment.id : undefined;

  const refund: GroupRentalRefund = {
    id: refundId,
    clientNonce,
    receiptId,
    sourcePaymentId: originalPayment.id,
    method: originalPayment.method,
    amountCents: totalRefundCents,
    reason,
    timestamp: nowIso,
    operator: safeAdminName,
    operatorUid: adminUid,
    allocations: resolvedAllocations,
    ...(jointPaymentId ? { jointPaymentId } : {}),
  };

  const wasClosed = rental.status === 'quitada';
  const allocSummary = resolvedAllocations
    .map(a => `${a.participantName} (${formatCents(a.amountCents)})`)
    .join(', ');

  const historyEntry: GroupRentalHistoryEntry = {
    id: `hist_ref_${clientNonce}`,
    timestamp: nowIso,
    operator: safeAdminName,
    operatorUid: adminUid,
    type: 'estorno',
    description: `Estorno de ${formatCents(totalRefundCents)} via ${METHOD_NAMES_PT[originalPayment.method]} para: ${allocSummary}.`,
    details: `Motivo: ${reason}${wasClosed ? ' | Locação reaberta automaticamente.' : ''}${
      hasLinkedBar
        ? ` | Pagamento conjunto: estornada apenas a parcela da quadra (Comanda #${originalPayment.linkedBarPayment?.comandaNumber} não alterada).`
        : ''
    }`,
  };

  const { closedAt: _removedClosedAt, ...rentalWithoutClosedAt } = rental;
  void _removedClosedAt;

  const updatedRental: GroupRental = {
    ...rentalWithoutClosedAt,
    status: 'aberta',
    participants: updatedParticipants,
    refunds: [...existingRefunds, refund],
    history: [...(rental.history || []), historyEntry],
    lastModifiedAt: nowIso,
    lastModifiedByUid: adminUid,
    ...nextClientRevFields(rental),
  };

  const rentalLabel = `${rental.groupName} (${rental.space})`;

  const receiptPayload: Omit<ReceiptDocument, 'paidAt'> = {
    id: receiptId,
    origin: 'locacao',
    refId: rental.id,
    refNumber: rental.number,
    refLabel: rentalLabel.slice(0, 200),
    method: originalPayment.method,
    amountCents: totalRefundCents,
    staffUid: adminUid,
    staffName: safeAdminName,
    ...(jointPaymentId ? { jointPaymentId } : {}),
    sourcePaymentId: originalPayment.id,
    refundId,
    reason,
    kind: 'estorno',
  };

  return {
    ok: true,
    idempotent: false,
    updatedRental,
    refund,
    receiptId,
    receiptPayload,
    reopened: wasClosed,
  };
}
