import { PaymentMethod } from '@/lib/types';
import { formatDate, formatTime } from '@/lib/formatters';
import {
  AggregatedReceiptsResult,
  GroupingGranularity,
  PeriodBucket,
} from './aggregate';

const METHOD_LABELS_PT: Record<PaymentMethod, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  debito: 'Débito',
  credito: 'Crédito',
};

const GRANULARITY_LABELS_PT: Record<GroupingGranularity, string> = {
  dia: 'Por dia',
  semana: 'Por semana (segunda a domingo)',
  mes: 'Por mês',
};

function formatCentsCsvBR(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

type CsvCell = string | { kind: 'number'; value: string };

function csvNumberCents(cents: number): CsvCell {
  return { kind: 'number', value: formatCentsCsvBR(cents) };
}

/**
 * Proteção contra injeção de fórmulas em planilhas (Excel/Calc/Sheets)
 * aplicada exclusivamente a campos de texto livre.
 * Números gerados pelo sistema (como -60,00) NÃO passam por este escape.
 */
function escapeCsvTextCell(raw: string): string {
  let str = String(raw ?? '');
  if (/^\s*[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatCsvCell(cell: CsvCell): string {
  if (typeof cell !== 'string') {
    return cell.value;
  }
  return escapeCsvTextCell(cell);
}

function toCsvRow(cells: CsvCell[]): string {
  return cells.map(formatCsvCell).join(';');
}

export interface BuildReceiptsCsvParams {
  rangeLabel: string;
  isOngoing: boolean;
  grouping: GroupingGranularity;
  aggregated: AggregatedReceiptsResult;
}

/**
 * Gera conteúdo CSV no padrão de planilhas brasileiras (BOM UTF-8, separador ";",
 * decimal com vírgula, datas dd/mm/aaaa e proteção contra injeção de fórmulas em textos livres).
 * Inclui o resumo consolidado idêntico à tabela exibida e o detalhamento de lançamentos (incluindo estornos).
 */
export function buildReceiptsCsv({
  rangeLabel,
  isOngoing,
  grouping,
  aggregated,
}: BuildReceiptsCsvParams): string {
  const { totals, dailySeries, weeklySeries, monthlySeries, filteredLines, jointPaymentCounts } =
    aggregated;

  const activeSeries: PeriodBucket[] =
    grouping === 'semana'
      ? weeklySeries
      : grouping === 'mes'
      ? monthlySeries
      : dailySeries;

  const rows: string[] = [];

  // Cabeçalho do relatório
  rows.push(toCsvRow(['Engenho da Bola — Relatório de Recebimentos']));
  rows.push(toCsvRow(['Período consultado', isOngoing ? `${rangeLabel} (Valores parciais)` : rangeLabel]));
  rows.push(toCsvRow(['Agrupamento', GRANULARITY_LABELS_PT[grouping]]));
  rows.push(
    toCsvRow([
      'Escopo',
      'Este painel inclui comandas e locações (recebimentos e estornos). Mensalidades, eventos cobrados separadamente e despesas ainda não estão integrados.',
    ])
  );
  rows.push('');

  // Seção 1: Indicadores resumidos do período
  rows.push(toCsvRow(['RESUMO DO PERÍODO']));
  rows.push(toCsvRow(['Indicador', 'Valor (R$)']));
  rows.push(toCsvRow(['Recebido no período', csvNumberCents(totals.totalCents)]));
  if (totals.refundedCents > 0) {
    rows.push(toCsvRow(['Recebido bruto no período', csvNumberCents(totals.grossReceivedCents)]));
    rows.push(toCsvRow(['Estornos no período', csvNumberCents(-totals.refundedCents)]));
  }
  rows.push(toCsvRow(['Bar e cozinha (Comandas)', csvNumberCents(totals.comandasCents)]));
  rows.push(toCsvRow(['Locações de quadras', csvNumberCents(totals.locacoesCents)]));
  rows.push(toCsvRow(['Pix', csvNumberCents(totals.byMethodCents.pix)]));
  rows.push(toCsvRow(['Dinheiro', csvNumberCents(totals.byMethodCents.dinheiro)]));
  rows.push(toCsvRow(['Débito', csvNumberCents(totals.byMethodCents.debito)]));
  rows.push(toCsvRow(['Crédito', csvNumberCents(totals.byMethodCents.credito)]));
  rows.push('');

  // Seção 2: Tabela consolidada (espelho exato da tabela exibida)
  rows.push(toCsvRow([`CONSOLIDAÇÃO (${GRANULARITY_LABELS_PT[grouping].toUpperCase()})`]));
  rows.push(
    toCsvRow([
      'Data ou intervalo',
      'Bar e cozinha (R$)',
      'Locações (R$)',
      'Total recebido (R$)',
      'Pix (R$)',
      'Dinheiro (R$)',
      'Débito (R$)',
      'Crédito (R$)',
    ])
  );

  for (const bucket of activeSeries) {
    rows.push(
      toCsvRow([
        bucket.label,
        csvNumberCents(bucket.comandasCents),
        csvNumberCents(bucket.locacoesCents),
        csvNumberCents(bucket.totalCents),
        csvNumberCents(bucket.byMethodCents.pix),
        csvNumberCents(bucket.byMethodCents.dinheiro),
        csvNumberCents(bucket.byMethodCents.debito),
        csvNumberCents(bucket.byMethodCents.credito),
      ])
    );
  }

  rows.push(
    toCsvRow([
      'Total do período',
      csvNumberCents(totals.comandasCents),
      csvNumberCents(totals.locacoesCents),
      csvNumberCents(totals.totalCents),
      csvNumberCents(totals.byMethodCents.pix),
      csvNumberCents(totals.byMethodCents.dinheiro),
      csvNumberCents(totals.byMethodCents.debito),
      csvNumberCents(totals.byMethodCents.credito),
    ])
  );
  rows.push('');

  // Seção 3: Detalhamento dos lançamentos
  rows.push(toCsvRow(['DETALHAMENTO DOS RECEBIMENTOS']));
  rows.push(
    toCsvRow([
      'Data',
      'Hora',
      'Tipo',
      'Origem',
      'Número',
      'Identificação',
      'Forma de pagamento',
      'Valor recebido (R$)',
      'Funcionário',
      'Recebimento conjunto',
      'Motivo do estorno',
    ])
  );

  for (const line of filteredLines) {
    const isRefund = line.kind === 'estorno';
    const isJoint =
      !!line.jointPaymentKey && (jointPaymentCounts[line.jointPaymentKey] || 0) >= 2;
    const signedCents = isRefund ? -line.amountCents : line.amountCents;

    rows.push(
      toCsvRow([
        formatDate(line.paidAtIso),
        formatTime(line.paidAtIso),
        isRefund ? 'Estorno' : 'Recebimento',
        line.origin === 'comanda' ? 'Comanda' : 'Locação',
        `#${line.refNumber}`,
        line.refLabel,
        METHOD_LABELS_PT[line.method],
        csvNumberCents(signedCents),
        line.operatorName,
        isJoint ? 'Sim' : 'Não',
        isRefund ? line.reason || '' : '',
      ])
    );
  }

  // BOM UTF-8 para compatibilidade imediata com Excel em português
  return `\uFEFF${rows.join('\r\n')}`;
}
