import { Appointment, AppointmentStatus, AppointmentType } from './types';
import { SAO_PAULO_TZ } from './formatters';

/**
 * Retorna o horário atual no formato 'HH:mm' em America/Sao_Paulo.
 */
export function getCurrentSaoPauloTimeHHmm(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SAO_PAULO_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const hour = parts.find(p => p.type === 'hour')?.value ?? '00';
  const minute = parts.find(p => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

/**
 * Seleciona os próximos agendamentos reais de hoje (ou em andamento agora) em America/Sao_Paulo.
 * - Considera apenas agendamentos com `date === todayDateKey`.
 * - Exclui agendamentos com status `cancelada` ou `concluida`.
 * - Mantém agendamentos `em_andamento` ou cujo `endTime` ainda não passou do horário atual em São Paulo.
 * - Ordena cronologicamente por `startTime`, `endTime` e `space`.
 */
export function getUpcomingTodayAppointments(
  appointments: Appointment[],
  todayDateKey: string,
  now: Date = new Date(),
  maxItems: number = 5
): Appointment[] {
  const currentHHmm = getCurrentSaoPauloTimeHHmm(now);

  return (appointments || [])
    .filter(apt => {
      if (!apt || apt.date !== todayDateKey) return false;
      if (apt.status === 'cancelada' || apt.status === 'concluida') return false;
      if (apt.status === 'em_andamento') return true;
      return typeof apt.endTime === 'string' && apt.endTime > currentHHmm;
    })
    .sort((a, b) => {
      const startDiff = (a.startTime || '').localeCompare(b.startTime || '');
      if (startDiff !== 0) return startDiff;
      const endDiff = (a.endTime || '').localeCompare(b.endTime || '');
      if (endDiff !== 0) return endDiff;
      return (a.space || '').localeCompare(b.space || '');
    })
    .slice(0, Math.max(0, maxItems));
}

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  locacao_avulsa: 'Locação avulsa',
  mensalista: 'Mensalista',
  aula: 'Aula',
  evento: 'Evento',
  bloqueio: 'Bloqueio',
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  confirmada: 'Confirmada',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};
