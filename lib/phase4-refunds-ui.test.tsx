import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Comanda, GroupRental, StaffMember } from './types';
import { aggregateReceipts } from './reports/aggregate';
import { ReceiptLine } from './reports/receipts';

const mockUseComandas = vi.fn();

vi.mock('@/context/ComandasContext', () => ({
  useComandas: () => mockUseComandas(),
}));

import { RefundPaymentModal } from '@/components/comandas/RefundPaymentModal';
import { GroupRentalDetailModal } from '@/components/comandas/GroupRentalDetailModal';
import { ReceiptsBarChart } from '@/components/relatorios/ReceiptsBarChart';
import { ReceiptsReconciliationModal } from '@/components/relatorios/ReceiptsReconciliationModal';
import { CaixaAdminContent } from '@/components/caixa/CaixaView';

const ADMIN_STAFF: StaffMember = {
  uid: 'uid-admin-1',
  email: 'admin@engenhodabola.com',
  name: 'Cauê Admin',
  role: 'admin',
  active: true,
  createdAt: '2026-01-01T12:00:00.000Z',
};

const OPERATOR_STAFF: StaffMember = {
  uid: 'uid-op-1',
  email: 'op@engenhodabola.com',
  name: 'Operador Balcão',
  role: 'operator',
  active: true,
  createdAt: '2026-01-01T12:00:00.000Z',
};

describe('Etapa 4.1 — Testes de UI para Estornos, Comanda Vinculada e Relatórios', () => {
  beforeEach(() => {
    mockUseComandas.mockReset();
  });

  it('Ajuste B: RefundPaymentModal exibe título/botão "Registrar estorno", aviso de devolução externa e atalho de pagamento conjunto', () => {
    const cmd: Comanda = {
      id: 'cmd-1',
      number: 12,
      type: 'individual',
      name: 'Lucas',
      status: 'encerrada',
      openedAt: '2026-11-18T12:00:00.000Z',
      closedAt: '2026-11-18T13:00:00.000Z',
      items: [
        {
          id: 'i-1',
          productId: 'p-1',
          name: 'Cerveja',
          category: 'Bebidas',
          priceCents: 1500,
          quantity: 2,
          addedAt: '2026-11-18T12:05:00.000Z',
        },
      ],
      payments: [
        {
          id: 'pay-1',
          clientNonce: 'joint-1_bar',
          method: 'pix',
          amountCents: 3000,
          timestamp: '2026-11-18T12:30:00.000Z',
          operator: 'Operador',
          operatorUid: 'uid-op-1',
        },
      ],
      history: [],
    };

    const html = renderToStaticMarkup(
      <RefundPaymentModal
        mode="comanda"
        comanda={cmd}
        payment={cmd.payments[0]}
        jointShortcut={{
          label: 'Abrir Locação #501',
          description: 'Este estorno altera somente a parcela do bar.',
          onOpen: () => {},
        }}
        onSubmit={async () => ({ success: true })}
        onClose={() => {}}
      />
    );

    expect(html).toContain('Registrar estorno');
    expect(html).toContain('A devolução do dinheiro, do Pix ou do cartão é feita fora do sistema');
    expect(html).toContain('reaberta automaticamente');
    expect(html).toContain('Abrir Locação #501');
  });

  it('Ajuste D: GroupRentalDetailModal reflete o saldo restaurado de comanda de bar vinculada (linkedComandaId) após estorno', () => {
    const linkedComandaWithRefund: Comanda = {
      id: 'cmd-linked-1',
      number: 88,
      type: 'individual',
      name: 'João',
      status: 'aberta',
      openedAt: '2026-11-18T18:00:00.000Z',
      items: [
        {
          id: 'i-1',
          productId: 'p-1',
          name: 'Espetinho',
          category: 'Cozinha',
          priceCents: 2000,
          quantity: 2, // R$ 40,00
          addedAt: '2026-11-18T18:10:00.000Z',
        },
      ],
      payments: [
        {
          id: 'pay-bar-1',
          clientNonce: 'nonce-bar-1',
          method: 'pix',
          amountCents: 4000,
          timestamp: '2026-11-18T19:00:00.000Z',
          operator: 'Operador',
          operatorUid: 'uid-op-1',
        },
      ],
      refunds: [
        {
          id: 'ref-bar-1',
          clientNonce: 'ref-nonce-bar-1',
          receiptId: 'rcpt_est_cmd_cmd-linked-1_ref-nonce-bar-1',
          sourcePaymentId: 'pay-bar-1',
          method: 'pix',
          amountCents: 1500, // R$ 15,00 estornado -> saldo da comanda volta a R$ 15,00
          reason: 'Erro na cobrança do bar',
          timestamp: '2026-11-18T19:15:00.000Z',
          operator: 'Cauê Admin',
          operatorUid: 'uid-admin-1',
        },
      ],
      history: [],
    };

    const rental: GroupRental = {
      id: 'gr-linked-1',
      number: 510,
      groupName: 'Pelada Quinta',
      date: '2026-11-18',
      time: '19:00',
      space: 'Areia 1',
      totalAmountCents: 6000,
      status: 'aberta',
      participants: [
        {
          id: 'p-1',
          name: 'João',
          dueAmountCents: 6000,
          paidAmountCents: 0,
          status: 'pendente',
          linkedComandaId: 'cmd-linked-1',
        },
      ],
      payments: [],
      history: [],
      createdAt: '2026-11-18T18:00:00.000Z',
      createdByUid: 'uid-op-1',
      createdByName: 'Operador',
    };

    mockUseComandas.mockReturnValue({
      groupRentals: [rental],
      comandas: [linkedComandaWithRefund],
      currentStaff: OPERATOR_STAFF,
      updateParticipantName: vi.fn(),
      adjustGroupDivision: vi.fn(),
      linkBarComanda: vi.fn(),
      registerGroupPayment: vi.fn(),
      refundGroupRentalPayment: vi.fn(),
      closeGroupRental: vi.fn(),
      verifyGroupPaymentStatus: vi.fn(),
      setSelectedComandaId: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <GroupRentalDetailModal rentalId="gr-linked-1" onClose={() => {}} />
    );

    // Antes da correção, o cálculo manual (4000 - 4000) mostrava #88 (R$ 0,00).
    // Agora usa calculateComandaTotals e exibe o saldo real de R$ 15,00!
    expect(html).toContain('#88');
    expect(html).toContain('15,00');
  });

  it('ReceiptsBarChart renderiza dia líquido negativo sem nenhum atributo height negativo no SVG', () => {
    const lines: ReceiptLine[] = [
      {
        id: 'rcpt-pos',
        paidAtIso: '2026-11-18T15:00:00.000Z',
        dateKey: '2026-11-18',
        origin: 'comanda',
        refId: 'c1',
        refNumber: 1,
        refLabel: 'Mesa 1',
        method: 'pix',
        amountCents: 6000,
        operatorName: 'Op',
        operatorUid: 'op-1',
        kind: 'recebimento',
      },
      {
        id: 'rcpt-neg',
        paidAtIso: '2026-11-19T15:00:00.000Z',
        dateKey: '2026-11-19',
        origin: 'comanda',
        refId: 'c1',
        refNumber: 1,
        refLabel: 'Mesa 1',
        method: 'pix',
        amountCents: 6000,
        operatorName: 'Admin',
        operatorUid: 'adm-1',
        reason: 'Estorno no dia seguinte',
        kind: 'estorno',
      },
    ];
    const agg = aggregateReceipts(lines, '2026-11-18', '2026-11-19');

    const html = renderToStaticMarkup(
      <ReceiptsBarChart
        buckets={agg.dailySeries}
        granularity="dia"
        onSelectBucket={() => {}}
      />
    );

    expect(html).toContain('Saldo líquido negativo (estornos)');
    expect(html).not.toMatch(/height="-/);
  });

  it('ReceiptsReconciliationModal e CaixaAdminContent exibem estornos e motivo corretamente', () => {
    const lines: ReceiptLine[] = [
      {
        id: 'rcpt-1',
        paidAtIso: '2026-11-19T14:00:00.000Z',
        dateKey: '2026-11-19',
        origin: 'comanda',
        refId: 'c1',
        refNumber: 10,
        refLabel: 'Carlos',
        method: 'pix',
        amountCents: 5000,
        operatorName: 'Op',
        operatorUid: 'op-1',
        kind: 'recebimento',
      },
      {
        id: 'rcpt-2',
        paidAtIso: '2026-11-19T15:00:00.000Z',
        dateKey: '2026-11-19',
        origin: 'comanda',
        refId: 'c1',
        refNumber: 10,
        refLabel: 'Carlos',
        method: 'pix',
        amountCents: 2000,
        operatorName: ADMIN_STAFF.name,
        operatorUid: ADMIN_STAFF.uid,
        sourcePaymentId: 'pay-1',
        reason: 'Cobrança duplicada no balcão',
        kind: 'estorno',
      },
    ];
    const agg = aggregateReceipts(lines, '2026-11-19', '2026-11-19');

    const modalHtml = renderToStaticMarkup(
      <ReceiptsReconciliationModal
        scope={{
          title: 'Total do dia',
          subtitle: '19/11/2026',
          expectedAmountCents: 3000,
        }}
        allPeriodLines={lines}
        jointPaymentCounts={{}}
        onClose={() => {}}
        onOpenComanda={() => {}}
        onOpenGroupRental={() => {}}
      />
    );
    expect(modalHtml).toContain('Motivo do estorno: Cobrança duplicada no balcão');
    expect(modalHtml).toContain('Estorno');

    const caixaHtml = renderToStaticMarkup(
      <CaixaAdminContent
        todayDateKey="2026-11-19"
        isLoading={false}
        error={null}
        summary={agg}
        issues={[]}
        onRetry={() => {}}
      />
    );
    expect(caixaHtml).toContain('30,00');
    expect(caixaHtml).toContain('Inclui 1 estorno');
    expect(caixaHtml).toContain('20,00');
  });
});
