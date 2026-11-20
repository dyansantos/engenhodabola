'use client';

import React, { useState, useMemo } from 'react';
import { useComandas } from '@/context/ComandasContext';
import {
  CalendarDays,
  Clock,
  User,
  Plus,
  Filter,
  ChevronLeft,
  ChevronRight,
  Layers,
  Repeat,
  AlertCircle,
  CheckCircle2,
  Phone,
  Play,
  ExternalLink,
  Ban,
  Calendar,
  Sparkles,
  MapPin,
  Settings,
  Pencil,
} from 'lucide-react';
import { CourtSpace, SportModality, AppointmentType, Appointment } from '@/lib/types';
import {
  COURT_SPACES,
  COURT_DETAILS,
  MODALITY_LABELS,
  APPOINTMENT_TYPE_LABELS,
  APPOINTMENT_TYPE_STYLES,
  APPOINTMENT_STATUS_LABELS,
  getAppointmentSpaces,
  addDaysToDateKey,
  formatDateKeyPortuguese,
  getWeekDates,
  timeToMinutes,
  minutesToTime,
  intervalsOverlap,
  generateOperatingTimeSlots,
} from '@/lib/agenda-helpers';
import { getSaoPauloDateKey, formatCentsToBRL } from '@/lib/formatters';
import { NewAppointmentModal } from './NewAppointmentModal';
import { AppointmentDetailModal } from './AppointmentDetailModal';
import { EditAppointmentModal } from './EditAppointmentModal';
import { OperatingHoursModal } from './OperatingHoursModal';

export function AgendaView() {
  const {
    appointments,
    selectedAppointmentId,
    setSelectedAppointmentId,
    setIsNewAppointmentModalOpen,
    agendaSelectedDate,
    setAgendaSelectedDate,
    agendaSelectedSpace,
    setAgendaSelectedSpace,
    agendaFilterModality,
    setAgendaFilterModality,
    agendaFilterType,
    setAgendaFilterType,
    operatingHours,
    setIsOperatingHoursModalOpen,
    openNewAppointmentWithSlot,
    currentStaff,
  } = useComandas();

  const isAdmin = currentStaff?.role === 'admin';

  // Modo de visualização: diária ou semanal
  const [viewMode, setViewMode] = useState<'diaria' | 'semanal'>('diaria');

  // Espaço selecionado para visão semanal
  const [weeklySpace, setWeeklySpace] = useState<CourtSpace>('Areia 1');

  const todayKey = getSaoPauloDateKey();

  // Navegação entre datas
  const handlePrevDay = () => {
    setAgendaSelectedDate(addDaysToDateKey(agendaSelectedDate, viewMode === 'diaria' ? -1 : -7));
  };

  const handleNextDay = () => {
    setAgendaSelectedDate(addDaysToDateKey(agendaSelectedDate, viewMode === 'diaria' ? 1 : 7));
  };

  const handleGoToday = () => {
    setAgendaSelectedDate(todayKey);
  };

  // Faixas de horário baseadas na configuração oficial
  const operatingTimeSlots = useMemo(() => {
    const open = operatingHours?.configured ? operatingHours.openTime : '07:00';
    const close = operatingHours?.configured ? operatingHours.closeTime : '23:00';
    const interval = operatingHours?.slotIntervalMinutes || 60;
    return generateOperatingTimeSlots(open, close, interval);
  }, [operatingHours]);

  // Filtragem dos agendamentos
  const filteredAppointments = useMemo(() => {
    return appointments.filter(apt => {
      if (apt.status === 'cancelada') return false;

      // Filtro de espaço
      if (agendaSelectedSpace !== 'todos') {
        const aptSpaces = getAppointmentSpaces(apt);
        if (!aptSpaces.includes(agendaSelectedSpace)) return false;
      }

      // Filtro de modalidade
      if (agendaFilterModality !== 'todas' && apt.modality !== agendaFilterModality) {
        return false;
      }

      // Filtro de tipo
      if (agendaFilterType !== 'todos' && apt.type !== agendaFilterType) {
        return false;
      }

      return true;
    });
  }, [appointments, agendaSelectedSpace, agendaFilterModality, agendaFilterType]);

  // Agendamentos da data selecionada
  const dayAppointments = useMemo(() => {
    return filteredAppointments.filter(apt => apt.date === agendaSelectedDate);
  }, [filteredAppointments, agendaSelectedDate]);

  // Dias da semana corrente para visão semanal
  const weekDays = useMemo(() => {
    return getWeekDates(agendaSelectedDate);
  }, [agendaSelectedDate]);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* 1. Cabeçalho da Agenda */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Agenda Operacional
            </h1>
            <span className="rounded-full bg-emerald-100 text-emerald-900 px-2.5 py-0.5 text-xs font-bold border border-emerald-300">
              4 Espaços
            </span>
          </div>
          {/* Subtítulo atualizado conforme solicitado */}
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Reservas, aulas e horários fixos
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Indicador de Horário de Funcionamento */}
          {operatingHours?.configured ? (
            isAdmin ? (
              <button
                type="button"
                onClick={() => setIsOperatingHoursModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                title="Ajustar horários de abertura e fechamento"
              >
                <Clock className="h-3.5 w-3.5 text-slate-500" />
                <span>{operatingHours.openTime} às {operatingHours.closeTime}</span>
                <Settings className="h-3 w-3 text-slate-400 ml-0.5" />
              </button>
            ) : (
              <span
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs"
                title="Horário oficial de funcionamento"
              >
                <Clock className="h-3.5 w-3.5 text-slate-500" />
                <span>{operatingHours.openTime} às {operatingHours.closeTime}</span>
              </span>
            )
          ) : isAdmin ? (
            <button
              type="button"
              onClick={() => setIsOperatingHoursModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition-colors"
            >
              <Clock className="h-3.5 w-3.5 text-amber-700" />
              <span>Configurar Horário</span>
            </button>
          ) : null}

          {/* Seletor Diária / Semanal */}
          <div className="flex rounded-xl bg-slate-200/80 p-1 border border-slate-300">
            <button
              type="button"
              onClick={() => setViewMode('diaria')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                viewMode === 'diaria'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Visão Diária
            </button>
            <button
              type="button"
              onClick={() => setViewMode('semanal')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                viewMode === 'semanal'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Visão Semanal
            </button>
          </div>

          {/* Botão Nova Reserva */}
          <button
            type="button"
            onClick={() => openNewAppointmentWithSlot()}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Nova Reserva</span>
          </button>
        </div>
      </div>

      {/* Alerta de Horário de Funcionamento Não Configurado */}
      {!operatingHours?.configured && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/90 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start sm:items-center gap-2.5">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-bold text-amber-950 block text-xs sm:text-sm">
                Horário de funcionamento não configurado
              </span>
              <span className="text-amber-900 text-[11px] sm:text-xs">
                Configure os horários oficiais de abertura e fechamento para que a grade da agenda reflita com fidelidade o funcionamento do Engenho da Bola.
              </span>
            </div>
          </div>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setIsOperatingHoursModalOpen(true)}
              className="shrink-0 rounded-xl bg-amber-900 px-3.5 py-2 font-bold text-white hover:bg-amber-800 transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Configurar Horário</span>
            </button>
          ) : (
            <span className="shrink-0 rounded-xl border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-900">
              Solicite ao administrador
            </span>
          )}
        </div>
      )}

      {/* 2. Barra de Navegação de Datas e Filtros */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Navegação entre dias */}
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={handlePrevDay}
                className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-slate-900 transition-colors"
                title="Dia anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleGoToday}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                  agendaSelectedDate === todayKey
                    ? 'bg-emerald-900 text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={handleNextDay}
                className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-slate-900 transition-colors"
                title="Próximo dia"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Input de Data */}
            <input
              type="date"
              value={agendaSelectedDate}
              onChange={e => setAgendaSelectedDate(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 focus:border-emerald-700 focus:outline-hidden"
            />

            <span className="text-xs font-bold text-slate-800 hidden md:inline ml-1">
              {formatDateKeyPortuguese(agendaSelectedDate)}
            </span>
          </div>

          {/* Filtro por Espaço Físico */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setAgendaSelectedSpace('todos')}
              className={`whitespace-nowrap shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                agendaSelectedSpace === 'todos'
                  ? 'bg-emerald-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Todos os Espaços
            </button>
            {COURT_SPACES.map(sp => (
              <button
                key={sp}
                type="button"
                onClick={() => {
                  setAgendaSelectedSpace(sp);
                  setWeeklySpace(sp);
                }}
                className={`whitespace-nowrap shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                  agendaSelectedSpace === sp
                    ? 'bg-emerald-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {sp}
              </button>
            ))}
          </div>
        </div>

        {/* Filtros Secundários: Modalidade, Tipo e Legenda */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1 text-slate-500 font-medium">
            <Filter className="h-3.5 w-3.5" />
            <span>Filtros:</span>
          </div>

          {/* Modalidade */}
          <select
            value={agendaFilterModality}
            onChange={e => setAgendaFilterModality(e.target.value as any)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
          >
            <option value="todas">Todas as modalidades</option>
            <option value="beach_tennis">Beach Tennis</option>
            <option value="futevolei">Futevôlei</option>
            <option value="society">Society</option>
            <option value="funcional_outro">Funcional / Outro</option>
          </select>

          {/* Tipo de Agendamento */}
          <select
            value={agendaFilterType}
            onChange={e => setAgendaFilterType(e.target.value as any)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
          >
            <option value="todos">Todos os tipos</option>
            <option value="locacao_avulsa">Locação Avulsa</option>
            <option value="mensalista">Horário Mensal</option>
            <option value="aula">Aula / Treino</option>
            <option value="evento">Evento Multi-Espaço</option>
            <option value="bloqueio">Bloqueio Técnico</option>
          </select>

          {/* Legenda de Cores Acompanhadas de Texto */}
          <div className="ml-auto hidden xl:flex items-center gap-3 text-[11px] font-medium text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-500 border border-amber-600" /> Avulsa
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-sky-500 border border-sky-600" /> Mensal
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600 border border-emerald-700" /> Aula
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-purple-600 border border-purple-700" /> Evento
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-500 border border-rose-600" /> Bloqueio
            </span>
          </div>
        </div>
      </div>

      {/* 3. VISÃO DIÁRIA — Grade dos 4 Espaços (Desktop) & Lista Cronológica (Mobile) */}
      {viewMode === 'diaria' && (
        <>
          {/* VISÃO CELULAR: Lista Cronológica com ações fáceis de tocar */}
          <div className="block md:hidden space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1">
              <span>Reservas do Dia ({dayAppointments.length})</span>
              <span>{formatDateKeyPortuguese(agendaSelectedDate)}</span>
            </div>

            {dayAppointments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500">
                <Calendar className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="font-bold text-slate-700 text-sm">Nenhuma reserva neste dia</p>
                <p className="mt-1">Todos os 4 espaços estão livres para agendamento.</p>
                <button
                  type="button"
                  onClick={() => openNewAppointmentWithSlot()}
                  className="mt-3 inline-flex items-center gap-1 rounded-xl bg-emerald-900 px-4 py-2 text-xs font-bold text-white shadow-xs"
                >
                  <Plus className="h-4 w-4" /> Reservar Horário
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {dayAppointments.map(apt => {
                  const typeStyle = APPOINTMENT_TYPE_STYLES[apt.type];
                  const statusInfo = APPOINTMENT_STATUS_LABELS[apt.status];
                  const spaces = getAppointmentSpaces(apt);

                  return (
                    <div
                      key={apt.id}
                      onClick={() => setSelectedAppointmentId(apt.id)}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-emerald-600 transition-all cursor-pointer relative overflow-hidden"
                    >
                      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${typeStyle.barColor}`} />

                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-slate-900">
                              {spaces.join(' + ')}
                            </span>
                            <span className={`rounded-md border px-1.5 py-0.2 text-[9px] font-bold ${typeStyle.pillColor}`}>
                              {typeStyle.label}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 mt-1">{apt.title}</h3>
                          <p className="text-xs text-slate-600 mt-0.5">{apt.hostName}</p>
                        </div>

                        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${statusInfo.badgeClass}`}>
                          {statusInfo.label}
                        </span>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 font-bold text-slate-800 tabular-nums">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          {apt.startTime} às {apt.endTime}
                        </span>

                        <div className="flex items-center gap-2">
                          {apt.priceCents !== undefined && (
                            <span className="font-bold text-emerald-950">
                              {formatCentsToBRL(apt.priceCents)}
                            </span>
                          )}
                          {apt.linkedGroupRentalId ? (
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                              Em Atendimento
                            </span>
                          ) : apt.type === 'locacao_avulsa' ? (
                            <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                              Iniciar
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* VISÃO DESKTOP: Grade Operacional com Horários Visíveis e 4 Colunas de Espaços */}
          <div className="hidden md:block rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
            {/* Topo da Grade: Colunas dos 4 Espaços */}
            <div className="grid grid-cols-[80px_repeat(4,1fr)] border-b border-slate-200 bg-slate-50 text-center divide-x divide-slate-200">
              <div className="p-3 flex items-center justify-center font-bold text-xs text-slate-500 uppercase tracking-wider">
                Horário
              </div>
              {COURT_SPACES.map(sp => {
                const details = COURT_DETAILS[sp];
                const courtApts = dayAppointments.filter(a => getAppointmentSpaces(a).includes(sp));

                return (
                  <div key={sp} className="p-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="font-bold text-sm text-slate-900">{sp}</span>
                      <span className="rounded-full bg-slate-200 text-slate-700 px-2 py-0.2 text-[10px] font-bold">
                        {courtApts.length}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {details.description}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Linhas da Grade de Horários */}
            <div className="divide-y divide-slate-100">
              {operatingTimeSlots.map((slotTime, slotIndex) => {
                const [hStr, mStr] = slotTime.split(':');
                const nextHourNum = (parseInt(hStr, 10) + 1) % 24;
                const nextSlotTime = `${String(nextHourNum).padStart(2, '0')}:${mStr}`;

                return (
                  <div
                    key={slotTime}
                    className="grid grid-cols-[80px_repeat(4,1fr)] divide-x divide-slate-100 min-h-[58px] hover:bg-slate-50/40 transition-colors"
                  >
                    {/* Coluna do Horário Visível */}
                    <div className="p-2 flex flex-col items-center justify-start text-center bg-slate-50/70 border-r border-slate-200 select-none">
                      <span className="text-xs font-bold text-slate-700 tabular-nums">
                        {slotTime}
                      </span>
                      <span className="text-[10px] text-slate-400 tabular-nums">
                        {nextSlotTime}
                      </span>
                    </div>

                    {/* Células dos 4 Espaços Físicos */}
                    {COURT_SPACES.map(sp => {
                      // Procura agendamento que sobreponha este intervalo de 1 hora
                      const matchingApts = dayAppointments.filter(apt => {
                        const aptSpaces = getAppointmentSpaces(apt);
                        if (!aptSpaces.includes(sp)) return false;
                        return intervalsOverlap(slotTime, nextSlotTime, apt.startTime, apt.endTime);
                      });

                      // Se houver agendamento
                      if (matchingApts.length > 0) {
                        return (
                          <div key={sp} className="p-1.5 space-y-1">
                            {matchingApts.map(apt => {
                              const typeStyle = APPOINTMENT_TYPE_STYLES[apt.type];
                              const statusInfo = APPOINTMENT_STATUS_LABELS[apt.status];
                              const isFirstSlot = timeToMinutes(apt.startTime) <= timeToMinutes(slotTime);

                              return (
                                <div
                                  key={apt.id}
                                  onClick={() => setSelectedAppointmentId(apt.id)}
                                  className={`rounded-xl border p-2 text-left cursor-pointer transition-all hover:shadow-xs relative overflow-hidden ${typeStyle.bg} ${typeStyle.border}`}
                                >
                                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${typeStyle.barColor}`} />

                                  <div className="pl-1">
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="font-bold text-xs text-slate-900 truncate">
                                        {apt.title}
                                      </span>
                                      <span className={`px-1.5 py-0.2 rounded-md text-[9px] font-bold border shrink-0 ${typeStyle.pillColor}`}>
                                        {typeStyle.label}
                                      </span>
                                    </div>

                                    <div className="flex items-center justify-between text-[11px] text-slate-600 mt-1">
                                      <span className="truncate">{apt.hostName}</span>
                                      <span className="tabular-nums font-semibold text-slate-800 shrink-0">
                                        {apt.startTime} - {apt.endTime}
                                      </span>
                                    </div>

                                    <div className="flex items-center justify-between mt-1 text-[10px]">
                                      <span className={`font-semibold ${statusInfo.badgeClass} px-1.5 py-0.2 rounded-md`}>
                                        {statusInfo.label}
                                      </span>

                                      {apt.linkedGroupRentalId ? (
                                        <span className="font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded-md">
                                          Em Atendimento
                                        </span>
                                      ) : apt.priceCents ? (
                                        <span className="font-bold text-emerald-950">
                                          {formatCentsToBRL(apt.priceCents)}
                                        </span>
                                      ) : apt.monthlyPriceCents ? (
                                        <span className="text-sky-900 font-bold">
                                          {formatCentsToBRL(apt.monthlyPriceCents)}/mês
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      }

                      // Horário Livre: Permite clicar para abrir cadastro com espaço e horário já preenchidos
                      return (
                        <div
                          key={sp}
                          onClick={() => {
                            openNewAppointmentWithSlot({
                              space: sp,
                              date: agendaSelectedDate,
                              startTime: slotTime,
                              endTime: nextSlotTime,
                            });
                          }}
                          className="group relative p-2 h-full flex items-center justify-center cursor-pointer hover:bg-emerald-50/50 transition-colors"
                          title={`Clique para reservar ${sp} das ${slotTime} às ${nextSlotTime}`}
                        >
                          <span className="opacity-0 group-hover:opacity-100 text-[11px] font-bold text-emerald-800 flex items-center gap-1 transition-opacity bg-white/80 px-2 py-1 rounded-lg border border-emerald-300 shadow-2xs">
                            <Plus className="h-3 w-3" />
                            <span>Reservar {slotTime}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* 4. VISÃO SEMANAL — Filtrada por Espaço Selecionado */}
      {viewMode === 'semanal' && (
        <div className="space-y-3">
          {/* Seletor do Espaço na Visão Semanal */}
          <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 p-3 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Espaço analisado:</span>
              <div className="flex gap-1.5">
                {COURT_SPACES.map(sp => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => setWeeklySpace(sp)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                      weeklySpace === sp
                        ? 'bg-emerald-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {sp}
                  </button>
                ))}
              </div>
            </div>

            <span className="text-xs text-slate-500 hidden sm:inline">
              Visão dos 7 dias para planejamento de horários fixos e avulsos
            </span>
          </div>

          {/* Grade dos 7 Dias da Semana */}
          <div className="grid grid-cols-1 md:grid-cols-7 gap-2.5">
            {weekDays.map(dayKey => {
              const dayApts = filteredAppointments.filter(
                a => a.date === dayKey && getAppointmentSpaces(a).includes(weeklySpace)
              );
              dayApts.sort((a, b) => a.startTime.localeCompare(b.startTime));
              const isToday = dayKey === todayKey;

              return (
                <div
                  key={dayKey}
                  className={`rounded-2xl border p-3 flex flex-col justify-between min-h-[300px] ${
                    isToday
                      ? 'border-emerald-500 bg-emerald-50/20 shadow-xs'
                      : 'border-slate-200 bg-white shadow-2xs'
                  }`}
                >
                  <div>
                    {/* Cabeçalho do Dia */}
                    <div className="border-b border-slate-100 pb-2 mb-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">
                          {formatDateKeyPortuguese(dayKey).split(',')[0]}
                        </span>
                        {isToday && (
                          <span className="rounded-md bg-emerald-900 text-white text-[9px] font-bold px-1.5 py-0.2">
                            Hoje
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500">
                        {dayKey.split('-').reverse().slice(0, 2).join('/')} · {dayApts.length} reservas
                      </span>
                    </div>

                    {/* Cards das Reservas do Dia */}
                    <div className="space-y-2">
                      {dayApts.length === 0 ? (
                        <p className="text-[11px] text-slate-400 py-6 text-center italic">
                          Livre
                        </p>
                      ) : (
                        dayApts.map(apt => {
                          const typeStyle = APPOINTMENT_TYPE_STYLES[apt.type];
                          return (
                            <div
                              key={apt.id}
                              onClick={() => setSelectedAppointmentId(apt.id)}
                              className={`rounded-lg border p-2 text-left cursor-pointer hover:shadow-xs transition-all ${typeStyle.bg} ${typeStyle.border}`}
                            >
                              <div className="flex items-center justify-between text-[10px] font-bold">
                                <span className="tabular-nums text-slate-900">
                                  {apt.startTime} - {apt.endTime}
                                </span>
                                <span className={`px-1 rounded-sm text-[8px] font-bold ${typeStyle.pillColor}`}>
                                  {typeStyle.label}
                                </span>
                              </div>
                              <p className="text-xs font-bold text-slate-900 mt-1 truncate">
                                {apt.title}
                              </p>
                              <p className="text-[10px] text-slate-600 truncate">{apt.hostName}</p>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setAgendaSelectedDate(dayKey);
                      setAgendaSelectedSpace(weeklySpace);
                      openNewAppointmentWithSlot({
                        space: weeklySpace,
                        date: dayKey,
                        startTime: '18:00',
                        endTime: '19:00',
                      });
                    }}
                    className="mt-3 w-full rounded-lg border border-dashed border-slate-300 py-1.5 text-[10px] font-bold text-slate-600 hover:border-emerald-600 hover:text-emerald-900 transition-colors"
                  >
                    + Agendar
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modais da Agenda Operacional */}
      <NewAppointmentModal />

      {selectedAppointmentId && (
        <AppointmentDetailModal
          appointmentId={selectedAppointmentId}
          onClose={() => setSelectedAppointmentId(null)}
        />
      )}

      <EditAppointmentModal />
      <OperatingHoursModal />
    </div>
  );
}
