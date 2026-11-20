import { describe, expect, it } from 'vitest';
import {
  buildComandaRefundTransition,
  buildGroupRentalRefundTransition,
  CURRENT_CLIENT_REV,
  getComandaPaymentRefundSummary,
  getGroupPaymentRefundSummary,
  nextClientRevFields,
  STALE_CLIENT_ERROR_MESSAGE,
  translateStaleClientError,
} from './refunds';
import { calculateComandaTotals } from './formatters';
import {
  calculateGroupRentalTotals,
  calculateServerComandaTotals,
} from './firestore-transactions';
import { Comanda, GroupRental } from './types';

function makeComanda(overrides: Partial<Comanda> = {}): Comanda {
  return {
    id: 'cmd-1',
    number: 101,
    type: 'individual',
    name: 'Carlos',
    status: 'aberta',
    openedAt: '2026-11-18T12:00:00.000Z',
    items: [
      {
        id: 'item-1',
        productId: 'prod-cerveja',
        name: 'Cerveja',
        category: 'Bebidas',
        priceCents: 1500,
        quantity: 4, // 6000 centavos (R$ 60,00)
        addedAt: '2026-11-18T12:05:00.000Z',
      },
    ],
    payments: [
      {
        id: 'pay-1',
        clientNonce: 'pay-nonce-1',
        method: 'pix',
        amountCents: 6000,
        timestamp: '2026-11-18T12:20:00.000Z',
        operator: 'Operador Balcão',
        operatorUid: 'op-1',
      },
    ],
    history: [
      {
        id: 'hist-1',
        timestamp: '2026-11-18T12:00:00.000Z',
        operator: 'Operador Balcão',
        type: 'abertura',
        description: 'Comanda aberta',
      },
    ],
    ...overrides,
  };
}

function makeGroupRental(overrides: Partial<GroupRental> = {}): GroupRental {
  return {
    id: 'gr-1',
    number: 501,
    groupName: 'Pelada Quarta',
    date: '2026-11-18',
    time: '19:00',
    space: 'Areia 1',
    totalAmountCents: 12000,
    status: 'quitada',
    closedAt: '2026-11-18T21:00:00.000Z',
    participants: [
      {
        id: 'p-1',
        name: 'João',
        dueAmountCents: 6000,
        paidAmountCents: 6000,
        status: 'pago',
      },
      {
        id: 'p-2',
        name: 'Pedro',
        dueAmountCents: 6000,
        paidAmountCents: 6000,
        status: 'pago',
      },
    ],
    payments: [
      {
        id: 'grpay-1',
        clientNonce: 'grpay-nonce-1',
        method: 'pix',
        amountCents: 12000,
        timestamp: '2026-11-18T20:30:00.000Z',
        operator: 'Operador Balcão',
        operatorUid: 'op-1',
        payerName: 'João',
        allocations: [
          { participantId: 'p-1', participantName: 'João', amountCents: 6000 },
          { participantId: 'p-2', participantName: 'Pedro', amountCents: 6000 },
        ],
      },
    ],
    history: [
      {
        id: 'h-1',
        timestamp: '2026-11-18T19:00:00.000Z',
        operator: 'Operador Balcão',
        type: 'criacao',
        description: 'Locação criada',
      },
    ],
    createdAt: '2026-11-18T19:00:00.000Z',
    createdByUid: 'op-1',
    createdByName: 'Operador Balcão',
    ...overrides,
  };
}

describe('Etapa 4.1 — Domínio de Estorno de Pagamento (lib/refunds)', () => {
  it('estorno parcial e segundo estorno até o teto; bloqueia acima do saldo estornável e preserva pagamento original intacto', () => {
    const cmd = makeComanda({
      status: 'encerrada',
      closedAt: '2026-11-18T12:25:00.000Z',
    });

    const res1 = buildComandaRefundTransition({
      comanda: cmd,
      sourcePaymentId: 'pay-1',
      amountCents: 2500,
      reason: 'Devolução parcial combinada com cliente',
      clientNonce: 'ref-nonce-1',
      adminUid: 'admin-1',
      adminName: 'Cauê Admin',
      nowIso: '2026-11-18T13:00:00.000Z',
    });

    expect(res1.ok).toBe(true);
    if (!res1.ok) return;

    // Comanda encerrada é reaberta e closedAt removido
    expect(res1.reopened).toBe(true);
    expect(res1.updatedComanda.status).toBe('aberta');
    expect('closedAt' in res1.updatedComanda).toBe(false);
    // Pagamento original intacto (append-only)
    expect(res1.updatedComanda.payments).toEqual(cmd.payments);
    // Marca de versão atualizada (trava contra versões antigas)
    expect(res1.updatedComanda.clientRev).toBe(CURRENT_CLIENT_REV);
    expect(res1.updatedComanda.revSeq).toBe(1);
    // Receipt com kind='estorno', método idêntico ao original, motivo e refundId
    expect(res1.receiptPayload.kind).toBe('estorno');
    expect(res1.receiptPayload.method).toBe('pix');
    expect(res1.receiptPayload.amountCents).toBe(2500);
    expect(res1.receiptPayload.sourcePaymentId).toBe('pay-1');
    expect(res1.receiptPayload.refundId).toBe(res1.refund.id);
    expect(res1.receiptPayload.reason).toBe('Devolução parcial combinada com cliente');

    // Totais líquido, bruto e saldo (cliente e servidor)
    const totals1 = calculateComandaTotals(res1.updatedComanda);
    const serverTotals1 = calculateServerComandaTotals(res1.updatedComanda);
    expect(totals1.totalConsumedCents).toBe(6000);
    expect(totals1.totalPaidGrossCents).toBe(6000);
    expect(totals1.totalRefundedCents).toBe(2500);
    expect(totals1.totalPaidCents).toBe(3500);
    expect(totals1.balanceCents).toBe(2500);
    expect(serverTotals1).toEqual({
      totalConsumptionCents: 6000,
      totalPaidGrossCents: 6000,
      totalRefundedCents: 2500,
      totalPaidCents: 3500,
      balanceCents: 2500,
    });

    // Tentativa acima do restante (restante = 3500, tentando 3501) -> bloqueada
    const overRes = buildComandaRefundTransition({
      comanda: res1.updatedComanda,
      sourcePaymentId: 'pay-1',
      amountCents: 3501,
      reason: 'Tentativa acima do limite',
      clientNonce: 'ref-nonce-over',
      adminUid: 'admin-1',
      adminName: 'Cauê Admin',
    });
    expect(overRes.ok).toBe(false);
    if (!overRes.ok) {
      expect(overRes.error).toContain('excede o saldo estornável');
    }

    // Segundo estorno exato de 3500 -> sucesso e saldo estornável zera
    const res2 = buildComandaRefundTransition({
      comanda: res1.updatedComanda,
      sourcePaymentId: 'pay-1',
      amountCents: 3500,
      reason: 'Estorno do saldo restante',
      clientNonce: 'ref-nonce-2',
      adminUid: 'admin-1',
      adminName: 'Cauê Admin',
    });
    expect(res2.ok).toBe(true);
    if (!res2.ok) return;
    expect(res2.updatedComanda.revSeq).toBe(2);
    expect(getComandaPaymentRefundSummary(res2.updatedComanda, 'pay-1')?.refundableCents).toBe(0);
    expect(calculateComandaTotals(res2.updatedComanda).balanceCents).toBe(6000);
  });

  it('idempotência por clientNonce impede estorno duplicado', () => {
    const cmd = makeComanda();
    const first = buildComandaRefundTransition({
      comanda: cmd,
      sourcePaymentId: 'pay-1',
      amountCents: 2000,
      reason: 'Cobrança duplicada',
      clientNonce: 'same-nonce-1',
      adminUid: 'admin-1',
      adminName: 'Cauê Admin',
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retry = buildComandaRefundTransition({
      comanda: first.updatedComanda,
      sourcePaymentId: 'pay-1',
      amountCents: 2000,
      reason: 'Cobrança duplicada',
      clientNonce: 'same-nonce-1',
      adminUid: 'admin-1',
      adminName: 'Cauê Admin',
    });
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.idempotent).toBe(true);
    expect(retry.updatedComanda.refunds).toHaveLength(1);
    expect(retry.receiptId).toBe(first.receiptId);
  });

  it('estorno em dinheiro com troco limita o estorno a amountCents (troco não aumenta teto)', () => {
    const cmd = makeComanda({
      payments: [
        {
          id: 'pay-cash',
          clientNonce: 'pay-cash-1',
          method: 'dinheiro',
          amountCents: 6000,
          tenderedCents: 10000,
          changeCents: 4000,
          timestamp: '2026-11-18T12:20:00.000Z',
          operator: 'Operador',
          operatorUid: 'op-1',
        },
      ],
    });

    const summary = getComandaPaymentRefundSummary(cmd, 'pay-cash');
    expect(summary?.originalAmountCents).toBe(6000);
    expect(summary?.refundableCents).toBe(6000);

    const overCash = buildComandaRefundTransition({
      comanda: cmd,
      sourcePaymentId: 'pay-cash',
      amountCents: 8000, // menor que tenderedCents (10000), mas maior que amountCents (6000)
      reason: 'Tentativa incluindo troco',
      clientNonce: 'ref-cash-over',
      adminUid: 'admin-1',
      adminName: 'Cauê Admin',
    });
    expect(overCash.ok).toBe(false);
  });

  it('motivo ausente ou curto (< 3 chars) é recusado', () => {
    const cmd = makeComanda();
    const resEmpty = buildComandaRefundTransition({
      comanda: cmd,
      sourcePaymentId: 'pay-1',
      amountCents: 1000,
      reason: '   ',
      clientNonce: 'ref-no-reason',
      adminUid: 'admin-1',
      adminName: 'Cauê Admin',
    });
    expect(resEmpty.ok).toBe(false);

    const resShort = buildComandaRefundTransition({
      comanda: cmd,
      sourcePaymentId: 'pay-1',
      amountCents: 1000,
      reason: 'ok',
      clientNonce: 'ref-short-reason',
      adminUid: 'admin-1',
      adminName: 'Cauê Admin',
    });
    expect(resShort.ok).toBe(false);
  });

  it('Ajuste D: estorno de pagamento legado SEM clientNonce (apenas id) funciona normalmente', () => {
    const legacyCmd = makeComanda({
      payments: [
        {
          id: 'legacy-pay-id-99',
          // sem clientNonce!
          method: 'debito',
          amountCents: 4000,
          timestamp: '2026-10-01T15:00:00.000Z',
          operator: 'Operador Antigo',
          operatorUid: 'op-old',
        },
      ],
    });

    const res = buildComandaRefundTransition({
      comanda: legacyCmd,
      sourcePaymentId: 'legacy-pay-id-99',
      amountCents: 4000,
      reason: 'Estorno de pagamento legado sem clientNonce',
      clientNonce: 'ref-legacy-1',
      adminUid: 'admin-1',
      adminName: 'Cauê Admin',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.refund.sourcePaymentId).toBe('legacy-pay-id-99');
    expect(res.receiptPayload.sourcePaymentId).toBe('legacy-pay-id-99');
    expect(res.receiptPayload.jointPaymentId).toBeUndefined();
    expect(calculateServerComandaTotals(res.updatedComanda).totalPaidCents).toBe(0);
    expect(calculateServerComandaTotals(res.updatedComanda).balanceCents).toBe(6000);
  });

  it('Ajuste D: comanda encerrada -> estorno reabre -> paga de novo -> encerra novamente com totais líquidos corretos', () => {
    const closedCmd = makeComanda({
      status: 'encerrada',
      closedAt: '2026-11-18T12:30:00.000Z',
    });

    // 1. Estorno parcial de R$ 20,00 reabre a comanda
    const refRes = buildComandaRefundTransition({
      comanda: closedCmd,
      sourcePaymentId: 'pay-1',
      amountCents: 2000,
      reason: 'Cliente trocou forma de pagamento de R$ 20',
      clientNonce: 'ref-cycle-1',
      adminUid: 'admin-1',
      adminName: 'Cauê Admin',
    });
    expect(refRes.ok).toBe(true);
    if (!refRes.ok) return;
    expect(refRes.updatedComanda.status).toBe('aberta');
    expect(calculateServerComandaTotals(refRes.updatedComanda).balanceCents).toBe(2000);

    // 2. Novo pagamento de R$ 20,00 em dinheiro (com nextClientRevFields)
    const repaidCmd: Comanda = {
      ...refRes.updatedComanda,
      payments: [
        ...refRes.updatedComanda.payments,
        {
          id: 'pay-2',
          clientNonce: 'pay-nonce-2',
          method: 'dinheiro',
          amountCents: 2000,
          timestamp: '2026-11-18T13:10:00.000Z',
          operator: 'Operador Balcão',
          operatorUid: 'op-1',
        },
      ],
      ...nextClientRevFields(refRes.updatedComanda),
    };

    const totalsAfterRepay = calculateServerComandaTotals(repaidCmd);
    expect(totalsAfterRepay.totalConsumptionCents).toBe(6000);
    expect(totalsAfterRepay.totalPaidGrossCents).toBe(8000); // 6000 + 2000
    expect(totalsAfterRepay.totalRefundedCents).toBe(2000);
    expect(totalsAfterRepay.totalPaidCents).toBe(6000); // líquido exato = consumido
    expect(totalsAfterRepay.balanceCents).toBe(0);
    expect(repaidCmd.revSeq).toBe(2);

    // 3. Encerramento permitido porque balanceCents === 0 no cálculo do servidor
    const reclosedCmd: Comanda = {
      ...repaidCmd,
      status: 'encerrada',
      closedAt: '2026-11-18T13:11:00.000Z',
      ...nextClientRevFields(repaidCmd),
    };
    expect(reclosedCmd.status).toBe('encerrada');
    expect(reclosedCmd.revSeq).toBe(3);
    expect(calculateComandaTotals(reclosedCmd).balanceCents).toBe(0);
  });

  it('locação em grupo: estorno parcial reabre locação quitada, recalcula participante e bloqueia locação cancelada', () => {
    const rental = makeGroupRental();

    const res = buildGroupRentalRefundTransition({
      rental,
      sourcePaymentId: 'grpay-1',
      allocations: [{ participantId: 'p-1', amountCents: 2500 }],
      reason: 'João saiu mais cedo e recebeu abatimento',
      clientNonce: 'ref-gr-1',
      adminUid: 'admin-1',
      adminName: 'Cauê Admin',
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.reopened).toBe(true);
    expect(res.updatedRental.status).toBe('aberta');
    expect('closedAt' in res.updatedRental).toBe(false);
    expect(res.updatedRental.payments).toEqual(rental.payments);
    expect(res.updatedRental.clientRev).toBe(CURRENT_CLIENT_REV);
    expect(res.updatedRental.revSeq).toBe(1);

    const p1 = res.updatedRental.participants.find(p => p.id === 'p-1')!;
    const p2 = res.updatedRental.participants.find(p => p.id === 'p-2')!;
    expect(p1.paidAmountCents).toBe(3500);
    expect(p1.status).toBe('parcial');
    expect(p2.paidAmountCents).toBe(6000);
    expect(p2.status).toBe('pago');

    const totals = calculateGroupRentalTotals(res.updatedRental);
    expect(totals.totalPaidGrossCents).toBe(12000);
    expect(totals.totalRefundedCents).toBe(2500);
    expect(totals.totalPaidCents).toBe(9500);
    expect(totals.pendingBalanceCents).toBe(2500);
    expect(totals.isFullyPaid).toBe(false);

    const summaryAfter = getGroupPaymentRefundSummary(res.updatedRental, 'grpay-1')!;
    expect(summaryAfter.refundedCents).toBe(2500);
    expect(summaryAfter.refundableCents).toBe(9500);
    expect(summaryAfter.participantBounds.find(b => b.participantId === 'p-1')?.refundableCents).toBe(3500);

    // Locação cancelada -> bloqueada
    const canceledRental = makeGroupRental({ status: 'cancelada' });
    const cancelRes = buildGroupRentalRefundTransition({
      rental: canceledRental,
      sourcePaymentId: 'grpay-1',
      allocations: [{ participantId: 'p-1', amountCents: 1000 }],
      reason: 'Tentativa em cancelada',
      clientNonce: 'ref-gr-cancel',
      adminUid: 'admin-1',
      adminName: 'Cauê Admin',
    });
    expect(cancelRes.ok).toBe(false);
    if (!cancelRes.ok) {
      expect(cancelRes.error).toContain('cancelada');
    }
  });

  it('pagamento conjunto (bar + quadra): estorno altera somente a parcela escolhida e preserva jointPaymentId', () => {
    const sharedNonce = 'joint-tx-777';
    const cmdBar = makeComanda({
      id: 'cmd-bar-joint',
      number: 42,
      payments: [
        {
          id: 'pay-bar-777',
          clientNonce: `${sharedNonce}_bar`,
          method: 'pix',
          amountCents: 3500,
          timestamp: '2026-11-18T20:00:00.000Z',
          operator: 'Operador',
          operatorUid: 'op-1',
        },
      ],
    });
    const rental = makeGroupRental({
      id: 'gr-joint',
      payments: [
        {
          id: sharedNonce,
          clientNonce: sharedNonce,
          method: 'pix',
          amountCents: 6000,
          timestamp: '2026-11-18T20:00:00.000Z',
          operator: 'Operador',
          operatorUid: 'op-1',
          allocations: [{ participantId: 'p-1', participantName: 'João', amountCents: 6000 }],
          linkedBarPayment: {
            comandaId: 'cmd-bar-joint',
            comandaNumber: 42,
            amountCents: 3500,
          },
        },
      ],
    });

    // Estornar somente a parcela da quadra (teto = 6000, NÃO 9500)
    const overQuadra = buildGroupRentalRefundTransition({
      rental,
      sourcePaymentId: sharedNonce,
      allocations: [{ participantId: 'p-1', amountCents: 6500 }],
      reason: 'Tentando incluir valor do bar',
      clientNonce: 'ref-joint-over',
      adminUid: 'admin-1',
      adminName: 'Cauê Admin',
    });
    expect(overQuadra.ok).toBe(false);

    const okQuadra = buildGroupRentalRefundTransition({
      rental,
      sourcePaymentId: sharedNonce,
      allocations: [{ participantId: 'p-1', amountCents: 6000 }],
      reason: 'Estorno apenas da quadra',
      clientNonce: 'ref-joint-q',
      adminUid: 'admin-1',
      adminName: 'Cauê Admin',
    });
    expect(okQuadra.ok).toBe(true);
    if (okQuadra.ok) {
      expect(okQuadra.refund.jointPaymentId).toBe(sharedNonce);
      expect(okQuadra.receiptPayload.jointPaymentId).toBe(sharedNonce);
      expect(okQuadra.receiptPayload.amountCents).toBe(6000);
    }

    // Estornar somente a parcela do bar
    const okBar = buildComandaRefundTransition({
      comanda: cmdBar,
      sourcePaymentId: 'pay-bar-777',
      amountCents: 1500,
      reason: 'Estorno parcial da parcela do bar',
      clientNonce: 'ref-joint-b',
      adminUid: 'admin-1',
      adminName: 'Cauê Admin',
    });
    expect(okBar.ok).toBe(true);
    if (okBar.ok) {
      expect(okBar.refund.jointPaymentId).toBe(sharedNonce);
      expect(okBar.receiptPayload.jointPaymentId).toBe(sharedNonce);
      expect(okBar.receiptPayload.amountCents).toBe(1500);
    }
  });

  it('translateStaleClientError orienta a atualizar a página quando documento possui estornos e ocorre permission-denied', () => {
    const err = Object.assign(new Error('Missing or insufficient permissions'), {
      code: 'permission-denied',
    });
    expect(translateStaleClientError(err, { hasRefunds: true })).toBe(STALE_CLIENT_ERROR_MESSAGE);
    expect(translateStaleClientError(err, { hasRefunds: true })).toContain('Atualize a página para continuar');
    expect(translateStaleClientError(err, { hasRefunds: false })).toBe('Missing or insufficient permissions');
  });
});
