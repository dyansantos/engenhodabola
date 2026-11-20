/**
 * Script de Verificação Automatizada de Confiabilidade e Integridade
 * Engenho da Bola - Gestão de Comandas
 */

import {
  STORAGE_VERSION,
  STORAGE_KEY_COMANDAS,
  LEGACY_STORAGE_KEY_COMANDAS,
  loadComandasFromStorage,
  saveComandasToStorage,
  attemptRecoverStorage,
  restoreDefaultsConfirmed,
  validateComanda,
  createNewComandaHelper,
  addItemHelper,
  registerPaymentHelper,
  transferItemsHelper,
  loadRealLocalBackupComandas,
} from '../lib/storage';
import { calculateComandaTotals } from '../lib/formatters';
import { Comanda, Product } from '../lib/types';

// Mock do localStorage para ambiente Node.js de teste
class MockLocalStorage {
  private store: Map<string, string> = new Map();
  public failNextSetItem = false;

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    if (this.failNextSetItem) {
      const err = new Error('QuotaExceededError: DomException: quota exceeded');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
    this.failNextSetItem = false;
  }
}

const mockStorage = new MockLocalStorage();
(globalThis as any).window = {};
(globalThis as any).localStorage = mockStorage;

// Simulador da fila sequencial de operações do ComandasContext
class SimulatedComandasEngine {
  public comandas: Comanda[] = [];
  public isInitialized = false;
  public isCorrupted = false;
  public storageError: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  async init(): Promise<void> {
    const res = loadComandasFromStorage();
    if (res.status === 'corrupted') {
      this.isCorrupted = true;
      this.comandas = [];
    } else {
      this.comandas = res.comandas;
      this.isCorrupted = false;
    }
    this.isInitialized = true;
  }

  executeSequential<T extends { success: boolean; error?: string }>(
    op: (current: Comanda[]) => { success: boolean; nextComandas?: Comanda[]; result: T }
  ): Promise<T> {
    const run = async (): Promise<T> => {
      if (!this.isInitialized) {
        return { success: false, error: 'Não inicializado' } as T;
      }
      if (this.isCorrupted) {
        return { success: false, error: 'Dados corrompidos' } as T;
      }

      const current = this.comandas;
      const outcome = op(current);

      if (!outcome.success || !outcome.nextComandas) {
        return outcome.result;
      }

      const saveRes = saveComandasToStorage(outcome.nextComandas);
      if (!saveRes.success) {
        this.storageError = `Falha ao gravar: ${saveRes.error}`;
        // Mantém estado anterior integralmente
        return {
          ...outcome.result,
          success: false,
          error: `A operação não foi concluída porque não foi possível gravar os dados: ${saveRes.error}`,
        };
      }

      // Persistência confirmada: atualiza memória
      this.comandas = outcome.nextComandas;
      this.storageError = null;
      return outcome.result;
    };

    const nextP = this.queue.then(run, run);
    this.queue = nextP.catch(() => {});
    return nextP;
  }

  async createComanda(params: { type: 'individual' | 'mesa'; name: string; table?: string }) {
    return this.executeSequential<{ success: boolean; comanda?: Comanda; error?: string }>(current => {
      const newCmd = createNewComandaHelper(current, params);
      const nextList = [newCmd, ...current];
      return {
        success: true,
        nextComandas: nextList,
        result: { success: true, comanda: newCmd },
      };
    });
  }

  async addItem(comandaId: string, product: Product, quantity: number) {
    return this.executeSequential<{ success: boolean; error?: string }>(current => {
      const target = current.find(c => c.id === comandaId);
      if (!target) return { success: false, result: { success: false, error: 'Não encontrada' } };
      const res = addItemHelper(target, product, quantity);
      if (!res.success || !res.comanda) return { success: false, result: { success: false, error: res.error } };
      return {
        success: true,
        nextComandas: current.map(c => (c.id === comandaId ? res.comanda! : c)),
        result: { success: true },
      };
    });
  }

  async registerPayment(comandaId: string, params: { method: 'pix'; amountCents: number; clientNonce?: string }) {
    return this.executeSequential<{ success: boolean; error?: string }>(current => {
      const target = current.find(c => c.id === comandaId);
      if (!target) return { success: false, result: { success: false, error: 'Não encontrada' } };
      const res = registerPaymentHelper(target, params);
      if (!res.success || !res.comanda) return { success: false, result: { success: false, error: res.error } };
      return {
        success: true,
        nextComandas: current.map(c => (c.id === comandaId ? res.comanda! : c)),
        result: { success: true },
      };
    });
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('INICIANDO BATERIA DE TESTES DE CONFIABILIDADE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  }

  // TESTE 1: Primeira execução limpa começa vazia (sem dados fictícios) e criar comanda persiste exatamente o registro salvo
  {
    mockStorage.clear();
    const engine = new SimulatedComandasEngine();
    await engine.init();

    assert(engine.comandas.length === 0, '1.0 Primeira execução limpa inicia sem comandas fictícias');
    assert(
      mockStorage.getItem(STORAGE_KEY_COMANDAS) === null,
      '1.0b Primeira execução limpa não grava comandas de exemplo no localStorage'
    );
    assert(
      loadRealLocalBackupComandas().length === 0,
      '1.0c Backup local real reporta 0 registros em navegador limpo'
    );

    const initialCount = engine.comandas.length;
    const res = await engine.createComanda({
      type: 'individual',
      name: 'Gabriel Teste',
      table: 'Mesa 07',
    });

    assert(res.success === true && !!res.comanda, '1.1 createComanda retorna sucesso e objeto comanda');

    // Verificar se o registro retornado bate exatamente com o salvo em storage
    const storedRaw = mockStorage.getItem(STORAGE_KEY_COMANDAS);
    const parsedStored = JSON.parse(storedRaw!);
    const savedInStorage = parsedStored.comandas.find((c: Comanda) => c.id === res.comanda!.id);

    assert(
      savedInStorage &&
        savedInStorage.id === res.comanda!.id &&
        savedInStorage.number === res.comanda!.number &&
        savedInStorage.name === 'Gabriel Teste' &&
        savedInStorage.status === 'aberta',
      '1.2 O registro retornado corresponde exatamente ao salvo no armazenamento local'
    );
    assert(engine.comandas.length === initialCount + 1, '1.3 O estado interno em memória reflete o total correto');
  }

  // TESTE 2: Falha de armazenamento retorna erro, sem confirmação falsa na interface
  {
    mockStorage.clear();
    const engine = new SimulatedComandasEngine();
    await engine.init();

    const previousLength = engine.comandas.length;
    const previousStored = mockStorage.getItem(STORAGE_KEY_COMANDAS);

    // Simular falha de cota no localStorage
    mockStorage.failNextSetItem = true;

    const res = await engine.createComanda({
      type: 'individual',
      name: 'Cliente Falha Cota',
    });

    assert(res.success === false, '2.1 Operação retorna erro quando o salvamento falha');
    assert(
      res.error!.includes('não foi possível gravar os dados'),
      '2.2 Mensagem de erro informa falha de gravação'
    );
    assert(
      engine.comandas.length === previousLength,
      '2.3 Estado em memória foi mantido inalterado (sem confirmação falsa)'
    );
    assert(
      mockStorage.getItem(STORAGE_KEY_COMANDAS) === previousStored,
      '2.4 Armazenamento anterior foi mantido integralmente'
    );
    mockStorage.failNextSetItem = false;
  }

  // TESTE 3: Dois lançamentos consecutivos preservam ambos os itens
  {
    mockStorage.clear();
    const engine = new SimulatedComandasEngine();
    await engine.init();

    const cmdRes = await engine.createComanda({ type: 'individual', name: 'Comanda Concorrência' });
    const cmdId = cmdRes.comanda!.id;

    const prodA: Product = { id: 'p-1', name: 'Item Alpha', category: 'Bebidas', priceCents: 1500 };
    const prodB: Product = { id: 'p-2', name: 'Item Beta', category: 'Lanches', priceCents: 2500 };

    // Disparar duas operações em rápida sucessão concorrente (Promise.all)
    const [resA, resB] = await Promise.all([
      engine.addItem(cmdId, prodA, 2), // 2x 1500 = 3000
      engine.addItem(cmdId, prodB, 1), // 1x 2500 = 2500
    ]);

    assert(resA.success && resB.success, '3.1 Ambos os lançamentos concorrentes retornaram sucesso');

    // Verificar na memória e no storage
    const targetCmd = engine.comandas.find(c => c.id === cmdId)!;
    assert(targetCmd.items.length === 2, '3.2 Comanda em memória possui ambos os itens (nenhum foi sobrescrito)');

    const storedParsed = JSON.parse(mockStorage.getItem(STORAGE_KEY_COMANDAS)!);
    const storedCmd = storedParsed.comandas.find((c: Comanda) => c.id === cmdId)!;
    assert(storedCmd.items.length === 2, '3.3 Comanda no armazenamento possui ambos os itens preservados');

    const totals = calculateComandaTotals(storedCmd);
    assert(totals.totalConsumedCents === 5500, '3.4 Valor total acumulado confere exatamente (R$ 55,00)');
  }

  // TESTE 4: Repetir o mesmo pagamento não duplica o recebimento
  {
    mockStorage.clear();
    const engine = new SimulatedComandasEngine();
    await engine.init();

    const cmdRes = await engine.createComanda({ type: 'individual', name: 'Comanda Pagamento Duplo' });
    const cmdId = cmdRes.comanda!.id;
    await engine.addItem(cmdId, { id: 'p-1', name: 'Água', category: 'Bebidas', priceCents: 10000 }, 1);

    const nonce = 'unique-payment-nonce-xyz-999';

    // Primeiro pagamento
    const pay1 = await engine.registerPayment(cmdId, {
      method: 'pix',
      amountCents: 5000,
      clientNonce: nonce,
    });
    assert(pay1.success === true, '4.1 Primeiro pagamento registrado com sucesso');

    // Segundo pagamento com o mesmo nonce (repetição acidental)
    const pay2 = await engine.registerPayment(cmdId, {
      method: 'pix',
      amountCents: 5000,
      clientNonce: nonce,
    });
    assert(pay2.success === false, '4.2 Segundo pagamento com mesmo nonce é rejeitado');
    assert(pay2.error!.includes('Duplicidade detectada'), '4.3 Mensagem explicativa de duplicidade retornada');

    const targetCmd = engine.comandas.find(c => c.id === cmdId)!;
    assert(targetCmd.payments.length === 1, '4.4 Apenas 1 registro de pagamento foi mantido');
    assert(targetCmd.payments[0].amountCents === 5000, '4.5 Valor abatido não foi duplicado');
  }

  // TESTE 5: JSON legado inválido permanece intacto
  {
    mockStorage.clear();
    const invalidLegacyRaw = '{ "corrupted": true, syntax_error: [1, 2, }';
    mockStorage.setItem(LEGACY_STORAGE_KEY_COMANDAS, invalidLegacyRaw);

    const loadRes = loadComandasFromStorage();
    assert(loadRes.status === 'corrupted', '5.1 JSON legado inválido gera status "corrupted"');
    assert(
      (loadRes as any).reason === 'v1_invalid_json',
      '5.2 Razão é diagnosticada como "v1_invalid_json"'
    );
    assert(
      mockStorage.getItem(LEGACY_STORAGE_KEY_COMANDAS) === invalidLegacyRaw,
      '5.3 Conteúdo corrompido na chave legada permanece 100% intacto (não foi sobrescrito)'
    );
    assert(
      mockStorage.getItem(STORAGE_KEY_COMANDAS) === null,
      '5.4 Chave v2 NÃO foi preenchida silenciosamente com dados de exemplo'
    );
  }

  // TESTE 6: Versão desconhecida permanece intacta
  {
    mockStorage.clear();
    const unknownVersionRaw = JSON.stringify({
      version: 'v99_incompatible_schema',
      savedAt: '2026-10-10T00:00:00.000Z',
      comandas: [{ id: 'cmd-future', number: 999, name: 'Futuro' }],
    });
    mockStorage.setItem(STORAGE_KEY_COMANDAS, unknownVersionRaw);

    const loadRes = loadComandasFromStorage();
    assert(loadRes.status === 'corrupted', '6.1 Versão desconhecida gera status "corrupted"');
    assert(
      (loadRes as any).reason === 'v2_unknown_version',
      '6.2 Razão é diagnosticada como "v2_unknown_version"'
    );
    assert(
      mockStorage.getItem(STORAGE_KEY_COMANDAS) === unknownVersionRaw,
      '6.3 Conteúdo original com versão desconhecida permanece 100% intacto'
    );
  }

  // TESTE 7: Recuperação malsucedida não restaura exemplos
  {
    mockStorage.clear();
    // Um JSON com comanda contendo valores matematicamente inválidos que não podem ser adivinhados
    const irrecoverableRaw = JSON.stringify({
      version: 'v2_corrupted',
      comandas: [
        {
          id: '', // id vazio
          number: -50, // número negativo
          name: '', // nome ausente
          items: [{ id: 'it-1', priceCents: -999, quantity: -2 }], // valores negativos
        },
      ],
    });
    mockStorage.setItem(STORAGE_KEY_COMANDAS, irrecoverableRaw);

    const recoveryRes = attemptRecoverStorage();
    assert(recoveryRes.success === false, '7.1 attemptRecoverStorage retorna falha quando registros são irrecuperáveis');
    assert(
      Boolean(recoveryRes.unrecoverableDetails && recoveryRes.unrecoverableDetails.length > 0),
      '7.2 Registros irrecuperáveis são diagnosticados e detalhados'
    );
    assert(
      mockStorage.getItem(STORAGE_KEY_COMANDAS) === irrecoverableRaw,
      '7.3 O conteúdo original NÃO foi substituído pelos exemplos de demonstração'
    );
  }

  // TESTE 8: Restauração só ocorre após confirmação explícita e trata falhas de gravação
  {
    mockStorage.clear();
    const corruptedRaw = '{ invalid_json';
    mockStorage.setItem(STORAGE_KEY_COMANDAS, corruptedRaw);

    // Simular falha de cota durante restauração
    mockStorage.failNextSetItem = true;
    const failedRestore = restoreDefaultsConfirmed();
    assert(failedRestore.success === false, '8.1 restoreDefaultsConfirmed falha quando há erro no storage');
    assert(
      mockStorage.getItem(STORAGE_KEY_COMANDAS) === corruptedRaw,
      '8.2 Dados anteriores NÃO são apagados quando o salvamento dos exemplos falha'
    );
    mockStorage.failNextSetItem = false;

    // Restauração com confirmação explícita e sucesso de gravação (reinicia com lista vazia, nunca exemplos)
    const successRestore = restoreDefaultsConfirmed();
    assert(successRestore.success === true, '8.3 restoreDefaultsConfirmed conclui com sucesso');
    const storedAfter = JSON.parse(mockStorage.getItem(STORAGE_KEY_COMANDAS)!);
    assert(
      storedAfter.version === STORAGE_VERSION &&
        Array.isArray(storedAfter.comandas) &&
        storedAfter.comandas.length === 0,
      '8.4 Reinicialização grava lista vazia (sem comandas fictícias) após confirmação explícita'
    );
  }

  // TESTE 9: React Strict Mode compatibilidade & ausência de efeitos colaterais em atualizadores
  {
    // Verificar que helpers de domínio são puros e não dependem de re-execuções
    const initialCmd: Comanda = {
      id: 'cmd-pure-test',
      number: 201,
      type: 'individual',
      name: 'Teste Pureza',
      status: 'aberta',
      openedAt: '2026-11-18T15:00:00.000Z',
      items: [],
      payments: [],
      history: [],
    };
    const initialItemsCount = initialCmd.items.length;

    const prod: Product = { id: 'p-test', name: 'Teste Puro', category: 'Bebidas', priceCents: 1000 };

    // Chamar helper duas vezes sobre o mesmo objeto de entrada (como React StrictMode faz em render)
    const run1 = addItemHelper(initialCmd, prod, 1);
    const run2 = addItemHelper(initialCmd, prod, 1);

    assert(initialCmd.items.length === initialItemsCount, '9.1 initialCmd original não foi mutado diretamente');
    assert(run1.comanda!.items.length === initialItemsCount + 1, '9.2 run1 produziu nova comanda imutável');
    assert(run2.comanda!.items.length === initialItemsCount + 1, '9.3 run2 produziu nova comanda imutável');
    assert(run1.comanda!.items.length === run2.comanda!.items.length, '9.4 Comportamento idempotente em StrictMode');
  }

  console.log('\n====================================================');
  console.log(`RESULTADO FINAL: ${passed} PASSOU, ${failed} FALHOU`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
