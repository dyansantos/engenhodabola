import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  STORAGE_KEY_COMANDAS,
  filterRealBackupComandas,
  isDemoComanda,
  loadComandasFromStorage,
  loadRealLocalBackupComandas,
  restoreDefaultsConfirmed,
  saveComandasToStorage,
} from './storage';
import { INITIAL_COMANDAS } from './mock-data';
import { Comanda } from './types';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

function makeRealComanda(overrides: Partial<Comanda> = {}): Comanda {
  return {
    id: 'cmd-1790000000-real1',
    number: 201,
    type: 'individual',
    name: 'Cliente Real',
    status: 'aberta',
    openedAt: '2026-11-18T15:00:00.000Z',
    items: [
      {
        id: 'item-real-1',
        productId: 'prod-1',
        name: 'Cerveja Heineken 600ml',
        category: 'Bebidas',
        priceCents: 1800,
        quantity: 2,
        addedAt: '2026-11-18T15:05:00.000Z',
      },
    ],
    payments: [],
    history: [
      {
        id: 'hist-real-1',
        timestamp: '2026-11-18T15:00:00.000Z',
        operator: 'Operador Real',
        operatorUid: 'uid-op-1',
        type: 'abertura',
        description: 'Comanda aberta para Cliente Real.',
      },
    ],
    ...overrides,
  };
}

describe('Armazenamento local (Etapa 3.0) — Sem semeadura fictícia nem importação de exemplos', () => {
  const prevWindow = (globalThis as Record<string, unknown>).window;
  const prevLocalStorage = (globalThis as Record<string, unknown>).localStorage;
  let memoryStorage: MemoryStorage;

  beforeEach(() => {
    memoryStorage = new MemoryStorage();
    (globalThis as Record<string, unknown>).window = {};
    (globalThis as Record<string, unknown>).localStorage = memoryStorage;
  });

  afterEach(() => {
    if (prevWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      (globalThis as Record<string, unknown>).window = prevWindow;
    }
    if (prevLocalStorage === undefined) {
      delete (globalThis as Record<string, unknown>).localStorage;
    } else {
      (globalThis as Record<string, unknown>).localStorage = prevLocalStorage;
    }
  });

  it('primeira execução limpa retorna lista vazia e NÃO semeia INITIAL_COMANDAS no localStorage', () => {
    const res = loadComandasFromStorage();
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.comandas).toEqual([]);
    }
    expect(memoryStorage.getItem(STORAGE_KEY_COMANDAS)).toBeNull();
    expect(loadRealLocalBackupComandas()).toEqual([]);
  });

  it('identifica todas as comandas antigas de INITIAL_COMANDAS como exemplo e bloqueia sua importação', () => {
    expect(INITIAL_COMANDAS.length).toBeGreaterThan(0);
    for (const demo of INITIAL_COMANDAS) {
      expect(isDemoComanda(demo)).toBe(true);
    }

    // Simula navegador que já tinha INITIAL_COMANDAS gravadas em versão anterior
    saveComandasToStorage(INITIAL_COMANDAS);
    expect(loadRealLocalBackupComandas()).toEqual([]);
  });

  it('mantém backups operacionais reais disponíveis para importação e descarta exemplos misturados', () => {
    const realComanda = makeRealComanda();
    const legacyLocalRealComanda = makeRealComanda({
      id: 'cmd-1789000000-442',
      number: 108,
      name: 'Mesa 09 Real',
      history: [
        {
          id: 'hist-local-1',
          timestamp: '2026-11-18T14:00:00.000Z',
          operator: 'Operador de demonstração',
          type: 'abertura',
          description: 'Comanda aberta em versão local antiga.',
        },
      ],
    });

    expect(isDemoComanda(realComanda)).toBe(false);
    expect(isDemoComanda(legacyLocalRealComanda)).toBe(false);

    const mixed = [...INITIAL_COMANDAS, realComanda, legacyLocalRealComanda];
    expect(filterRealBackupComandas(mixed).map(c => c.id)).toEqual([
      realComanda.id,
      legacyLocalRealComanda.id,
    ]);

    saveComandasToStorage(mixed);
    const loadedBackup = loadRealLocalBackupComandas();
    expect(loadedBackup.map(c => c.id)).toEqual([
      realComanda.id,
      legacyLocalRealComanda.id,
    ]);
  });

  it('restoreDefaultsConfirmed reinicia com lista vazia e nunca grava comandas fictícias', () => {
    saveComandasToStorage([makeRealComanda()]);
    const res = restoreDefaultsConfirmed();
    expect(res.success).toBe(true);
    expect(res.comandas).toEqual([]);
    expect(loadRealLocalBackupComandas()).toEqual([]);
  });
});
