'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useComandas } from '@/context/ComandasContext';
import { PaymentMethod } from '@/lib/types';
import { formatCents, getSaoPauloDateKey } from '@/lib/formatters';
import { ReceiptIssue, ReceiptLine } from '@/lib/reports/receipts';
import {
  backfillReceiptsFromHistory,
  BackfillExecutionResult,
  fetchReceiptsByDateRange,
} from '@/lib/reports/receipts-firestore';
import {
  aggregateReceipts,
  calculateCurrentPending,
  GroupingGranularity,
  PeriodBucket,
  PeriodPreset,
  resolvePeriodRange,
} from '@/lib/reports/aggregate';
import { buildReceiptsCsv } from '@/lib/reports/csv';
import { ReceiptsBarChart } from './ReceiptsBarChart';
import {
  ReceiptsReconciliationModal,
  ReconciliationScope,
} from './ReceiptsReconciliationModal';
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Database,
  Download,
  Info,
  Lock,
  QrCode,
  Receipt,
  RefreshCw,
  ShieldAlert,
  Users,
  Wallet,
} from 'lucide-react';

const PRESET_OPTIONS: { id: PeriodPreset; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'ontem', label: 'Ontem' },
  { id: 'esta_semana', label: 'Esta semana' },
  { id: 'este_mes', label: 'Este mês' },
  { id: 'personalizado', label: 'Período personalizado' },
];

const METHOD_META: {
  key: PaymentMethod;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeClass: string;
}[] = [
  {
    key: 'pix',
    label: 'Pix',
    icon: QrCode,
    badgeClass: 'bg-teal-50 text-teal-800',
  },
  {
    key: 'dinheiro',
    label: 'Dinheiro',
    icon: Banknote,
    badgeClass: 'bg-emerald-50 text-emerald-800',
  },
  {
    key: 'debito',
    label: 'Débito',
    icon: CreditCard,
    badgeClass: 'bg-sky-50 text-sky-800',
  },
  {
    key: 'credito',
    label: 'Crédito',
    icon: CreditCard,
    badgeClass: 'bg-indigo-50 text-indigo-800',
  },
];

export function RelatoriosView() {
  const {
    comandas,
    groupRentals,
    currentStaff,
    setActiveModule,
    setSelectedComandaId,
    setSelectedGroupRentalId,
    comandasLoaded,
    groupRentalsLoaded,
    comandasSyncError,
    groupRentalsSyncError,
  } = useComandas();

  const todayKey = getSaoPauloDateKey();
  const [preset, setPreset] = useState<PeriodPreset>('hoje');
  const [customStart, setCustomStart] = useState<string>(todayKey);
  const [customEnd, setCustomEnd] = useState<string>(todayKey);
  const [granularity, setGranularity] = useState<GroupingGranularity>('dia');
  const [showIssuesDetails, setShowIssuesDetails] = useState(false);
  const [reconciliationScope, setReconciliationScope] =
    useState<ReconciliationScope | null>(null);

  // Estado da consulta paginada na coleção `receipts`
  const [fetchedReceipts, setFetchedReceipts] = useState<{
    key: string;
    lines: ReceiptLine[];
    issues: ReceiptIssue[];
    error: string | null;
  } | null>(null);
  const [reloadTick, setReloadTick] = useState<number>(0);

  // Estado do backfill administrativo idempotente
  const [backfillRunning, setBackfillRunning] = useState<boolean>(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [backfillResult, setBackfillResult] = useState<BackfillExecutionResult | null>(null);
  const [showBackfillIssues, setShowBackfillIssues] = useState<boolean>(false);

  const isAdmin = currentStaff?.role === 'admin';

  // Intervalo de datas no fuso America/Sao_Paulo (semana segunda a domingo)
  const periodRange = useMemo(
    () => resolvePeriodRange(preset, new Date(), customStart, customEnd),
    [preset, customStart, customEnd]
  );

  const activeQueryKey =
    isAdmin && periodRange.isValid
      ? `${periodRange.startDateKey}..${periodRange.endDateKey}#${reloadTick}`
      : null;

  // Consulta paginada ao livro `receipts` no servidor para todo o intervalo [startDateKey, endDateKey]
  useEffect(() => {
    if (!activeQueryKey || !periodRange.isValid) {
      return;
    }

    let cancelled = false;
    const targetKey = activeQueryKey;

    fetchReceiptsByDateRange(periodRange.startDateKey, periodRange.endDateKey)
      .then(result => {
        if (cancelled) return;
        setFetchedReceipts({
          key: targetKey,
          lines: result.lines,
          issues: result.issues,
          error: null,
        });
      })
      .catch(err => {
        if (cancelled) return;
        console.error('[Relatorios] Falha ao consultar coleção receipts:', err);
        setFetchedReceipts({
          key: targetKey,
          lines: [],
          issues: [],
          error:
            err instanceof Error
              ? err.message
              : 'Não foi possível consultar o livro de recebimentos no servidor.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeQueryKey, periodRange.isValid, periodRange.startDateKey, periodRange.endDateKey]);

  const receiptsLoading = activeQueryKey !== null && fetchedReceipts?.key !== activeQueryKey;
  const isCurrentResult = activeQueryKey !== null && fetchedReceipts?.key === activeQueryKey;
  const receiptLines = useMemo(
    () => (isCurrentResult && fetchedReceipts ? fetchedReceipts.lines : []),
    [isCurrentResult, fetchedReceipts]
  );
  const receiptIssues = useMemo(
    () => (isCurrentResult && fetchedReceipts ? fetchedReceipts.issues : []),
    [isCurrentResult, fetchedReceipts]
  );
  const receiptsError = isCurrentResult && fetchedReceipts ? fetchedReceipts.error : null;

  // Consolidação única usada pelos indicadores, gráfico, tabela e CSV
  const aggregated = useMemo(() => {
    if (!periodRange.isValid || receiptsError) {
      return aggregateReceipts([], '', '');
    }
    return aggregateReceipts(
      receiptLines,
      periodRange.startDateKey,
      periodRange.endDateKey
    );
  }, [receiptLines, periodRange, receiptsError]);

  // Posição atual de pendências continua vindo das comandas e locações abertas
  const currentPending = useMemo(
    () => calculateCurrentPending(comandas, groupRentals),
    [comandas, groupRentals]
  );

  const activeBuckets: PeriodBucket[] = useMemo(() => {
    if (granularity === 'semana') return aggregated.weeklySeries;
    if (granularity === 'mes') return aggregated.monthlySeries;
    return aggregated.dailySeries;
  }, [granularity, aggregated]);

  // 1. Proteção de acesso na interface (apenas Administrador)
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-900">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Acesso Restrito ao Administrador
            </h1>
            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
              O painel gerencial de relatórios financeiros está disponível apenas para o perfil administrador do Engenho da Bola.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveModule('inicio')}
            className="inline-flex items-center justify-center rounded-xl bg-emerald-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors"
          >
            Voltar para o Início
          </button>
        </div>
      </div>
    );
  }

  const handleRunBackfill = async () => {
    if (!isAdmin || !currentStaff || backfillRunning) return;
    if (!comandasLoaded || !groupRentalsLoaded) return;

    setBackfillRunning(true);
    setBackfillError(null);

    try {
      const result = await backfillReceiptsFromHistory({
        comandas,
        groupRentals,
        adminUid: currentStaff.uid,
        adminName: currentStaff.name,
      });
      setBackfillResult(result);
      setShowBackfillIssues(result.invalidRecordsCount > 0);
      setReloadTick(t => t + 1);
    } catch (err) {
      console.error('[Relatorios] Falha no backfill de receipts:', err);
      setBackfillError(
        err instanceof Error
          ? err.message
          : 'Erro ao gerar livro de recebimentos a partir do histórico.'
      );
    } finally {
      setBackfillRunning(false);
    }
  };

  const handleExportCsv = () => {
    if (!periodRange.isValid || receiptsLoading || receiptsError) return;

    const csvContent = buildReceiptsCsv({
      rangeLabel: periodRange.label,
      isOngoing: periodRange.isOngoing,
      grouping: granularity,
      aggregated,
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fileSuffix =
      periodRange.startDateKey === periodRange.endDateKey
        ? periodRange.startDateKey
        : `${periodRange.startDateKey}_a_${periodRange.endDateKey}`;
    link.href = url;
    link.setAttribute('download', `relatorio-engenho-da-bola-${fileSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const openScopeModal = (nextScope: ReconciliationScope) => {
    setReconciliationScope(nextScope);
  };

  const pendingSyncError = comandasSyncError || groupRentalsSyncError;

  return (
    <div className="space-y-5">
      {/* Cabeçalho, Backfill Administrativo e Exportação */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Relatórios — Painel do Proprietário
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Consolidação a partir do livro de recebimentos no servidor (fuso America/Sao_Paulo)
          </p>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span>
              Este painel inclui comandas e locações. Mensalidades, eventos cobrados separadamente e despesas ainda não estão integrados.
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isAdmin && (
            <button
              type="button"
              onClick={handleRunBackfill}
              disabled={backfillRunning || !comandasLoaded || !groupRentalsLoaded}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 shadow-2xs hover:bg-slate-50 disabled:opacity-50 transition-colors"
              title="Lê pagamentos antigos de comandas e locações e preenche o livro receipts sem duplicar"
            >
              <Database className={`h-4 w-4 text-emerald-800 ${backfillRunning ? 'animate-pulse' : ''}`} />
              <span>
                {backfillRunning
                  ? 'Gerando livro...'
                  : 'Gerar livro de recebimentos a partir do histórico'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setReloadTick(t => t + 1)}
            disabled={receiptsLoading || !periodRange.isValid}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            title="Recarregar recebimentos do servidor"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${receiptsLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!periodRange.isValid || receiptsLoading || !!receiptsError}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-900 bg-emerald-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 disabled:opacity-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Resultado ou Erro do Backfill Administrativo */}
      {backfillError && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-xs text-red-950 flex items-start gap-2.5">
          <ShieldAlert className="h-4 w-4 text-red-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Falha ao executar geração do livro histórico</p>
            <p className="text-red-900">{backfillError}</p>
          </div>
        </div>
      )}

      {backfillResult && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50/90 p-4 text-xs text-emerald-950 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-800 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">
                  Backfill concluído: {backfillResult.createdCount}{' '}
                  {backfillResult.createdCount === 1 ? 'lançamento criado' : 'lançamentos criados'} ·{' '}
                  {backfillResult.skippedExistingCount}{' '}
                  {backfillResult.skippedExistingCount === 1
                    ? 'já existente preservado'
                    : 'já existentes preservados'}{' '}
                  · {backfillResult.invalidRecordsCount}{' '}
                  {backfillResult.invalidRecordsCount === 1
                    ? 'registro inválido ignorado'
                    : 'registros inválidos ignorados'}
                </p>
                <p className="text-emerald-900 mt-0.5">
                  Execução idempotente: nenhum recibo existente foi duplicado e nenhuma data foi inventada.
                </p>
              </div>
            </div>

            {backfillResult.invalidIssues.length > 0 && (
              <button
                type="button"
                onClick={() => setShowBackfillIssues(prev => !prev)}
                className="inline-flex items-center gap-1 self-start sm:self-center rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-semibold text-emerald-950 hover:bg-emerald-100 transition-colors shrink-0"
              >
                <span>{showBackfillIssues ? 'Ocultar inválidos' : 'Ver registros inválidos'}</span>
                {showBackfillIssues ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>

          {showBackfillIssues && backfillResult.invalidIssues.length > 0 && (
            <div className="mt-2 rounded-xl border border-emerald-200 bg-white p-3 divide-y divide-slate-100 max-h-48 overflow-y-auto">
              {backfillResult.invalidIssues.map(issue => (
                <div
                  key={`bf-${issue.origin}-${issue.refId}-${issue.id}`}
                  className="py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                >
                  <span className="font-semibold text-slate-900">
                    {issue.origin === 'comanda' ? 'Comanda' : issue.origin === 'locacao' ? 'Locação' : 'Origem desconhecida'}{' '}
                    #{issue.refNumber} ({issue.refLabel}) · ID {issue.id}
                  </span>
                  <span className="text-amber-900">{issue.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Aviso de Registros na coleção `receipts` com Inconsistência */}
      {receiptIssues.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">
                  {receiptIssues.length}{' '}
                  {receiptIssues.length === 1
                    ? 'documento no livro receipts ignorado por inconsistência de data, valor ou schema'
                    : 'documentos no livro receipts ignorados por inconsistência de data, valor ou schema'}
                </p>
                <p className="text-amber-900 mt-0.5">
                  Esses registros não foram atribuídos a outro dia nem somados nos totalizadores.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIssuesDetails(prev => !prev)}
              className="inline-flex items-center gap-1 self-start sm:self-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-950 hover:bg-amber-100 transition-colors shrink-0"
            >
              <span>{showIssuesDetails ? 'Ocultar detalhes' : 'Ver registros'}</span>
              {showIssuesDetails ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {showIssuesDetails && (
            <div className="mt-2 rounded-xl border border-amber-200 bg-white p-3 divide-y divide-amber-100 max-h-48 overflow-y-auto">
              {receiptIssues.map(issue => (
                <div
                  key={`${issue.origin}-${issue.refId}-${issue.id}`}
                  className="py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                >
                  <span className="font-semibold text-slate-900">
                    {issue.origin === 'comanda' ? 'Comanda' : issue.origin === 'locacao' ? 'Locação' : 'Origem desconhecida'}{' '}
                    #{issue.refNumber} ({issue.refLabel}) · ID {issue.id}
                  </span>
                  <span className="text-amber-900">{issue.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filtros por Período */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESET_OPTIONS.map(opt => {
              const active = preset === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPreset(opt.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-emerald-900 text-white shadow-2xs'
                      : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Sempre mostra as datas abrangidas pelo filtro */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-800 tabular-nums">
              <Calendar className="h-3.5 w-3.5 text-emerald-800" />
              <span>{periodRange.label}</span>
            </span>

            {periodRange.isValid && periodRange.isOngoing && (
              <span className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
                Valores parciais
              </span>
            )}
          </div>
        </div>

        {/* Seletor de Período Personalizado */}
        {preset === 'personalizado' && (
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Data inicial
              </label>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-emerald-700 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Data final
              </label>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-emerald-700 focus:outline-hidden"
              />
            </div>

            {!periodRange.isValid && periodRange.error && (
              <p className="text-xs font-semibold text-red-700 flex items-center gap-1 pb-1">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{periodRange.error}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Estado de Erro ou Carregamento da Consulta de Recebimentos (nunca exibe R$ 0,00 em caso de erro) */}
      {receiptsError ? (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-5 text-red-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-red-700 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs sm:text-sm">
              <p className="font-bold">
                Não foi possível carregar os recebimentos no servidor
              </p>
              <p className="text-red-900 leading-relaxed">{receiptsError}</p>
              <p className="text-xs text-red-800">
                Para evitar exibir valores zerados ou incompletos por engano, os totalizadores foram bloqueados até o restabelecimento da consulta em `receipts`.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReloadTick(t => t + 1)}
            className="shrink-0 rounded-xl bg-red-800 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      ) : receiptsLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white flex flex-col items-center justify-center py-16 text-center">
          <RefreshCw className="h-7 w-7 text-emerald-900 animate-spin mb-3" />
          <p className="text-sm font-semibold text-slate-800">
            Consultando livro de recebimentos no servidor...
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Buscando todas as páginas do período {periodRange.label}
          </p>
        </div>
      ) : (
        <>
          {/* Bloco 1: Indicadores Principais ("Recebido no período") */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                Recebido no período
              </h2>
              <span className="text-[11px] text-slate-500">
                Toque em qualquer card para conferir os lançamentos
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Total recebido no período */}
              <button
                type="button"
                onClick={() =>
                  openScopeModal({
                    title: 'Recebido no período (Total)',
                    subtitle: `Período: ${periodRange.label} · Comandas + Locações`,
                    expectedAmountCents: aggregated.totals.totalCents,
                  })
                }
                className="group rounded-2xl border border-emerald-200 bg-white p-4 text-left shadow-2xs hover:border-emerald-600 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900">
                    Recebido no período
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-900">
                    <Wallet className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2.5 text-2xl font-bold text-emerald-950 tabular-nums">
                  {formatCents(aggregated.totals.totalCents)}
                </p>
                <p className="mt-1 text-[11px] text-slate-500 group-hover:text-emerald-800 transition-colors">
                  {aggregated.totals.count}{' '}
                  {aggregated.totals.count === 1 ? 'lançamento' : 'lançamentos'} · Conferir →
                </p>
                {aggregated.totals.refundedCents > 0 && (
                  <p className="mt-1 text-[11px] font-semibold text-rose-700 tabular-nums">
                    Inclui {aggregated.totals.refundsCount}{' '}
                    {aggregated.totals.refundsCount === 1 ? 'estorno' : 'estornos'} (-
                    {formatCents(aggregated.totals.refundedCents)})
                  </p>
                )}
              </button>

              {/* Bar e cozinha (Comandas) */}
              <button
                type="button"
                onClick={() =>
                  openScopeModal({
                    title: 'Bar e cozinha (Comandas)',
                    subtitle: `Período: ${periodRange.label}`,
                    expectedAmountCents: aggregated.totals.comandasCents,
                    initialOrigin: 'comanda',
                  })
                }
                className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xs hover:border-emerald-600 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Bar e cozinha
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
                    <Receipt className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2.5 text-2xl font-bold text-slate-900 tabular-nums">
                  {formatCents(aggregated.totals.comandasCents)}
                </p>
                <p className="mt-1 text-[11px] text-slate-500 group-hover:text-emerald-800 transition-colors">
                  {aggregated.totals.comandasCount} em comandas · Conferir →
                </p>
              </button>

              {/* Locações de quadras */}
              <button
                type="button"
                onClick={() =>
                  openScopeModal({
                    title: 'Locações de quadras',
                    subtitle: `Período: ${periodRange.label} (somente parcela da quadra)`,
                    expectedAmountCents: aggregated.totals.locacoesCents,
                    initialOrigin: 'locacao',
                  })
                }
                className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xs hover:border-sky-600 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Locações de quadras
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-800">
                    <Users className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2.5 text-2xl font-bold text-slate-900 tabular-nums">
                  {formatCents(aggregated.totals.locacoesCents)}
                </p>
                <p className="mt-1 text-[11px] text-slate-500 group-hover:text-sky-800 transition-colors">
                  {aggregated.totals.locacoesCount} em locações · Conferir →
                </p>
              </button>
            </div>

            {/* Formas de pagamento */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Formas de pagamento
                </h3>
                <span className="text-[11px] text-slate-400">
                  Troco não é contabilizado como receita
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {METHOD_META.map(({ key, label, icon: Icon, badgeClass }) => {
                  const amount = aggregated.totals.byMethodCents[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        openScopeModal({
                          title: `Recebimentos via ${label}`,
                          subtitle: `Período: ${periodRange.label}`,
                          expectedAmountCents: amount,
                          initialMethod: key,
                        })
                      }
                      className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-left hover:border-emerald-600 hover:bg-white transition-all"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-700">{label}</span>
                        <span className={`flex h-6 w-6 items-center justify-center rounded-md ${badgeClass}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                      </div>
                      <p className="mt-2 text-base sm:text-lg font-bold text-slate-900 tabular-nums">
                        {formatCents(amount)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Bloco 2: Recebimentos por dia (Gráfico + Tabela + Alternância Dia/Semana/Mês) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Recebimentos por dia
                </h2>
                <p className="text-xs text-slate-500">
                  Evolução do período ({periodRange.label}) — clique em uma barra ou linha para conferir
                </p>
              </div>

              {/* Alternar Dia / Semana / Mês */}
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 self-start sm:self-auto">
                {(
                  [
                    { id: 'dia', label: 'Dia' },
                    { id: 'semana', label: 'Semana' },
                    { id: 'mes', label: 'Mês' },
                  ] as { id: GroupingGranularity; label: string }[]
                ).map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setGranularity(tab.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                      granularity === tab.id
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Gráfico SVG simples */}
            <ReceiptsBarChart
              buckets={activeBuckets}
              granularity={granularity}
              onSelectBucket={bucket =>
                openScopeModal({
                  title: `Lançamentos de ${bucket.label}`,
                  subtitle: `Total do recorte: ${formatCents(bucket.totalCents)}`,
                  expectedAmountCents: bucket.totalCents,
                  startDateKey: bucket.startDateKey,
                  endDateKey: bucket.endDateKey,
                })
              }
            />

            {/* Tabela de Resumo */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs border-collapse min-w-[740px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    <th className="px-3 py-2.5">Data ou intervalo</th>
                    <th className="px-3 py-2.5 text-right">Bar e cozinha</th>
                    <th className="px-3 py-2.5 text-right">Locações</th>
                    <th className="px-3 py-2.5 text-right text-emerald-950">Total recebido</th>
                    <th className="px-3 py-2.5 text-right">Pix</th>
                    <th className="px-3 py-2.5 text-right">Dinheiro</th>
                    <th className="px-3 py-2.5 text-right">Débito</th>
                    <th className="px-3 py-2.5 text-right">Crédito</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeBuckets.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                        Nenhum dia no intervalo selecionado.
                      </td>
                    </tr>
                  ) : (
                    activeBuckets.map(bucket => (
                      <tr
                        key={bucket.key}
                        onClick={() =>
                          openScopeModal({
                            title: `Lançamentos de ${bucket.label}`,
                            subtitle: `Total do recorte: ${formatCents(bucket.totalCents)}`,
                            expectedAmountCents: bucket.totalCents,
                            startDateKey: bucket.startDateKey,
                            endDateKey: bucket.endDateKey,
                          })
                        }
                        className="cursor-pointer hover:bg-emerald-50/40 transition-colors"
                      >
                        <td className="px-3 py-2.5 font-semibold text-slate-900 whitespace-nowrap">
                          {bucket.label}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                          {formatCents(bucket.comandasCents)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                          {formatCents(bucket.locacoesCents)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold text-emerald-950">
                          {formatCents(bucket.totalCents)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                          {formatCents(bucket.byMethodCents.pix)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                          {formatCents(bucket.byMethodCents.dinheiro)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                          {formatCents(bucket.byMethodCents.debito)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                          {formatCents(bucket.byMethodCents.credito)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
                    <td className="px-3 py-2.5">Total do período</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatCents(aggregated.totals.comandasCents)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatCents(aggregated.totals.locacoesCents)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-950">
                      {formatCents(aggregated.totals.totalCents)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatCents(aggregated.totals.byMethodCents.pix)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatCents(aggregated.totals.byMethodCents.dinheiro)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatCents(aggregated.totals.byMethodCents.debito)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatCents(aggregated.totals.byMethodCents.credito)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Bloco 3: Pendências atuais (Comandas e locações abertas, fora do filtro de período) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">
              Pendências atuais
            </h2>
            <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700">
              Posição atual
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            Valores em aberto no momento (independente do filtro de período, não somado aos recebimentos)
          </span>
        </div>

        {pendingSyncError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-900 flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-red-700 shrink-0 mt-0.5" />
            <span>
              Não foi possível carregar as pendências atuais de comandas/locações: {pendingSyncError}
            </span>
          </div>
        ) : !comandasLoaded || !groupRentalsLoaded ? (
          <div className="py-4 text-xs text-slate-500 flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-emerald-800" />
            <span>Sincronizando comandas e locações abertas...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <span className="text-[11px] font-semibold uppercase text-slate-500">
                Saldo pendente — Comandas
              </span>
              <p className="mt-1.5 text-xl font-bold text-slate-900 tabular-nums">
                {formatCents(currentPending.comandasPendingCents)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {currentPending.openComandasCount}{' '}
                {currentPending.openComandasCount === 1 ? 'comanda aberta' : 'comandas abertas'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <span className="text-[11px] font-semibold uppercase text-slate-500">
                Saldo pendente — Locações
              </span>
              <p className="mt-1.5 text-xl font-bold text-slate-900 tabular-nums">
                {formatCents(currentPending.locacoesPendingCents)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {currentPending.openLocacoesCount}{' '}
                {currentPending.openLocacoesCount === 1 ? 'locação aberta' : 'locações abertas'}
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
              <span className="text-[11px] font-semibold uppercase text-amber-900">
                Total pendente atual
              </span>
              <p className="mt-1.5 text-xl font-bold text-amber-950 tabular-nums">
                {formatCents(currentPending.totalPendingCents)}
              </p>
              <p className="text-[11px] text-amber-900/80 mt-0.5">
                Posição atual em aberto para recebimento futuro
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Bloco 4: Módulos ainda não integrados (Sem números fictícios) */}
      <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
          Módulos financeiros ainda não integrados
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 flex items-center justify-between">
            <span className="font-semibold text-slate-700">Mensalidades</span>
            <span className="text-[11px] font-medium text-slate-500">Ainda não integrado</span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 flex items-center justify-between">
            <span className="font-semibold text-slate-700">Eventos cobrados à parte</span>
            <span className="text-[11px] font-medium text-slate-500">Ainda não integrado</span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 flex items-center justify-between">
            <span className="font-semibold text-slate-700">Despesas e custos</span>
            <span className="text-[11px] font-medium text-slate-500">Ainda não integrado</span>
          </div>
        </div>
      </section>

      {/* Modal de Conferência de Lançamentos */}
      {reconciliationScope && (
        <ReceiptsReconciliationModal
          scope={reconciliationScope}
          allPeriodLines={aggregated.filteredLines}
          jointPaymentCounts={aggregated.jointPaymentCounts}
          onClose={() => setReconciliationScope(null)}
          onOpenComanda={comandaId => setSelectedComandaId(comandaId)}
          onOpenGroupRental={rentalId => setSelectedGroupRentalId(rentalId)}
        />
      )}
    </div>
  );
}
