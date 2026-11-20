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
import { getSaoPauloDateKey } from './lib/formatters';

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

  it('administrador consegue ler (get e list) a coleção receipts', async () => {
    const db = adminCtx().firestore();
    await assertSucceeds(db.doc('receipts/rcpt_cmd_cmd-1_pay-old-1').get());
    await assertSucceeds(db.collection('receipts').where('dateKey', '==', '2026-11-18').get());
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
    const todayKey = getSaoPauloDateKey(new Date());

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
        dateKey: todayKey,
        staffUid: 'op-uid-1',
        staffName: 'Operador Teste',
        sourcePaymentId: 'pay-fake',
        kind: 'recebimento',
      })
    );
  });

  it('operador consegue registrar pagamento + receipt na mesma transação atômica', async () => {
    const opDb = operatorCtx().firestore();
    const todayKey = getSaoPauloDateKey(new Date());

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
          dateKey: todayKey,
          staffUid: 'op-uid-1',
          staffName: 'Operador Teste',
          sourcePaymentId: 'pay-new-2',
          kind: 'recebimento',
        });
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
});
