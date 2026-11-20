import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from './firebase';
import { StaffMember, StaffRole } from './types';

const BOOTSTRAP_ADMIN_EMAIL = 'caueoliveira46@gmail.com';

export interface AuthCheckResult {
  authorized: boolean;
  staff?: StaffMember;
  reason?: string;
}

/**
 * Valida autorização do funcionário conectado:
 * 1. O administrador inicial por email verificado (caueoliveira46@gmail.com) tem provisionamento inicial garantido.
 * 2. Qualquer outro funcionário precisa estar previamente cadastrado com `active: true` no Firestore.
 * 3. O próprio usuário não pode se auto-cadastrar nem elevar seu perfil.
 */
export async function checkUserAuthorization(user: User): Promise<AuthCheckResult> {
  const email = (user.email || '').toLowerCase().trim();
  const staffRef = doc(db, 'staff', user.uid);

  try {
    const snap = await getDoc(staffRef);

    // Caso 1: Administrador inicial (bootstrap controlado)
    if (email === BOOTSTRAP_ADMIN_EMAIL) {
      if (!snap.exists()) {
        const adminProfile: StaffMember = {
          uid: user.uid,
          email,
          name: user.displayName || 'Administrador Inicial',
          role: 'admin',
          active: true,
          createdAt: new Date().toISOString(),
          addedBy: 'Sistema (Bootstrap Inicial)',
        };
        await setDoc(staffRef, adminProfile);
        return { authorized: true, staff: adminProfile };
      } else {
        const data = snap.data() as StaffMember;
        return { authorized: true, staff: data };
      }
    }

    // Caso 2: Funcionário com cadastro pelo UID
    if (snap.exists()) {
      const data = snap.data() as StaffMember;
      if (data.active) {
        return { authorized: true, staff: data };
      } else {
        return {
          authorized: false,
          reason: 'Cadastro de funcionário desativado. Solicite a reativação a um Administrador.',
        };
      }
    }

    // Caso 3: Funcionário pré-cadastrado por email por um Administrador
    const q = query(collection(db, 'staff'), where('email', '==', email));
    const querySnap = await getDocs(q);

    if (!querySnap.empty) {
      const existingDoc = querySnap.docs[0];
      const data = existingDoc.data() as StaffMember;

      if (!data.active) {
        return {
          authorized: false,
          reason: 'Seu cadastro de funcionário está inativo. Solicite a ativação a um Administrador.',
        };
      }

      // Se foi pré-cadastrado com um ID temporário, migra para o UID real autenticado
      if (existingDoc.id !== user.uid) {
        const updatedStaff: StaffMember = {
          ...data,
          uid: user.uid,
          name: user.displayName || data.name,
          updatedAt: new Date().toISOString(),
        };
        await setDoc(staffRef, updatedStaff);
        if (existingDoc.id !== user.uid) {
          try {
            await deleteDoc(existingDoc.ref);
          } catch {
            // Ignorar falha na limpeza do doc temporário se as regras restringirem
          }
        }
        return { authorized: true, staff: updatedStaff };
      }

      return { authorized: true, staff: data };
    }

    return {
      authorized: false,
      reason:
        'Sua conta Google conectada não possui cadastro ativo de funcionário no Engenho da Bola. Solicite a um Administrador que cadastre seu e-mail.',
    };
  } catch (error) {
    console.error('[Staff Authorization Error]:', error);
    return {
      authorized: false,
      reason: 'Não foi possível verificar suas credenciais de funcionário com o servidor.',
    };
  }
}

/**
 * Lista todos os funcionários (Apenas Administrador)
 */
export async function listAllStaff(): Promise<StaffMember[]> {
  try {
    const snap = await getDocs(collection(db, 'staff'));
    const list: StaffMember[] = [];
    snap.forEach(d => {
      const data = d.data() as StaffMember;
      if (data && data.email) {
        list.push(data);
      }
    });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'staff');
  }
}

/**
 * Cadastra um novo funcionário (Apenas Administrador)
 */
export async function addStaffMember(
  email: string,
  name: string,
  role: StaffRole,
  adminUser: { uid: string; name: string }
): Promise<{ success: boolean; staff?: StaffMember; error?: string }> {
  const cleanEmail = email.toLowerCase().trim();
  const cleanName = name.trim();

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'E-mail inválido informado.' };
  }
  if (!cleanName) {
    return { success: false, error: 'Nome do funcionário é obrigatório.' };
  }

  try {
    // Usar um ID estável derivado do email para pré-cadastro se ainda não souber o UID
    const docId = `staff_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`;
    const staffDocRef = doc(db, 'staff', docId);

    const newStaff: StaffMember = {
      uid: docId,
      email: cleanEmail,
      name: cleanName,
      role,
      active: true,
      createdAt: new Date().toISOString(),
      addedBy: `${adminUser.name} (${adminUser.uid})`,
    };

    await setDoc(staffDocRef, newStaff);
    return { success: true, staff: newStaff };
  } catch (error) {
    console.error('Erro ao cadastrar funcionário:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao gravar funcionário no banco.',
    };
  }
}

/**
 * Altera status de ativação do funcionário (Apenas Administrador)
 */
export async function toggleStaffActive(
  staffUid: string,
  active: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const ref = doc(db, 'staff', staffUid);
    await updateDoc(ref, {
      active,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao atualizar status do funcionário.',
    };
  }
}

/**
 * Altera cargo/perfil do funcionário (Apenas Administrador)
 */
export async function updateStaffRole(
  staffUid: string,
  role: StaffRole
): Promise<{ success: boolean; error?: string }> {
  try {
    const ref = doc(db, 'staff', staffUid);
    await updateDoc(ref, {
      role,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao atualizar perfil.',
    };
  }
}
