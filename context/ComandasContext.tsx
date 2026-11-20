'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  Comanda,
  Product,
  ActiveModule,
  PaymentMethod,
  StaffMember,
  StaffRole,
  GroupRental,
  CourtSpace,
  Appointment,
  SportModality,
  AppointmentType,
  AppointmentStatus,
  RecurringSeries,
  AgendaOperatingHours,
} from '@/lib/types';
import { auth, loginWithGoogle, logoutUser, testConnection } from '@/lib/firebase';
import {
  subscribeToComandas,
  subscribeToProducts,
  subscribeToGroupRentals,
  subscribeToAppointments,
  subscribeToOperatingHours,
  initializeBaseProductsIfEmpty,
  adminImportRecoveredComandas,
  FirestoreSyncMeta,
} from '@/lib/firestore-sync';
import {
  atomicCreateAppointment,
  atomicUpdateAppointment,
  atomicUpdateAppointmentStatus,
  atomicCancelAppointment,
  atomicStartGroupRentalFromAppointment,
  atomicCreateRecurringSeries,
  atomicSaveOperatingHours,
  previewRecurringSeries,
  RecurringOccurrencePreview,
  ConflictDetails,
} from '@/lib/agenda-transactions';
import {
  checkUserAuthorization,
  listAllStaff,
  addStaffMember,
  toggleStaffActive,
  updateStaffRole,
} from '@/lib/staff-service';
import {
  atomicCreateComanda,
  atomicAddItem,
  atomicUpdateItemQuantity,
  atomicTransferItems,
  atomicRegisterPayment,
  atomicCloseComanda,
  checkPaymentOperationStatus,
  atomicCreateGroupRental,
  atomicUpdateParticipantName,
  atomicAdjustGroupDivision,
  atomicLinkBarComanda,
  atomicRegisterGroupPayment,
  atomicCloseGroupRental,
  checkGroupPaymentOperationStatus,
  calculateGroupRentalTotals,
} from '@/lib/firestore-transactions';
import {
  calculateComandaTotals,
  getSaoPauloDateKey,
} from '@/lib/formatters';
import {
  loadComandasFromStorage,
  getRawStorageDataForExport,
  attemptRecoverStorage,
} from '@/lib/storage';

export type AuthStatus = 'loading' | 'unauthenticated' | 'unauthorized' | 'authorized';

interface ComandasContextType {
  comandas: Comanda[];
  products: Product[];
  activeModule: ActiveModule;
  setActiveModule: (m: ActiveModule) => void;
  selectedComandaId: string | null;
  setSelectedComandaId: (id: string | null) => void;
  isNewComandaModalOpen: boolean;
  setIsNewComandaModalOpen: (open: boolean) => void;

  // Estado de autorização e usuário
  authStatus: AuthStatus;
  currentStaff: StaffMember | null;
  currentUser: User | null;
  unauthorizedReason: string | null;
  handleGoogleLogin: () => Promise<{ success: boolean; error?: string }>;
  handleLogout: () => Promise<{ success: boolean; error?: string }>;

  // Gestão de Equipe (Administrador)
  staffList: StaffMember[];
  refreshStaffList: () => Promise<void>;
  addNewStaff: (email: string, name: string, role: StaffRole) => Promise<{ success: boolean; error?: string }>;
  toggleStaff: (staffUid: string, active: boolean) => Promise<{ success: boolean; error?: string }>;
  changeRole: (staffUid: string, role: StaffRole) => Promise<{ success: boolean; error?: string }>;

  // Sincronização e Conectividade
  syncMeta: FirestoreSyncMeta;
  storageError: string | null;
  dismissStorageError: () => void;
  comandasLoaded: boolean;
  groupRentalsLoaded: boolean;
  comandasSyncError: string | null;
  groupRentalsSyncError: string | null;

  // Dados Locais e Recuperação Administrativa
  localBackupCount: number;
  adminImportLocalData: () => Promise<{ success: boolean; count?: number; error?: string }>;
  exportLocalData: () => { filename: string; content: string };

  // Filtros da listagem de comandas
  filterStatus: 'todas' | 'abertas' | 'encerradas';
  setFilterStatus: (s: 'todas' | 'abertas' | 'encerradas') => void;
  filterType: 'todas' | 'individual' | 'mesa';
  setFilterType: (t: 'todas' | 'individual' | 'mesa') => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // Operações transacionais atômicas no servidor
  createComanda: (params: {
    type: 'individual' | 'mesa';
    name: string;
    table?: string;
    responsible?: string;
  }) => Promise<{ success: boolean; comanda?: Comanda; error?: string }>;
  addItem: (
    comandaId: string,
    product: Product,
    quantity: number,
    notes?: string
  ) => Promise<{ success: boolean; error?: string }>;
  updateItemQuantity: (
    comandaId: string,
    itemId: string,
    quantity: number,
    reason: string
  ) => Promise<{ success: boolean; error?: string }>;
  removeItem: (
    comandaId: string,
    itemId: string,
    reason: string
  ) => Promise<{ success: boolean; error?: string }>;
  transferItems: (
    sourceId: string,
    targetId: string,
    transfers: { itemId: string; quantity: number }[]
  ) => Promise<{ success: boolean; error?: string }>;
  registerPayment: (
    comandaId: string,
    params: {
      method: PaymentMethod;
      amountCents: number;
      tenderedCents?: number;
      clientNonce?: string;
    }
  ) => Promise<{ success: boolean; changeCents?: number; alreadyProcessed?: boolean; error?: string }>;
  verifyPaymentStatus: (
    comandaId: string,
    operationId: string
  ) => Promise<{ processed: boolean; error?: string }>;
  closeComanda: (comandaId: string) => Promise<{ success: boolean; error?: string }>;

  // Locações em Grupo (Fechamento por Participantes)
  groupRentals: GroupRental[];
  selectedGroupRentalId: string | null;
  setSelectedGroupRentalId: (id: string | null) => void;
  isNewGroupRentalModalOpen: boolean;
  setIsNewGroupRentalModalOpen: (open: boolean) => void;

  createGroupRental: (params: {
    groupName: string;
    date: string;
    time: string;
    space: CourtSpace;
    totalAmountCents: number;
    participantsCount: number;
  }) => Promise<{ success: boolean; rental?: GroupRental; error?: string }>;
  updateParticipantName: (
    rentalId: string,
    participantId: string,
    newName: string
  ) => Promise<{ success: boolean; error?: string }>;
  adjustGroupDivision: (
    rentalId: string,
    newDueAmounts: { participantId: string; dueAmountCents: number }[]
  ) => Promise<{ success: boolean; error?: string }>;
  linkBarComanda: (
    rentalId: string,
    participantId: string,
    comandaId?: string | null
  ) => Promise<{ success: boolean; error?: string }>;
  registerGroupPayment: (
    rentalId: string,
    params: {
      clientNonce: string;
      method: PaymentMethod;
      tenderedCents?: number;
      payerName?: string;
      allocations: { participantId: string; amountCents: number }[];
      linkedBarPayment?: {
        participantId: string;
        comandaId: string;
        amountCents: number;
      };
    }
  ) => Promise<{ success: boolean; changeCents?: number; alreadyProcessed?: boolean; error?: string }>;
  closeGroupRental: (rentalId: string) => Promise<{ success: boolean; error?: string }>;
  verifyGroupPaymentStatus: (
    rentalId: string,
    operationId: string
  ) => Promise<{ processed: boolean; error?: string }>;

  groupRentalMetrics: {
    openCount: number;
    closedCount: number;
    pendingBalanceCents: number;
    todayReceiptsCents: number;
  };

  // Agenda Operacional
  appointments: Appointment[];
  selectedAppointmentId: string | null;
  setSelectedAppointmentId: (id: string | null) => void;
  isNewAppointmentModalOpen: boolean;
  setIsNewAppointmentModalOpen: (open: boolean) => void;
  agendaSelectedDate: string;
  setAgendaSelectedDate: (date: string) => void;
  agendaSelectedSpace: CourtSpace | 'todos';
  setAgendaSelectedSpace: (space: CourtSpace | 'todos') => void;
  agendaFilterModality: SportModality | 'todas';
  setAgendaFilterModality: (mod: SportModality | 'todas') => void;
  agendaFilterType: AppointmentType | 'todos';
  setAgendaFilterType: (type: AppointmentType | 'todos') => void;

  // Horários de Funcionamento Configuráveis
  operatingHours: AgendaOperatingHours | null;
  saveOperatingHours: (openTime: string, closeTime: string, slotIntervalMinutes?: number) => Promise<{ success: boolean; error?: string }>;
  isOperatingHoursModalOpen: boolean;
  setIsOperatingHoursModalOpen: (open: boolean) => void;

  // Pré-seleção de Espaço/Horário ao Clicar na Grade Livre
  newAppointmentInitialSlot: { space?: CourtSpace; date?: string; startTime?: string; endTime?: string } | null;
  openNewAppointmentWithSlot: (slot?: { space?: CourtSpace; date?: string; startTime?: string; endTime?: string }) => void;

  // Edição de Agendamento
  isEditAppointmentModalOpen: boolean;
  setIsEditAppointmentModalOpen: (open: boolean) => void;
  appointmentToEdit: Appointment | null;
  openEditAppointmentModal: (appointment: Appointment) => void;

  createAppointment: (params: {
    title: string;
    hostName: string;
    hostPhone?: string;
    space: CourtSpace;
    spaces?: CourtSpace[];
    modality: SportModality;
    date: string;
    startTime: string;
    endTime: string;
    type: AppointmentType;
    priceCents?: number;
    monthlyPriceCents?: number;
    notes?: string;
  }) => Promise<{ success: boolean; appointment?: Appointment; error?: string }>;
  updateAppointment: (params: {
    appointmentId: string;
    title: string;
    hostName: string;
    hostPhone?: string;
    space: CourtSpace;
    spaces?: CourtSpace[];
    modality: SportModality;
    date: string;
    startTime: string;
    endTime: string;
    priceCents?: number;
    notes?: string;
    scope?: 'only_this' | 'this_and_following';
  }) => Promise<{ success: boolean; appointment?: Appointment; updatedCount?: number; error?: string }>;
  updateAppointmentStatus: (
    appointmentId: string,
    status: AppointmentStatus
  ) => Promise<{ success: boolean; error?: string }>;
  cancelAppointment: (params: {
    appointmentId: string;
    reason: string;
    scope?: 'only_this' | 'this_and_following';
  }) => Promise<{ success: boolean; cancelledCount?: number; error?: string }>;
  startGroupRentalFromAppointment: (
    appointmentId: string,
    participantsCount: number
  ) => Promise<{
    success: boolean;
    rental?: GroupRental;
    alreadyExisted?: boolean;
    error?: string;
  }>;
  createRecurringSeries: (params: {
    hostName: string;
    hostPhone?: string;
    space: CourtSpace;
    modality: SportModality;
    type: 'mensalista' | 'aula';
    daysOfWeek: number[];
    startTime: string;
    endTime: string;
    startDate: string;
    endDate: string;
    monthlyPriceCents?: number;
    notes?: string;
  }) => Promise<{ success: boolean; seriesId?: string; occurrencesCreated?: number; error?: string }>;
  getRecurringPreview: (params: {
    space: CourtSpace;
    daysOfWeek: number[];
    startTime: string;
    endTime: string;
    startDate: string;
    endDate: string;
  }) => {
    occurrences: RecurringOccurrencePreview[];
    conflicts: ConflictDetails[];
    canConfirm: boolean;
    limitExceeded?: boolean;
    limitError?: string;
  };

  // Indicadores operacionais calculados
  metrics: {
    openCount: number;
    closedCount: number;
    pendingBalanceCents: number;
    pendingBalance: number;
    todayReceiptsCents: number;
    todayReceipts: number;
    todayReceiptsByMethodCents: {
      dinheiro: number;
      pix: number;
      debito: number;
      credito: number;
    };
    todayReceiptsByMethod: {
      dinheiro: number;
      pix: number;
      debito: number;
      credito: number;
    };
  };
}

const ComandasContext = createContext<ComandasContextType | undefined>(undefined);

export function ComandasProvider({ children }: { children: ReactNode }) {
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [groupRentals, setGroupRentals] = useState<GroupRental[]>([]);

  // Autenticação e autorização
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentStaff, setCurrentStaff] = useState<StaffMember | null>(null);
  const [unauthorizedReason, setUnauthorizedReason] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);

  // Conectividade e sincronização
  const [syncMeta, setSyncMeta] = useState<FirestoreSyncMeta>({
    fromCache: false,
    hasPendingWrites: false,
    isOnline: true,
  });
  const [storageError, setStorageError] = useState<string | null>(null);
  const [comandasLoaded, setComandasLoaded] = useState(false);
  const [groupRentalsLoaded, setGroupRentalsLoaded] = useState(false);
  const [comandasSyncError, setComandasSyncError] = useState<string | null>(null);
  const [groupRentalsSyncError, setGroupRentalsSyncError] = useState<string | null>(null);

  // Módulo ativo e filtros
  const [activeModule, setActiveModule] = useState<ActiveModule>('inicio');
  const [selectedComandaId, setSelectedComandaId] = useState<string | null>(null);
  const [isNewComandaModalOpen, setIsNewComandaModalOpen] = useState(false);
  const [selectedGroupRentalId, setSelectedGroupRentalId] = useState<string | null>(null);
  const [isNewGroupRentalModalOpen, setIsNewGroupRentalModalOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'todas' | 'abertas' | 'encerradas'>('abertas');
  const [filterType, setFilterType] = useState<'todas' | 'individual' | 'mesa'>('todas');
  const [searchQuery, setSearchQuery] = useState('');

  // Agenda Operacional
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [isNewAppointmentModalOpen, setIsNewAppointmentModalOpen] = useState(false);
  const [agendaSelectedDate, setAgendaSelectedDate] = useState<string>(() => getSaoPauloDateKey());
  const [agendaSelectedSpace, setAgendaSelectedSpace] = useState<CourtSpace | 'todos'>('todos');
  const [agendaFilterModality, setAgendaFilterModality] = useState<SportModality | 'todas'>('todas');
  const [agendaFilterType, setAgendaFilterType] = useState<AppointmentType | 'todos'>('todos');
  const [operatingHours, setOperatingHours] = useState<AgendaOperatingHours | null>(null);
  const [isOperatingHoursModalOpen, setIsOperatingHoursModalOpen] = useState(false);
  const [newAppointmentInitialSlot, setNewAppointmentInitialSlot] = useState<{
    space?: CourtSpace;
    date?: string;
    startTime?: string;
    endTime?: string;
  } | null>(null);
  const [isEditAppointmentModalOpen, setIsEditAppointmentModalOpen] = useState(false);
  const [appointmentToEdit, setAppointmentToEdit] = useState<Appointment | null>(null);

  // Rastreamento da data de hoje no fuso America/Sao_Paulo
  const [currentSaoPauloDay, setCurrentSaoPauloDay] = useState<string>(() => getSaoPauloDateKey());

  // Rastreamento de backup local remanescente
  const [localBackupCount, setLocalBackupCount] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const local = loadComandasFromStorage();
      return local.status === 'ok' ? local.comandas.length : 0;
    } catch {
      return 0;
    }
  });

  // Monitorar data de São Paulo a cada 15 segundos
  useEffect(() => {
    const timer = setInterval(() => {
      const spDay = getSaoPauloDateKey();
      if (spDay !== currentSaoPauloDay) {
        setCurrentSaoPauloDay(spDay);
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [currentSaoPauloDay]);

  // Monitorar Autenticação Firebase e Validar Cadastro Ativo no Firestore
  useEffect(() => {
    let unsubComandasListener: (() => void) | null = null;
    let unsubProductsListener: (() => void) | null = null;
    let unsubGroupRentalsListener: (() => void) | null = null;
    let unsubAppointmentsListener: (() => void) | null = null;
    let unsubOperatingHoursListener: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user: User | null) => {
      setCurrentUser(user);

      // Limpar escutas e remover dados da tela se desconectado
      if (unsubComandasListener) {
        unsubComandasListener();
        unsubComandasListener = null;
      }
      if (unsubProductsListener) {
        unsubProductsListener();
        unsubProductsListener = null;
      }
      if (unsubGroupRentalsListener) {
        unsubGroupRentalsListener();
        unsubGroupRentalsListener = null;
      }
      if (unsubAppointmentsListener) {
        unsubAppointmentsListener();
        unsubAppointmentsListener = null;
      }
      if (unsubOperatingHoursListener) {
        unsubOperatingHoursListener();
        unsubOperatingHoursListener = null;
      }

      if (!user) {
        setAuthStatus('unauthenticated');
        setCurrentStaff(null);
        setUnauthorizedReason(null);
        setComandas([]);
        setProducts([]);
        setGroupRentals([]);
        setAppointments([]);
        setStaffList([]);
        setComandasLoaded(false);
        setGroupRentalsLoaded(false);
        setComandasSyncError(null);
        setGroupRentalsSyncError(null);
        return;
      }

      setAuthStatus('loading');

      try {
        // Verificar autorização no Firestore
        const authRes = await checkUserAuthorization(user);

        if (!authRes.authorized || !authRes.staff) {
          // Usuário autenticado com Google, mas SEM autorização de funcionário ativo
          setAuthStatus('unauthorized');
          setCurrentStaff(null);
          setUnauthorizedReason(
            authRes.reason ||
              'Sua conta não possui permissão ativa para acessar os dados operacionais.'
          );
          // Garantir que nenhum dado residual permaneça na tela
          setComandas([]);
          setProducts([]);
          setGroupRentals([]);
          setAppointments([]);
          setStaffList([]);
          setComandasLoaded(false);
          setGroupRentalsLoaded(false);
          setComandasSyncError(null);
          setGroupRentalsSyncError(null);
          return;
        }

        // Funcionário autorizado com perfil confirmado
        setAuthStatus('authorized');
        setCurrentStaff(authRes.staff);
        setUnauthorizedReason(null);

        // Se for administrador e produtos estiverem vazios, inicializa cardápio base
        if (authRes.staff.role === 'admin') {
          initializeBaseProductsIfEmpty().catch(() => {});
          listAllStaff()
            .then(setStaffList)
            .catch(() => {});
        }

        // Iniciar consultas SOMENTE após autorização confirmada
        unsubComandasListener = subscribeToComandas(
          (remoteComandas, meta) => {
            setComandas(remoteComandas);
            setSyncMeta(meta);
            setComandasLoaded(true);
            setComandasSyncError(null);
          },
          err => {
            console.error('[Comandas Listener Error]:', err);
            const msg = `Erro na sincronização de comandas: ${err.message}`;
            setComandasSyncError(msg);
            setStorageError(msg);
          }
        );

        unsubProductsListener = subscribeToProducts(
          remoteProducts => {
            setProducts(remoteProducts);
          },
          err => {
            console.error('[Products Listener Error]:', err);
          }
        );

        unsubGroupRentalsListener = subscribeToGroupRentals(
          remoteRentals => {
            setGroupRentals(remoteRentals);
            setGroupRentalsLoaded(true);
            setGroupRentalsSyncError(null);
          },
          err => {
            console.error('[Group Rentals Listener Error]:', err);
            const msg = `Erro na sincronização de locações: ${err.message}`;
            setGroupRentalsSyncError(msg);
            setStorageError(msg);
          }
        );

        unsubAppointmentsListener = subscribeToAppointments(
          remoteAppointments => {
            setAppointments(remoteAppointments);
          },
          err => {
            console.error('[Appointments Listener Error]:', err);
            setStorageError(`Erro na sincronização da agenda: ${err.message}`);
          }
        );

        unsubOperatingHoursListener = subscribeToOperatingHours(
          hours => {
            setOperatingHours(hours);
          },
          err => {
            console.error('[OperatingHours Listener Error]:', err);
          }
        );
      } catch (err) {
        console.error('[Auth Check Exception]:', err);
        setAuthStatus('unauthorized');
        setUnauthorizedReason('Falha ao validar cadastro de funcionário com o servidor.');
        setComandas([]);
        setProducts([]);
        setGroupRentals([]);
        setAppointments([]);
        setOperatingHours(null);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubComandasListener) unsubComandasListener();
      if (unsubProductsListener) unsubProductsListener();
      if (unsubGroupRentalsListener) unsubGroupRentalsListener();
      if (unsubAppointmentsListener) unsubAppointmentsListener();
      if (unsubOperatingHoursListener) unsubOperatingHoursListener();
    };
  }, []);

  const refreshStaffList = async () => {
    if (currentStaff?.role !== 'admin') return;
    try {
      const list = await listAllStaff();
      setStaffList(list);
    } catch (err) {
      console.error('Erro ao listar equipe:', err);
    }
  };

  const addNewStaff = async (email: string, name: string, role: StaffRole) => {
    if (currentStaff?.role !== 'admin') {
      return { success: false, error: 'Apenas Administradores podem cadastrar funcionários.' };
    }
    const res = await addStaffMember(email, name, role, {
      uid: currentStaff.uid,
      name: currentStaff.name,
    });
    if (res.success) {
      await refreshStaffList();
    }
    return res;
  };

  const toggleStaff = async (staffUid: string, active: boolean) => {
    if (currentStaff?.role !== 'admin') {
      return { success: false, error: 'Apenas Administradores podem alterar status de funcionários.' };
    }
    const res = await toggleStaffActive(staffUid, active);
    if (res.success) {
      await refreshStaffList();
    }
    return res;
  };

  const changeRole = async (staffUid: string, role: StaffRole) => {
    if (currentStaff?.role !== 'admin') {
      return { success: false, error: 'Apenas Administradores podem alterar perfis de acesso.' };
    }
    const res = await updateStaffRole(staffUid, role);
    if (res.success) {
      await refreshStaffList();
    }
    return res;
  };

  const dismissStorageError = () => {
    setStorageError(null);
  };

  const handleGoogleLogin = async () => {
    const res = await loginWithGoogle();
    if (!res.success && res.error) {
      setStorageError(`Falha ao conectar com conta Google: ${res.error}`);
    }
    return res;
  };

  const handleLogout = async () => {
    const res = await logoutUser();
    setComandas([]);
    setProducts([]);
    setCurrentStaff(null);
    setAuthStatus('unauthenticated');
    return res;
  };

  // Importação administrativa de dados locais recuperados
  const adminImportLocalData = async () => {
    if (currentStaff?.role !== 'admin') {
      return { success: false, error: 'Apenas Administradores podem homologar e importar dados.' };
    }
    const local = loadComandasFromStorage();
    if (local.status !== 'ok' || local.comandas.length === 0) {
      return { success: false, error: 'Nenhum dado local válido encontrado para importação.' };
    }

    const res = await adminImportRecoveredComandas(local.comandas, currentStaff.name);
    if (res.success) {
      setLocalBackupCount(0);
    }
    return { success: res.success, count: res.importedCount, error: res.error };
  };

  const exportLocalData = () => {
    return getRawStorageDataForExport();
  };

  // Helper de validação de operador
  const requireActiveOperator = (): { uid: string; name: string } => {
    if (!currentStaff || !currentStaff.active) {
      throw new Error('Acesso negado: funcionário não autorizado ou inativo.');
    }
    return { uid: currentStaff.uid, name: currentStaff.name };
  };

  /**
   * Operação Transacional: Criação de Comanda
   */
  const createComanda = async (params: {
    type: 'individual' | 'mesa';
    name: string;
    table?: string;
    responsible?: string;
  }): Promise<{ success: boolean; comanda?: Comanda; error?: string }> => {
    try {
      const op = requireActiveOperator();
      const newId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const created = await atomicCreateComanda({
        id: newId,
        type: params.type,
        name: params.name,
        table: params.table,
        responsible: params.responsible,
        operatorUid: op.uid,
        operatorName: op.name,
      });

      return { success: true, comanda: created };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao abrir comanda no servidor.';
      setStorageError(message);
      return { success: false, error: message };
    }
  };

  /**
   * Operação Transacional: Inclusão de Item
   */
  const addItem = async (
    comandaId: string,
    product: Product,
    quantity: number,
    notes?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const op = requireActiveOperator();
      await atomicAddItem({
        comandaId,
        product,
        quantity,
        notes,
        operatorUid: op.uid,
        operatorName: op.name,
      });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao lançar item no servidor.';
      setStorageError(message);
      return { success: false, error: message };
    }
  };

  /**
   * Operação Transacional: Ajuste de Quantidade de Item
   */
  const updateItemQuantity = async (
    comandaId: string,
    itemId: string,
    quantity: number,
    reason: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const op = requireActiveOperator();
      await atomicUpdateItemQuantity({
        comandaId,
        itemId,
        quantity,
        reason,
        operatorUid: op.uid,
        operatorName: op.name,
      });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao ajustar quantidade no servidor.';
      setStorageError(message);
      return { success: false, error: message };
    }
  };

  const removeItem = async (comandaId: string, itemId: string, reason: string) => {
    return updateItemQuantity(comandaId, itemId, 0, reason);
  };

  /**
   * Operação Transacional: Transferência Atômica entre Comandas
   */
  const transferItems = async (
    sourceId: string,
    targetId: string,
    transfers: { itemId: string; quantity: number }[]
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const op = requireActiveOperator();
      await atomicTransferItems({
        sourceId,
        targetId,
        transfers,
        operatorUid: op.uid,
        operatorName: op.name,
      });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao transferir itens no servidor.';
      setStorageError(message);
      return { success: false, error: message };
    }
  };

  /**
   * Operação Transacional: Pagamento com Idempotência e Conexão Obrigatória
   */
  const registerPayment = async (
    comandaId: string,
    params: {
      method: PaymentMethod;
      amountCents: number;
      tenderedCents?: number;
      clientNonce?: string;
    }
  ): Promise<{
    success: boolean;
    changeCents?: number;
    alreadyProcessed?: boolean;
    error?: string;
  }> => {
    const opId =
      params.clientNonce ||
      `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    try {
      const op = requireActiveOperator();
      const res = await atomicRegisterPayment({
        comandaId,
        method: params.method,
        amountCents: params.amountCents,
        tenderedCents: params.tenderedCents,
        operationId: opId,
        operatorUid: op.uid,
        operatorName: op.name,
      });

      return {
        success: true,
        changeCents: res.changeCents,
        alreadyProcessed: res.alreadyProcessed,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao registrar pagamento no servidor.';

      // Se a falha for de conectividade, orientar verificação de status do identificador
      setStorageError(message);
      return { success: false, error: message };
    }
  };

  /**
   * Verificação de Status de Pagamento Incerto
   */
  const verifyPaymentStatus = async (
    comandaId: string,
    operationId: string
  ): Promise<{ processed: boolean; error?: string }> => {
    try {
      const status = await checkPaymentOperationStatus(comandaId, operationId);
      return { processed: status.processed };
    } catch (err) {
      return {
        processed: false,
        error: err instanceof Error ? err.message : 'Não foi possível consultar o servidor.',
      };
    }
  };

  /**
   * Operação Transacional: Encerramento com Validação Estrita de Saldo
   */
  const closeComanda = async (
    comandaId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const op = requireActiveOperator();
      await atomicCloseComanda({
        comandaId,
        operatorUid: op.uid,
        operatorName: op.name,
      });
      return { success: true };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao encerrar comanda no servidor.';
      setStorageError(message);
      return { success: false, error: message };
    }
  };

  /**
   * Operação Transacional: Criação de Locação em Grupo
   */
  const createGroupRental = async (params: {
    groupName: string;
    date: string;
    time: string;
    space: CourtSpace;
    totalAmountCents: number;
    participantsCount: number;
  }): Promise<{ success: boolean; rental?: GroupRental; error?: string }> => {
    try {
      const op = requireActiveOperator();
      const id = `gr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const rental = await atomicCreateGroupRental({
        id,
        groupName: params.groupName,
        date: params.date,
        time: params.time,
        space: params.space,
        totalAmountCents: params.totalAmountCents,
        participantsCount: params.participantsCount,
        operatorUid: op.uid,
        operatorName: op.name,
      });
      return { success: true, rental };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao criar locação em grupo.';
      setStorageError(message);
      return { success: false, error: message };
    }
  };

  /**
   * Operação Transacional: Edição Rápida de Nome de Participante
   */
  const updateParticipantName = async (
    rentalId: string,
    participantId: string,
    newName: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const op = requireActiveOperator();
      await atomicUpdateParticipantName({
        rentalId,
        participantId,
        newName,
        operatorUid: op.uid,
        operatorName: op.name,
      });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao atualizar nome do participante.';
      setStorageError(message);
      return { success: false, error: message };
    }
  };

  /**
   * Operação Transacional: Ajuste de Divisão das Partes
   */
  const adjustGroupDivision = async (
    rentalId: string,
    newDueAmounts: { participantId: string; dueAmountCents: number }[]
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const op = requireActiveOperator();
      await atomicAdjustGroupDivision({
        rentalId,
        newDueAmounts,
        operatorUid: op.uid,
        operatorName: op.name,
      });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao ajustar divisão da locação.';
      setStorageError(message);
      return { success: false, error: message };
    }
  };

  /**
   * Operação Transacional: Vincular Comanda Individual de Bar a Participante
   */
  const linkBarComanda = async (
    rentalId: string,
    participantId: string,
    comandaId?: string | null
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const op = requireActiveOperator();
      await atomicLinkBarComanda({
        rentalId,
        participantId,
        comandaId,
        operatorUid: op.uid,
        operatorName: op.name,
      });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao vincular comanda do bar.';
      setStorageError(message);
      return { success: false, error: message };
    }
  };

  /**
   * Operação Transacional: Recebimento de Locação em Grupo (Individual, Multi-participante ou com Bar)
   */
  const registerGroupPayment = async (
    rentalId: string,
    params: {
      clientNonce: string;
      method: PaymentMethod;
      tenderedCents?: number;
      payerName?: string;
      allocations: { participantId: string; amountCents: number }[];
      linkedBarPayment?: {
        participantId: string;
        comandaId: string;
        amountCents: number;
      };
    }
  ): Promise<{
    success: boolean;
    changeCents?: number;
    alreadyProcessed?: boolean;
    error?: string;
  }> => {
    try {
      const op = requireActiveOperator();
      const res = await atomicRegisterGroupPayment({
        rentalId,
        clientNonce: params.clientNonce,
        method: params.method,
        tenderedCents: params.tenderedCents,
        payerName: params.payerName,
        operatorUid: op.uid,
        operatorName: op.name,
        allocations: params.allocations,
        linkedBarPayment: params.linkedBarPayment,
      });
      return {
        success: true,
        changeCents: res.changeCents,
        alreadyProcessed: res.alreadyProcessed,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao registrar recebimento da locação.';
      setStorageError(message);
      return { success: false, error: message };
    }
  };

  /**
   * Operação Transacional: Encerramento de Locação em Grupo (Exige Saldo 0)
   */
  const closeGroupRental = async (
    rentalId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const op = requireActiveOperator();
      await atomicCloseGroupRental({
        rentalId,
        operatorUid: op.uid,
        operatorName: op.name,
      });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao encerrar locação.';
      setStorageError(message);
      return { success: false, error: message };
    }
  };

  /**
   * Consulta de Status de Pagamento de Locação
   */
  const verifyGroupPaymentStatus = async (
    rentalId: string,
    operationId: string
  ): Promise<{ processed: boolean; error?: string }> => {
    try {
      const res = await checkGroupPaymentOperationStatus(rentalId, operationId);
      return { processed: res.processed };
    } catch (err) {
      return { processed: false, error: err instanceof Error ? err.message : 'Falha ao consultar servidor.' };
    }
  };

  /**
   * Operação Transacional: Criar Reserva na Agenda
   */
  const createAppointment = async (params: {
    title: string;
    hostName: string;
    hostPhone?: string;
    space: CourtSpace;
    spaces?: CourtSpace[];
    modality: SportModality;
    date: string;
    startTime: string;
    endTime: string;
    type: AppointmentType;
    priceCents?: number;
    monthlyPriceCents?: number;
    notes?: string;
  }): Promise<{ success: boolean; appointment?: Appointment; error?: string }> => {
    try {
      const op = requireActiveOperator();
      const res = await atomicCreateAppointment({
        ...params,
        operatorUid: op.uid,
        operatorName: op.name,
      });
      if (!res.success && res.error) {
        setStorageError(res.error);
      }
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao registrar reserva.';
      setStorageError(message);
      return { success: false, error: message };
    }
  };

  /**
   * Operação Transacional: Atualizar Reserva
   */
  const updateAppointment = async (params: {
    appointmentId: string;
    title: string;
    hostName: string;
    hostPhone?: string;
    space: CourtSpace;
    spaces?: CourtSpace[];
    modality: SportModality;
    date: string;
    startTime: string;
    endTime: string;
    priceCents?: number;
    notes?: string;
    scope?: 'only_this' | 'this_and_following';
  }): Promise<{ success: boolean; appointment?: Appointment; updatedCount?: number; error?: string }> => {
    try {
      const op = requireActiveOperator();
      const res = await atomicUpdateAppointment({
        ...params,
        operatorUid: op.uid,
        operatorName: op.name,
      });
      if (!res.success && res.error) {
        setStorageError(res.error);
      }
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao atualizar reserva.';
      setStorageError(message);
      return { success: false, error: message };
    }
  };

  /**
   * Operação Transacional: Atualizar Status da Reserva (Concluída, Em Andamento)
   */
  const updateAppointmentStatus = async (
    appointmentId: string,
    status: AppointmentStatus
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const op = requireActiveOperator();
      const res = await atomicUpdateAppointmentStatus({
        appointmentId,
        status,
        operatorUid: op.uid,
        operatorName: op.name,
      });
      if (!res.success && res.error) {
        setStorageError(res.error);
      }
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao alterar situação da reserva.';
      setStorageError(message);
      return { success: false, error: message };
    }
  };

  /**
   * Operação Transacional: Cancelamento de Reserva (Ocorrência única ou em lote)
   */
  const cancelAppointment = async (params: {
    appointmentId: string;
    reason: string;
    scope?: 'only_this' | 'this_and_following';
  }): Promise<{ success: boolean; cancelledCount?: number; error?: string }> => {
    try {
      const op = requireActiveOperator();
      const res = await atomicCancelAppointment({
        ...params,
        operatorUid: op.uid,
        operatorName: op.name,
      });
      if (!res.success && res.error) {
        setStorageError(res.error);
      }
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao cancelar reserva.';
      setStorageError(message);
      return { success: false, error: message };
    }
  };

  /**
   * CONEXÃO COM FECHAMENTO POR GRUPO: Iniciar Atendimento
   */
  const startGroupRentalFromAppointment = async (
    appointmentId: string,
    participantsCount: number
  ): Promise<{
    success: boolean;
    rental?: GroupRental;
    alreadyExisted?: boolean;
    error?: string;
  }> => {
    try {
      const op = requireActiveOperator();
      const res = await atomicStartGroupRentalFromAppointment({
        appointmentId,
        participantsCount,
        operatorUid: op.uid,
        operatorName: op.name,
      });
      if (!res.success && res.error) {
        setStorageError(res.error);
      }
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao iniciar atendimento.';
      setStorageError(message);
      return { success: false, error: message };
    }
  };

  /**
   * Operação Transacional: Criar Série Recorrente Fixa Semanal
   */
  const createRecurringSeries = async (params: {
    hostName: string;
    hostPhone?: string;
    space: CourtSpace;
    modality: SportModality;
    type: 'mensalista' | 'aula';
    daysOfWeek: number[];
    startTime: string;
    endTime: string;
    startDate: string;
    endDate: string;
    monthlyPriceCents?: number;
    notes?: string;
  }): Promise<{ success: boolean; seriesId?: string; occurrencesCreated?: number; error?: string }> => {
    try {
      const op = requireActiveOperator();
      const res = await atomicCreateRecurringSeries({
        ...params,
        operatorUid: op.uid,
        operatorName: op.name,
      });
      if (!res.success && res.error) {
        setStorageError(res.error);
      }
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao criar série recorrente.';
      setStorageError(message);
      return { success: false, error: message };
    }
  };

  /**
   * Prévia de Conflitos para Recorrência
   */
  const getRecurringPreview = (params: {
    space: CourtSpace;
    daysOfWeek: number[];
    startTime: string;
    endTime: string;
    startDate: string;
    endDate: string;
  }) => {
    return previewRecurringSeries({
      ...params,
      existingAppointments: appointments,
    });
  };

  /**
   * Salva configurações de horário de funcionamento da agenda
   */
  const saveOperatingHours = async (openTime: string, closeTime: string, slotIntervalMinutes?: number) => {
    try {
      const op = requireActiveOperator();
      const res = await atomicSaveOperatingHours({
        openTime,
        closeTime,
        slotIntervalMinutes,
        operatorUid: op.uid,
        operatorName: op.name,
      });
      if (!res.success && res.error) {
        setStorageError(res.error);
      }
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao salvar horários de funcionamento.';
      setStorageError(message);
      return { success: false, error: message };
    }
  };

  /**
   * Abre o modal de nova reserva com slot (espaço e horário) pré-preenchido
   */
  const openNewAppointmentWithSlot = (slot?: { space?: CourtSpace; date?: string; startTime?: string; endTime?: string }) => {
    setNewAppointmentInitialSlot(slot || null);
    setIsNewAppointmentModalOpen(true);
  };

  /**
   * Abre o modal de edição de agendamento existente
   */
  const openEditAppointmentModal = (apt: Appointment) => {
    setAppointmentToEdit(apt);
    setIsEditAppointmentModalOpen(true);
  };

  // Métricas específicas de locação em grupo
  const groupRentalMetrics = useMemo(() => {
    let openCount = 0;
    let closedCount = 0;
    let pendingBalanceCents = 0;
    let todayReceiptsCents = 0;

    for (const r of groupRentals) {
      const { pendingBalanceCents: bal } = calculateGroupRentalTotals(r);
      if (r.status === 'aberta') {
        openCount++;
        pendingBalanceCents += bal;
      } else {
        closedCount++;
      }
      for (const p of r.payments || []) {
        if (getSaoPauloDateKey(p.timestamp) === currentSaoPauloDay) {
          todayReceiptsCents += p.amountCents;
        }
      }
    }

    return {
      openCount,
      closedCount,
      pendingBalanceCents,
      todayReceiptsCents,
    };
  }, [groupRentals, currentSaoPauloDay]);

  // Indicadores operacionais calculados no fuso America/Sao_Paulo
  const metrics = useMemo(() => {
    let openCount = 0;
    let closedCount = 0;
    let pendingBalanceCents = 0;
    let todayReceiptsCents = 0;
    const todayReceiptsByMethodCents = {
      dinheiro: 0,
      pix: 0,
      debito: 0,
      credito: 0,
    };

    // 1. Recebimentos e saldo de Comandas
    for (const cmd of comandas) {
      const { balanceCents } = calculateComandaTotals(cmd);

      if (cmd.status === 'aberta') {
        openCount++;
        pendingBalanceCents += balanceCents;
      } else {
        closedCount++;
      }

      for (const p of cmd.payments) {
        const payCents =
          typeof p.amountCents === 'number'
            ? p.amountCents
            : typeof p.amount === 'number'
            ? Math.round(p.amount * 100)
            : 0;

        if (getSaoPauloDateKey(p.timestamp) === currentSaoPauloDay) {
          todayReceiptsCents += payCents;
          if (p.method in todayReceiptsByMethodCents) {
            todayReceiptsByMethodCents[p.method] += payCents;
          }
        }
      }
    }

    // 2. Recebimentos consolidados de Locações em Grupo
    for (const r of groupRentals) {
      for (const p of r.payments || []) {
        if (getSaoPauloDateKey(p.timestamp) === currentSaoPauloDay) {
          todayReceiptsCents += p.amountCents;
          if (p.method in todayReceiptsByMethodCents) {
            todayReceiptsByMethodCents[p.method] += p.amountCents;
          }
        }
      }
    }

    return {
      openCount,
      closedCount,
      pendingBalanceCents,
      pendingBalance: pendingBalanceCents / 100,
      todayReceiptsCents,
      todayReceipts: todayReceiptsCents / 100,
      todayReceiptsByMethodCents,
      todayReceiptsByMethod: {
        dinheiro: todayReceiptsByMethodCents.dinheiro / 100,
        pix: todayReceiptsByMethodCents.pix / 100,
        debito: todayReceiptsByMethodCents.debito / 100,
        credito: todayReceiptsByMethodCents.credito / 100,
      },
    };
  }, [comandas, groupRentals, currentSaoPauloDay]);

  return (
    <ComandasContext.Provider
      value={{
        comandas,
        products,
        groupRentals,
        activeModule,
        setActiveModule,
        selectedComandaId,
        setSelectedComandaId,
        isNewComandaModalOpen,
        setIsNewComandaModalOpen,
        selectedGroupRentalId,
        setSelectedGroupRentalId,
        isNewGroupRentalModalOpen,
        setIsNewGroupRentalModalOpen,
        authStatus,
        currentStaff,
        currentUser,
        unauthorizedReason,
        handleGoogleLogin,
        handleLogout,
        staffList,
        refreshStaffList,
        addNewStaff,
        toggleStaff,
        changeRole,
        syncMeta,
        storageError,
        dismissStorageError,
        comandasLoaded,
        groupRentalsLoaded,
        comandasSyncError,
        groupRentalsSyncError,
        localBackupCount,
        adminImportLocalData,
        exportLocalData,
        filterStatus,
        setFilterStatus,
        filterType,
        setFilterType,
        searchQuery,
        setSearchQuery,
        createComanda,
        addItem,
        updateItemQuantity,
        removeItem,
        transferItems,
        registerPayment,
        verifyPaymentStatus,
        closeComanda,
        createGroupRental,
        updateParticipantName,
        adjustGroupDivision,
        linkBarComanda,
        registerGroupPayment,
        closeGroupRental,
        verifyGroupPaymentStatus,
        groupRentalMetrics,
        metrics,

        // Agenda Operacional
        appointments,
        selectedAppointmentId,
        setSelectedAppointmentId,
        isNewAppointmentModalOpen,
        setIsNewAppointmentModalOpen,
        agendaSelectedDate,
        setAgendaSelectedDate,
        agendaSelectedSpace,
        setAgendaSelectedSpace,
        agendaFilterModality,
        setAgendaFilterModality,
        agendaFilterType,
        setAgendaFilterType,
        operatingHours,
        saveOperatingHours,
        isOperatingHoursModalOpen,
        setIsOperatingHoursModalOpen,
        newAppointmentInitialSlot,
        openNewAppointmentWithSlot,
        isEditAppointmentModalOpen,
        setIsEditAppointmentModalOpen,
        appointmentToEdit,
        openEditAppointmentModal,
        createAppointment,
        updateAppointment,
        updateAppointmentStatus,
        cancelAppointment,
        startGroupRentalFromAppointment,
        createRecurringSeries,
        getRecurringPreview,
      }}
    >
      {children}
    </ComandasContext.Provider>
  );
}

export function useComandas() {
  const context = useContext(ComandasContext);
  if (!context) {
    throw new Error('useComandas deve ser utilizado dentro de um ComandasProvider');
  }
  return context;
}
