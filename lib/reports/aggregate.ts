import { Comanda, GroupRental, PaymentMethod } from '@/lib/types';
import { calculateComandaTotals, getSaoPauloDateKey } from '@/lib/formatters';
import { ReceiptLine } from './receipts';

export type PeriodPreset = 'hoje' | 'ontem' | 'esta_semana' | 'este_mes' | 'personalizado';
export type GroupingGranularity = 'dia' | 'semana' | 'mes';

export interface ReceiptTotals {
  totalCents: number;
  grossReceivedCents: number;
  refundedCents: number;
  refundsCount: number;
  comandasCents: number;
  locacoesCents: number;
  byMethodCents: Record<PaymentMethod, number>;
  count: number;
  comandasCount: number;
  locacoesCount: number;
}

export interface PeriodBucket extends ReceiptTotals {
  key: string;
  label: string;
  shortLabel: string;
  startDateKey: string;
  endDateKey: string;
}

export interface PeriodRangeResult {
  startDateKey: string;
  endDateKey: string;
  label: string;
  isOngoing: boolean;
  isValid: boolean;
  error?: string;
}

export interface AggregatedReceiptsResult {
  startDateKey: string;
  endDateKey: string;
  filteredLines: ReceiptLine[];
  totals: ReceiptTotals;
  dailySeries: PeriodBucket[];
  weeklySeries: PeriodBucket[];
  monthlySeries: PeriodBucket[];
  jointPaymentCounts: Record<string, number>;
}

export interface CurrentPendingSummary {
  comandasPendingCents: number;
  openComandasCount: number;
  locacoesPendingCents: number;
  openLocacoesCount: number;
  totalPendingCents: number;
}

const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function createEmptyTotals(): ReceiptTotals {
  return {
    totalCents: 0,
    grossReceivedCents: 0,
    refundedCents: 0,
    refundsCount: 0,
    comandasCents: 0,
    locacoesCents: 0,
    byMethodCents: {
      pix: 0,
      dinheiro: 0,
      debito: 0,
      credito: 0,
    },
    count: 0,
    comandasCount: 0,
    locacoesCount: 0,
  };
}

function addLineToTotals(target: ReceiptTotals, line: ReceiptLine) {
  const isRefund = line.kind === 'estorno';
  const signedAmount = isRefund ? -line.amountCents : line.amountCents;
  target.totalCents += signedAmount;
  if (isRefund) {
    target.refundedCents += line.amountCents;
    target.refundsCount += 1;
  } else {
    target.grossReceivedCents += line.amountCents;
  }
  target.count += 1;
  if (line.origin === 'comanda') {
    target.comandasCents += signedAmount;
    target.comandasCount += 1;
  } else {
    target.locacoesCents += signedAmount;
    target.locacoesCount += 1;
  }
  target.byMethodCents[line.method] += signedAmount;
}

function mergeTotals(target: ReceiptTotals, source: ReceiptTotals) {
  target.totalCents += source.totalCents;
  target.grossReceivedCents += source.grossReceivedCents;
  target.refundedCents += source.refundedCents;
  target.refundsCount += source.refundsCount;
  target.comandasCents += source.comandasCents;
  target.locacoesCents += source.locacoesCents;
  target.byMethodCents.pix += source.byMethodCents.pix;
  target.byMethodCents.dinheiro += source.byMethodCents.dinheiro;
  target.byMethodCents.debito += source.byMethodCents.debito;
  target.byMethodCents.credito += source.byMethodCents.credito;
  target.count += source.count;
  target.comandasCount += source.comandasCount;
  target.locacoesCount += source.locacoesCount;
}

function isValidDateKey(dateKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

export function formatDateKeyBR(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  const [y, m, d] = dateKey.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateRangeLabel(startDateKey: string, endDateKey: string): string {
  if (!isValidDateKey(startDateKey) || !isValidDateKey(endDateKey)) {
    return `${startDateKey} a ${endDateKey}`;
  }
  if (startDateKey === endDateKey) {
    return formatDateKeyBR(startDateKey);
  }
  const [y1, m1, d1] = startDateKey.split('-');
  const [y2, m2, d2] = endDateKey.split('-');
  if (y1 === y2) {
    return `${d1}/${m1} a ${d2}/${m2}/${y2}`;
  }
  return `${d1}/${m1}/${y1} a ${d2}/${m2}/${y2}`;
}

function getMondayOfWeek(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=Dom, 1=Seg, ..., 6=Sab
  const offsetFromMonday = (dow + 6) % 7;
  return addDaysToDateKey(dateKey, -offsetFromMonday);
}

function getLastDayOfMonth(year: number, month1Based: number): string {
  const dt = new Date(Date.UTC(year, month1Based, 0));
  return dt.toISOString().slice(0, 10);
}

/**
 * Resolve o intervalo de datas no fuso horário America/Sao_Paulo.
 * Semanas consideram estritamente Segunda a Domingo.
 */
export function resolvePeriodRange(
  preset: PeriodPreset,
  now: Date = new Date(),
  customStart?: string,
  customEnd?: string
): PeriodRangeResult {
  const todayKey = getSaoPauloDateKey(now);

  if (preset === 'hoje') {
    return {
      startDateKey: todayKey,
      endDateKey: todayKey,
      label: formatDateRangeLabel(todayKey, todayKey),
      isOngoing: true,
      isValid: true,
    };
  }

  if (preset === 'ontem') {
    const yesterdayKey = addDaysToDateKey(todayKey, -1);
    return {
      startDateKey: yesterdayKey,
      endDateKey: yesterdayKey,
      label: formatDateRangeLabel(yesterdayKey, yesterdayKey),
      isOngoing: false,
      isValid: true,
    };
  }

  if (preset === 'esta_semana') {
    const mondayKey = getMondayOfWeek(todayKey);
    const sundayKey = addDaysToDateKey(mondayKey, 6);
    return {
      startDateKey: mondayKey,
      endDateKey: sundayKey,
      label: formatDateRangeLabel(mondayKey, sundayKey),
      isOngoing: todayKey >= mondayKey && todayKey <= sundayKey,
      isValid: true,
    };
  }

  if (preset === 'este_mes') {
    const [yStr, mStr] = todayKey.split('-');
    const firstDayKey = `${yStr}-${mStr}-01`;
    const lastDayKey = getLastDayOfMonth(Number(yStr), Number(mStr));
    return {
      startDateKey: firstDayKey,
      endDateKey: lastDayKey,
      label: formatDateRangeLabel(firstDayKey, lastDayKey),
      isOngoing: todayKey >= firstDayKey && todayKey <= lastDayKey,
      isValid: true,
    };
  }

  // Período personalizado
  const start = (customStart || '').trim();
  const end = (customEnd || '').trim();

  if (!isValidDateKey(start) || !isValidDateKey(end)) {
    return {
      startDateKey: todayKey,
      endDateKey: todayKey,
      label: 'Período inválido',
      isOngoing: false,
      isValid: false,
      error: 'Informe datas inicial e final válidas.',
    };
  }

  if (start > end) {
    return {
      startDateKey: start,
      endDateKey: end,
      label: `${formatDateKeyBR(start)} a ${formatDateKeyBR(end)}`,
      isOngoing: false,
      isValid: false,
      error: 'A data inicial não pode ser posterior à data final.',
    };
  }

  return {
    startDateKey: start,
    endDateKey: end,
    label: formatDateRangeLabel(start, end),
    isOngoing: todayKey >= start && todayKey <= end,
    isValid: true,
  };
}

/**
 * Consolida um único conjunto de ReceiptLines para o intervalo informado,
 * gerando totais, série diária completa (com dias zerados), semanal (Seg-Dom) e mensal.
 */
export function aggregateReceipts(
  allLines: ReceiptLine[],
  startDateKey: string,
  endDateKey: string
): AggregatedReceiptsResult {
  const jointPaymentCounts: Record<string, number> = {};
  for (const line of allLines) {
    if (line.kind !== 'estorno' && line.jointPaymentKey) {
      jointPaymentCounts[line.jointPaymentKey] = (jointPaymentCounts[line.jointPaymentKey] || 0) + 1;
    }
  }

  const validRange = isValidDateKey(startDateKey) && isValidDateKey(endDateKey) && startDateKey <= endDateKey;

  if (!validRange) {
    return {
      startDateKey,
      endDateKey,
      filteredLines: [],
      totals: createEmptyTotals(),
      dailySeries: [],
      weeklySeries: [],
      monthlySeries: [],
      jointPaymentCounts,
    };
  }

  const filteredLines = allLines
    .filter(line => line.dateKey >= startDateKey && line.dateKey <= endDateKey)
    .sort((a, b) => b.paidAtIso.localeCompare(a.paidAtIso));

  const totals = createEmptyTotals();
  const dayMap = new Map<string, PeriodBucket>();

  // Enumera todos os dias do intervalo (incluindo dias sem movimento com zero)
  let cursor = startDateKey;
  let guard = 0;
  while (cursor <= endDateKey && guard < 4000) {
    const [, m, d] = cursor.split('-');
    dayMap.set(cursor, {
      ...createEmptyTotals(),
      key: cursor,
      label: formatDateKeyBR(cursor),
      shortLabel: `${d}/${m}`,
      startDateKey: cursor,
      endDateKey: cursor,
    });
    cursor = addDaysToDateKey(cursor, 1);
    guard += 1;
  }

  for (const line of filteredLines) {
    addLineToTotals(totals, line);
    const bucket = dayMap.get(line.dateKey);
    if (bucket) {
      addLineToTotals(bucket, line);
    }
  }

  const dailySeries = Array.from(dayMap.values());

  // Agrupamento Semanal (Segunda a Domingo) preservando exatamente os dias do período
  const weekMap = new Map<string, PeriodBucket>();
  for (const day of dailySeries) {
    const mondayKey = getMondayOfWeek(day.key);
    let weekBucket = weekMap.get(mondayKey);
    if (!weekBucket) {
      weekBucket = {
        ...createEmptyTotals(),
        key: mondayKey,
        label: formatDateRangeLabel(day.startDateKey, day.endDateKey),
        shortLabel: day.shortLabel,
        startDateKey: day.startDateKey,
        endDateKey: day.endDateKey,
      };
      weekMap.set(mondayKey, weekBucket);
    } else {
      weekBucket.endDateKey = day.endDateKey;
      weekBucket.label = formatDateRangeLabel(weekBucket.startDateKey, weekBucket.endDateKey);
      const [sm, sd] = weekBucket.startDateKey.split('-').slice(1);
      const [em, ed] = weekBucket.endDateKey.split('-').slice(1);
      weekBucket.shortLabel =
        weekBucket.startDateKey === weekBucket.endDateKey
          ? `${sd}/${sm}`
          : `${sd}/${sm}-${ed}/${em}`;
    }
    mergeTotals(weekBucket, day);
  }
  const weeklySeries = Array.from(weekMap.values());

  // Agrupamento Mensal preservando exatamente os dias do período
  const monthMap = new Map<string, PeriodBucket>();
  for (const day of dailySeries) {
    const monthKey = day.key.slice(0, 7); // YYYY-MM
    const [yStr, mStr] = monthKey.split('-');
    const monthName = MONTH_NAMES_PT[Number(mStr) - 1] || mStr;

    let monthBucket = monthMap.get(monthKey);
    if (!monthBucket) {
      monthBucket = {
        ...createEmptyTotals(),
        key: monthKey,
        label: `${monthName}/${yStr} (${formatDateRangeLabel(day.startDateKey, day.endDateKey)})`,
        shortLabel: `${mStr}/${yStr}`,
        startDateKey: day.startDateKey,
        endDateKey: day.endDateKey,
      };
      monthMap.set(monthKey, monthBucket);
    } else {
      monthBucket.endDateKey = day.endDateKey;
      monthBucket.label = `${monthName}/${yStr} (${formatDateRangeLabel(monthBucket.startDateKey, monthBucket.endDateKey)})`;
    }
    mergeTotals(monthBucket, day);
  }
  const monthlySeries = Array.from(monthMap.values());

  return {
    startDateKey,
    endDateKey,
    filteredLines,
    totals,
    dailySeries,
    weeklySeries,
    monthlySeries,
    jointPaymentCounts,
  };
}

/**
 * Calcula a posição atual de pendências (fora do filtro de período).
 * Nunca somar pendências aos recebimentos.
 */
export function calculateCurrentPending(
  comandas: Comanda[],
  groupRentals: GroupRental[]
): CurrentPendingSummary {
  let comandasPendingCents = 0;
  let openComandasCount = 0;

  for (const cmd of comandas || []) {
    if (cmd.status === 'aberta') {
      openComandasCount += 1;
      const { balanceCents } = calculateComandaTotals(cmd);
      comandasPendingCents += balanceCents;
    }
  }

  let locacoesPendingCents = 0;
  let openLocacoesCount = 0;

  for (const rental of groupRentals || []) {
    if (rental.status === 'aberta') {
      openLocacoesCount += 1;
      const totalAmountCents = Math.max(0, Math.floor(rental.totalAmountCents || 0));
      const paidCents = (rental.participants || []).reduce(
        (sum, p) => sum + Math.max(0, Math.floor(p.paidAmountCents || 0)),
        0
      );
      locacoesPendingCents += Math.max(0, totalAmountCents - paidCents);
    }
  }

  return {
    comandasPendingCents,
    openComandasCount,
    locacoesPendingCents,
    openLocacoesCount,
    totalPendingCents: comandasPendingCents + locacoesPendingCents,
  };
}
