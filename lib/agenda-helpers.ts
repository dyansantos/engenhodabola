import { CourtSpace, SportModality, AppointmentType, AppointmentStatus } from './types';

export const COURT_SPACES: CourtSpace[] = ['Areia 1', 'Areia 2', 'Areia 3', 'Society'];

export const COURT_DETAILS: Record<CourtSpace, { name: CourtSpace; type: 'areia' | 'society'; description: string; color: string; badgeBg: string }> = {
  'Areia 1': {
    name: 'Areia 1',
    type: 'areia',
    description: 'Beach Tennis & Futevôlei',
    color: 'emerald',
    badgeBg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  },
  'Areia 2': {
    name: 'Areia 2',
    type: 'areia',
    description: 'Beach Tennis & Futevôlei',
    color: 'teal',
    badgeBg: 'bg-teal-100 text-teal-900 border-teal-300',
  },
  'Areia 3': {
    name: 'Areia 3',
    type: 'areia',
    description: 'Beach Tennis & Futevôlei',
    color: 'cyan',
    badgeBg: 'bg-cyan-100 text-cyan-900 border-cyan-300',
  },
  'Society': {
    name: 'Society',
    type: 'society',
    description: 'Futebol Society',
    color: 'blue',
    badgeBg: 'bg-blue-100 text-blue-900 border-blue-300',
  },
};

export const MODALITY_LABELS: Record<SportModality, string> = {
  beach_tennis: 'Beach Tennis',
  futevolei: 'Futevôlei',
  society: 'Futebol Society',
  funcional_outro: 'Treino Funcional / Outro',
};

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  locacao_avulsa: 'Locação Avulsa',
  mensalista: 'Horário Mensal',
  aula: 'Aula / Escolinha',
  evento: 'Evento / Torneio',
  bloqueio: 'Bloqueio / Manutenção',
};

export const APPOINTMENT_TYPE_STYLES: Record<AppointmentType, { label: string; bg: string; text: string; border: string; barColor: string; pillColor: string }> = {
  locacao_avulsa: {
    label: 'Locação Avulsa',
    bg: 'bg-amber-50',
    text: 'text-amber-950',
    border: 'border-amber-300',
    barColor: 'bg-amber-500',
    pillColor: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  mensalista: {
    label: 'Horário Mensal',
    bg: 'bg-sky-50',
    text: 'text-sky-950',
    border: 'border-sky-300',
    barColor: 'bg-sky-500',
    pillColor: 'bg-sky-100 text-sky-900 border-sky-300',
  },
  aula: {
    label: 'Aula / Treino',
    bg: 'bg-emerald-50',
    text: 'text-emerald-950',
    border: 'border-emerald-300',
    barColor: 'bg-emerald-600',
    pillColor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  },
  evento: {
    label: 'Evento Multi-Espaço',
    bg: 'bg-purple-50',
    text: 'text-purple-950',
    border: 'border-purple-300',
    barColor: 'bg-purple-600',
    pillColor: 'bg-purple-100 text-purple-900 border-purple-300',
  },
  bloqueio: {
    label: 'Bloqueio Técnico',
    bg: 'bg-rose-50',
    text: 'text-rose-950',
    border: 'border-rose-300',
    barColor: 'bg-rose-500',
    pillColor: 'bg-rose-100 text-rose-900 border-rose-300',
  },
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, { label: string; badgeClass: string }> = {
  confirmada: {
    label: 'Confirmada',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  em_andamento: {
    label: 'Em Andamento',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200 animate-pulse',
  },
  concluida: {
    label: 'Concluída',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  cancelada: {
    label: 'Cancelada',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
  },
};

/**
 * Converte horário 'HH:mm' para minutos desde 00:00
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [h, m] = timeStr.trim().split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

/**
 * Converte minutos para string 'HH:mm'
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Valida se horário de término é estritamente posterior ao horário de início
 */
export function isEndTimeAfterStartTime(startTime: string, endTime: string): boolean {
  return timeToMinutes(endTime) > timeToMinutes(startTime);
}

/**
 * Verifica sobreposição de intervalo de tempo (meio-aberto: [start, end))
 * Uma reserva que termina às 20h NÃO sobrepõe outra que começa às 20h.
 */
export function intervalsOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const sA = timeToMinutes(startA);
  const eA = timeToMinutes(endA);
  const sB = timeToMinutes(startB);
  const eB = timeToMinutes(endB);

  return sA < eB && sB < eA;
}

/**
 * Retorna todos os espaços físicos que uma reserva ocupa.
 */
export function getAppointmentSpaces(appointment: { space: CourtSpace; spaces?: CourtSpace[] }): CourtSpace[] {
  if (appointment.spaces && appointment.spaces.length > 0) {
    return Array.from(new Set([appointment.space, ...appointment.spaces]));
  }
  return [appointment.space];
}

/**
 * Retorna a data no formato 'YYYY-MM-DD' para uma data acrescida de N dias.
 */
export function addDaysToDateKey(dateKey: string, daysToAdd: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + daysToAdd);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dayStr = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dayStr}`;
}

/**
 * Retorna o dia da semana (0 = Domingo, 1 = Segunda, ..., 6 = Sábado) para uma chave 'YYYY-MM-DD'
 */
export function getDayOfWeekFromDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  // Usa UTC para evitar alterações de fuso horário
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return d.getUTCDay();
}

/**
 * Formata chave de data para texto amigável em português
 * Ex: '2026-10-14' -> 'Quarta-feira, 14/10'
 */
export function formatDateKeyPortuguese(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekDays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const dayOfWeek = weekDays[d.getUTCDay()];
  return `${dayOfWeek}, ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

/**
 * Retorna array com as datas dos 7 dias da semana (começando no domingo ou segunda)
 */
export function getWeekDates(dateKey: string): string[] {
  const dayOfWeek = getDayOfWeekFromDateKey(dateKey);
  // Início na segunda-feira (se domingo, volta 6 dias; senão volta dayOfWeek - 1)
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = addDaysToDateKey(dateKey, -daysToMonday);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(addDaysToDateKey(monday, i));
  }
  return dates;
}

/**
 * Normaliza o nome do espaço para uso seguro em IDs do Firestore (sem espaços)
 */
export function normalizeSpaceId(space: CourtSpace): string {
  return space.replace(/\s+/g, '_');
}

/**
 * Retorna o ID único do documento de ocupação atômica para um espaço físico e data
 * Ex: 'occ_Areia_1_2026-10-15'
 */
export function getOccupancyDocId(space: CourtSpace, dateKey: string): string {
  return `occ_${normalizeSpaceId(space)}_${dateKey}`;
}

/**
 * Limite máximo suportado para séries recorrentes (1 ano = 365 dias)
 */
export const MAX_RECURRING_DAYS_LIMIT = 365;

/**
 * Calcula a diferença em dias corridos entre duas datas no formato YYYY-MM-DD
 */
export function differenceInDays(startDate: string, endDate: string): number {
  const [y1, m1, d1] = startDate.split('-').map(Number);
  const [y2, m2, d2] = endDate.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

/**
 * Gera a lista de faixas de horários ('HH:mm') entre o horário de abertura e fechamento
 */
export function generateOperatingTimeSlots(
  openTime: string,
  closeTime: string,
  intervalMinutes: number = 60
): string[] {
  const startMin = timeToMinutes(openTime);
  let endMin = timeToMinutes(closeTime);
  // Se fechamento for 00:00 (meia-noite), interpreta como 24:00 (1440 min)
  if (endMin <= startMin) {
    endMin = 24 * 60;
  }

  const slots: string[] = [];
  for (let m = startMin; m < endMin; m += intervalMinutes) {
    slots.push(minutesToTime(m));
  }
  return slots;
}
