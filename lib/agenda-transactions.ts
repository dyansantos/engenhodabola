import {
  collection,
  doc,
  runTransaction,
  getDocs,
  query,
  where,
  getDoc,
  writeBatch,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  Appointment,
  CourtSpace,
  SportModality,
  AppointmentType,
  AppointmentStatus,
  AppointmentFinancialStatus,
  RecurringSeries,
  GroupRental,
  GroupParticipant,
  GroupRentalHistoryEntry,
  OccupancySlot,
  CourtOccupancyDoc,
  AgendaOperatingHours,
} from './types';
import {
  sanitizeForFirestore,
  calculateEqualDivisionCents,
  getHighestExistingGroupRentalNumber,
} from './firestore-transactions';
import {
  isEndTimeAfterStartTime,
  intervalsOverlap,
  getAppointmentSpaces,
  addDaysToDateKey,
  getDayOfWeekFromDateKey,
  getOccupancyDocId,
  differenceInDays,
  MAX_RECURRING_DAYS_LIMIT,
} from './agenda-helpers';

/**
 * Asserção de conectividade com a rede
 */
function assertOnline(opName: string) {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    throw new Error(
      `A operação "${opName}" exige conexão com o servidor para garantir integridade e evitar reservas conflitantes simultâneas.`
    );
  }
}

export interface ConflictDetails {
  conflictingAppointmentId: string;
  title: string;
  space: CourtSpace;
  date: string;
  startTime: string;
  endTime: string;
  type: AppointmentType;
}

/**
 * Verifica sobreposição de horário dentro de uma lista de slots de ocupação.
 */
export function findSlotConflict(
  slots: OccupancySlot[],
  startTime: string,
  endTime: string,
  excludeAppointmentId?: string
): OccupancySlot | null {
  for (const slot of slots) {
    if (excludeAppointmentId && slot.appointmentId === excludeAppointmentId) continue;
    if (intervalsOverlap(startTime, endTime, slot.startTime, slot.endTime)) {
      return slot;
    }
  }
  return null;
}

/**
 * Verifica na lista em memória de agendamentos se há colisão para determinado espaço, data e horário.
 * Útil para validação imediata em tela / prévia.
 */
export function findAppointmentConflict(
  existingAppointments: Appointment[],
  params: {
    spaces: CourtSpace[];
    date: string;
    startTime: string;
    endTime: string;
    excludeAppointmentId?: string;
  }
): ConflictDetails | null {
  for (const apt of existingAppointments) {
    if (apt.status === 'cancelada') continue;
    if (params.excludeAppointmentId && apt.id === params.excludeAppointmentId) continue;
    if (apt.date !== params.date) continue;

    const aptSpaces = getAppointmentSpaces(apt);
    const hasCommonSpace = params.spaces.some(s => aptSpaces.includes(s));
    if (!hasCommonSpace) continue;

    if (intervalsOverlap(params.startTime, params.endTime, apt.startTime, apt.endTime)) {
      const commonSpace = params.spaces.find(s => aptSpaces.includes(s)) || apt.space;
      return {
        conflictingAppointmentId: apt.id,
        title: apt.title,
        space: commonSpace,
        date: apt.date,
        startTime: apt.startTime,
        endTime: apt.endTime,
        type: apt.type,
      };
    }
  }

  return null;
}


/**
 * CRIAÇÃO ATÔMICA DE RESERVA
 * Utiliza documento compartilhado de ocupação por espaço e data (court_occupancy)
 * lido e gravado dentro de runTransaction para proteção real contra concorrência simultânea.
 * Para eventos multi-espaço, lê e valida todos os espaços e confirma todos juntos ou nenhum.
 */
export async function atomicCreateAppointment(params: {
  title: string;
  hostName: string;
  hostPhone?: string;
  space: CourtSpace;
  spaces?: CourtSpace[];
  modality: SportModality;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  type: AppointmentType;
  priceCents?: number;
  monthlyPriceCents?: number;
  notes?: string;
  operatorUid: string;
  operatorName: string;
  recurringSeriesId?: string;
  occurrenceIndex?: number;
}): Promise<{ success: boolean; appointment?: Appointment; conflict?: ConflictDetails; error?: string }> {
  assertOnline('Cadastro de Reserva na Agenda');

  if (!isEndTimeAfterStartTime(params.startTime, params.endTime)) {
    return {
      success: false,
      error: 'O horário de término deve ser estritamente posterior ao horário de início.',
    };
  }

  const targetSpaces = params.spaces && params.spaces.length > 0
    ? Array.from(new Set([params.space, ...params.spaces]))
    : [params.space];

  const nowIso = new Date().toISOString();
  const appointmentId = `apt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const appointmentRef = doc(db, 'appointments', appointmentId);

  try {
    const result = await runTransaction(db, async transaction => {
      // 1. LEITURA ATÔMICA: Lê documentos de ocupação de TODOS os espaços envolvidos
      const occDocsToUpdate: { ref: any; data: CourtOccupancyDoc }[] = [];

      for (const sp of targetSpaces) {
        const occDocId = getOccupancyDocId(sp, params.date);
        const occRef = doc(db, 'court_occupancy', occDocId);
        const occSnap = await transaction.get(occRef);

        let existingSlots: OccupancySlot[] = [];
        if (occSnap.exists()) {
          const occData = occSnap.data() as CourtOccupancyDoc;
          existingSlots = Array.isArray(occData.slots) ? occData.slots : [];
        }

        // Validação de conflito no espaço
        const conflictSlot = findSlotConflict(existingSlots, params.startTime, params.endTime);
        if (conflictSlot) {
          throw new Error(
            `CONFLITO_RESERVA: O espaço ${sp} já possui reserva ("${conflictSlot.title}") das ${conflictSlot.startTime} às ${conflictSlot.endTime} nesta data.`
          );
        }

        const newSlot: OccupancySlot = {
          appointmentId,
          startTime: params.startTime,
          endTime: params.endTime,
          title: params.title.trim(),
          type: params.type,
        };

        const updatedSlots = [...existingSlots, newSlot].sort((a, b) => a.startTime.localeCompare(b.startTime));

        occDocsToUpdate.push({
          ref: occRef,
          data: {
            id: occDocId,
            space: sp,
            date: params.date,
            slots: updatedSlots,
            updatedAt: nowIso,
          },
        });
      }

      // 2. Determina situação financeira inicial
      let financialStatus: AppointmentFinancialStatus = 'pendente';
      if (params.type === 'mensalista' || params.type === 'aula') {
        financialStatus = 'mensalidade';
      }

      const newAppointment: Appointment = {
        id: appointmentId,
        title: params.title.trim(),
        hostName: params.hostName.trim(),
        hostPhone: params.hostPhone?.trim() || undefined,
        space: params.space,
        spaces: params.spaces && params.spaces.length > 1 ? params.spaces : undefined,
        modality: params.modality,
        date: params.date,
        startTime: params.startTime,
        endTime: params.endTime,
        type: params.type,
        status: 'confirmada',
        financialStatus,
        priceCents: params.priceCents !== undefined ? Math.max(0, Math.floor(params.priceCents)) : undefined,
        monthlyPriceCents: params.monthlyPriceCents !== undefined ? Math.max(0, Math.floor(params.monthlyPriceCents)) : undefined,
        notes: params.notes?.trim() || undefined,
        recurringSeriesId: params.recurringSeriesId,
        occurrenceIndex: params.occurrenceIndex,
        createdAt: nowIso,
        createdByUid: params.operatorUid,
        createdByName: params.operatorName,
        history: [
          {
            id: `hist-apt-${Date.now()}`,
            timestamp: nowIso,
            operator: params.operatorName,
            operatorUid: params.operatorUid,
            type: 'criacao',
            description: `Reserva cadastrada para ${params.hostName} no espaço ${targetSpaces.join(', ')} (${params.startTime} - ${params.endTime}).`,
          },
        ],
      };

      // 3. GRAVAÇÃO ATÔMICA: Atualiza documentos de ocupação e o agendamento
      for (const occItem of occDocsToUpdate) {
        transaction.set(occItem.ref, sanitizeForFirestore(occItem.data));
      }
      transaction.set(appointmentRef, sanitizeForFirestore(newAppointment));

      return newAppointment;
    });

    return { success: true, appointment: result };
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('CONFLITO_RESERVA:')) {
      return {
        success: false,
        error: msg.replace('CONFLITO_RESERVA: ', ''),
      };
    }
    return {
      success: false,
      error: `Erro ao confirmar reserva: ${msg}`,
    };
  }
}

/**
 * Prévia e criação em lote de série recorrente (mensalista ou aula fixa)
 */
export interface RecurringOccurrencePreview {
  date: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  space: CourtSpace;
  conflict: ConflictDetails | null;
}

/**
 * Gera a lista de ocorrências da série recorrente e analisa conflitos prévios.
 * Rejeita períodos superiores ao limite suportado de 365 dias sem truncar silenciosamente.
 */
export function previewRecurringSeries(params: {
  space: CourtSpace;
  daysOfWeek: number[]; // 0 a 6
  startTime: string;
  endTime: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  existingAppointments: Appointment[];
}): {
  occurrences: RecurringOccurrencePreview[];
  conflicts: ConflictDetails[];
  canConfirm: boolean;
  limitExceeded?: boolean;
  limitError?: string;
} {
  const diffDays = differenceInDays(params.startDate, params.endDate);
  if (diffDays > MAX_RECURRING_DAYS_LIMIT) {
    return {
      occurrences: [],
      conflicts: [],
      canConfirm: false,
      limitExceeded: true,
      limitError: `O período máximo permitido para configuração de série recorrente é de ${MAX_RECURRING_DAYS_LIMIT} dias (1 ano). O intervalo informado possui ${diffDays} dias. Por favor, reduza a data final da série antes de prosseguir.`,
    };
  }

  const occurrences: RecurringOccurrencePreview[] = [];
  const conflicts: ConflictDetails[] = [];

  let currentDate = params.startDate;

  while (currentDate <= params.endDate) {
    const dayOfWeek = getDayOfWeekFromDateKey(currentDate);

    if (params.daysOfWeek.includes(dayOfWeek)) {
      const conflict = findAppointmentConflict(params.existingAppointments, {
        spaces: [params.space],
        date: currentDate,
        startTime: params.startTime,
        endTime: params.endTime,
      });

      if (conflict) {
        conflicts.push(conflict);
      }

      occurrences.push({
        date: currentDate,
        dayOfWeek,
        startTime: params.startTime,
        endTime: params.endTime,
        space: params.space,
        conflict,
      });
    }

    currentDate = addDaysToDateKey(currentDate, 1);
  }

  return {
    occurrences,
    conflicts,
    canConfirm: conflicts.length === 0 && occurrences.length > 0,
  };
}

/**
 * Criação atômica de série recorrente.
 * Revalida conflitos na confirmação utilizando o mecanismo de ocupação por data/espaço.
 * Utiliza o ID completo da série e índice da ocorrência, garantindo que uma nova série
 * nunca sobrescreva ocorrências existentes.
 */
export async function atomicCreateRecurringSeries(params: {
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
  operatorUid: string;
  operatorName: string;
}): Promise<{ success: boolean; seriesId?: string; occurrencesCreated?: number; error?: string }> {
  assertOnline('Cadastro de Horário Recorrente');

  if (!isEndTimeAfterStartTime(params.startTime, params.endTime)) {
    return { success: false, error: 'Horário de término deve ser após o horário de início.' };
  }
  if (params.startDate > params.endDate) {
    return { success: false, error: 'A data final da série deve ser igual ou posterior à data inicial.' };
  }
  if (!params.daysOfWeek || params.daysOfWeek.length === 0) {
    return { success: false, error: 'Selecione ao menos um dia da semana para o horário fixo.' };
  }

  const diffDays = differenceInDays(params.startDate, params.endDate);
  if (diffDays > MAX_RECURRING_DAYS_LIMIT) {
    return {
      success: false,
      error: `O período máximo suportado para séries recorrentes é de ${MAX_RECURRING_DAYS_LIMIT} dias (1 ano). O intervalo informado possui ${diffDays} dias. Não criamos séries truncadas: reduza a data final antes de confirmar.`,
    };
  }

  // Identificador único e completo da série
  const seriesId = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const nowIso = new Date().toISOString();

  // Gera lista de datas alvo da série
  const targetDates: string[] = [];
  let curr = params.startDate;
  while (curr <= params.endDate) {
    const dow = getDayOfWeekFromDateKey(curr);
    if (params.daysOfWeek.includes(dow)) {
      targetDates.push(curr);
    }
    curr = addDaysToDateKey(curr, 1);
  }

  if (targetDates.length === 0) {
    return {
      success: false,
      error: 'Nenhuma ocorrência encontrada para os dias da semana selecionados no período informado.',
    };
  }

  try {
    await runTransaction(db, async transaction => {
      // 1. LEITURA ATÔMICA & REVALIDAÇÃO DE CONFLITOS EM CADA DATA DA SÉRIE
      const occUpdates: { ref: any; doc: CourtOccupancyDoc }[] = [];
      const aptDocsToCreate: { ref: any; apt: Appointment }[] = [];

      for (let index = 0; index < targetDates.length; index++) {
        const occDate = targetDates[index];
        const occDocId = getOccupancyDocId(params.space, occDate);
        const occRef = doc(db, 'court_occupancy', occDocId);
        const occSnap = await transaction.get(occRef);

        let existingSlots: OccupancySlot[] = [];
        if (occSnap.exists()) {
          const occData = occSnap.data() as CourtOccupancyDoc;
          existingSlots = Array.isArray(occData.slots) ? occData.slots : [];
        }

        // Revalidação em tempo de confirmação
        const conflictSlot = findSlotConflict(existingSlots, params.startTime, params.endTime);
        if (conflictSlot) {
          throw new Error(
            `CONFLITO_RECORRENCIA: Não foi possível criar a série. Conflito identificado na data ${occDate} (${params.space}, ${params.startTime} às ${params.endTime}) com a reserva "${conflictSlot.title}".`
          );
        }

        // Identificador COMPLETO e estritamente único da ocorrência
        const aptId = `apt-${seriesId}-occ-${index}`;
        const aptRef = doc(db, 'appointments', aptId);

        const title = params.type === 'mensalista'
          ? `Mensalista: ${params.hostName.trim()}`
          : `Aula: ${params.hostName.trim()}`;

        const newSlot: OccupancySlot = {
          appointmentId: aptId,
          startTime: params.startTime,
          endTime: params.endTime,
          title,
          type: params.type,
        };

        const updatedSlots = [...existingSlots, newSlot].sort((a, b) => a.startTime.localeCompare(b.startTime));

        occUpdates.push({
          ref: occRef,
          doc: {
            id: occDocId,
            space: params.space,
            date: occDate,
            slots: updatedSlots,
            updatedAt: nowIso,
          },
        });

        const newApt: Appointment = {
          id: aptId,
          title,
          hostName: params.hostName.trim(),
          hostPhone: params.hostPhone?.trim() || undefined,
          space: params.space,
          modality: params.modality,
          date: occDate,
          startTime: params.startTime,
          endTime: params.endTime,
          type: params.type,
          status: 'confirmada',
          financialStatus: 'mensalidade',
          monthlyPriceCents: params.monthlyPriceCents !== undefined ? Math.max(0, Math.floor(params.monthlyPriceCents)) : undefined,
          recurringSeriesId: seriesId,
          occurrenceIndex: index,
          notes: params.notes?.trim() || undefined,
          createdAt: nowIso,
          createdByUid: params.operatorUid,
          createdByName: params.operatorName,
          history: [
            {
              id: `hist-rec-${Date.now()}-${index}`,
              timestamp: nowIso,
              operator: params.operatorName,
              operatorUid: params.operatorUid,
              type: 'criacao',
              description: `Ocorrência #${index + 1} de série fixa semanal (${params.startTime} - ${params.endTime}).`,
            },
          ],
        };

        aptDocsToCreate.push({ ref: aptRef, apt: newApt });
      }

      // 2. GRAVAÇÃO ATÔMICA DA SÉRIE E OCORRÊNCIAS
      const seriesDoc: RecurringSeries = {
        id: seriesId,
        hostName: params.hostName.trim(),
        hostPhone: params.hostPhone?.trim() || undefined,
        space: params.space,
        modality: params.modality,
        type: params.type,
        daysOfWeek: params.daysOfWeek,
        startTime: params.startTime,
        endTime: params.endTime,
        startDate: params.startDate,
        endDate: params.endDate,
        monthlyPriceCents: params.monthlyPriceCents !== undefined ? Math.max(0, Math.floor(params.monthlyPriceCents)) : undefined,
        notes: params.notes?.trim() || undefined,
        status: 'ativa',
        createdAt: nowIso,
        createdByUid: params.operatorUid,
        createdByName: params.operatorName,
      };

      transaction.set(doc(db, 'recurring_series', seriesId), sanitizeForFirestore(seriesDoc));

      for (const occItem of occUpdates) {
        transaction.set(occItem.ref, sanitizeForFirestore(occItem.doc));
      }

      for (const aptItem of aptDocsToCreate) {
        transaction.set(aptItem.ref, sanitizeForFirestore(aptItem.apt));
      }
    });

    return {
      success: true,
      seriesId,
      occurrencesCreated: targetDates.length,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('CONFLITO_RECORRENCIA:')) {
      return {
        success: false,
        error: msg.replace('CONFLITO_RECORRENCIA: ', ''),
      };
    }
    return {
      success: false,
      error: `Erro ao criar série recorrente: ${msg}`,
    };
  }
}

/**
 * ATUALIZAÇÃO DOS DADOS DA RESERVA (Edição)
 * Permite editar:
 * - Apenas esta ocorrência
 * - Esta e as próximas ocorrências (quando parte de série)
 * Revalida disponibilidade usando os documentos de ocupação no Firestore.
 * Preserva histórico passado e vínculos financeiros existentes.
 */
export async function atomicUpdateAppointment(params: {
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
  operatorUid: string;
  operatorName: string;
  scope?: 'only_this' | 'this_and_following';
}): Promise<{ success: boolean; appointment?: Appointment; updatedCount?: number; error?: string }> {
  assertOnline('Edição de Reserva');

  if (!isEndTimeAfterStartTime(params.startTime, params.endTime)) {
    return { success: false, error: 'Horário de término deve ser estritamente após o início.' };
  }

  const targetSpaces = params.spaces && params.spaces.length > 0
    ? Array.from(new Set([params.space, ...params.spaces]))
    : [params.space];

  const appointmentRef = doc(db, 'appointments', params.appointmentId);
  const scope = params.scope || 'only_this';

  try {
    const result = await runTransaction(db, async transaction => {
      // 1. Lê o estado atual do agendamento DENTRO da transação protegida
      const currentSnap = await transaction.get(appointmentRef);
      if (!currentSnap.exists()) {
        throw new Error('Reserva não encontrada.');
      }

      const current = currentSnap.data() as Appointment;
      if (current.status === 'cancelada') {
        throw new Error('Não é possível editar uma reserva que já foi cancelada.');
      }

      // Regra de Integridade Financeira: bloqueia alteração de valor se a locação em grupo já foi aberta
      if (current.linkedGroupRentalId && params.priceCents !== undefined && params.priceCents !== current.priceCents) {
        throw new Error(
          'O atendimento desta reserva já foi iniciado e gerou uma locação em grupo ativa. Para manter a integridade fiscal, o valor combinado não pode ser alterado pela agenda. Ajuste a cobrança diretamente no fechamento do grupo.'
        );
      }

      const nowIso = new Date().toISOString();

      if (scope === 'this_and_following' && current.recurringSeriesId) {
        // EDIÇÃO EM LOTE: Esta e as próximas ocorrências da mesma série
        const qFollowing = query(
          collection(db, 'appointments'),
          where('recurringSeriesId', '==', current.recurringSeriesId),
          where('date', '>=', current.date)
        );
        const followingSnap = await getDocs(qFollowing);
        const followingApts: Appointment[] = [];
        followingSnap.forEach(d => {
          const a = d.data() as Appointment;
          if (a.status !== 'cancelada') followingApts.push(a);
        });

        // Para cada ocorrência, valida ocupação no novo horário/espaço
        const followingOccUpdates: { ref: any; doc: CourtOccupancyDoc }[] = [];

        for (const apt of followingApts) {
          const occRef = doc(db, 'court_occupancy', getOccupancyDocId(params.space, apt.date));
          const occSnap = await transaction.get(occRef);

          let slots: OccupancySlot[] = [];
          if (occSnap.exists()) {
            const occData = occSnap.data() as CourtOccupancyDoc;
            slots = Array.isArray(occData.slots) ? occData.slots : [];
          }

          // Se a quadra anterior for diferente, limpa o slot anterior da quadra antiga
          if (apt.space !== params.space) {
            const oldOccRef = doc(db, 'court_occupancy', getOccupancyDocId(apt.space, apt.date));
            const oldOccSnap = await transaction.get(oldOccRef);
            if (oldOccSnap.exists()) {
              const oldOccData = oldOccSnap.data() as CourtOccupancyDoc;
              const filteredOld = (oldOccData.slots || []).filter(s => s.appointmentId !== apt.id);
              followingOccUpdates.push({
                ref: oldOccRef,
                doc: { ...oldOccData, slots: filteredOld, updatedAt: nowIso },
              });
            }
          }

          const conflict = findSlotConflict(slots, params.startTime, params.endTime, apt.id);
          if (conflict) {
            throw new Error(
              `CONFLITO_RESERVA: Conflito em ${apt.date} (${params.space}, ${params.startTime} às ${params.endTime}) com "${conflict.title}".`
            );
          }

          // Atualiza slot no espaço novo
          const filteredNew = slots.filter(s => s.appointmentId !== apt.id);
          filteredNew.push({
            appointmentId: apt.id,
            startTime: params.startTime,
            endTime: params.endTime,
            title: params.title.trim(),
            type: apt.type,
          });
          filteredNew.sort((a, b) => a.startTime.localeCompare(b.startTime));

          followingOccUpdates.push({
            ref: occRef,
            doc: {
              id: getOccupancyDocId(params.space, apt.date),
              space: params.space,
              date: apt.date,
              slots: filteredNew,
              updatedAt: nowIso,
            },
          });

          // Atualiza dados da ocorrência preservando links e histórico
          const updatedOccApt: Appointment = {
            ...apt,
            title: params.title.trim(),
            hostName: params.hostName.trim(),
            hostPhone: params.hostPhone?.trim() || undefined,
            space: params.space,
            modality: params.modality,
            startTime: params.startTime,
            endTime: params.endTime,
            notes: params.notes?.trim() || undefined,
            updatedAt: nowIso,
            updatedByUid: params.operatorUid,
            updatedByName: params.operatorName,
            history: [
              ...(apt.history || []),
              {
                id: `hist-apt-edit-${Date.now()}-${apt.id}`,
                timestamp: nowIso,
                operator: params.operatorName,
                operatorUid: params.operatorUid,
                type: 'edicao',
                description: `Horário e dados atualizados em série (${params.startTime} - ${params.endTime}).`,
              },
            ],
          };

          transaction.set(doc(db, 'appointments', apt.id), sanitizeForFirestore(updatedOccApt));
        }

        for (const occItem of followingOccUpdates) {
          transaction.set(occItem.ref, sanitizeForFirestore(occItem.doc));
        }

        return { updatedCount: followingApts.length };
      }

      // EDIÇÃO DE OCORRÊNCIA ÚNICA (only_this)
      const oldSpaces = getAppointmentSpaces(current);
      const oldDate = current.date;
      const isDateOrSpaceChanged = oldDate !== params.date || oldSpaces.sort().join() !== targetSpaces.sort().join();
      const isTimeChanged = current.startTime !== params.startTime || current.endTime !== params.endTime;

      const occUpdates: { ref: any; doc: CourtOccupancyDoc }[] = [];

      // 1.1 Se o espaço ou data mudou, remove os slots da ocupação antiga
      if (isDateOrSpaceChanged) {
        for (const oldSp of oldSpaces) {
          const oldOccRef = doc(db, 'court_occupancy', getOccupancyDocId(oldSp, oldDate));
          const oldOccSnap = await transaction.get(oldOccRef);
          if (oldOccSnap.exists()) {
            const oldData = oldOccSnap.data() as CourtOccupancyDoc;
            const remainingSlots = (oldData.slots || []).filter(s => s.appointmentId !== current.id);
            occUpdates.push({
              ref: oldOccRef,
              doc: { ...oldData, slots: remainingSlots, updatedAt: nowIso },
            });
          }
        }
      }

      // 1.2 Valida conflito e adiciona/atualiza slot nos novos espaços
      for (const sp of targetSpaces) {
        const occRef = doc(db, 'court_occupancy', getOccupancyDocId(sp, params.date));
        const occSnap = await transaction.get(occRef);

        let slots: OccupancySlot[] = [];
        if (occSnap.exists()) {
          const occData = occSnap.data() as CourtOccupancyDoc;
          slots = Array.isArray(occData.slots) ? occData.slots : [];
        }

        if (isTimeChanged || isDateOrSpaceChanged) {
          const conflict = findSlotConflict(slots, params.startTime, params.endTime, current.id);
          if (conflict) {
            throw new Error(
              `CONFLITO_RESERVA: O espaço ${sp} já possui a reserva "${conflict.title}" das ${conflict.startTime} às ${conflict.endTime} nesta data.`
            );
          }
        }

        // Remove slot anterior se existia neste mesmo espaço
        const filtered = slots.filter(s => s.appointmentId !== current.id);
        filtered.push({
          appointmentId: current.id,
          startTime: params.startTime,
          endTime: params.endTime,
          title: params.title.trim(),
          type: current.type,
        });
        filtered.sort((a, b) => a.startTime.localeCompare(b.startTime));

        occUpdates.push({
          ref: occRef,
          doc: {
            id: getOccupancyDocId(sp, params.date),
            space: sp,
            date: params.date,
            slots: filtered,
            updatedAt: nowIso,
          },
        });
      }

      const updatedApt: Appointment = {
        ...current,
        title: params.title.trim(),
        hostName: params.hostName.trim(),
        hostPhone: params.hostPhone?.trim() || undefined,
        space: params.space,
        spaces: params.spaces && params.spaces.length > 1 ? params.spaces : undefined,
        modality: params.modality,
        date: params.date,
        startTime: params.startTime,
        endTime: params.endTime,
        priceCents: params.priceCents !== undefined ? Math.max(0, Math.floor(params.priceCents)) : current.priceCents,
        notes: params.notes?.trim() || undefined,
        updatedAt: nowIso,
        updatedByUid: params.operatorUid,
        updatedByName: params.operatorName,
        history: [
          ...(current.history || []),
          {
            id: `hist-apt-edit-${Date.now()}`,
            timestamp: nowIso,
            operator: params.operatorName,
            operatorUid: params.operatorUid,
            type: 'edicao',
            description: `Reserva alterada para ${params.startTime} - ${params.endTime} (${targetSpaces.join(', ')}).`,
          },
        ],
      };

      for (const occItem of occUpdates) {
        transaction.set(occItem.ref, sanitizeForFirestore(occItem.doc));
      }
      transaction.set(appointmentRef, sanitizeForFirestore(updatedApt));

      return { appointment: updatedApt, updatedCount: 1 };
    });

    return {
      success: true,
      appointment: result.appointment,
      updatedCount: result.updatedCount,
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('CONFLITO_RESERVA:')) {
      return { success: false, error: msg.replace('CONFLITO_RESERVA: ', '') };
    }
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Atualiza status da reserva (ex: 'em_andamento' ou 'concluida').
 * Preserva estritamente a situação financeira separada da situação do agendamento.
 */
export async function atomicUpdateAppointmentStatus(params: {
  appointmentId: string;
  status: AppointmentStatus;
  operatorUid: string;
  operatorName: string;
}): Promise<{ success: boolean; error?: string }> {
  assertOnline('Atualização de Status da Reserva');

  const appointmentRef = doc(db, 'appointments', params.appointmentId);

  try {
    await runTransaction(db, async transaction => {
      const snap = await transaction.get(appointmentRef);
      if (!snap.exists()) {
        throw new Error('Reserva não encontrada.');
      }

      const current = snap.data() as Appointment;
      if (current.status === 'cancelada') {
        throw new Error('Não é possível alterar o status de uma reserva já cancelada.');
      }

      const nowIso = new Date().toISOString();
      const updatedApt: Appointment = {
        ...current,
        status: params.status,
        updatedAt: nowIso,
        updatedByUid: params.operatorUid,
        updatedByName: params.operatorName,
        history: [
          ...(current.history || []),
          {
            id: `hist-apt-stat-${Date.now()}`,
            timestamp: nowIso,
            operator: params.operatorName,
            operatorUid: params.operatorUid,
            type: 'status_alterado',
            description: `Situação do agendamento alterada para "${params.status}". Cobrança financeira mantida separada.`,
          },
        ],
      };

      transaction.set(appointmentRef, sanitizeForFirestore(updatedApt));
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * CANCELAMENTO DE RESERVA
 * Lê o estado atual dentro da operação protegida (runTransaction) para não sobrescrever
 * alterações concorrentes nem o vínculo com atendimento em andamento.
 * Libera o horário nos documentos de ocupação (court_occupancy), preserva registros
 * passados e não exclui cobranças financeiras existentes.
 */
export async function atomicCancelAppointment(params: {
  appointmentId: string;
  reason: string;
  scope?: 'only_this' | 'this_and_following';
  operatorUid: string;
  operatorName: string;
}): Promise<{ success: boolean; cancelledCount?: number; error?: string }> {
  assertOnline('Cancelamento de Reserva');

  if (!params.reason || !params.reason.trim()) {
    return { success: false, error: 'Informe obrigatoriamente o motivo do cancelamento.' };
  }

  const appointmentRef = doc(db, 'appointments', params.appointmentId);
  const scope = params.scope || 'only_this';
  const nowIso = new Date().toISOString();

  try {
    const result = await runTransaction(db, async transaction => {
      // 1. Lê o estado atual do agendamento dentro da transação protegida
      const snap = await transaction.get(appointmentRef);
      if (!snap.exists()) {
        throw new Error('Reserva não encontrada.');
      }

      const targetApt = snap.data() as Appointment;
      if (targetApt.status === 'cancelada') {
        return { cancelledCount: 0 };
      }

      if (scope === 'this_and_following' && targetApt.recurringSeriesId) {
        // CANCELAMENTO EM LOTE: Esta e próximas ocorrências da mesma série
        const qFollowing = query(
          collection(db, 'appointments'),
          where('recurringSeriesId', '==', targetApt.recurringSeriesId),
          where('date', '>=', targetApt.date)
        );
        const followingSnap = await getDocs(qFollowing);
        let count = 0;

        for (const d of followingSnap.docs) {
          const apt = d.data() as Appointment;
          if (apt.status === 'cancelada') continue;

          // Libera o slot no documento de ocupação
          const aptSpaces = getAppointmentSpaces(apt);
          for (const sp of aptSpaces) {
            const occRef = doc(db, 'court_occupancy', getOccupancyDocId(sp, apt.date));
            const occSnap = await transaction.get(occRef);
            if (occSnap.exists()) {
              const occData = occSnap.data() as CourtOccupancyDoc;
              const remaining = (occData.slots || []).filter(s => s.appointmentId !== apt.id);
              transaction.set(occRef, sanitizeForFirestore({
                ...occData,
                slots: remaining,
                updatedAt: nowIso,
              }));
            }
          }

          const cancelledApt: Appointment = {
            ...apt,
            status: 'cancelada',
            cancelledAt: nowIso,
            cancelledByUid: params.operatorUid,
            cancelledByName: params.operatorName,
            cancellationReason: params.reason.trim(),
            history: [
              ...(apt.history || []),
              {
                id: `hist-cancel-${Date.now()}-${count}`,
                timestamp: nowIso,
                operator: params.operatorName,
                operatorUid: params.operatorUid,
                type: 'cancelamento',
                description: `Reserva cancelada em lote. Horário liberado na agenda. Motivo: ${params.reason.trim()}`,
              },
            ],
          };

          transaction.set(doc(db, 'appointments', apt.id), sanitizeForFirestore(cancelledApt));
          count++;
        }

        return { cancelledCount: count };
      }

      // CANCELAMENTO DE OCORRÊNCIA ÚNICA (only_this)
      // Libera os slots de todos os espaços ocupados
      const targetSpaces = getAppointmentSpaces(targetApt);
      for (const sp of targetSpaces) {
        const occRef = doc(db, 'court_occupancy', getOccupancyDocId(sp, targetApt.date));
        const occSnap = await transaction.get(occRef);
        if (occSnap.exists()) {
          const occData = occSnap.data() as CourtOccupancyDoc;
          const remaining = (occData.slots || []).filter(s => s.appointmentId !== targetApt.id);
          transaction.set(occRef, sanitizeForFirestore({
            ...occData,
            slots: remaining,
            updatedAt: nowIso,
          }));
        }
      }

      // Preserva o vínculo linkedGroupRentalId e histórico financeiro caso exista
      const updatedApt: Appointment = {
        ...targetApt,
        status: 'cancelada',
        cancelledAt: nowIso,
        cancelledByUid: params.operatorUid,
        cancelledByName: params.operatorName,
        cancellationReason: params.reason.trim(),
        history: [
          ...(targetApt.history || []),
          {
            id: `hist-cancel-${Date.now()}`,
            timestamp: nowIso,
            operator: params.operatorName,
            operatorUid: params.operatorUid,
            type: 'cancelamento',
            description: `Reserva cancelada. Horário liberado na agenda. Motivo: ${params.reason.trim()}`,
          },
        ],
      };

      transaction.set(appointmentRef, sanitizeForFirestore(updatedApt));
      return { cancelledCount: 1 };
    });

    return { success: true, cancelledCount: result.cancelledCount };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * CONEXÃO COM O FECHAMENTO POR GRUPO: "Iniciar atendimento"
 *
 * Regras Estritas:
 * 1. Restrito aos tipos permitidos (locacao_avulsa e evento). Aulas, mensalistas e bloqueios NÃO geram locação avulsa.
 * 2. Unificação do contador: utiliza metadata/group_rentals_counter com lastNumber, harmonizado com criações diretas.
 * 3. Idempotência garantida: cria apenas UMA locação por reserva.
 * 4. Vincula bidirecionalmente a reserva e a locação.
 */
export async function atomicStartGroupRentalFromAppointment(params: {
  appointmentId: string;
  participantsCount: number;
  operatorUid: string;
  operatorName: string;
}): Promise<{
  success: boolean;
  rental?: GroupRental;
  appointment?: Appointment;
  alreadyExisted?: boolean;
  error?: string;
}> {
  assertOnline('Iniciar Atendimento da Reserva');

  if (!params.participantsCount || params.participantsCount <= 0 || !Number.isInteger(params.participantsCount)) {
    return { success: false, error: 'A quantidade de participantes deve ser um número inteiro positivo.' };
  }

  const appointmentRef = doc(db, 'appointments', params.appointmentId);
  const counterRef = doc(db, 'metadata', 'group_rentals_counter');

  // Verifica o maior número já existente no banco para garantir que o contador nunca regrida
  const highestExisting = await getHighestExistingGroupRentalNumber();

  try {
    const result = await runTransaction(db, async transaction => {
      // 1. Lê a reserva dentro da transação protegida
      const aptSnap = await transaction.get(appointmentRef);
      if (!aptSnap.exists()) {
        throw new Error('Reserva não encontrada na agenda.');
      }

      const appointment = aptSnap.data() as Appointment;

      if (appointment.status === 'cancelada') {
        throw new Error('Não é possível iniciar atendimento para uma reserva que foi cancelada.');
      }

      // Restrição estrita de tipos
      if (appointment.type === 'mensalista' || appointment.type === 'aula') {
        throw new Error(
          'Horários mensais e aulas fixas não geram locação avulsa por encontro. O faturamento pertence ao módulo de mensalidades.'
        );
      }
      if (appointment.type === 'bloqueio') {
        throw new Error('Bloqueios técnicos de manutenção não geram atendimento nem cobrança.');
      }

      // 2. Proteção Idempotente: se já possui locação vinculada, retorna a existente
      if (appointment.linkedGroupRentalId) {
        const existingRentalRef = doc(db, 'group_rentals', appointment.linkedGroupRentalId);
        const existingRentalSnap = await transaction.get(existingRentalRef);
        if (existingRentalSnap.exists()) {
          return {
            alreadyExisted: true,
            rental: existingRentalSnap.data() as GroupRental,
            appointment,
          };
        }
      }

      // 3. Lê o contador unificado de locações em grupo
      const counterSnap = await transaction.get(counterRef);
      let currentLast = highestExisting;

      if (counterSnap.exists()) {
        const data = counterSnap.data();
        if (typeof data.lastNumber === 'number' && Number.isInteger(data.lastNumber)) {
          currentLast = Math.max(currentLast, data.lastNumber);
        }
      }

      const nextNumber = currentLast + 1;
      const nowIso = new Date().toISOString();

      transaction.set(counterRef, sanitizeForFirestore({
        lastNumber: nextNumber,
        updatedAt: nowIso,
        updatedBy: params.operatorName,
      }), { merge: true });

      // 4. Divisão exata em centavos
      const totalCents = Math.max(0, Math.floor(appointment.priceCents || 0));
      const division = calculateEqualDivisionCents(totalCents, params.participantsCount);

      const participants: GroupParticipant[] = division.map((dueCents, index) => ({
        id: `p-${index + 1}`,
        name: index === 0 ? appointment.hostName.trim() : `Participante ${index + 1}`,
        dueAmountCents: dueCents,
        paidAmountCents: 0,
        status: 'pendente',
      }));

      const rentalId = `gr-apt-${appointment.id}`;
      const rentalRef = doc(db, 'group_rentals', rentalId);

      const newRental: GroupRental = {
        id: rentalId,
        number: nextNumber,
        groupName: `${appointment.hostName.trim()} (${appointment.space})`,
        date: appointment.date,
        time: `${appointment.startTime} - ${appointment.endTime}`,
        space: appointment.space,
        totalAmountCents: totalCents,
        status: 'aberta',
        participants,
        payments: [],
        history: [
          {
            id: `hist-gr-init-${Date.now()}`,
            timestamp: nowIso,
            operator: params.operatorName,
            operatorUid: params.operatorUid,
            type: 'criacao',
            description: `Atendimento iniciado a partir da reserva na agenda (${appointment.startTime} - ${appointment.endTime}).`,
            details: `Valor acordado: R$ ${(totalCents / 100).toFixed(2)} dividido entre ${params.participantsCount} participantes.`,
          },
        ],
        createdAt: nowIso,
        createdByUid: params.operatorUid,
        createdByName: params.operatorName,
      };

      const updatedAppointment: Appointment = {
        ...appointment,
        linkedGroupRentalId: rentalId,
        status: 'em_andamento',
        financialStatus: 'em_atendimento',
        updatedAt: nowIso,
        updatedByUid: params.operatorUid,
        updatedByName: params.operatorName,
        history: [
          ...(appointment.history || []),
          {
            id: `hist-start-${Date.now()}`,
            timestamp: nowIso,
            operator: params.operatorName,
            operatorUid: params.operatorUid,
            type: 'inicio_atendimento',
            description: `Atendimento iniciado. Locação em grupo nº ${nextNumber} vinculada com ${params.participantsCount} participantes.`,
          },
        ],
      };

      transaction.set(rentalRef, sanitizeForFirestore(newRental));
      transaction.set(appointmentRef, sanitizeForFirestore(updatedAppointment));

      return {
        alreadyExisted: false,
        rental: newRental,
        appointment: updatedAppointment,
      };
    });

    return {
      success: true,
      rental: result.rental,
      appointment: result.appointment,
      alreadyExisted: result.alreadyExisted,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || String(err),
    };
  }
}

/**
 * CONFIGURAÇÃO DO HORÁRIO DE FUNCIONAMENTO
 * Salva os horários de abertura e fechamento configuráveis no documento metadata/agenda_config
 */
export async function atomicSaveOperatingHours(params: {
  openTime: string;
  closeTime: string;
  slotIntervalMinutes?: number;
  operatorUid: string;
  operatorName: string;
}): Promise<{ success: boolean; error?: string }> {
  assertOnline('Configuração de Horário de Funcionamento');

  if (!params.openTime || !params.closeTime) {
    return { success: false, error: 'Informe os horários de abertura e fechamento.' };
  }

  const nowIso = new Date().toISOString();
  const configRef = doc(db, 'metadata', 'agenda_config');

  const configDoc: AgendaOperatingHours = {
    configured: true,
    openTime: params.openTime.trim(),
    closeTime: params.closeTime.trim(),
    slotIntervalMinutes: params.slotIntervalMinutes || 60,
    updatedAt: nowIso,
    updatedByUid: params.operatorUid,
    updatedByName: params.operatorName,
  };

  try {
    await runTransaction(db, async transaction => {
      transaction.set(configRef, sanitizeForFirestore(configDoc), { merge: true });
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}
