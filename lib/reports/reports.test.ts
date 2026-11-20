import { describe, it, expect } from 'vitest';
import { Comanda, GroupRental } from '@/lib/types';
import {
  buildDeterministicReceiptId,
  buildReceiptLines,
} from './receipts';
import {
  getSaoPauloDateRangeBounds,
  getSaoPauloDayStartUtc,
  mapReceiptDocsToLines,
  paginateAll,
  planHistoricalBackfill,
} from './receipts-firestore';
import {
  aggregateReceipts,
  calculateCurrentPending,
  resolvePeriodRange,
} from './aggregate';
import { buildReceiptsCsv } from './csv';

function makeComanda(overrides: Partial<Comanda> = {}): Comanda {
  return {
    id: 'cmd-1',
    number: 1,
    type: 'individual',
    name: 'Cliente Teste',
    status: 'aberta',
    openedAt: '2026-11-18T12:00:00.000Z',
    items: [],
    payments: [],
    history: [],
    ...overrides,
  };
}

function makeGroupRental(overrides: Partial<GroupRental> = {}): GroupRental {
  return {
    id: 'gr-1',
    number: 10,
    groupName: 'Turma da Quadra',
    date: '2026-11-18',
    time: '19:00',
    space: 'Areia 1',
    totalAmountCents: 6000,
    status: 'aberta',
    participants: [
      {
        id: 'p-1',
        name: 'Jogador 1',
        dueAmountCents: 3000,
        paidAmountCents: 0,
        status: 'pendente',
      },
      {
        id: 'p-2',
        name: 'Jogador 2',
        dueAmountCents: 3000,
        paidAmountCents: 0,
        status: 'pendente',
      },
    ],
    payments: [],
    history: [],
    createdAt: '2026-11-18T12:00:00.000Z',
    createdByUid: 'op-1',
    createdByName: 'Operador',
    ...overrides,
  };
}

describe('Relatórios Financeiros — Regras de Consolidação', () => {
  // Referência: 18/11/2026 14:00 America/Sao_Paulo (quarta-feira)
  const refNow = new Date('2026-11-18T14:00:00-03:00');

  it('pagamento de ontem fica fora de Hoje, e comanda aberta ontem e paga hoje entra em Hoje', () => {
    const comandaOntemPagaOntem = makeComanda({
      id: 'cmd-ontem',
      number: 101,
      openedAt: '2026-11-17T15:00:00-03:00',
      status: 'encerrada',
      payments: [
        {
          id: 'pay-ontem',
          method: 'pix',
          amountCents: 4000,
          timestamp: '2026-11-17T18:00:00-03:00',
          operator: 'Carlos',
          operatorUid: 'u1',
        },
      ],
    });

    const comandaAbertaOntemPagaHoje = makeComanda({
      id: 'cmd-ontem-paga-hoje',
      number: 102,
      openedAt: '2026-11-17T21:00:00-03:00',
      status: 'encerrada',
      payments: [
        {
          id: 'pay-hoje',
          method: 'debito',
          amountCents: 6000,
          timestamp: '2026-11-18T10:15:00-03:00',
          operator: 'Carlos',
          operatorUid: 'u1',
        },
      ],
    });

    const { lines, issues } = buildReceiptLines(
      [comandaOntemPagaOntem, comandaAbertaOntemPagaHoje],
      []
    );
    expect(issues).toHaveLength(0);

    const hojeRange = resolvePeriodRange('hoje', refNow);
    const aggHoje = aggregateReceipts(lines, hojeRange.startDateKey, hojeRange.endDateKey);

    expect(aggHoje.totals.totalCents).toBe(6000);
    expect(aggHoje.totals.comandasCents).toBe(6000);
    expect(aggHoje.filteredLines.map(l => l.refId)).toEqual(['cmd-ontem-paga-hoje']);

    // Conferência de R$ 40 ontem e R$ 60 hoje nos dias certos
    const ontemRange = resolvePeriodRange('ontem', refNow);
    const aggIntervalo = aggregateReceipts(
      lines,
      ontemRange.startDateKey,
      hojeRange.endDateKey
    );

    expect(aggIntervalo.dailySeries).toHaveLength(2);
    expect(aggIntervalo.dailySeries[0].key).toBe('2026-11-17');
    expect(aggIntervalo.dailySeries[0].totalCents).toBe(4000);
    expect(aggIntervalo.dailySeries[1].key).toBe('2026-11-18');
    expect(aggIntervalo.dailySeries[1].totalCents).toBe(6000);
    expect(aggIntervalo.totals.totalCents).toBe(10000);
  });

  it('pagamento conjunto: R$ 15 de locação + R$ 20 de bar = R$ 35 sem somar linkedBarPayment duas vezes', () => {
    const sharedNonce = 'grpay-1790000000-abc';

    const comandaBar = makeComanda({
      id: 'cmd-bar-1',
      number: 55,
      name: 'João',
      status: 'encerrada',
      payments: [
        {
          id: 'pay-bar-link-1',
          clientNonce: `${sharedNonce}_bar`,
          method: 'pix',
          amountCents: 2000, // R$ 20,00 do bar
          timestamp: '2026-11-18T11:30:00-03:00',
          operator: 'Ana',
          operatorUid: 'op-ana',
        },
      ],
    });

    const rental = makeGroupRental({
      id: 'gr-joint-1',
      number: 12,
      groupName: 'Pelada Quarta',
      payments: [
        {
          id: sharedNonce,
          clientNonce: sharedNonce,
          method: 'pix',
          amountCents: 1500, // SOMENTE a parte da quadra (R$ 15,00)
          timestamp: '2026-11-18T11:30:00-03:00',
          operator: 'Ana',
          operatorUid: 'op-ana',
          allocations: [
            { participantId: 'p-1', participantName: 'João', amountCents: 1500 },
          ],
          linkedBarPayment: {
            comandaId: 'cmd-bar-1',
            comandaNumber: 55,
            amountCents: 2000, // referência apenas — NÃO pode ser somado de novo
          },
        },
      ],
    });

    const { lines, issues } = buildReceiptLines([comandaBar], [rental]);
    expect(issues).toHaveLength(0);
    expect(lines).toHaveLength(2);

    const agg = aggregateReceipts(lines, '2026-11-18', '2026-11-18');
    expect(agg.totals.locacoesCents).toBe(1500);
    expect(agg.totals.comandasCents).toBe(2000);
    expect(agg.totals.totalCents).toBe(3500);
    expect(agg.totals.byMethodCents.pix).toBe(3500);
    // Ambas as parcelas compartilham a mesma jointPaymentKey com contagem 2
    expect(agg.jointPaymentCounts[sharedNonce]).toBe(2);
    expect(lines[0].jointPaymentKey).toBe(sharedNonce);
    expect(lines[1].jointPaymentKey).toBe(sharedNonce);
  });

  it('troco não entra como receita: R$ 100 entregues para pagar R$ 60 contam R$ 60', () => {
    const cmd = makeComanda({
      id: 'cmd-troco',
      number: 77,
      payments: [
        {
          id: 'pay-dinheiro',
          method: 'dinheiro',
          amountCents: 6000,
          tenderedCents: 10000,
          changeCents: 4000,
          timestamp: '2026-11-18T16:00:00-03:00',
          operator: 'Bruno',
          operatorUid: 'op-bruno',
        },
      ],
    });

    const { lines } = buildReceiptLines([cmd], []);
    const agg = aggregateReceipts(lines, '2026-11-18', '2026-11-18');

    expect(agg.totals.totalCents).toBe(6000);
    expect(agg.totals.byMethodCents.dinheiro).toBe(6000);
  });

  it('pendências atuais não alteram o total recebido', () => {
    const comandaAbertaComSaldo = makeComanda({
      id: 'cmd-aberta',
      number: 10,
      status: 'aberta',
      items: [
        {
          id: 'it-1',
          productId: 'prod-1',
          name: 'Cerveja',
          category: 'Bebidas',
          priceCents: 1500,
          quantity: 4, // R$ 60,00 consumo
          addedAt: '2026-11-18T10:00:00-03:00',
        },
      ],
      payments: [
        {
          id: 'pay-parcial',
          method: 'pix',
          amountCents: 2000, // R$ 20,00 pago -> R$ 40,00 pendente
          timestamp: '2026-11-18T10:30:00-03:00',
          operator: 'Carlos',
          operatorUid: 'u1',
        },
      ],
    });

    const rentalAberta = makeGroupRental({
      id: 'gr-aberta',
      number: 20,
      status: 'aberta',
      totalAmountCents: 10000, // R$ 100,00
      participants: [
        {
          id: 'p-1',
          name: 'A',
          dueAmountCents: 10000,
          paidAmountCents: 3000, // R$ 30,00 pago -> R$ 70,00 pendente
          status: 'parcial',
        },
      ],
      payments: [
        {
          id: 'grpay-1',
          clientNonce: 'grpay-1',
          method: 'credito',
          amountCents: 3000,
          timestamp: '2026-11-18T11:00:00-03:00',
          operator: 'Carlos',
          operatorUid: 'u1',
          allocations: [{ participantId: 'p-1', participantName: 'A', amountCents: 3000 }],
        },
      ],
    });

    const { lines } = buildReceiptLines([comandaAbertaComSaldo], [rentalAberta]);
    const agg = aggregateReceipts(lines, '2026-11-18', '2026-11-18');
    const pending = calculateCurrentPending([comandaAbertaComSaldo], [rentalAberta]);

    // Total recebido = 2000 + 3000 = 5000 (R$ 50,00), sem incluir os R$ 110,00 pendentes
    expect(agg.totals.totalCents).toBe(5000);
    expect(pending.comandasPendingCents).toBe(4000);
    expect(pending.locacoesPendingCents).toBe(7000);
    expect(pending.totalPendingCents).toBe(11000);
  });

  it('fuso America/Sao_Paulo: 23:59 e 00:01 caem em dias diferentes; UTC no dia seguinte mas ainda no mesmo dia em SP fica no dia de SP', () => {
    const cmd = makeComanda({
      id: 'cmd-tz',
      number: 88,
      payments: [
        {
          id: 'pay-2359-sp',
          method: 'pix',
          amountCents: 2500,
          // Em UTC já é 2026-11-19T02:59:00Z, mas em São Paulo ainda é 18/11/2026 23:59
          timestamp: '2026-11-19T02:59:00.000Z',
          operator: 'Carlos',
          operatorUid: 'u1',
        },
        {
          id: 'pay-0001-sp',
          method: 'pix',
          amountCents: 3500,
          // 19/11/2026 00:01 em São Paulo = 2026-11-19T03:01:00.000Z
          timestamp: '2026-11-19T03:01:00.000Z',
          operator: 'Carlos',
          operatorUid: 'u1',
        },
      ],
    });

    const { lines, issues } = buildReceiptLines([cmd], []);
    expect(issues).toHaveLength(0);

    const line2359 = lines.find(l => l.id.endsWith('pay-2359-sp'));
    const line0001 = lines.find(l => l.id.endsWith('pay-0001-sp'));

    expect(line2359?.dateKey).toBe('2026-11-18');
    expect(line0001?.dateKey).toBe('2026-11-19');

    const agg18 = aggregateReceipts(lines, '2026-11-18', '2026-11-18');
    const agg19 = aggregateReceipts(lines, '2026-11-19', '2026-11-19');

    expect(agg18.totals.totalCents).toBe(2500);
    expect(agg19.totals.totalCents).toBe(3500);
  });

  it('soma dos dias = total do período; semana (seg-dom) e mês preservam os mesmos valores e incluem dias zerados', () => {
    const cmd1 = makeComanda({
      id: 'c1',
      number: 1,
      payments: [
        {
          id: 'p1',
          method: 'pix',
          amountCents: 1200,
          timestamp: '2026-11-16T10:00:00-03:00', // Segunda
          operator: 'Op',
          operatorUid: 'u1',
        },
        {
          id: 'p2',
          method: 'credito',
          amountCents: 3800,
          timestamp: '2026-11-22T20:00:00-03:00', // Domingo
          operator: 'Op',
          operatorUid: 'u1',
        },
      ],
    });

    const gr1 = makeGroupRental({
      id: 'g1',
      number: 2,
      payments: [
        {
          id: 'gp1',
          clientNonce: 'gp1',
          method: 'dinheiro',
          amountCents: 5000,
          timestamp: '2026-11-18T19:00:00-03:00', // Quarta
          operator: 'Op',
          operatorUid: 'u1',
          allocations: [{ participantId: 'p-1', participantName: 'J1', amountCents: 5000 }],
        },
      ],
    });

    const { lines } = buildReceiptLines([cmd1], [gr1]);

    // Semana de segunda (16/11) a domingo (22/11)
    const weekRange = resolvePeriodRange('esta_semana', refNow);
    expect(weekRange.startDateKey).toBe('2026-11-16');
    expect(weekRange.endDateKey).toBe('2026-11-22');
    expect(weekRange.label).toBe('16/11 a 22/11/2026');

    const aggWeek = aggregateReceipts(lines, weekRange.startDateKey, weekRange.endDateKey);
    expect(aggWeek.dailySeries).toHaveLength(7); // inclui dias sem movimento (ter, qui, sex, sab com 0)
    expect(aggWeek.dailySeries[1].totalCents).toBe(0); // Terça 17/11 zerada

    const sumDaily = aggWeek.dailySeries.reduce((s, d) => s + d.totalCents, 0);
    const sumWeekly = aggWeek.weeklySeries.reduce((s, w) => s + w.totalCents, 0);
    const sumMonthly = aggWeek.monthlySeries.reduce((s, m) => s + m.totalCents, 0);

    expect(aggWeek.totals.totalCents).toBe(10000);
    expect(sumDaily).toBe(aggWeek.totals.totalCents);
    expect(sumWeekly).toBe(aggWeek.totals.totalCents);
    expect(sumMonthly).toBe(aggWeek.totals.totalCents);
  });

  it('CSV bate com a tabela exibida, usa formato brasileiro e protege contra injeção de fórmula', () => {
    const cmdFormula = makeComanda({
      id: 'cmd-csv',
      number: 99,
      name: '=SUM(A1:A5)',
      payments: [
        {
          id: 'pay-csv-1',
          method: 'debito',
          amountCents: 3500, // 35,00
          timestamp: '2026-11-18T14:25:00-03:00',
          operator: '+Operador',
          operatorUid: 'u1',
        },
      ],
    });

    const { lines } = buildReceiptLines([cmdFormula], []);
    const agg = aggregateReceipts(lines, '2026-11-18', '2026-11-18');
    const csv = buildReceiptsCsv({
      rangeLabel: '18/11/2026',
      isOngoing: true,
      grouping: 'dia',
      aggregated: agg,
    });

    // BOM UTF-8
    expect(csv.startsWith('\uFEFF')).toBe(true);
    // Delimitador ";" e decimal ","
    expect(csv).toContain('18/11/2026;35,00;0,00;35,00;0,00;0,00;35,00;0,00');
    expect(csv).toContain('Total do período;35,00;0,00;35,00;0,00;0,00;35,00;0,00');
    // Proteção contra fórmula
    expect(csv).toContain("'=SUM(A1:A5)");
    expect(csv).toContain("'+Operador");
    // Mensalidades não aparecem como receita (aviso de escopo)
    expect(csv).toContain('Mensalidades, eventos cobrados separadamente e despesas ainda não estão integrados');
    expect(csv).not.toContain('4520');
    expect(csv).not.toContain('4.520');
  });

  it('mensalidades não aparecem como receita nem valores fictícios', () => {
    const { lines } = buildReceiptLines([], []);
    const agg = aggregateReceipts(lines, '2026-11-01', '2026-11-30');
    expect(agg.totals.totalCents).toBe(0);
    expect(agg.totals.comandasCents).toBe(0);
    expect(agg.totals.locacoesCents).toBe(0);
  });

  it('registro com data ou valor inválido vai para issues, nunca recebe 1970-01-01 e não entra em nenhum dia', () => {
    const cmdInvalida = makeComanda({
      id: 'cmd-bad',
      number: 500,
      name: 'Comanda Bug',
      payments: [
        {
          id: 'bad-date',
          method: 'pix',
          amountCents: 1000,
          timestamp: 'data-quebrada',
          operator: 'Op',
          operatorUid: 'u1',
        },
        {
          id: 'bad-negative',
          method: 'pix',
          amountCents: -500,
          timestamp: '2026-11-18T12:00:00-03:00',
          operator: 'Op',
          operatorUid: 'u1',
        },
        {
          id: 'bad-float',
          method: 'dinheiro',
          amountCents: 12.5,
          timestamp: '2026-11-18T12:00:00-03:00',
          operator: 'Op',
          operatorUid: 'u1',
        },
        {
          id: 'bad-method',
          method: 'cheque' as unknown as 'pix',
          amountCents: 1000,
          timestamp: '2026-11-18T12:00:00-03:00',
          operator: 'Op',
          operatorUid: 'u1',
        },
      ],
    });

    const { lines, issues } = buildReceiptLines([cmdInvalida], []);

    expect(lines).toHaveLength(0);
    expect(issues).toHaveLength(4);
    expect(issues.map(i => i.id)).toEqual([
      'bad-date',
      'bad-negative',
      'bad-float',
      'bad-method',
    ]);

    // Garante que nem no ano de 1970 caiu
    const agg1970 = aggregateReceipts(lines, '1970-01-01', '1970-01-02');
    expect(agg1970.totals.totalCents).toBe(0);
    const aggHoje = aggregateReceipts(lines, '2026-11-18', '2026-11-18');
    expect(aggHoje.totals.totalCents).toBe(0);
  });
});

describe('Livro `receipts` (Fase 2) — IDs, Paginação, Mapeamento e Backfill Idempotente', () => {
  it('buildDeterministicReceiptId gera IDs determinísticos, compatíveis com regras e sem colisão entre bar e locação', () => {
    const idLoc = buildDeterministicReceiptId('locacao', 'gr-123', 'nonce-abc');
    const idBar = buildDeterministicReceiptId('comanda', 'cmd-456', 'nonce-abc_bar');

    expect(idLoc).toBe(buildDeterministicReceiptId('locacao', 'gr-123', 'nonce-abc'));
    expect(idLoc).not.toBe(idBar);
    expect(idLoc).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);
    expect(idBar).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);

    // IDs muito longos sofrem hash determinístico mantendo <= 128 chars
    const long1 = buildDeterministicReceiptId('comanda', 'a'.repeat(100), 'k1_' + 'b'.repeat(100));
    const long2 = buildDeterministicReceiptId('comanda', 'a'.repeat(100), 'k2_' + 'b'.repeat(100));
    expect(long1.length).toBeLessThanOrEqual(128);
    expect(long2.length).toBeLessThanOrEqual(128);
    expect(long1).not.toBe(long2);
  });

  it('paginateAll busca TODAS as páginas do período sem truncamento silencioso', async () => {
    const all = Array.from({ length: 7 }, (_, i) => ({ id: `r-${i + 1}` }));

    const result = await paginateAll(async (cursor: number | null, pageSize: number) => {
      const start = cursor ?? 0;
      const slice = all.slice(start, start + pageSize);
      const next = start + slice.length < all.length ? start + slice.length : null;
      return {
        items: slice,
        nextCursor: next,
        rawCount: slice.length,
      };
    }, 3);

    expect(result.pagesFetched).toBe(3); // 3 + 3 + 1
    expect(result.items.map(x => x.id)).toEqual(['r-1', 'r-2', 'r-3', 'r-4', 'r-5', 'r-6', 'r-7']);
  });

  it('mapReceiptDocsToLines valida Timestamp, fuso SP, estorno e envia documentos inválidos para issues', () => {
    const fakeTimestamp = {
      toDate: () => new Date('2026-11-19T02:55:00.000Z'), // 23:55 de 18/11 em SP
    };

    const { lines, issues } = mapReceiptDocsToLines([
      {
        id: 'rcpt-ok',
        data: {
          id: 'rcpt-ok',
          origin: 'comanda',
          refId: 'cmd-10',
          refNumber: 10,
          refLabel: 'Mesa 01',
          method: 'pix',
          amountCents: 4500,
          paidAt: fakeTimestamp,
          dateKey: '2026-11-18',
          staffUid: 'op-1',
          staffName: 'Maria',
          sourcePaymentId: 'pay-1',
          kind: 'recebimento',
        },
      },
      {
        id: 'rcpt-estorno',
        data: {
          id: 'rcpt-estorno',
          origin: 'comanda',
          refId: 'cmd-10',
          refNumber: 10,
          refLabel: 'Mesa 01',
          method: 'pix',
          amountCents: 1500,
          paidAt: fakeTimestamp,
          dateKey: '2026-11-18',
          staffUid: 'adm-1',
          staffName: 'Admin',
          sourcePaymentId: 'pay-est-1',
          kind: 'estorno',
        },
      },
      {
        id: 'rcpt-bad-datekey',
        data: {
          id: 'rcpt-bad-datekey',
          origin: 'locacao',
          refId: 'gr-1',
          refNumber: 501,
          refLabel: 'Turma',
          method: 'dinheiro',
          amountCents: 2000,
          paidAt: fakeTimestamp,
          dateKey: '2026-11-19', // Diverge do fuso America/Sao_Paulo (2026-11-18)
          staffUid: 'op-1',
          staffName: 'Maria',
          sourcePaymentId: 'pay-2',
          kind: 'recebimento',
        },
      },
      {
        id: 'rcpt-bad-amount',
        data: {
          id: 'rcpt-bad-amount',
          origin: 'comanda',
          refId: 'cmd-11',
          refNumber: 11,
          refLabel: 'Mesa 02',
          method: 'debito',
          amountCents: -100,
          paidAt: fakeTimestamp,
          dateKey: '2026-11-18',
          staffUid: 'op-1',
          staffName: 'Maria',
          sourcePaymentId: 'pay-3',
          kind: 'recebimento',
        },
      },
    ]);

    expect(lines).toHaveLength(2);
    expect(lines[0].dateKey).toBe('2026-11-18');
    expect(issues).toHaveLength(2);
    expect(issues.map(i => i.id)).toEqual(['rcpt-bad-datekey', 'rcpt-bad-amount']);

    // Conferir efeito líquido do estorno na agregação (4500 - 1500 = 3000)
    const agg = aggregateReceipts(lines, '2026-11-18', '2026-11-18');
    expect(agg.totals.totalCents).toBe(3000);
    expect(agg.totals.byMethodCents.pix).toBe(3000);
  });

  it('mapReceiptDocsToLines aceita recebimentos novos SEM dateKey e deriva o dia a partir de paidAt na virada da meia-noite de São Paulo', () => {
    const beforeMidnightSp = {
      toDate: () => new Date('2026-11-19T02:59:59.999Z'), // 18/11 23:59:59.999 SP
    };
    const exactMidnightSp = {
      toDate: () => new Date('2026-11-19T03:00:00.000Z'), // 19/11 00:00:00.000 SP
    };

    const { lines, issues } = mapReceiptDocsToLines([
      {
        id: 'rcpt-sem-datekey-2359',
        data: {
          id: 'rcpt-sem-datekey-2359',
          origin: 'comanda',
          refId: 'cmd-20',
          refNumber: 20,
          refLabel: 'Mesa 05',
          method: 'pix',
          amountCents: 2500,
          paidAt: beforeMidnightSp,
          staffUid: 'op-1',
          staffName: 'Maria',
          sourcePaymentId: 'pay-2359',
          kind: 'recebimento',
        },
      },
      {
        id: 'rcpt-sem-datekey-0000',
        data: {
          id: 'rcpt-sem-datekey-0000',
          origin: 'locacao',
          refId: 'gr-20',
          refNumber: 520,
          refLabel: 'Pelada (Areia 1)',
          method: 'dinheiro',
          amountCents: 4000,
          paidAt: exactMidnightSp,
          staffUid: 'op-1',
          staffName: 'Maria',
          sourcePaymentId: 'pay-0000',
          kind: 'recebimento',
        },
      },
    ]);

    expect(issues).toHaveLength(0);
    expect(lines).toHaveLength(2);
    expect(lines[0].dateKey).toBe('2026-11-18');
    expect(lines[1].dateKey).toBe('2026-11-19');

    const agg18 = aggregateReceipts(lines, '2026-11-18', '2026-11-18');
    const agg19 = aggregateReceipts(lines, '2026-11-19', '2026-11-19');
    expect(agg18.totals.totalCents).toBe(2500);
    expect(agg19.totals.totalCents).toBe(4000);
  });

  it('getSaoPauloDateRangeBounds gera intervalo [início SP inclusive, início do dia seguinte SP exclusivo) correto na virada da meia-noite', () => {
    const start18 = getSaoPauloDayStartUtc('2026-11-18');
    expect(start18.toISOString()).toBe('2026-11-18T03:00:00.000Z');

    const bounds = getSaoPauloDateRangeBounds('2026-11-18', '2026-11-18');
    expect(bounds.startUtc.toISOString()).toBe('2026-11-18T03:00:00.000Z');
    expect(bounds.endExclusiveUtc.toISOString()).toBe('2026-11-19T03:00:00.000Z');

    // 18/11 23:59:59.999 em SP entra no intervalo de 18/11
    const lastMsOfDay18 = new Date('2026-11-19T02:59:59.999Z');
    expect(lastMsOfDay18 >= bounds.startUtc && lastMsOfDay18 < bounds.endExclusiveUtc).toBe(true);

    // 19/11 00:00:00.000 em SP fica fora de 18/11 e entra em 19/11
    const firstMsOfDay19 = new Date('2026-11-19T03:00:00.000Z');
    expect(firstMsOfDay19 >= bounds.startUtc && firstMsOfDay19 < bounds.endExclusiveUtc).toBe(false);

    const bounds19 = getSaoPauloDateRangeBounds('2026-11-19', '2026-11-19');
    expect(firstMsOfDay19 >= bounds19.startUtc && firstMsOfDay19 < bounds19.endExclusiveUtc).toBe(true);
  });

  it('planHistoricalBackfill é idempotente, preserva pagamento conjunto sem dupla contagem e reporta inválidos sem inventar data', () => {
    const sharedNonce = 'joint-op-999';

    const cmdBar = makeComanda({
      id: 'cmd-hist-1',
      number: 101,
      name: 'Lucas',
      payments: [
        {
          id: 'pay-already-exists',
          clientNonce: 'pay-already-exists',
          method: 'dinheiro',
          amountCents: 1000,
          timestamp: '2026-11-17T15:00:00-03:00',
          operator: 'Ana',
          operatorUid: 'op-1',
        },
        {
          id: 'pay-bar-joint',
          clientNonce: `${sharedNonce}_bar`,
          method: 'pix',
          amountCents: 2000,
          timestamp: '2026-11-18T11:00:00-03:00',
          operator: 'Ana',
          operatorUid: 'op-1',
        },
        {
          id: 'pay-invalid-date',
          method: 'pix',
          amountCents: 500,
          timestamp: 'data-invalida',
          operator: 'Ana',
          operatorUid: 'op-1',
        },
      ],
    });

    const rental = makeGroupRental({
      id: 'gr-hist-1',
      number: 501,
      groupName: 'Pelada',
      payments: [
        {
          id: sharedNonce,
          clientNonce: sharedNonce,
          method: 'pix',
          amountCents: 1500,
          timestamp: '2026-11-18T11:00:00-03:00',
          operator: 'Ana',
          operatorUid: 'op-1',
          allocations: [{ participantId: 'p-1', participantName: 'Lucas', amountCents: 1500 }],
          linkedBarPayment: {
            comandaId: 'cmd-hist-1',
            comandaNumber: 101,
            amountCents: 2000,
          },
        },
      ],
    });

    const alreadyExistingId = buildDeterministicReceiptId(
      'comanda',
      'cmd-hist-1',
      'pay-already-exists'
    );

    const plan = planHistoricalBackfill({
      comandas: [cmdBar],
      groupRentals: [rental],
      existingReceiptIds: new Set([alreadyExistingId]),
      adminUid: 'adm-1',
      adminName: 'Admin',
    });

    // pay-already-exists é pulado; pay-bar-joint e rental geram 2 docs; pay-invalid-date vai para invalidIssues
    expect(plan.skippedExistingCount).toBe(1);
    expect(plan.toCreate).toHaveLength(2);
    expect(plan.invalidIssues).toHaveLength(1);
    expect(plan.invalidIssues[0].id).toBe('pay-invalid-date');

    const createdBar = plan.toCreate.find(c => c.receiptDoc.origin === 'comanda')!.receiptDoc;
    const createdLoc = plan.toCreate.find(c => c.receiptDoc.origin === 'locacao')!.receiptDoc;

    expect(createdBar.amountCents).toBe(2000);
    expect(createdBar.jointPaymentId).toBe(sharedNonce);
    expect(createdBar.dateKey).toBeUndefined();
    expect(createdLoc.amountCents).toBe(1500);
    expect(createdLoc.jointPaymentId).toBe(sharedNonce);
    expect(createdLoc.dateKey).toBeUndefined();
    expect(createdBar.amountCents + createdLoc.amountCents).toBe(3500);

    // Re-execução com todos os IDs criados presentes -> zero criações novas
    const secondPlan = planHistoricalBackfill({
      comandas: [cmdBar],
      groupRentals: [rental],
      existingReceiptIds: new Set([alreadyExistingId, createdBar.id, createdLoc.id]),
      adminUid: 'adm-1',
      adminName: 'Admin',
    });

    expect(secondPlan.toCreate).toHaveLength(0);
    expect(secondPlan.skippedExistingCount).toBe(3);
  });

  it('Etapa 4.1: estorno após a meia-noite em São Paulo aparece negativo no dia do estorno (não no dia original) e CSV sai -60,00 sem apóstrofo enquanto texto livre segue protegido', () => {
    const paidDay1 = {
      toDate: () => new Date('2026-11-19T02:55:00.000Z'), // 18/11 23:55 SP
    };
    const refundedDay2 = {
      toDate: () => new Date('2026-11-19T03:05:00.000Z'), // 19/11 00:05 SP
    };

    const { lines, issues } = mapReceiptDocsToLines([
      {
        id: 'rcpt_cmd_c1_p1',
        data: {
          id: 'rcpt_cmd_c1_p1',
          origin: 'comanda',
          refId: 'c1',
          refNumber: 77,
          refLabel: 'Mesa 07',
          method: 'pix',
          amountCents: 6000,
          paidAt: paidDay1,
          staffUid: 'op-1',
          staffName: 'Maria',
          sourcePaymentId: 'p1',
          kind: 'recebimento',
        },
      },
      {
        id: 'rcpt_est_cmd_c1_r1',
        data: {
          id: 'rcpt_est_cmd_c1_r1',
          origin: 'comanda',
          refId: 'c1',
          refNumber: 77,
          refLabel: 'Mesa 07',
          method: 'pix',
          amountCents: 6000,
          paidAt: refundedDay2,
          staffUid: 'adm-1',
          staffName: 'Cauê Admin',
          sourcePaymentId: 'p1',
          refundId: 'ref_r1',
          reason: '=SUM(A1:A2) Estorno combinado',
          kind: 'estorno',
        },
      },
    ]);

    expect(issues).toHaveLength(0);
    expect(lines).toHaveLength(2);
    expect(lines[0].dateKey).toBe('2026-11-18');
    expect(lines[1].dateKey).toBe('2026-11-19');

    // Dia 18: +60,00
    const agg18 = aggregateReceipts(lines, '2026-11-18', '2026-11-18');
    expect(agg18.totals.totalCents).toBe(6000);
    expect(agg18.totals.refundedCents).toBe(0);

    // Dia 19: -60,00
    const agg19 = aggregateReceipts(lines, '2026-11-19', '2026-11-19');
    expect(agg19.totals.totalCents).toBe(-6000);
    expect(agg19.totals.grossReceivedCents).toBe(0);
    expect(agg19.totals.refundedCents).toBe(6000);
    expect(agg19.totals.refundsCount).toBe(1);
    expect(agg19.totals.byMethodCents.pix).toBe(-6000);

    // Período 18 a 19: líquido 0, bruto 6000, estornado 6000
    const aggBoth = aggregateReceipts(lines, '2026-11-18', '2026-11-19');
    expect(aggBoth.totals.totalCents).toBe(0);
    expect(aggBoth.totals.grossReceivedCents).toBe(6000);
    expect(aggBoth.totals.refundedCents).toBe(6000);

    // CSV (Ajuste C): valores negativos saem como -60,00 (SEM apóstrofo), texto livre com = segue escapado
    const csv = buildReceiptsCsv({
      rangeLabel: '18/11 a 19/11/2026',
      isOngoing: false,
      grouping: 'dia',
      aggregated: aggBoth,
    });
    expect(csv).toContain('19/11/2026;-60,00;0,00;-60,00;-60,00;0,00;0,00;0,00');
    expect(csv).toContain('19/11/2026;00:05;Estorno;Comanda;#77;Mesa 07;Pix;-60,00;');
    expect(csv).not.toContain("'-60,00");
    expect(csv).toContain("'=SUM(A1:A2) Estorno combinado");
  });
});
