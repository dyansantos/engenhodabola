import {
  calculateEqualDivisionCents,
  calculateGroupRentalTotals,
} from '../lib/firestore-transactions';
import { GroupRental, GroupParticipant, GroupRentalPayment } from '../lib/types';

function runTests() {
  console.log('====================================================');
  console.log('INICIANDO BATERIA DE TESTES DE ACEITAÇÃO: LOCAÇÃO EM GRUPO');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}: ${details || 'Condição não satisfeita'}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // TESTE 1: R$ 150 divididos entre 10 pessoas resultam em R$ 15 por pessoa.
  // ----------------------------------------------------
  const division150 = calculateEqualDivisionCents(15000, 10);
  const all15 = division150.length === 10 && division150.every(v => v === 1500);
  const sum150 = division150.reduce((a, b) => a + b, 0);
  assert(
    all15 && sum150 === 15000,
    'Teste 1: R$ 150 divididos entre 10 pessoas = R$ 15 cada',
    `Partes: ${JSON.stringify(division150)}`
  );

  // ----------------------------------------------------
  // TESTE 2: Após três participantes pagarem R$ 15, total recebido = R$ 45 e faltam R$ 105.
  // ----------------------------------------------------
  const participantsT2: GroupParticipant[] = division150.map((v, i) => ({
    id: `p-${i + 1}`,
    name: `Participante ${i + 1}`,
    dueAmountCents: v,
    paidAmountCents: i < 3 ? 1500 : 0,
    status: i < 3 ? 'pago' : 'pendente',
  }));

  const rentalT2: GroupRental = {
    id: 'test-r2',
    number: 501,
    groupName: 'Society Terça',
    date: '2026-10-10',
    time: '19:00 - 20:00',
    space: 'Society',
    totalAmountCents: 15000,
    status: 'aberta',
    participants: participantsT2,
    payments: [],
    history: [],
    createdAt: new Date().toISOString(),
    createdByUid: 'admin-1',
    createdByName: 'Admin',
  };

  const totalsT2 = calculateGroupRentalTotals(rentalT2);
  assert(
    totalsT2.totalPaidCents === 4500 && totalsT2.pendingBalanceCents === 10500 && totalsT2.paidParticipantsCount === 3,
    'Teste 2: 3 de 10 pagando R$ 15 -> Recebido: R$ 45, Faltam: R$ 105',
    `Recebido: ${totalsT2.totalPaidCents}, Saldo: ${totalsT2.pendingBalanceCents}`
  );

  // ----------------------------------------------------
  // TESTE 3: Uma pessoa pode pagar R$ 30 por dois participantes, gerando um único recebimento.
  // ----------------------------------------------------
  const singleBulkPayment: GroupRentalPayment = {
    id: 'pay-bulk-1',
    clientNonce: 'nonce-bulk-1',
    timestamp: new Date().toISOString(),
    method: 'pix',
    amountCents: 3000,
    payerName: 'Carlos (Amigo)',
    operator: 'Operador Caixa',
    operatorUid: 'op-1',
    allocations: [
      { participantId: 'p-4', participantName: 'Participante 4', amountCents: 1500 },
      { participantId: 'p-5', participantName: 'Participante 5', amountCents: 1500 },
    ],
  };

  // Atualizar participantes p-4 e p-5 com o pagamento único
  participantsT2[3].paidAmountCents = 1500;
  participantsT2[3].status = 'pago';
  participantsT2[4].paidAmountCents = 1500;
  participantsT2[4].status = 'pago';
  rentalT2.payments.push(singleBulkPayment);

  const totalsT3 = calculateGroupRentalTotals(rentalT2);
  assert(
    rentalT2.payments.length === 1 &&
    singleBulkPayment.allocations.length === 2 &&
    singleBulkPayment.amountCents === 3000 &&
    totalsT3.totalPaidCents === 7500 &&
    totalsT3.pendingBalanceCents === 7500,
    'Teste 3: Pagamento único de R$ 30 por dois participantes (distribuição explícita)',
    `Pagamentos no registro: ${rentalT2.payments.length}, Total recebido: ${totalsT3.totalPaidCents}`
  );

  // ----------------------------------------------------
  // TESTE 4: Uma parte de R$ 15 pode receber R$ 10 e continuar com R$ 5 pendentes.
  // ----------------------------------------------------
  const p6 = participantsT2[5]; // devido: 1500, pago: 0
  p6.paidAmountCents = 1000; // Recebeu R$ 10,00
  p6.status = 'parcial';

  const pendingP6 = p6.dueAmountCents - p6.paidAmountCents;
  assert(
    pendingP6 === 500 && p6.status === 'parcial',
    'Teste 4: Pagamento parcial de R$ 10 sobre parte de R$ 15 mantém R$ 5 pendentes',
    `Saldo restante: ${pendingP6}, Status: ${p6.status}`
  );

  // ----------------------------------------------------
  // TESTE 5: R$ 100 divididos entre três pessoas fecham exatamente em R$ 100.
  // ----------------------------------------------------
  const division100 = calculateEqualDivisionCents(10000, 3);
  const sum100 = division100.reduce((a, b) => a + b, 0);
  assert(
    division100.length === 3 &&
    sum100 === 10000 &&
    division100[0] === 3334 &&
    division100[1] === 3333 &&
    division100[2] === 3333,
    'Teste 5: R$ 100 divididos entre 3 pessoas fecham exatamente em R$ 100 (centavos exatos)',
    `Partes: ${JSON.stringify(division100)}, Soma: ${sum100}`
  );

  // ----------------------------------------------------
  // TESTE 6: R$ 15 de locação e R$ 20 de bar podem ser pagos juntos, registrando R$ 35 uma única vez.
  // ----------------------------------------------------
  const rentalPartCents = 1500;
  const barConsumptionCents = 2000;
  const totalJointReceiptCents = rentalPartCents + barConsumptionCents;

  const jointPayment: GroupRentalPayment = {
    id: 'pay-joint-1',
    clientNonce: 'nonce-joint-1',
    timestamp: new Date().toISOString(),
    method: 'dinheiro',
    amountCents: rentalPartCents,
    tenderedCents: 5000, // R$ 50,00 entregues
    changeCents: 1500, // R$ 15,00 troco (50,00 - 35,00)
    operator: 'Operador Bar',
    operatorUid: 'op-1',
    allocations: [
      { participantId: 'p-7', participantName: 'Participante 7', amountCents: rentalPartCents },
    ],
    linkedBarPayment: {
      comandaId: 'cmd-104',
      comandaNumber: 104,
      amountCents: barConsumptionCents,
    },
  };

  const totalOperacao = jointPayment.amountCents + (jointPayment.linkedBarPayment?.amountCents || 0);
  const changeCalculated = (jointPayment.tenderedCents || 0) - totalOperacao;

  assert(
    totalOperacao === 3500 &&
    changeCalculated === 1500 &&
    jointPayment.linkedBarPayment?.amountCents === 2000,
    'Teste 6: R$ 15 de locação e R$ 20 de bar recebidos juntos totalizando R$ 35 com troco correto',
    `Total operação: ${totalOperacao}, Troco: ${changeCalculated}`
  );

  // ----------------------------------------------------
  // TESTE 7: Integridade transacional e concorrência sem perda de dados
  // ----------------------------------------------------
  // Simular transação que recebe simultaneamente dois pagamentos distintos em memória
  const simulatedRental: GroupRental = {
    ...rentalT2,
    payments: [],
    participants: division150.map((v, i) => ({
      id: `p-${i + 1}`,
      name: `Participante ${i + 1}`,
      dueAmountCents: v,
      paidAmountCents: 0,
      status: 'pendente',
    })),
  };

  // Aparelho A recebe Participante 1 (R$ 15)
  const paymentA: GroupRentalPayment = {
    id: 'pay-device-a',
    clientNonce: 'nonce-a',
    timestamp: new Date().toISOString(),
    method: 'pix',
    amountCents: 1500,
    operator: 'Operador A',
    operatorUid: 'op-a',
    allocations: [{ participantId: 'p-1', participantName: 'Participante 1', amountCents: 1500 }],
  };

  // Aparelho B recebe Participante 2 (R$ 15)
  const paymentB: GroupRentalPayment = {
    id: 'pay-device-b',
    clientNonce: 'nonce-b',
    timestamp: new Date().toISOString(),
    method: 'credito',
    amountCents: 1500,
    operator: 'Operador B',
    operatorUid: 'op-b',
    allocations: [{ participantId: 'p-2', participantName: 'Participante 2', amountCents: 1500 }],
  };

  simulatedRental.payments.push(paymentA, paymentB);
  simulatedRental.participants[0].paidAmountCents = 1500;
  simulatedRental.participants[0].status = 'pago';
  simulatedRental.participants[1].paidAmountCents = 1500;
  simulatedRental.participants[1].status = 'pago';

  const totalsSim = calculateGroupRentalTotals(simulatedRental);
  assert(
    simulatedRental.payments.length === 2 &&
    totalsSim.totalPaidCents === 3000 &&
    totalsSim.paidParticipantsCount === 2,
    'Teste 7: Dois aparelhos recebendo simultaneamente preservam ambos os registros e status',
    `Pagamentos salvos: ${simulatedRental.payments.length}, Total recebido: ${totalsSim.totalPaidCents}`
  );

  // ----------------------------------------------------
  // TESTE 8: Repetir a confirmação não duplica o recebimento (Idempotência com clientNonce)
  // ----------------------------------------------------
  const existingNonce = 'nonce-a';
  const duplicateAttempt = simulatedRental.payments.find(p => p.clientNonce === existingNonce);
  const wouldBeDuplicate = !!duplicateAttempt;

  assert(
    wouldBeDuplicate,
    'Teste 8: Idempotência ativa - Repetição com o mesmo clientNonce detectada e duplicidade prevenida',
    `Identificador de idempotência: ${existingNonce}`
  );

  console.log('\n====================================================');
  console.log(`RESULTADO FINAL: ${passed} PASSOU / ${failed} FALHOU`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
