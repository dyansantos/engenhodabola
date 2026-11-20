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

/**
 * Proteção contra injeção de fórmulas em planilhas (Excel/Calc/Sheets)
 * e escape de delimitador ";", aspas e quebras de linha.
 */
function escapeCsvCell(raw: string | number): string {
  let str = String(raw ?? '');
  if (/^\s*[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(cells: (string | number)[]): string {
  return cells.map(escapeCsvCell).join(';');
}

export interface BuildReceiptsCsvParams {
  rangeLabel: string;
  isOngoing: boolean;
  grouping: GroupingGranularity;
  aggregated: AggregatedReceiptsResult;
}

/**
 * Gera conteúdo CSV no padrão de planilhas brasileiras (BOM UTF-8, separador ";",
 * decimal com vírgula, datas dd/mm/aaaa e proteção contra injeção de fórmulas).
 * Inclui o resumo consolidado idêntico à tabela exibida e o detalhamento de lançamentos.
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
      'Este painel inclui comandas e locações. Mensalidades, eventos cobrados separadamente e despesas ainda não estão integrados.',
    ])
  );
  rows.push('');

  // Seção 1: Indicadores resumidos do período
  rows.push(toCsvRow(['RESUMO DO PERÍODO']));
  rows.push(toCsvRow(['Indicador', 'Valor (R$)']));
  rows.push(toCsvRow(['Recebido no período', formatCentsCsvBR(totals.totalCents)]));
  rows.push(toCsvRow(['Bar e cozinha (Comandas)', formatCentsCsvBR(totals.comandasCents)]));
  rows.push(toCsvRow(['Locações de quadras', formatCentsCsvBR(totals.locacoesCents)]));
  rows.push(toCsvRow(['Pix', formatCentsCsvBR(totals.byMethodCents.pix)]));
  rows.push(toCsvRow(['Dinheiro', formatCentsCsvBR(totals.byMethodCents.dinheiro)]));
  rows.push(toCsvRow(['Débito', formatCentsCsvBR(totals.byMethodCents.debito)]));
  rows.push(toCsvRow(['Crédito', formatCentsCsvBR(totals.byMethodCents.credito)]));
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
        formatCentsCsvBR(bucket.comandasCents),
        formatCentsCsvBR(bucket.locacoesCents),
        formatCentsCsvBR(bucket.totalCents),
        formatCentsCsvBR(bucket.byMethodCents.pix),
        formatCentsCsvBR(bucket.byMethodCents.dinheiro),
        formatCentsCsvBR(bucket.byMethodCents.debito),
        formatCentsCsvBR(bucket.byMethodCents.credito),
      ])
    );
  }

  rows.push(
    toCsvRow([
      'Total do período',
      formatCentsCsvBR(totals.comandasCents),
      formatCentsCsvBR(totals.locacoesCents),
      formatCentsCsvBR(totals.totalCents),
      formatCentsCsvBR(totals.byMethodCents.pix),
      formatCentsCsvBR(totals.byMethodCents.dinheiro),
      formatCentsCsvBR(totals.byMethodCents.debito),
      formatCentsCsvBR(totals.byMethodCents.credito),
    ])
  );
  rows.push('');

  // Seção 3: Detalhamento dos lançamentos
  rows.push(toCsvRow(['DETALHAMENTO DOS RECEBIMENTOS']));
  rows.push(
    toCsvRow([
      'Data',
      'Hora',
      'Origem',
      'Número',
      'Identificação',
      'Forma de pagamento',
      'Valor recebido (R$)',
      'Funcionário',
      'Recebimento conjunto',
    ])
  );

  for (const line of filteredLines) {
    const isJoint =
      !!line.jointPaymentKey && (jointPaymentCounts[line.jointPaymentKey] || 0) >= 2;
    rows.push(
      toCsvRow([
        formatDate(line.paidAtIso),
        formatTime(line.paidAtIso),
        line.origin === 'comanda' ? 'Comanda' : 'Locação',
        `#${line.refNumber}`,
        line.refLabel,
        METHOD_LABELS_PT[line.method],
        formatCentsCsvBR(line.amountCents),
        line.operatorName,
        isJoint ? 'Sim' : 'Não',
      ])
    );
  }

  // BOM UTF-8 para compatibilidade imediata com Excel em português
  return `\uFEFF${rows.join('\r\n')}`;
}
