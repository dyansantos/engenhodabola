'use client';

import React, { useState, useMemo } from 'react';
import { useComandas } from '@/context/ComandasContext';
import {
  formatCents,
  formatDateTime,
  formatDate,
  calculateComandaTotals,
} from '@/lib/formatters';
import { calculateGroupRentalTotals } from '@/lib/firestore-transactions';
import {
  Search,
  Plus,
  User,
  Store,
  Clock,
  ChevronRight,
  Filter,
  Users,
  Calendar,
  CheckCircle2,
  DollarSign,
  Coffee,
} from 'lucide-react';

export function ComandasView() {
  const {
    comandas,
    groupRentals,
    filterStatus,
    setFilterStatus,
    filterType,
    setFilterType,
    searchQuery,
    setSearchQuery,
    setSelectedComandaId,
    setIsNewComandaModalOpen,
    setSelectedGroupRentalId,
    setIsNewGroupRentalModalOpen,
  } = useComandas();

  // Alternador principal entre Comandas de Bar e Locações em Grupo
  const [mainTab, setMainTab] = useState<'comandas' | 'grupos'>('comandas');

  // Filtros específicos de locação em grupo
  const [groupFilterStatus, setGroupFilterStatus] = useState<'todas' | 'abertas' | 'quitadas'>('todas');
  const [groupFilterSpace, setGroupFilterSpace] = useState<'todos' | 'Areia 1' | 'Areia 2' | 'Areia 3' | 'Society'>('todos');
  const [groupSearchQuery, setGroupSearchQuery] = useState('');

  // Filtragem de comandas
  const filteredComandas = useMemo(() => {
    return comandas.filter(cmd => {
      if (filterStatus === 'abertas' && cmd.status !== 'aberta') return false;
      if (filterStatus === 'encerradas' && cmd.status !== 'encerrada') return false;

      if (filterType === 'individual' && cmd.type !== 'individual') return false;
      if (filterType === 'mesa' && cmd.type !== 'mesa') return false;

      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase().trim();
        const matchesNumber = cmd.number.toString().includes(query);
        const matchesName = cmd.name.toLowerCase().includes(query);
        const matchesTable = cmd.table ? cmd.table.toLowerCase().includes(query) : false;
        const matchesResp = cmd.responsible ? cmd.responsible.toLowerCase().includes(query) : false;

        if (!matchesNumber && !matchesName && !matchesTable && !matchesResp) {
          return false;
        }
      }

      return true;
    });
  }, [comandas, filterStatus, filterType, searchQuery]);

  // Filtragem de locações em grupo
  const filteredGroupRentals = useMemo(() => {
    return (groupRentals || []).filter(rental => {
      if (groupFilterStatus === 'abertas' && rental.status !== 'aberta') return false;
      if (groupFilterStatus === 'quitadas' && rental.status !== 'quitada') return false;

      if (groupFilterSpace !== 'todos' && rental.space !== groupFilterSpace) return false;

      if (groupSearchQuery.trim() !== '') {
        const query = groupSearchQuery.toLowerCase().trim();
        const matchesNumber = rental.number.toString().includes(query);
        const matchesName = rental.groupName.toLowerCase().includes(query);
        const matchesSpace = rental.space.toLowerCase().includes(query);

        if (!matchesNumber && !matchesName && !matchesSpace) {
          return false;
        }
      }

      return true;
    });
  }, [groupRentals, groupFilterStatus, groupFilterSpace, groupSearchQuery]);

  return (
    <div className="space-y-5">
      {/* Cabeçalho da Seção */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Atendimento & Fechamento
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Gerencie o consumo do bar e locações esportivas divididas por participantes
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsNewComandaModalOpen(true)}
            className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs sm:text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Nova Comanda (Bar)</span>
          </button>

          <button
            type="button"
            onClick={() => setIsNewGroupRentalModalOpen(true)}
            className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-900 px-4 text-xs sm:text-sm font-semibold text-white shadow-xs transition-colors hover:bg-emerald-800 active:scale-95"
          >
            <Users className="h-4 w-4" />
            <span>+ Locação em Grupo</span>
          </button>
        </div>
      </div>

      {/* Alternador de Abas Principais: Comandas de Consumo vs Locações em Grupo */}
      <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1.5 self-start">
        <button
          type="button"
          onClick={() => setMainTab('comandas')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-bold transition-all ${
            mainTab === 'comandas'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Coffee className="h-4 w-4 text-amber-700" />
          <span>Comandas de Bar & Mesas</span>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-2xs font-semibold text-slate-700">
            {comandas.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('grupos')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-bold transition-all ${
            mainTab === 'grupos'
              ? 'bg-white text-emerald-950 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="h-4 w-4 text-emerald-700" />
          <span>Locações em Grupo (Fechamento)</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-2xs font-semibold text-emerald-900">
            {groupRentals.length}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* ABA 1: COMANDAS DO BAR & COZINHA */}
      {/* ========================================================================= */}
      {mainTab === 'comandas' && (
        <>
          {/* Barra de Filtros e Busca */}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs sm:p-4">
            <div className="flex flex-col lg:flex-row gap-3">
              {/* Campo de Busca */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nome do cliente, número da comanda (#101) ou mesa..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-800"
                />
              </div>

              {/* Filtros rápidos: Status e Tipo */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Status */}
                <div className="flex rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setFilterStatus('abertas')}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      filterStatus === 'abertas'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Abertas
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('encerradas')}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      filterStatus === 'encerradas'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Encerradas
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('todas')}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      filterStatus === 'todas'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todas
                  </button>
                </div>

                {/* Tipo */}
                <div className="flex rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setFilterType('todas')}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      filterType === 'todas'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todos Tipos
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterType('individual')}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      filterType === 'individual'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Individuais
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterType('mesa')}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      filterType === 'mesa'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Mesas
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Grid de Comandas */}
          {filteredComandas.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-2xs">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Store className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">
                Nenhuma comanda encontrada
              </h3>
              <p className="mt-1 text-xs sm:text-sm text-slate-500 max-w-sm">
                Não encontramos nenhuma comanda com os filtros atuais.
              </p>
              <button
                type="button"
                onClick={() => setIsNewComandaModalOpen(true)}
                className="mt-5 flex items-center gap-2 rounded-lg bg-emerald-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-emerald-800 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Abrir Nova Comanda</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredComandas.map(cmd => {
                const { totalConsumedCents, totalPaidCents, balanceCents } = calculateComandaTotals(cmd);

                let statusText = 'Aberta';
                let statusClass = 'bg-amber-50 text-amber-900 border-amber-200';
                if (cmd.status === 'encerrada') {
                  statusText = 'Encerrada';
                  statusClass = 'bg-slate-100 text-slate-700 border-slate-200';
                } else if (totalPaidCents > 0) {
                  statusText = 'Pagamento Parcial';
                  statusClass = 'bg-sky-50 text-sky-900 border-sky-200';
                }

                return (
                  <div
                    key={cmd.id}
                    onClick={() => setSelectedComandaId(cmd.id)}
                    className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-2xs transition-all hover:border-emerald-800/40 hover:shadow-xs cursor-pointer group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700 font-mono font-bold text-sm group-hover:bg-emerald-50 group-hover:text-emerald-900 transition-colors">
                            #{cmd.number}
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 text-sm sm:text-base group-hover:text-emerald-950 transition-colors line-clamp-1">
                              {cmd.name}
                            </h3>
                            <div className="flex items-center gap-1.5 text-2xs text-slate-500">
                              <span>{cmd.type === 'individual' ? 'Individual' : 'Mesa'}</span>
                              {cmd.table && (
                                <>
                                  <span>·</span>
                                  <span className="font-medium text-slate-700">{cmd.table}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-2xs font-semibold ${statusClass}`}>
                          {statusText}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center gap-1 text-2xs text-slate-500">
                        <Clock className="h-3 w-3 text-slate-400" />
                        <span>Aberta: {formatDateTime(cmd.openedAt)}</span>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="text-2xs uppercase font-semibold text-slate-400 block">
                          Saldo a Pagar
                        </span>
                        <span
                          className={`text-base font-bold tabular-nums ${
                            balanceCents === 0 ? 'text-emerald-800' : 'text-slate-900'
                          }`}
                        >
                          {formatCents(balanceCents)}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-2xs text-slate-400 block">
                          Consumo: {formatCents(totalConsumedCents)}
                        </span>
                        <span className="text-xs font-semibold text-emerald-900 flex items-center justify-end">
                          Acessar comanda <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: LOCAÇÕES EM GRUPO (FECHAMENTO POR PARTICIPANTES) */}
      {/* ========================================================================= */}
      {mainTab === 'grupos' && (
        <>
          {/* Barra de Filtros e Busca de Locações */}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs sm:p-4">
            <div className="flex flex-col lg:flex-row gap-3">
              {/* Campo de Busca */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={groupSearchQuery}
                  onChange={e => setGroupSearchQuery(e.target.value)}
                  placeholder="Buscar por grupo (#501, Amigos do Society, quadra)..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-800"
                />
              </div>

              {/* Filtros rápidos: Status e Quadra */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Status */}
                <div className="flex rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setGroupFilterStatus('todas')}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      groupFilterStatus === 'todas'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupFilterStatus('abertas')}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      groupFilterStatus === 'abertas'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Com Pendência
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupFilterStatus('quitadas')}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      groupFilterStatus === 'quitadas'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Quitadas
                  </button>
                </div>

                {/* Espaço */}
                <div className="flex rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setGroupFilterSpace('todos')}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      groupFilterSpace === 'todos'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todos Espaços
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupFilterSpace('Society')}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      groupFilterSpace === 'Society'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Society
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupFilterSpace('Areia 1')}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      groupFilterSpace === 'Areia 1'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Areia
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Grid de Locações em Grupo */}
          {filteredGroupRentals.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-2xs">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-800">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">
                Nenhuma locação em grupo encontrada
              </h3>
              <p className="mt-1 text-xs sm:text-sm text-slate-500 max-w-sm">
                Agilize o fechamento dividido entre pessoas (ex: 10 amigos alugando o Society por R$ 150) sem abrir 10 comandas avulsas.
              </p>
              <button
                type="button"
                onClick={() => setIsNewGroupRentalModalOpen(true)}
                className="mt-5 flex items-center gap-2 rounded-lg bg-emerald-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-emerald-800 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>+ Abrir Locação em Grupo</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredGroupRentals.map(rental => {
                const totals = calculateGroupRentalTotals(rental);
                const percent = totals.totalAmountCents > 0
                  ? Math.min(100, Math.round((totals.totalPaidCents / totals.totalAmountCents) * 100))
                  : 100;

                return (
                  <div
                    key={rental.id}
                    onClick={() => setSelectedGroupRentalId(rental.id)}
                    className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-2xs transition-all hover:border-emerald-800/40 hover:shadow-xs cursor-pointer group"
                  >
                    <div>
                      {/* Topo do Card */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-900 font-mono font-bold text-sm group-hover:bg-emerald-200 transition-colors">
                            #{rental.number}
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 text-sm sm:text-base group-hover:text-emerald-950 transition-colors line-clamp-1">
                              {rental.groupName}
                            </h3>
                            <div className="flex items-center gap-1.5 text-2xs text-slate-500">
                              <span className="font-semibold text-slate-700">{rental.space}</span>
                              <span>·</span>
                              <span>{formatDate(rental.date)}</span>
                            </div>
                          </div>
                        </div>

                        {rental.status === 'quitada' ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-2xs font-semibold text-emerald-800">
                            <CheckCircle2 className="h-3 w-3" />
                            Quitada
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-2xs font-semibold text-amber-800">
                            Em Aberto
                          </span>
                        )}
                      </div>

                      {/* Progresso de Pagamentos */}
                      <div className="mt-3.5 space-y-1.5">
                        <div className="flex items-center justify-between text-2xs">
                          <span className="text-slate-600">
                            <strong>{totals.paidParticipantsCount}</strong> de <strong>{totals.totalParticipantsCount}</strong> quitados
                          </span>
                          <span className="font-bold text-slate-700">{percent}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-emerald-700 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-2.5 flex items-center gap-1 text-2xs text-slate-400">
                        <Clock className="h-3 w-3" />
                        <span>{rental.time} (Informativo)</span>
                      </div>
                    </div>

                    {/* Rodapé com Valores */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="text-2xs uppercase font-semibold text-slate-400 block">
                          Saldo Pendente
                        </span>
                        <span
                          className={`text-base font-bold tabular-nums ${
                            totals.pendingBalanceCents === 0 ? 'text-emerald-800' : 'text-amber-900'
                          }`}
                        >
                          {formatCents(totals.pendingBalanceCents)}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-2xs text-slate-400 block">
                          Total: {formatCents(totals.totalAmountCents)}
                        </span>
                        <span className="text-xs font-semibold text-emerald-900 flex items-center justify-end">
                          Abrir fechamento <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
