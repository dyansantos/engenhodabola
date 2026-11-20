'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useComandas } from '@/context/ComandasContext';
import { formatCents } from '@/lib/formatters';
import { aggregateReceipts, AggregatedReceiptsResult } from '@/lib/reports/aggregate';
import { ReceiptIssue, ReceiptLine } from '@/lib/reports/receipts';
import { fetchReceiptsByDateRange } from '@/lib/reports/receipts-firestore';
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  Info,
  RefreshCw,
  ShieldAlert,
  Wallet,
} from 'lucide-react';

export interface CaixaAdminContentProps {
  todayDateKey: string;
  isLoading: boolean;
  error: string | null;
  summary: AggregatedReceiptsResult | null;
  issues: ReceiptIssue[];
  onRetry: () => void;
}

export function CaixaAdminContent({
  todayDateKey,
  isLoading,
  error,
  summary,
  issues,
  onRetry,
}: CaixaAdminContentProps) {
  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Caixa do Dia
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Recebimentos reais registrados no livro oficial em {todayDateKey} (America/Sao_Paulo)
          </p>
        </div>

        <button
          type="button"
          onClick={onRetry}
          disabled={isLoading}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* Aviso explícito sobre fechamento de caixa */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
        <Info className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-sm">
            Fechamento de caixa: ainda não integrado
          </p>
          <p className="mt-0.5 text-amber-900 leading-relaxed">
            Fundo de troco, sangrias e conferência física de gaveta ainda não estão integrados e não entram nos valores exibidos abaixo. Os totais desta tela refletem exclusivamente os recebimentos reais gravados na coleção oficial de recebimentos do dia de hoje.
          </p>
        </div>
      </div>

      {/* Estado de erro */}
      {error && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-red-950">
                Erro ao consultar os recebimentos do dia
              </p>
              <p className="mt-0.5 text-red-800">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-lg bg-red-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-800"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Estado de carregamento (sem exibir zero ou R$ 0,00) */}
      {!error && (isLoading || !summary) && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-2xs">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-emerald-900 mb-2" />
          <p className="text-sm font-semibold text-slate-800">Carregando…</p>
          <p className="mt-1 text-xs text-slate-500">
            Consultando lançamentos oficiais de recebimentos de hoje
          </p>
        </div>
      )}

      {/* Dados reais carregados */}
      {!error && !isLoading && summary && (
        <>
          {issues.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950">
              <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  Atenção: {issues.length}{' '}
                  {issues.length === 1
                    ? 'lançamento com inconsistência'
                    : 'lançamentos com inconsistências'}{' '}
                  no livro de recebimentos
                </p>
                <p className="mt-0.5 text-amber-900">
                  Verifique os detalhes em Relatórios para conferência administrativa.
                </p>
              </div>
            </div>
          )}

          {/* Cards principais: Dinheiro recebido hoje e Total recebido hoje */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-200 bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Recebido hoje em dinheiro (comandas e locações)
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-900">
                  <Banknote className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-emerald-950 tabular-nums">
                {formatCents(summary.totals.byMethodCents.dinheiro)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Valor líquido efetivamente recebido em espécie no livro oficial (troco não entra como receita).
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Recebido hoje: comandas e locações
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  <Wallet className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-900 tabular-nums">
                {formatCents(summary.totals.totalCents)}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                <span>
                  Comandas (Bar): {formatCents(summary.totals.comandasCents)}
                </span>
                <span>·</span>
                <span>
                  Locações em grupo: {formatCents(summary.totals.locacoesCents)}
                </span>
                <span>·</span>
                <span>
                  {summary.totals.count}{' '}
                  {summary.totals.count === 1 ? 'lançamento' : 'lançamentos'}
                </span>
              </div>
              {summary.totals.refundedCents > 0 && (
                <p className="mt-1.5 text-[11px] font-semibold text-rose-700 tabular-nums">
                  Inclui {summary.totals.refundsCount}{' '}
                  {summary.totals.refundsCount === 1 ? 'estorno' : 'estornos'} de -
                  {formatCents(summary.totals.refundedCents)} hoje (bruto{' '}
                  {formatCents(summary.totals.grossReceivedCents)})
                </p>
              )}
            </div>
          </div>

          {/* Detalhamento por Forma de Pagamento */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <h2 className="text-base font-bold text-slate-900 mb-1">
              Recebido hoje por forma de pagamento (comandas e locações)
            </h2>
            <p className="text-xs text-slate-500 mb-3">
              Somatório exclusivo dos lançamentos oficiais da data de hoje em America/Sao_Paulo
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="text-slate-500 font-medium">Pix</span>
                <p className="mt-1 text-base font-bold text-slate-900 tabular-nums">
                  {formatCents(summary.totals.byMethodCents.pix)}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="text-slate-500 font-medium">Dinheiro em Espécie</span>
                <p className="mt-1 text-base font-bold text-slate-900 tabular-nums">
                  {formatCents(summary.totals.byMethodCents.dinheiro)}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="text-slate-500 font-medium">Cartão de Débito</span>
                <p className="mt-1 text-base font-bold text-slate-900 tabular-nums">
                  {formatCents(summary.totals.byMethodCents.debito)}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="text-slate-500 font-medium">Cartão de Crédito</span>
                <p className="mt-1 text-base font-bold text-slate-900 tabular-nums">
                  {formatCents(summary.totals.byMethodCents.credito)}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function CaixaView() {
  const { currentStaff, setActiveModule, currentSaoPauloDay } = useComandas();
  const isAdmin = currentStaff?.role === 'admin';

  const [reloadTick, setReloadTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    lines: ReceiptLine[];
    issues: ReceiptIssue[];
    error: string | null;
  } | null>(null);

  const queryKey = `${currentSaoPauloDay}|${reloadTick}`;

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    fetchReceiptsByDateRange(currentSaoPauloDay, currentSaoPauloDay)
      .then(result => {
        if (cancelled) return;
        setFetched({
          key: queryKey,
          lines: result.lines,
          issues: result.issues,
          error: null,
        });
      })
      .catch(err => {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : 'Falha desconhecida ao consultar o livro de recebimentos.';
        setFetched({
          key: queryKey,
          lines: [],
          issues: [],
          error: message,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [isAdmin, currentSaoPauloDay, queryKey]);

  const isLoading = !fetched || fetched.key !== queryKey;
  const error = !isLoading ? fetched.error : null;

  const summary = useMemo(() => {
    if (isLoading || error) return null;
    return aggregateReceipts(fetched.lines, currentSaoPauloDay, currentSaoPauloDay);
  }, [isLoading, error, fetched, currentSaoPauloDay]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-800">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Acesso Restrito ao Administrador
            </h1>
            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
              O módulo de Caixa está disponível apenas para usuários com perfil de Administrador.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveModule('inicio')}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-900 px-4 text-xs font-semibold text-white hover:bg-emerald-800"
          >
            Voltar ao Início
          </button>
        </div>
      </div>
    );
  }

  return (
    <CaixaAdminContent
      todayDateKey={currentSaoPauloDay}
      isLoading={isLoading}
      error={error}
      summary={summary}
      issues={!isLoading && !error ? fetched.issues : []}
      onRetry={() => setReloadTick(prev => prev + 1)}
    />
  );
}
