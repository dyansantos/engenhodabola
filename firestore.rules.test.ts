import { readFileSync } from 'node:fs';
import path from 'node:path';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const PROJECT_ID = 'demo-engenho-da-bola-rules-test';
const RULES_PATH = path.resolve(import.meta.dirname, 'firestore.rules');

let testEnv: RulesTestEnvironment;

function adminCtx() {
  return testEnv.authenticatedContext('admin-uid-1', {
    email: 'admin@engenhodabola.com',
    email_verified: true,
  });
}

function operatorCtx() {
  return testEnv.authenticatedContext('op-uid-1', {
    email: 'operador@engenhodabola.com',
    email_verified: true,
  });
}

function unauthCtx() {
  return testEnv.unauthenticatedContext();
}

describe('Firestore Security Rules — Engenho da Bola (Fase 2)', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync(RULES_PATH, 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();

    // Seed inicial sem passar pelas regras
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();

      await db.doc('staff/admin-uid-1').set({
        uid: 'admin-uid-1',
        email: 'admin@engenhodabola.com',
        name: 'Admin Teste',
        role: 'admin',
        active: true,
        createdAt: '2026-11-01T10:00:00.000Z',
      });

      await db.doc('staff/op-uid-1').set({
        uid: 'op-uid-1',
        email: 'operador@engenhodabola.com',
        name: 'Operador Teste',
        role: 'operator',
        active: true,
        createdAt: '2026-11-01T10:00:00.000Z',
      });

      await db.doc('metadata/comandas_counter').set({
        lastNumber: 105,
        updatedAt: '2026-11-18T10:00:00.000Z',
      });

      await db.doc('comandas/cmd-1').set({
        id: 'cmd-1',
        number: 105,
        type: 'individual',
        name: 'Carlos',
        status: 'aberta',
        openedAt: '2026-11-18T12:00:00.000Z',
        items: [
          {
            id: 'item-1',
            productId: 'prod-agua',
            name: 'Água Mineral',
            category: 'Bebidas',
            priceCents: 600,
            quantity: 5,
            addedAt: '2026-11-18T12:05:00.000Z',
          },
        ],
        payments: [
          {
            id: 'pay-old-1',
            clientNonce: 'pay-old-1',
            method: 'pix',
            amountCents: 1000,
            timestamp: '2026-11-18T12:10:00.000Z',
            operator: 'Operador Teste',
            operatorUid: 'op-uid-1',
          },
        ],
        history: [
          {
            id: 'hist-1',
            timestamp: '2026-11-18T12:00:00.000Z',
            operator: 'Operador Teste',
            type: 'abertura',
            description: 'Comanda aberta',
          },
        ],
      });

      await db.doc('group_rentals/gr-1').set({
        id: 'gr-1',
        number: 501,
        groupName: 'Pelada Quarta',
        date: '2026-11-18',
        time: '19:00',
        space: 'Areia 1',
        totalAmountCents: 6000,
        status: 'aberta',
        participants: [
          {
            id: 'p-1',
            name: 'João',
            dueAmountCents: 3000,
            paidAmountCents: 3000,
            status: 'pago',
          },
          {
            id: 'p-2',
            name: 'Pedro',
            dueAmountCents: 3000,
            paidAmountCents: 0,
            status: 'pendente',
          },
        ],
        payments: [
          {
            id: 'grpay-old-1',
            clientNonce: 'grpay-old-1',
            method: 'dinheiro',
            amountCents: 3000,
            timestamp: '2026-11-18T12:15:00.000Z',
            operator: 'Operador Teste',
            operatorUid: 'op-uid-1',
            allocations: [{ participantId: 'p-1', participantName: 'João', amountCents: 3000 }],
          },
        ],
        history: [
          {
            id: 'hist-gr-1',
            timestamp: '2026-11-18T12:00:00.000Z',
            operator: 'Operador Teste',
            type: 'criacao',
            description: 'Locação criada',
          },
        ],
        createdAt: '2026-11-18T12:00:00.000Z',
        createdByUid: 'op-uid-1',
        createdByName: 'Operador Teste',
      });

      await db.doc('receipts/rcpt_cmd_cmd-1_pay-old-1').set({
        id: 'rcpt_cmd_cmd-1_pay-old-1',
        origin: 'comanda',
        refId: 'cmd-1',
        refNumber: 105,
        refLabel: 'Carlos',
        method: 'pix',
        amountCents: 1000,
        paidAt: firebase.firestore.Timestamp.fromDate(new Date('2026-11-18T15:10:00.000Z')),
        dateKey: '2026-11-18',
        staffUid: 'op-uid-1',
        staffName: 'Operador Teste',
        sourcePaymentId: 'pay-old-1',
        kind: 'recebimento',
      });
    });
  });

  it('bloqueia usuário anônimo em comandas, group_rentals, receipts e metadata', async () => {
    const db = unauthCtx().firestore();
    await assertFails(db.doc('comandas/cmd-1').get());
    await assertFails(db.doc('group_rentals/gr-1').get());
    await assertFails(db.doc('receipts/rcpt_cmd_cmd-1_pay-old-1').get());
    await assertFails(db.collection('receipts').get());
    await assertFails(db.doc('metadata/comandas_counter').get());
    await assertFails(db.doc('staff/hacker').set({ role: 'admin', active: true }));
  });

  it('operador NÃO consegue ler (get ou list) a coleção receipts', async () => {
    const db = operatorCtx().firestore();
    await assertFails(db.doc('receipts/rcpt_cmd_cmd-1_pay-old-1').get());
    await assertFails(db.collection('receipts').get());
  });

  it('administrador consegue ler (get e list por intervalo de paidAt) a coleção receipts', async () => {
    const db = adminCtx().firestore();
    await assertSucceeds(db.doc('receipts/rcpt_cmd_cmd-1_pay-old-1').get());
    await assertSucceeds(
      db
        .collection('receipts')
        .where('paidAt', '>=', firebase.firestore.Timestamp.fromDate(new Date('2026-11-18T03:00:00.000Z')))
        .where('paidAt', '<', firebase.firestore.Timestamp.fromDate(new Date('2026-11-19T03:00:00.000Z')))
        .orderBy('paidAt', 'asc')
        .get()
    );
  });

  it('ninguém (nem operador nem admin) consegue atualizar ou excluir receipts', async () => {
    const opDb = operatorCtx().firestore();
    const admDb = adminCtx().firestore();

    await assertFails(
      opDb.doc('receipts/rcpt_cmd_cmd-1_pay-old-1').update({ amountCents: 99999 })
    );
    await assertFails(opDb.doc('receipts/rcpt_cmd_cmd-1_pay-old-1').delete());
    await assertFails(
      admDb.doc('receipts/rcpt_cmd_cmd-1_pay-old-1').update({ amountCents: 99999 })
    );
    await assertFails(admDb.doc('receipts/rcpt_cmd_cmd-1_pay-old-1').delete());
  });

  it('operador NÃO consegue criar receipt avulso sem transação no documento de origem', async () => {
    const opDb = operatorCtx().firestore();

    await assertFails(
      opDb.doc('receipts/rcpt_fake_1').set({
        id: 'rcpt_fake_1',
        origin: 'comanda',
        refId: 'cmd-1',
        refNumber: 105,
        refLabel: 'Carlos',
        method: 'pix',
        amountCents: 500,
        paidAt: firebase.firestore.FieldValue.serverTimestamp(),
        staffUid: 'op-uid-1',
        staffName: 'Operador Teste',
        sourcePaymentId: 'pay-fake',
        kind: 'recebimento',
      })
    );
  });

  it('operador consegue registrar pagamento + receipt na mesma transação atômica SEM dateKey do cliente', async () => {
    const opDb = operatorCtx().firestore();

    await assertSucceeds(
      opDb.runTransaction(async tx => {
        const cmdRef = opDb.doc('comandas/cmd-1');
        const rcptRef = opDb.doc('receipts/rcpt_cmd_cmd-1_pay-new-2');
        const snap = await tx.get(cmdRef);
        const cmd = snap.data()!;

        tx.set(cmdRef, {
          ...cmd,
          payments: [
            ...cmd.payments,
            {
              id: 'pay-new-2',
              clientNonce: 'pay-new-2',
              method: 'credito',
              amountCents: 1500,
              timestamp: new Date().toISOString(),
              operator: 'Operador Teste',
              operatorUid: 'op-uid-1',
            },
          ],
          history: [
            ...cmd.history,
            {
              id: 'hist-pay-2',
              timestamp: new Date().toISOString(),
              operator: 'Operador Teste',
              type: 'pagamento',
              description: 'Pagamento de R$ 15,00',
            },
          ],
        });

        tx.set(rcptRef, {
          id: 'rcpt_cmd_cmd-1_pay-new-2',
          origin: 'comanda',
          refId: 'cmd-1',
          refNumber: 105,
          refLabel: 'Carlos',
          method: 'credito',
          amountCents: 1500,
          paidAt: firebase.firestore.FieldValue.serverTimestamp(),
          staffUid: 'op-uid-1',
          staffName: 'Operador Teste',
          sourcePaymentId: 'pay-new-2',
          kind: 'recebimento',
        });
      })
    );
  });

  it('operador NÃO consegue enviar dateKey calculado pelo cliente em transação ao vivo', async () => {
    const opDb = operatorCtx().firestore();

    await assertFails(
      opDb.runTransaction(async tx => {
        const cmdRef = opDb.doc('comandas/cmd-1');
        const rcptRef = opDb.doc('receipts/rcpt_cmd_cmd-1_pay-new-3');
        const snap = await tx.get(cmdRef);
        const cmd = snap.data()!;

        tx.set(cmdRef, {
          ...cmd,
          payments: [
            ...cmd.payments,
            {
              id: 'pay-new-3',
              clientNonce: 'pay-new-3',
              method: 'pix',
              amountCents: 1000,
              timestamp: new Date().toISOString(),
              operator: 'Operador Teste',
              operatorUid: 'op-uid-1',
            },
          ],
          history: [
            ...cmd.history,
            {
              id: 'hist-pay-3',
              timestamp: new Date().toISOString(),
              operator: 'Operador Teste',
              type: 'pagamento',
              description: 'Pagamento de R$ 10,00',
            },
          ],
        });

        tx.set(rcptRef, {
          id: 'rcpt_cmd_cmd-1_pay-new-3',
          origin: 'comanda',
          refId: 'cmd-1',
          refNumber: 105,
          refLabel: 'Carlos',
          method: 'pix',
          amountCents: 1000,
          paidAt: firebase.firestore.FieldValue.serverTimestamp(),
          dateKey: '2099-01-01',
          staffUid: 'op-uid-1',
          staffName: 'Operador Teste',
          sourcePaymentId: 'pay-new-3',
          kind: 'recebimento',
        });
      })
    );
  });

  it('backfill admin aceita receipt sem dateKey, aceita dateKey consistente e bloqueia dateKey divergente', async () => {
    const admDb = adminCtx().firestore();
    const pastTs = firebase.firestore.Timestamp.fromDate(new Date('2026-11-19T02:55:00.000Z')); // 23:55 de 18/11 em SP

    // Backfill sem dateKey -> permitido
    await assertSucceeds(
      admDb.doc('receipts/rcpt_gr_gr-1_grpay-old-1').set({
        id: 'rcpt_gr_gr-1_grpay-old-1',
        origin: 'locacao',
        refId: 'gr-1',
        refNumber: 501,
        refLabel: 'Pelada Quarta (Areia 1)',
        method: 'dinheiro',
        amountCents: 3000,
        paidAt: pastTs,
        staffUid: 'op-uid-1',
        staffName: 'Operador Teste',
        sourcePaymentId: 'grpay-old-1',
        kind: 'recebimento',
      })
    );

    // Backfill com dateKey consistente -> permitido
    await assertSucceeds(
      admDb.doc('receipts/rcpt_gr_gr-1_grpay-old-2').set({
        id: 'rcpt_gr_gr-1_grpay-old-2',
        origin: 'locacao',
        refId: 'gr-1',
        refNumber: 501,
        refLabel: 'Pelada Quarta (Areia 1)',
        method: 'dinheiro',
        amountCents: 1500,
        paidAt: pastTs,
        dateKey: '2026-11-18',
        staffUid: 'op-uid-1',
        staffName: 'Operador Teste',
        sourcePaymentId: 'grpay-old-2',
        kind: 'recebimento',
      })
    );

    // Backfill com dateKey divergente de America/Sao_Paulo -> bloqueado
    await assertFails(
      admDb.doc('receipts/rcpt_gr_gr-1_grpay-old-bad').set({
        id: 'rcpt_gr_gr-1_grpay-old-bad',
        origin: 'locacao',
        refId: 'gr-1',
        refNumber: 501,
        refLabel: 'Pelada Quarta (Areia 1)',
        method: 'dinheiro',
        amountCents: 1500,
        paidAt: pastTs,
        dateKey: '2026-11-19',
        staffUid: 'op-uid-1',
        staffName: 'Operador Teste',
        sourcePaymentId: 'grpay-old-bad',
        kind: 'recebimento',
      })
    );
  });

  it('operador NÃO consegue editar ou apagar pagamentos antigos nem histórico em comandas e group_rentals', async () => {
    const opDb = operatorCtx().firestore();

    // Tenta alterar amountCents de pagamento antigo em comanda
    await assertFails(
      opDb.doc('comandas/cmd-1').update({
        payments: [
          {
            id: 'pay-old-1',
            clientNonce: 'pay-old-1',
            method: 'pix',
            amountCents: 100, // adulterado de 1000 para 100
            timestamp: '2026-11-18T12:10:00.000Z',
            operator: 'Operador Teste',
            operatorUid: 'op-uid-1',
          },
        ],
      })
    );

    // Tenta apagar array payments em comanda
    await assertFails(opDb.doc('comandas/cmd-1').update({ payments: [] }));

    // Tenta apagar histórico em comanda
    await assertFails(opDb.doc('comandas/cmd-1').update({ history: [] }));

    // Tenta alterar pagamento antigo em group_rentals
    await assertFails(opDb.doc('group_rentals/gr-1').update({ payments: [] }));
  });

  it('operador NÃO consegue alterar priceCents de item já lançado em comandas', async () => {
    const opDb = operatorCtx().firestore();

    await assertFails(
      opDb.doc('comandas/cmd-1').update({
        items: [
          {
            id: 'item-1',
            productId: 'prod-agua',
            name: 'Água Mineral',
            category: 'Bebidas',
            priceCents: 100, // adulterado de 600 para 100
            quantity: 5,
            addedAt: '2026-11-18T12:05:00.000Z',
          },
        ],
      })
    );
  });

  it('metadata: operador altera contadores, mas NÃO configurações administrativas (agenda_config)', async () => {
    const opDb = operatorCtx().firestore();
    const admDb = adminCtx().firestore();

    // Operador pode avançar contador
    await assertSucceeds(
      opDb.doc('metadata/comandas_counter').set({
        lastNumber: 106,
        updatedAt: new Date().toISOString(),
      })
    );

    // Operador NÃO pode retroceder contador
    await assertFails(
      opDb.doc('metadata/comandas_counter').set({
        lastNumber: 10,
        updatedAt: new Date().toISOString(),
      })
    );

    // Operador NÃO pode gravar agenda_config
    await assertFails(
      opDb.doc('metadata/agenda_config').set({
        configured: true,
        openTime: '08:00',
        closeTime: '22:00',
      })
    );

    // Admin pode gravar agenda_config
    await assertSucceeds(
      admDb.doc('metadata/agenda_config').set({
        configured: true,
        openTime: '08:00',
        closeTime: '22:00',
      })
    );
  });

  // =========================================================================
  // ETAPA 4.1: ESTORNO DE PAGAMENTO E TRAVA PARA VERSÕES ANTIGAS
  // =========================================================================

  it('operador NÃO consegue registrar estorno em comanda nem criar receipt kind=estorno', async () => {
    const opDb = operatorCtx().firestore();

    await assertFails(
      opDb.runTransaction(async tx => {
        const cmdRef = opDb.doc('comandas/cmd-1');
        const rcptRef = opDb.doc('receipts/rcpt_est_cmd_cmd-1_op-try');
        const snap = await tx.get(cmdRef);
        const cmd = snap.data()!;

        tx.set(cmdRef, {
          ...cmd,
          clientRev: 2,
          revSeq: 1,
          refunds: [
            {
              id: 'ref_op-try',
              clientNonce: 'op-try',
              receiptId: 'rcpt_est_cmd_cmd-1_op-try',
              sourcePaymentId: 'pay-old-1',
              method: 'pix',
              amountCents: 500,
              reason: 'Tentativa de operador',
              timestamp: new Date().toISOString(),
              operator: 'Operador Teste',
              operatorUid: 'op-uid-1',
            },
          ],
          history: [
            ...cmd.history,
            {
              id: 'hist-ref-op',
              timestamp: new Date().toISOString(),
              operator: 'Operador Teste',
              type: 'estorno',
              description: 'Tentativa de estorno',
            },
          ],
        });

        tx.set(rcptRef, {
          id: 'rcpt_est_cmd_cmd-1_op-try',
          origin: 'comanda',
          refId: 'cmd-1',
          refNumber: 105,
          refLabel: 'Carlos',
          method: 'pix',
          amountCents: 500,
          paidAt: firebase.firestore.FieldValue.serverTimestamp(),
          staffUid: 'op-uid-1',
          staffName: 'Operador Teste',
          sourcePaymentId: 'pay-old-1',
          refundId: 'ref_op-try',
          reason: 'Tentativa de operador',
          kind: 'estorno',
        });
      })
    );
  });

  it('admin consegue estornar comanda encerrada (reabrindo-a) com receipt atômico, e bloqueia estorno sem motivo ou sem receipt', async () => {
    const admDb = adminCtx().firestore();

    // Prepara comanda encerrada
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await ctx.firestore().doc('comandas/cmd-1').update({
        status: 'encerrada',
        closedAt: '2026-11-18T14:00:00.000Z',
      });
    });

    // Sem receipt correspondente -> falha
    await assertFails(
      admDb.runTransaction(async tx => {
        const cmdRef = admDb.doc('comandas/cmd-1');
        const snap = await tx.get(cmdRef);
        const { closedAt: _c, ...cmd } = snap.data()!;
        void _c;
        tx.set(cmdRef, {
          ...cmd,
          status: 'aberta',
          clientRev: 2,
          revSeq: 1,
          refunds: [
            {
              id: 'ref_no_rcpt',
              clientNonce: 'no_rcpt',
              receiptId: 'rcpt_est_cmd_cmd-1_no_rcpt',
              sourcePaymentId: 'pay-old-1',
              method: 'pix',
              amountCents: 500,
              reason: 'Sem recibo no livro',
              timestamp: new Date().toISOString(),
              operator: 'Admin Teste',
              operatorUid: 'admin-uid-1',
            },
          ],
          history: [
            ...cmd.history,
            {
              id: 'hist-ref-1',
              timestamp: new Date().toISOString(),
              operator: 'Admin Teste',
              type: 'estorno',
              description: 'Estorno sem receipt',
            },
          ],
        });
      })
    );

    // Motivo curto (< 3 chars) -> falha
    await assertFails(
      admDb.runTransaction(async tx => {
        const cmdRef = admDb.doc('comandas/cmd-1');
        const rcptRef = opDbReceiptRef(admDb, 'rcpt_est_cmd_cmd-1_short');
        const snap = await tx.get(cmdRef);
        const { closedAt: _c, ...cmd } = snap.data()!;
        void _c;
        tx.set(cmdRef, {
          ...cmd,
          status: 'aberta',
          clientRev: 2,
          revSeq: 1,
          refunds: [
            {
              id: 'ref_short',
              clientNonce: 'short',
              receiptId: 'rcpt_est_cmd_cmd-1_short',
              sourcePaymentId: 'pay-old-1',
              method: 'pix',
              amountCents: 500,
              reason: 'ok',
              timestamp: new Date().toISOString(),
              operator: 'Admin Teste',
              operatorUid: 'admin-uid-1',
            },
          ],
          history: [
            ...cmd.history,
            {
              id: 'hist-ref-short',
              timestamp: new Date().toISOString(),
              operator: 'Admin Teste',
              type: 'estorno',
              description: 'Estorno motivo curto',
            },
          ],
        });
        tx.set(rcptRef, {
          id: 'rcpt_est_cmd_cmd-1_short',
          origin: 'comanda',
          refId: 'cmd-1',
          refNumber: 105,
          refLabel: 'Carlos',
          method: 'pix',
          amountCents: 500,
          paidAt: firebase.firestore.FieldValue.serverTimestamp(),
          staffUid: 'admin-uid-1',
          staffName: 'Admin Teste',
          sourcePaymentId: 'pay-old-1',
          refundId: 'ref_short',
          reason: 'ok',
          kind: 'estorno',
        });
      })
    );

    // Estorno válido pelo Admin reabrindo comanda encerrada -> sucesso
    await assertSucceeds(
      admDb.runTransaction(async tx => {
        const cmdRef = admDb.doc('comandas/cmd-1');
        const rcptRef = admDb.doc('receipts/rcpt_est_cmd_cmd-1_ref-1');
        const snap = await tx.get(cmdRef);
        const { closedAt: _c, ...cmd } = snap.data()!;
        void _c;

        tx.set(cmdRef, {
          ...cmd,
          status: 'aberta',
          clientRev: 2,
          revSeq: 1,
          refunds: [
            {
              id: 'ref_ref-1',
              clientNonce: 'ref-1',
              receiptId: 'rcpt_est_cmd_cmd-1_ref-1',
              sourcePaymentId: 'pay-old-1',
              method: 'pix',
              amountCents: 600,
              reason: 'Cobrança duplicada no Pix',
              timestamp: new Date().toISOString(),
              operator: 'Admin Teste',
              operatorUid: 'admin-uid-1',
            },
          ],
          history: [
            ...cmd.history,
            {
              id: 'hist-ref-valid',
              timestamp: new Date().toISOString(),
              operator: 'Admin Teste',
              type: 'estorno',
              description: 'Estorno de R$ 6,00',
            },
          ],
        });

        tx.set(rcptRef, {
          id: 'rcpt_est_cmd_cmd-1_ref-1',
          origin: 'comanda',
          refId: 'cmd-1',
          refNumber: 105,
          refLabel: 'Carlos',
          method: 'pix',
          amountCents: 600,
          paidAt: firebase.firestore.FieldValue.serverTimestamp(),
          staffUid: 'admin-uid-1',
          staffName: 'Admin Teste',
          sourcePaymentId: 'pay-old-1',
          refundId: 'ref_ref-1',
          reason: 'Cobrança duplicada no Pix',
          kind: 'estorno',
        });
      })
    );
  });

  it('trava de versão antiga: escrita sem novo clientRev/revSeq em documento com refunds é recusada, e app novo paga e encerra normalmente', async () => {
    const opDb = operatorCtx().firestore();

    // Seed comanda já com 1 estorno e revSeq: 1
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await ctx.firestore().doc('comandas/cmd-1').update({
        status: 'aberta',
        clientRev: 2,
        revSeq: 1,
        refunds: [
          {
            id: 'ref_seed-1',
            clientNonce: 'seed-1',
            receiptId: 'rcpt_est_cmd_cmd-1_seed-1',
            sourcePaymentId: 'pay-old-1',
            method: 'pix',
            amountCents: 600,
            reason: 'Estorno inicial',
            timestamp: '2026-11-18T13:00:00.000Z',
            operator: 'Admin Teste',
            operatorUid: 'admin-uid-1',
          },
        ],
      });
    });

    // 1. Cliente antigo (faz spread mantendo revSeq: 1 sem incrementar) -> RECUSADO
    await assertFails(
      opDb.runTransaction(async tx => {
        const cmdRef = opDb.doc('comandas/cmd-1');
        const snap = await tx.get(cmdRef);
        const cmd = snap.data()!;
        tx.set(cmdRef, {
          ...cmd,
          status: 'encerrada',
          closedAt: new Date().toISOString(),
        });
      })
    );

    // 2. App novo paga novamente com clientRev: 2 e revSeq: 2 + receipt -> PERMITIDO
    await assertSucceeds(
      opDb.runTransaction(async tx => {
        const cmdRef = opDb.doc('comandas/cmd-1');
        const rcptRef = opDb.doc('receipts/rcpt_cmd_cmd-1_pay-repaid');
        const snap = await tx.get(cmdRef);
        const cmd = snap.data()!;

        tx.set(cmdRef, {
          ...cmd,
          clientRev: 2,
          revSeq: (cmd.revSeq || 0) + 1,
          payments: [
            ...cmd.payments,
            {
              id: 'pay-repaid',
              clientNonce: 'pay-repaid',
              method: 'dinheiro',
              amountCents: 2600,
              timestamp: new Date().toISOString(),
              operator: 'Operador Teste',
              operatorUid: 'op-uid-1',
            },
          ],
          history: [
            ...cmd.history,
            {
              id: 'hist-repaid',
              timestamp: new Date().toISOString(),
              operator: 'Operador Teste',
              type: 'pagamento',
              description: 'Pagamento de R$ 26,00',
            },
          ],
        });

        tx.set(rcptRef, {
          id: 'rcpt_cmd_cmd-1_pay-repaid',
          origin: 'comanda',
          refId: 'cmd-1',
          refNumber: 105,
          refLabel: 'Carlos',
          method: 'dinheiro',
          amountCents: 2600,
          paidAt: firebase.firestore.FieldValue.serverTimestamp(),
          staffUid: 'op-uid-1',
          staffName: 'Operador Teste',
          sourcePaymentId: 'pay-repaid',
          kind: 'recebimento',
        });
      })
    );

    // 3. App novo encerra comanda com clientRev: 2 e revSeq: 3 -> PERMITIDO
    await assertSucceeds(
      opDb.runTransaction(async tx => {
        const cmdRef = opDb.doc('comandas/cmd-1');
        const snap = await tx.get(cmdRef);
        const cmd = snap.data()!;

        tx.set(cmdRef, {
          ...cmd,
          status: 'encerrada',
          closedAt: new Date().toISOString(),
          clientRev: 2,
          revSeq: (cmd.revSeq || 0) + 1,
          history: [
            ...cmd.history,
            {
              id: 'hist-reclosed',
              timestamp: new Date().toISOString(),
              operator: 'Operador Teste',
              type: 'encerramento',
              description: 'Comanda encerrada novamente',
            },
          ],
        });
      })
    );
  });

  it('locação em grupo: admin estorna locação quitada (reabrindo) e estorno em locação cancelada é bloqueado', async () => {
    const admDb = adminCtx().firestore();

    // Locação cancelada -> bloqueado
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await ctx.firestore().doc('group_rentals/gr-1').update({
        status: 'cancelada',
      });
    });

    await assertFails(
      admDb.runTransaction(async tx => {
        const ref = admDb.doc('group_rentals/gr-1');
        const rcptRef = admDb.doc('receipts/rcpt_est_loc_gr-1_cancel');
        const snap = await tx.get(ref);
        const rental = snap.data()!;

        tx.set(ref, {
          ...rental,
          status: 'aberta',
          clientRev: 2,
          revSeq: 1,
          refunds: [
            {
              id: 'ref_cancel',
              clientNonce: 'cancel',
              receiptId: 'rcpt_est_loc_gr-1_cancel',
              sourcePaymentId: 'grpay-old-1',
              method: 'dinheiro',
              amountCents: 1000,
              reason: 'Tentativa em cancelada',
              timestamp: new Date().toISOString(),
              operator: 'Admin Teste',
              operatorUid: 'admin-uid-1',
              allocations: [{ participantId: 'p-1', participantName: 'João', amountCents: 1000 }],
            },
          ],
          history: [
            ...rental.history,
            {
              id: 'hist-gr-cancel',
              timestamp: new Date().toISOString(),
              operator: 'Admin Teste',
              type: 'estorno',
              description: 'Estorno em cancelada',
            },
          ],
        });

        tx.set(rcptRef, {
          id: 'rcpt_est_loc_gr-1_cancel',
          origin: 'locacao',
          refId: 'gr-1',
          refNumber: 501,
          refLabel: 'Pelada Quarta (Areia 1)',
          method: 'dinheiro',
          amountCents: 1000,
          paidAt: firebase.firestore.FieldValue.serverTimestamp(),
          staffUid: 'admin-uid-1',
          staffName: 'Admin Teste',
          sourcePaymentId: 'grpay-old-1',
          refundId: 'ref_cancel',
          reason: 'Tentativa em cancelada',
          kind: 'estorno',
        });
      })
    );

    // Locação quitada -> permitido (reabre para 'aberta' e remove closedAt)
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await ctx.firestore().doc('group_rentals/gr-1').update({
        status: 'quitada',
        closedAt: '2026-11-18T21:00:00.000Z',
      });
    });

    await assertSucceeds(
      admDb.runTransaction(async tx => {
        const ref = admDb.doc('group_rentals/gr-1');
        const rcptRef = admDb.doc('receipts/rcpt_est_loc_gr-1_ref-gr-1');
        const snap = await tx.get(ref);
        const { closedAt: _c, ...rental } = snap.data()!;
        void _c;

        tx.set(ref, {
          ...rental,
          status: 'aberta',
          clientRev: 2,
          revSeq: 1,
          participants: rental.participants.map((p: { id: string; paidAmountCents: number }) =>
            p.id === 'p-1'
              ? { ...p, paidAmountCents: 2000, status: 'parcial' }
              : p
          ),
          refunds: [
            {
              id: 'ref_ref-gr-1',
              clientNonce: 'ref-gr-1',
              receiptId: 'rcpt_est_loc_gr-1_ref-gr-1',
              sourcePaymentId: 'grpay-old-1',
              method: 'dinheiro',
              amountCents: 1000,
              reason: 'Desconto autorizado pelo admin',
              timestamp: new Date().toISOString(),
              operator: 'Admin Teste',
              operatorUid: 'admin-uid-1',
              allocations: [{ participantId: 'p-1', participantName: 'João', amountCents: 1000 }],
            },
          ],
          history: [
            ...rental.history,
            {
              id: 'hist-gr-ref-1',
              timestamp: new Date().toISOString(),
              operator: 'Admin Teste',
              type: 'estorno',
              description: 'Estorno parcial',
            },
          ],
        });

        tx.set(rcptRef, {
          id: 'rcpt_est_loc_gr-1_ref-gr-1',
          origin: 'locacao',
          refId: 'gr-1',
          refNumber: 501,
          refLabel: 'Pelada Quarta (Areia 1)',
          method: 'dinheiro',
          amountCents: 1000,
          paidAt: firebase.firestore.FieldValue.serverTimestamp(),
          staffUid: 'admin-uid-1',
          staffName: 'Admin Teste',
          sourcePaymentId: 'grpay-old-1',
          refundId: 'ref_ref-gr-1',
          reason: 'Desconto autorizado pelo admin',
          kind: 'estorno',
        });
      })
    );
  });
});

function opDbReceiptRef(db: firebase.firestore.Firestore, id: string) {
  return db.doc(`receipts/${id}`);
}
