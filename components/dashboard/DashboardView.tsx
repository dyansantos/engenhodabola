'use client';

import React from 'react';
import { useComandas } from '@/context/ComandasContext';
import { formatCents, calculateComandaTotals } from '@/lib/formatters';
import { INITIAL_APPOINTMENTS } from '@/lib/mock-data';
import {
  Plus,
  Receipt,
  CalendarDays,
  TrendingUp,
  Wallet,
} from 'lucide-react';

export function DashboardView() {
  const {
    comandas,
    metrics,
    setActiveModule,
    setFilterStatus,
    setIsNewComandaModalOpen,
    setSelectedComandaId,
  } = useComandas();

  const handleGoToOpenComandas = () => {
    setFilterStatus('abertas');
    setActiveModule('comandas');
  };

  const handleGoToAgenda = () => {
    setActiveModule('agenda');
  };

  // Últimas comandas abertas para acesso rápido
  const recentOpenComandas = comandas
    .filter(c => c.status === 'aberta')
    .slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Mensagem de Boas-vindas e Contexto Operacional */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Painel Operacional — Engenho da Bola
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Acompanhe comandas, fluxo do bar e agenda das quadras em tempo real
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsNewComandaModalOpen(true)}
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-900 px-4 text-xs sm:text-sm font-semibold text-white shadow-xs transition-colors hover:bg-emerald-800 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span>Abrir Comanda</span>
          </button>
        </div>
      </div>

      {/* 3 Ações em Destaque Primário */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setIsNewComandaModalOpen(true)}
          className="group flex flex-col justify-between rounded-xl border border-emerald-900/15 bg-white p-4 text-left shadow-2xs transition-all hover:border-emerald-800 hover:shadow-md active:scale-98"
        >
          <div className="flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-900">
              <Plus className="h-5 w-5" />
            </span>
            <span className="text-xs font-semibold text-emerald-900 group-hover:translate-x-0.5 transition-transform">
              Iniciar →
            </span>
          </div>
          <div className="mt-4">
            <h2 className="text-sm font-bold text-slate-900">Abrir Comanda</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Individual ou mesa sem burocracia
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={handleGoToOpenComandas}
          className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-2xs transition-all hover:border-slate-300 hover:shadow-md active:scale-98"
        >
          <div className="flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-800">
              <Receipt className="h-5 w-5" />
            </span>
            <span className="text-xs font-semibold text-slate-700 group-hover:translate-x-0.5 transition-transform">
              Ver lista →
            </span>
          </div>
          <div className="mt-4">
            <h2 className="text-sm font-bold text-slate-900">Ver Comandas Abertas</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Consultar consumo, transferir e cobrar
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={handleGoToAgenda}
          className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-2xs transition-all hover:border-slate-300 hover:shadow-md active:scale-98"
        >
          <div className="flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-800">
              <CalendarDays className="h-5 w-5" />
            </span>
            <span className="text-xs font-semibold text-slate-700 group-hover:translate-x-0.5 transition-transform">
              Ver quadras →
            </span>
          </div>
          <div className="mt-4">
            <h2 className="text-sm font-bold text-slate-900">Consultar Agenda</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Horários de areia e campo society
            </p>
          </div>
        </button>
      </div>

      {/* Indicadores Dinâmicos Calculados a partir da Demonstração */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Comandas Abertas
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-800">
              <Receipt className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900 tabular-nums">
            {metrics.openCount}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {metrics.closedCount} {metrics.closedCount === 1 ? 'comanda quitada' : 'comandas quitadas'} no histórico
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Saldo Pendente
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900 tabular-nums">
            {formatCents(metrics.pendingBalanceCents)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Total a receber de todas as comandas abertas (inclusive dias anteriores)
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Recebimentos de Hoje
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-900">
              <Wallet className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold text-emerald-950 tabular-nums">
            {formatCents(metrics.todayReceiptsCents)}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 mt-0.5">
            <span>Pix: {formatCents(metrics.todayReceiptsByMethodCents.pix)}</span>
            <span>·</span>
            <span>Dinheiro: {formatCents(metrics.todayReceiptsByMethodCents.dinheiro)}</span>
            <span>·</span>
            <span>Cartão: {formatCents(metrics.todayReceiptsByMethodCents.debito + metrics.todayReceiptsByMethodCents.credito)}</span>
          </div>
        </div>
      </div>

      {/* Grid Duplo: Comandas Ativas Recentes + Próximos Compromissos da Agenda */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Lado Esquerdo: Acesso Rápido às Comandas Abertas */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Comandas em Atendimento</h2>
              <p className="text-xs text-slate-500">Toque para lançar pedidos ou receber</p>
            </div>
            <button
              type="button"
              onClick={handleGoToOpenComandas}
              className="text-xs font-semibold text-emerald-900 hover:underline"
            >
              Ver todas ({metrics.openCount})
            </button>
          </div>

          <div className="mt-3 divide-y divide-slate-100">
            {recentOpenComandas.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                Não há comandas abertas no momento.
              </div>
            ) : (
              recentOpenComandas.map(cmd => {
                const { totalConsumedCents, balanceCents } = calculateComandaTotals(cmd);
                return (
                  <div
                    key={cmd.id}
                    onClick={() => setSelectedComandaId(cmd.id)}
                    className="flex items-center justify-between py-3 cursor-pointer hover:bg-slate-50/80 rounded-lg px-2 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-900 text-xs font-bold text-white tabular-nums">
                        #{cmd.number}
                      </span>
                      <div>
                        <p className="text-xs sm:text-sm font-semibold text-slate-900">
                          {cmd.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {cmd.type === 'mesa' ? 'Mesa' : 'Individual'}
                          {cmd.table ? ` · ${cmd.table}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs sm:text-sm font-bold text-slate-900 tabular-nums block">
                        {formatCents(balanceCents)}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Consumo: {formatCents(totalConsumedCents)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Lado Direito: Próximos Compromissos da Agenda (Exemplos) */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Próximos Compromissos</h2>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  Exemplos
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Grade de horários das 3 quadras de areia e society
              </p>
            </div>
            <button
              type="button"
              onClick={handleGoToAgenda}
              className="text-xs font-semibold text-emerald-900 hover:underline"
            >
              Agenda completa
            </button>
          </div>

          <div className="mt-3 divide-y divide-slate-100">
            {INITIAL_APPOINTMENTS.slice(0, 4).map(apt => (
              <div key={apt.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">{apt.title}</span>
                    <span className="text-[11px] text-slate-400">·</span>
                    <span className="text-[11px] font-medium text-emerald-900">{apt.court}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                    <span>{apt.instructorOrHost}</span>
                    {apt.participantsCount && (
                      <>
                        <span>·</span>
                        <span>{apt.participantsCount} participantes</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800 tabular-nums">
                    {apt.time}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
