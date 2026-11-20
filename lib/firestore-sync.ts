import {
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, testConnection } from './firebase';
import { Comanda, Product, GroupRental, Appointment, AgendaOperatingHours } from './types';
import { INITIAL_PRODUCTS } from './mock-data';
import { validateComanda } from './storage';
import { sanitizeForFirestore } from './firestore-transactions';
import { nextClientRevFields } from './refunds';

export interface FirestoreSyncMeta {
  fromCache: boolean;
  hasPendingWrites: boolean;
  isOnline: boolean;
}

/**
 * Inscreve-se na coleção de comandas com suporte a tempo real.
 * Chamado SOMENTE após confirmação de autorização ativa de funcionário.
 */
export function subscribeToComandas(
  onData: (comandas: Comanda[], meta: FirestoreSyncMeta) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const colRef = collection(db, 'comandas');

  return onSnapshot(
    colRef,
    snapshot => {
      const list: Comanda[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (validateComanda(data)) {
          list.push(data);
        } else {
          console.warn(`[Firestore] Comanda ignorada por validação estrita: ${docSnap.id}`);
        }
      });

      // Ordenar por número decrescente para consistência de interface
      list.sort((a, b) => b.number - a.number);

      onData(list, {
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        isOnline: !snapshot.metadata.fromCache,
      });
    },
    error => {
      console.error('[Firestore Sync Error - Comandas]:', error);
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  );
}

/**
 * Inscreve-se na coleção de produtos com sincronização em tempo real.
 * Chamado SOMENTE após confirmação de autorização ativa de funcionário.
 */
export function subscribeToProducts(
  onData: (products: Product[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const colRef = collection(db, 'products');

  return onSnapshot(
    colRef,
    snapshot => {
      const list: Product[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as Product;
        if (data && typeof data.id === 'string' && typeof data.name === 'string') {
          list.push(data);
        }
      });

      onData(list);
    },
    error => {
      console.error('[Firestore Sync Error - Products]:', error);
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  );
}

/**
 * Inicialização controlada do catálogo de produtos base (Apenas Administrador)
 * Não insere comandas fictícias no banco operacional!
 */
export async function initializeBaseProductsIfEmpty(): Promise<{ initialized: boolean; count: number }> {
  try {
    const prodSnap = await getDocs(collection(db, 'products'));
    if (!prodSnap.empty) {
      return { initialized: false, count: prodSnap.size };
    }

    const prodBatch = writeBatch(db);
    for (const prod of INITIAL_PRODUCTS) {
      prodBatch.set(doc(db, 'products', prod.id), prod);
    }
    await prodBatch.commit();
    return { initialized: true, count: INITIAL_PRODUCTS.length };
  } catch (error) {
    console.error('[Firestore product init error]:', error);
    throw error instanceof Error
      ? error
      : new Error('Não foi possível inicializar o catálogo base de produtos.');
  }
}

/**
 * Importação controlada de comandas recuperadas localmente (Apenas Administrador mediante confirmação)
 */
export async function adminImportRecoveredComandas(
  comandas: Comanda[],
  adminName: string
): Promise<{ success: boolean; importedCount: number; error?: string }> {
  if (!comandas || comandas.length === 0) {
    return { success: false, importedCount: 0, error: 'Nenhuma comanda válida para importar.' };
  }

  try {
    const batch = writeBatch(db);
    let count = 0;

    for (const cmd of comandas) {
      if (validateComanda(cmd)) {
        const docRef = doc(db, 'comandas', cmd.id);
        const importedCmd: Comanda = {
          ...cmd,
          ...nextClientRevFields(cmd),
          history: [
            ...cmd.history,
            {
              id: `hist-imp-${Date.now()}-${count}`,
              timestamp: new Date().toISOString(),
              operator: adminName,
              type: 'abertura',
              description: `Comanda importada e homologada pelo Administrador ${adminName}`,
            },
          ],
        };
        batch.set(docRef, sanitizeForFirestore(importedCmd));
        count++;
      }
    }

    if (count > 0) {
      await batch.commit();
    }

    return { success: true, importedCount: count };
  } catch (error) {
    console.error('[Admin import error]:', error);
    return {
      success: false,
      importedCount: 0,
      error: error instanceof Error ? error.message : 'Falha na importação administrativa.',
    };
  }
}

/**
 * Validação de integridade de locação em grupo vinda do Firestore.
 */
export function validateGroupRental(data: any): data is GroupRental {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.id !== 'string' || typeof data.number !== 'number') return false;
  if (typeof data.groupName !== 'string' || typeof data.date !== 'string') return false;
  if (typeof data.time !== 'string' || typeof data.space !== 'string') return false;
  if (typeof data.totalAmountCents !== 'number' || !Number.isInteger(data.totalAmountCents)) return false;
  if (!Array.isArray(data.participants) || !Array.isArray(data.payments)) return false;
  if (data.refunds !== undefined && !Array.isArray(data.refunds)) return false;
  return true;
}

/**
 * Inscreve-se na coleção de locações em grupo com sincronização em tempo real.
 */
export function subscribeToGroupRentals(
  onData: (rentals: GroupRental[], meta: FirestoreSyncMeta) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const colRef = collection(db, 'group_rentals');

  return onSnapshot(
    colRef,
    snapshot => {
      const list: GroupRental[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (validateGroupRental(data)) {
          list.push(data);
        } else {
          console.warn(`[Firestore] Locação em grupo ignorada por validação estrita: ${docSnap.id}`);
        }
      });

      list.sort((a, b) => b.number - a.number);

      onData(list, {
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        isOnline: !snapshot.metadata.fromCache,
      });
    },
    error => {
      console.error('[Firestore Sync Error - Group Rentals]:', error);
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  );
}

/**
 * Validação de integridade de agendamento vindo do Firestore.
 */
export function validateAppointment(data: any): data is Appointment {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.id !== 'string' || typeof data.title !== 'string') return false;
  if (typeof data.hostName !== 'string' || typeof data.space !== 'string') return false;
  if (typeof data.date !== 'string' || typeof data.startTime !== 'string' || typeof data.endTime !== 'string') return false;
  if (typeof data.type !== 'string' || typeof data.status !== 'string') return false;
  return true;
}

/**
 * Inscreve-se na coleção de agendamentos com sincronização em tempo real.
 */
export function subscribeToAppointments(
  onData: (appointments: Appointment[], meta: FirestoreSyncMeta) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const colRef = collection(db, 'appointments');

  return onSnapshot(
    colRef,
    snapshot => {
      const list: Appointment[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (validateAppointment(data)) {
          list.push(data);
        } else {
          console.warn(`[Firestore] Agendamento ignorado por validação estrita: ${docSnap.id}`);
        }
      });

      // Ordenar por data crescente e depois horário de início crescente
      list.sort((a, b) => {
        if (a.date !== b.date) {
          return a.date.localeCompare(b.date);
        }
        return a.startTime.localeCompare(b.startTime);
      });

      onData(list, {
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        isOnline: !snapshot.metadata.fromCache,
      });
    },
    error => {
      console.error('[Firestore Sync Error - Appointments]:', error);
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  );
}

/**
 * Inscreve-se nas configurações de horário de funcionamento da agenda em tempo real.
 */
export function subscribeToOperatingHours(
  onData: (hours: AgendaOperatingHours | null) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const docRef = doc(db, 'metadata', 'agenda_config');
  return onSnapshot(
    docRef,
    snap => {
      if (snap.exists()) {
        const data = snap.data() as AgendaOperatingHours;
        onData(data);
      } else {
        onData(null);
      }
    },
    error => {
      console.error('[Firestore Sync Error - Agenda Config]:', error);
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  );
}

export { testConnection };


