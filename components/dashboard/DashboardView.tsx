'use client';

import React from 'react';
import { useComandas } from '@/context/ComandasContext';
import { formatCents, calculateComandaTotals } from '@/lib/formatters';
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_TYPE_LABELS,
  getUpcomingTodayAppointments,
} from '@/lib/dashboard-helpers';
import {
  AlertCircle,
  CalendarDays,
  Plus,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';

export function DashboardView() {
  const {
    comandas,
    metrics,
    appointments,
    comandasLoaded,
    comandasSyncError,
    groupRentalsLoaded,
    groupRentalsSyncError,
    appointmentsLoaded,
    appointmentsSyncError,
    currentSaoPauloDay,
    setActiveModule,
    setFilterStatus,
    setIsNewComandaModalOpen,
    setSelectedComandaId,
    setAgendaSelectedDate,
    setSelectedAppointmentId,
  } = useComandas();

  const handleGoToOpenComandas = () => {
    setFilterStatus('abertas');
    setActiveModule('comandas');
  };

  const handleGoToAgenda = () => {
    setActiveModule('agenda');
  };

  const handleOpenAppointment = (appointmentId: string, dateKey: string) => {
    setAgendaSelectedDate(dateKey);
    setSelectedAppointmentId(appointmentId);
    setActiveModule('agenda');
  };

  const recentOpenComandas = comandas
    .filter(c => c.status === 'aberta')
    .slice(0, 4);

  const upcomingTodayAppointments = getUpcomingTodayAppointments(
    appointments,
    currentSaoPauloDay,
    new Date(),
    5
  );

  const receiptsError = comandasSyncError || groupRentalsSyncError;
  const receiptsLoading = !comandasLoaded || !groupRentalsLoaded;

  return (
    <div className="space-y-6">
      {/* Cabeçalho Operacional */}
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

      {/* Indicadores Operacionais Reais */}
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
          {comandasSyncError ? (
            <div className="mt-3 flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Erro ao sincronizar comandas: {comandasSyncError}</span>
            </div>
          ) : !comandasLoaded ? (
            <p className="mt-3 text-sm font-semibold text-slate-500">Carregando…</p>
          ) : (
            <>
              <p className="mt-3 text-2xl font-bold text-slate-900 tabular-nums">
                {metrics.openCount}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {metrics.closedCount}{' '}
                {metrics.closedCount === 1 ? 'comanda quitada' : 'comandas quitadas'} no histórico
              </p>
            </>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Saldo Pendente (Comandas)
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>
          {comandasSyncError ? (
            <div className="mt-3 flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Erro ao sincronizar saldo das comandas: {comandasSyncError}</span>
            </div>
          ) : !comandasLoaded ? (
            <p className="mt-3 text-sm font-semibold text-slate-500">Carregando…</p>
          ) : (
            <>
              <p className="mt-3 text-2xl font-bold text-slate-900 tabular-nums">
                {formatCents(metrics.pendingBalanceCents)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Total a receber de todas as comandas abertas (inclusive dias anteriores)
              </p>
            </>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Recebido hoje: comandas e locações
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-900">
              <Wallet className="h-4 w-4" />
            </span>
          </div>
          {receiptsError ? (
            <div className="mt-3 flex items-start gap-2 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Erro ao sincronizar recebimentos de hoje: {receiptsError}</span>
            </div>
          ) : receiptsLoading ? (
            <p className="mt-3 text-sm font-semibold text-slate-500">Carregando…</p>
          ) : (
            <>
              <p className="mt-3 text-2xl font-bold text-emerald-950 tabular-nums">
                {formatCents(metrics.todayReceiptsCents)}
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 mt-0.5">
                <span>Pix: {formatCents(metrics.todayReceiptsByMethodCents.pix)}</span>
                <span>·</span>
                <span>Dinheiro: {formatCents(metrics.todayReceiptsByMethodCents.dinheiro)}</span>
                <span>·</span>
                <span>
                  Cartão:{' '}
                  {formatCents(
                    metrics.todayReceiptsByMethodCents.debito +
                      metrics.todayReceiptsByMethodCents.credito
                  )}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Grid Duplo: Comandas Ativas Recentes + Próximos Agendamentos de Hoje */}
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
              {comandasLoaded && !comandasSyncError
                ? `Ver todas (${metrics.openCount})`
                : 'Ver todas'}
            </button>
          </div>

          <div className="mt-3 divide-y divide-slate-100">
            {comandasSyncError ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
                <span>
                  Não foi possível carregar as comandas em atendimento: {comandasSyncError}
                </span>
              </div>
            ) : !comandasLoaded ? (
              <div className="py-6 text-center text-xs text-slate-500">
                Carregando…
              </div>
            ) : recentOpenComandas.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                Não há comandas abertas no momento.
              </div>
            ) : (
              recentOpenComandas.map(cmd => {
                const { totalConsumedCents, balanceCents } = calculateComandaTotals(cmd);
                return (
                  <button
                    key={cmd.id}
                    type="button"
                    onClick={() => setSelectedComandaId(cmd.id)}
                    className="flex w-full items-center justify-between py-3 text-left hover:bg-slate-50/80 rounded-lg px-2 transition-colors"
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
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Lado Direito: Próximos Agendamentos de Hoje (Agenda Real do Firestore) */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Próximos Agendamentos de Hoje
              </h2>
              <p className="text-xs text-slate-500">
                Agenda real das 3 quadras de areia e campo society
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
            {appointmentsSyncError ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
                <span>
                  Não foi possível carregar a agenda de hoje: {appointmentsSyncError}
                </span>
              </div>
            ) : !appointmentsLoaded ? (
              <div className="py-6 text-center text-xs text-slate-500">
                Carregando…
              </div>
            ) : upcomingTodayAppointments.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 space-y-2">
                <p>Nenhum agendamento pendente para hoje.</p>
                <button
                  type="button"
                  onClick={handleGoToAgenda}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span>Abrir Agenda</span>
                </button>
              </div>
            ) : (
              upcomingTodayAppointments.map(apt => (
                <button
                  key={apt.id}
                  type="button"
                  onClick={() => handleOpenAppointment(apt.id, apt.date)}
                  className="w-full py-2.5 px-2 flex items-center justify-between gap-3 text-left rounded-lg hover:bg-slate-50/80 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {apt.title}
                      </span>
                      <span className="text-[11px] text-slate-400">·</span>
                      <span className="text-[11px] font-medium text-emerald-900">
                        {apt.spaces && apt.spaces.length > 0
                          ? apt.spaces.join(', ')
                          : apt.space}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 mt-0.5">
                      <span>{apt.hostName}</span>
                      <span>·</span>
                      <span>{APPOINTMENT_TYPE_LABELS[apt.type]}</span>
                      {apt.status === 'em_andamento' && (
                        <>
                          <span>·</span>
                          <span className="font-semibold text-emerald-800">
                            {APPOINTMENT_STATUS_LABELS[apt.status]}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800 tabular-nums">
                      {apt.startTime} – {apt.endTime}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
