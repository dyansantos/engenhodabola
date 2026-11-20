'use client';

import React, { useMemo, useState } from 'react';
import { PaymentMethod } from '@/lib/types';
import { formatCents, formatDate, formatTime } from '@/lib/formatters';
import { ReceiptLine, ReceiptOrigin } from '@/lib/reports/receipts';
import {
  X,
  Search,
  ExternalLink,
  Link2,
  Receipt,
  Users,
  Filter,
} from 'lucide-react';

export interface ReconciliationScope {
  title: string;
  subtitle: string;
  expectedAmountCents: number;
  startDateKey?: string;
  endDateKey?: string;
  initialOrigin?: ReceiptOrigin | 'todos';
  initialMethod?: PaymentMethod | 'todos';
}

interface ReceiptsReconciliationModalProps {
  scope: ReconciliationScope;
  allPeriodLines: ReceiptLine[];
  jointPaymentCounts: Record<string, number>;
  onClose: () => void;
  onOpenComanda: (comandaId: string) => void;
  onOpenGroupRental: (rentalId: string) => void;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  debito: 'Débito',
  credito: 'Crédito',
};

const METHOD_BADGES: Record<PaymentMethod, string> = {
  pix: 'bg-teal-50 text-teal-900 border-teal-200',
  dinheiro: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  debito: 'bg-sky-50 text-sky-900 border-sky-200',
  credito: 'bg-indigo-50 text-indigo-900 border-indigo-200',
};

export function ReceiptsReconciliationModal({
  scope,
  allPeriodLines,
  jointPaymentCounts,
  onClose,
  onOpenComanda,
  onOpenGroupRental,
}: ReceiptsReconciliationModalProps) {
  const [searchText, setSearchText] = useState('');
  const [originFilter, setOriginFilter] = useState<ReceiptOrigin | 'todos'>(
    scope.initialOrigin || 'todos'
  );
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | 'todos'>(
    scope.initialMethod || 'todos'
  );

  // Primeiro aplica o recorte exato do item/linha clicado
  const scopeLines = useMemo(() => {
    return allPeriodLines.filter(line => {
      if (scope.startDateKey && line.dateKey < scope.startDateKey) return false;
      if (scope.endDateKey && line.dateKey > scope.endDateKey) return false;
      return true;
    });
  }, [allPeriodLines, scope.startDateKey, scope.endDateKey]);

  // Depois aplica busca e filtros interativos dentro do modal
  const visibleLines = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return scopeLines.filter(line => {
      if (originFilter !== 'todos' && line.origin !== originFilter) return false;
      if (methodFilter !== 'todos' && line.method !== methodFilter) return false;

      if (q) {
        const haystack = [
          `#${line.refNumber}`,
          String(line.refNumber),
          line.refLabel,
          line.operatorName,
          METHOD_LABELS[line.method],
          line.origin === 'comanda' ? 'comanda bar cozinha' : 'locacao quadra',
          line.jointPaymentKey || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [scopeLines, originFilter, methodFilter, searchText]);

  const visibleTotalCents = useMemo(
    () =>
      visibleLines.reduce(
        (sum, l) => sum + (l.kind === 'estorno' ? -l.amountCents : l.amountCents),
        0
      ),
    [visibleLines]
  );

  const isUsingInitialFilterOnly =
    !searchText.trim() &&
    originFilter === (scope.initialOrigin || 'todos') &&
    methodFilter === (scope.initialMethod || 'todos');

  return (
    <div className="fixed inset-0 z-[35] flex items-center justify-center bg-slate-950/60 p-2 sm:p-4 backdrop-blur-xs">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
              Conferência de Lançamentos
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
              {scope.title}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">{scope.subtitle}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-colors"
            aria-label="Fechar conferência"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Barra de Total + Busca + Filtros */}
        <div className="border-b border-slate-200 bg-white px-5 py-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2.5">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-900">
                {isUsingInitialFilterOnly
                  ? 'Total do indicador selecionado'
                  : 'Total dos lançamentos filtrados'}
              </span>
              <p className="text-xl font-bold text-emerald-950 tabular-nums">
                {formatCents(visibleTotalCents)}
              </p>
            </div>
            <div className="text-xs text-emerald-900 sm:text-right">
              <p className="font-semibold">
                {visibleLines.length}{' '}
                {visibleLines.length === 1 ? 'lançamento encontrado' : 'lançamentos encontrados'}
              </p>
              {!isUsingInitialFilterOnly && (
                <p className="text-[11px] text-emerald-800">
                  Valor clicado originalmente: {formatCents(scope.expectedAmountCents)}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            {/* Busca por texto */}
            <div className="relative sm:col-span-6">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Buscar nº, nome, cliente ou funcionário..."
                className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-emerald-700 focus:outline-hidden"
              />
            </div>

            {/* Filtro por origem */}
            <div className="sm:col-span-3">
              <div className="relative flex items-center">
                <Filter className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
                <select
                  value={originFilter}
                  onChange={e => setOriginFilter(e.target.value as ReceiptOrigin | 'todos')}
                  aria-label="Filtrar por origem"
                  className="w-full rounded-xl border border-slate-300 bg-white pl-8 pr-2.5 py-2 text-xs font-semibold text-slate-700 focus:border-emerald-700 focus:outline-hidden"
                >
                  <option value="todos">Todas as origens</option>
                  <option value="comanda">Comanda (Bar/Cozinha)</option>
                  <option value="locacao">Locação de quadra</option>
                </select>
              </div>
            </div>

            {/* Filtro por forma de pagamento */}
            <div className="sm:col-span-3">
              <select
                value={methodFilter}
                onChange={e => setMethodFilter(e.target.value as PaymentMethod | 'todos')}
                aria-label="Filtrar por forma de pagamento"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-emerald-700 focus:outline-hidden"
              >
                <option value="todos">Todas as formas</option>
                <option value="pix">Pix</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="debito">Débito</option>
                <option value="credito">Crédito</option>
              </select>
            </div>
          </div>
        </div>

        {/* Lista de Lançamentos */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {visibleLines.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Nenhum lançamento encontrado com os filtros aplicados.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleLines.map(line => {
                const isJoint =
                  !!line.jointPaymentKey &&
                  (jointPaymentCounts[line.jointPaymentKey] || 0) >= 2;

                return (
                  <div
                    key={line.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 hover:bg-slate-50/70 rounded-lg px-2 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                            line.origin === 'comanda'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                              : 'border-sky-200 bg-sky-50 text-sky-900'
                          }`}
                        >
                          {line.origin === 'comanda' ? (
                            <Receipt className="h-3 w-3" />
                          ) : (
                            <Users className="h-3 w-3" />
                          )}
                          <span>
                            {line.origin === 'comanda' ? 'Comanda' : 'Locação'} #{line.refNumber}
                          </span>
                        </span>

                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                            METHOD_BADGES[line.method]
                          }`}
                        >
                          {METHOD_LABELS[line.method]}
                        </span>

                        {isJoint && (
                          <span
                            className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-900"
                            title="Esta parcela faz parte de um recebimento conjunto de quadra + bar"
                          >
                            <Link2 className="h-3 w-3" />
                            <span>Recebimento conjunto</span>
                          </span>
                        )}

                        {line.kind === 'estorno' && (
                          <span className="inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                            Estorno
                          </span>
                        )}
                      </div>

                      <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {line.refLabel}
                      </p>

                      <p className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="tabular-nums font-medium text-slate-700">
                          {formatDate(line.paidAtIso)} às {formatTime(line.paidAtIso)}
                        </span>
                        <span>·</span>
                        <span>Funcionário: {line.operatorName}</span>
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <span
                        className={`text-sm sm:text-base font-bold tabular-nums ${
                          line.kind === 'estorno' ? 'text-rose-700' : 'text-emerald-950'
                        }`}
                      >
                        {line.kind === 'estorno' ? `-${formatCents(line.amountCents)}` : formatCents(line.amountCents)}
                      </span>

                      <button
                        type="button"
                        onClick={() => {
                          if (line.origin === 'comanda') {
                            onOpenComanda(line.refId);
                          } else {
                            onOpenGroupRental(line.refId);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-950 transition-colors"
                      >
                        <span>Abrir registro</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600">
          <span>Horários exibidos no fuso America/Sao_Paulo</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 font-semibold text-slate-700 hover:bg-slate-100"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
