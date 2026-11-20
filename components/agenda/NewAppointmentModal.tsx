'use client';

import React, { useState } from 'react';
import { useComandas } from '@/context/ComandasContext';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  DollarSign,
  AlertCircle,
  Sparkles,
  Repeat,
  Layers,
  Phone,
  CheckCircle2,
} from 'lucide-react';
import { CourtSpace, SportModality, AppointmentType } from '@/lib/types';
import {
  COURT_SPACES,
  COURT_DETAILS,
  MODALITY_LABELS,
  APPOINTMENT_TYPE_LABELS,
  isEndTimeAfterStartTime,
  formatDateKeyPortuguese,
} from '@/lib/agenda-helpers';
import { parseMonetaryInputToCents, reaisToCents } from '@/lib/formatters';

const DAYS_OF_WEEK = [
  { day: 1, label: 'Seg', full: 'Segunda-feira' },
  { day: 2, label: 'Ter', full: 'Terça-feira' },
  { day: 3, label: 'Qua', full: 'Quarta-feira' },
  { day: 4, label: 'Qui', full: 'Quinta-feira' },
  { day: 5, label: 'Sex', full: 'Sexta-feira' },
  { day: 6, label: 'Sáb', full: 'Sábado' },
  { day: 0, label: 'Dom', full: 'Domingo' },
];

interface NewAppointmentFormProps {
  initialSlot: { space?: CourtSpace; date?: string; startTime?: string; endTime?: string } | null;
  defaultSpace: CourtSpace;
  defaultDate: string;
  onClose: () => void;
  createAppointment: (params: any) => Promise<{ success: boolean; appointment?: any; error?: string }>;
  createRecurringSeries: (params: any) => Promise<{ success: boolean; seriesId?: string; occurrencesCreated?: number; error?: string }>;
  getRecurringPreview: (params: any) => any;
}

function NewAppointmentForm({
  initialSlot,
  defaultSpace,
  defaultDate,
  onClose,
  createAppointment,
  createRecurringSeries,
  getRecurringPreview,
}: NewAppointmentFormProps) {
  // Modo: Reserva Pontual vs. Série Recorrente
  const [isRecurring, setIsRecurring] = useState(false);

  // Inicialização direta do estado sem useEffect
  const initialSpace = initialSlot?.space || defaultSpace || 'Areia 1';
  const [space, setSpace] = useState<CourtSpace>(initialSpace);
  const [selectedSpaces, setSelectedSpaces] = useState<CourtSpace[]>([initialSpace]);
  const [hostName, setHostName] = useState('');
  const [hostPhone, setHostPhone] = useState('');
  const [title, setTitle] = useState('');
  const [modality, setModality] = useState<SportModality>('beach_tennis');
  const [date, setDate] = useState<string>(initialSlot?.date || defaultDate || '');
  const [startTime, setStartTime] = useState(initialSlot?.startTime || '18:00');
  const [endTime, setEndTime] = useState(initialSlot?.endTime || '19:00');
  const [type, setType] = useState<AppointmentType>('locacao_avulsa');
  const [priceInput, setPriceInput] = useState('120,00');
  const [notes, setNotes] = useState('');

  // Campos de Recorrência
  const [selectedDays, setSelectedDays] = useState<number[]>([1]); // Segunda
  const [recurringEndDate, setRecurringEndDate] = useState(() => {
    const baseDate = initialSlot?.date || defaultDate || '2026-10-14';
    const [y, m, d] = baseDate.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    dateObj.setUTCMonth(dateObj.getUTCMonth() + 3);
    return dateObj.toISOString().slice(0, 10);
  });
  const [monthlyPriceInput, setMonthlyPriceInput] = useState('450,00');

  // Estados de submissão e erro
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Alterna espaço em evento
  const toggleEventSpace = (sp: CourtSpace) => {
    if (selectedSpaces.includes(sp)) {
      if (selectedSpaces.length === 1) return;
      setSelectedSpaces(selectedSpaces.filter(s => s !== sp));
    } else {
      setSelectedSpaces([...selectedSpaces, sp]);
    }
  };

  // Alterna dia da semana
  const toggleDayOfWeek = (d: number) => {
    if (selectedDays.includes(d)) {
      if (selectedDays.length === 1) return;
      setSelectedDays(selectedDays.filter(day => day !== d));
    } else {
      setSelectedDays([...selectedDays, d]);
    }
  };

  // Prévia de recorrência em tempo real
  const recurringPreview = isRecurring
    ? getRecurringPreview({
        space,
        daysOfWeek: selectedDays,
        startTime,
        endTime,
        startDate: date,
        endDate: recurringEndDate,
      })
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!hostName.trim()) {
      setError('Informe o nome do cliente ou responsável.');
      return;
    }
    if (!startTime || !endTime) {
      setError('Informe os horários de início e término.');
      return;
    }
    if (!isEndTimeAfterStartTime(startTime, endTime)) {
      setError('O horário de término deve ser estritamente posterior ao início.');
      return;
    }

    setSubmitting(true);

    try {
      if (isRecurring) {
        // Criar Série Recorrente
        const monthlyCents = monthlyPriceInput.trim()
          ? parseMonetaryInputToCents(monthlyPriceInput)
          : undefined;

        const res = await createRecurringSeries({
          hostName: hostName.trim(),
          hostPhone: hostPhone.trim() || undefined,
          space,
          modality,
          type: type === 'aula' ? 'aula' : 'mensalista',
          daysOfWeek: selectedDays,
          startTime,
          endTime,
          startDate: date,
          endDate: recurringEndDate,
          monthlyPriceCents: monthlyCents,
          notes: notes.trim() || undefined,
        });

        if (!res.success) {
          setError(res.error || 'Falha ao criar série recorrente.');
          setSubmitting(false);
          return;
        }
      } else {
        // Criar Reserva Única / Multi-espaço
        const priceCents = (type === 'locacao_avulsa' || type === 'evento') && priceInput.trim()
          ? parseMonetaryInputToCents(priceInput)
          : undefined;

        const res = await createAppointment({
          title: title.trim() || `${APPOINTMENT_TYPE_LABELS[type]}: ${hostName.trim()}`,
          hostName: hostName.trim(),
          hostPhone: hostPhone.trim() || undefined,
          space,
          spaces: type === 'evento' ? selectedSpaces : undefined,
          modality,
          date,
          startTime,
          endTime,
          type,
          priceCents,
          notes: notes.trim() || undefined,
        });

        if (!res.success) {
          setError(res.error || 'Falha ao confirmar reserva.');
          setSubmitting(false);
          return;
        }
      }

      onClose();
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado ao salvar.');
      setSubmitting(false);
    }
  };

  return (
    <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 my-8 overflow-hidden">
      {/* Topo do Modal */}
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            {isRecurring ? 'Novo Horário Recorrente (Semanal)' : 'Nova Reserva de Quadra'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Engenho da Bola · Validação com proteção anti-conflito no Firestore
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Alternador: Pontual vs Recorrente */}
      <div className="px-6 pt-4">
        <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setIsRecurring(false);
              setType('locacao_avulsa');
            }}
            className={`rounded-lg py-2 text-xs font-bold transition-all ${
              !isRecurring
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Reserva Avulsa / Evento
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRecurring(true);
              setType('mensalista');
            }}
            className={`rounded-lg py-2 text-xs font-bold transition-all ${
              isRecurring
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Horário Fixo Semanal (Mensalista / Aula)
          </button>
        </div>
      </div>

      {/* Formulário */}
      <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-semibold">Não foi possível confirmar a reserva:</p>
              <p className="mt-0.5 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* Espaço Físico */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-slate-400" />
              Espaço Físico {type === 'evento' && !isRecurring ? '(Pode selecionar múltiplos)' : '*'}
            </span>
            <span className="text-[11px] font-normal text-slate-500">
              Conflito verificado pelo espaço físico
            </span>
          </label>

          {type === 'evento' && !isRecurring ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {COURT_SPACES.map(sp => {
                const isSel = selectedSpaces.includes(sp);
                const details = COURT_DETAILS[sp];
                return (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => toggleEventSpace(sp)}
                    className={`rounded-xl border p-2.5 text-left transition-all ${
                      isSel
                        ? 'border-purple-600 bg-purple-50 text-purple-950 font-bold ring-2 ring-purple-400/20'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">{sp}</span>
                      <span className="h-2 w-2 rounded-full bg-purple-600" />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate">{details.type}</p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {COURT_SPACES.map(sp => {
                const isSel = space === sp;
                const details = COURT_DETAILS[sp];
                return (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => {
                      setSpace(sp);
                      setSelectedSpaces([sp]);
                    }}
                    className={`rounded-xl border p-2.5 text-left transition-all ${
                      isSel
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold ring-2 ring-emerald-400/20'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">{sp}</span>
                      <span className={`h-2 w-2 rounded-full ${isSel ? 'bg-emerald-600' : 'bg-slate-300'}`} />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate">{details.type}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Modalidade */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Modalidade Esportiva
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(MODALITY_LABELS) as SportModality[]).map(mod => {
              const isSel = modality === mod;
              return (
                <button
                  key={mod}
                  type="button"
                  onClick={() => setModality(mod)}
                  className={`rounded-xl border p-2 text-center text-xs font-bold transition-all ${
                    isSel
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {MODALITY_LABELS[mod]}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            * Beach tennis e futevôlei compartilham as quadras de areia.
          </p>
        </div>

        {/* Cliente / Responsável */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Cliente ou Responsável *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Carlos Eduardo ou Galácticos da Areia"
              value={hostName}
              onChange={e => setHostName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Phone className="h-3 w-3 text-slate-400" />
              Telefone / WhatsApp (Opcional)
            </label>
            <input
              type="text"
              placeholder="(11) 98765-4321"
              value={hostPhone}
              onChange={e => setHostPhone(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Tipo de Agendamento */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Tipo de Agendamento
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {!isRecurring && (
              <button
                type="button"
                onClick={() => setType('locacao_avulsa')}
                className={`rounded-xl border p-2.5 text-left text-xs transition-all ${
                  type === 'locacao_avulsa'
                    ? 'border-amber-500 bg-amber-50 text-amber-950 font-bold ring-2 ring-amber-400/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <p className="font-bold">Locação Avulsa</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Permite iniciar atendimento e rateio</p>
              </button>
            )}

            <button
              type="button"
              onClick={() => setType('mensalista')}
              className={`rounded-xl border p-2.5 text-left text-xs transition-all ${
                type === 'mensalista'
                  ? 'border-sky-500 bg-sky-50 text-sky-950 font-bold ring-2 ring-sky-400/20'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <p className="font-bold">Horário Mensal</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Cobrança via mensalidade</p>
            </button>

            <button
              type="button"
              onClick={() => setType('aula')}
              className={`rounded-xl border p-2.5 text-left text-xs transition-all ${
                type === 'aula'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-950 font-bold ring-2 ring-emerald-400/20'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <p className="font-bold">Aula / Treino</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Escolinha e instrutores</p>
            </button>

            {!isRecurring && (
              <>
                <button
                  type="button"
                  onClick={() => setType('evento')}
                  className={`rounded-xl border p-2.5 text-left text-xs transition-all ${
                    type === 'evento'
                      ? 'border-purple-500 bg-purple-50 text-purple-950 font-bold ring-2 ring-purple-400/20'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <p className="font-bold">Evento / Torneio</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Múltiplos espaços</p>
                </button>

                <button
                  type="button"
                  onClick={() => setType('bloqueio')}
                  className={`rounded-xl border p-2.5 text-left text-xs transition-all ${
                    type === 'bloqueio'
                      ? 'border-rose-500 bg-rose-50 text-rose-950 font-bold ring-2 ring-rose-400/20'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <p className="font-bold">Bloqueio Técnico</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Manutenção / reparos</p>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Título opcional da Reserva */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Título ou Descrição (Opcional)
          </label>
          <input
            type="text"
            placeholder="Ex: Treino da Turma da Noite ou Aniversário"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:outline-hidden"
          />
        </div>

        {/* Horários e Datas */}
        {!isRecurring ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Data (Fuso America/Sao_Paulo) *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Horário Início
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Horário Término
              </label>
              <input
                type="time"
                required
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-hidden"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Dias da Semana Fixos
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS_OF_WEEK.map(({ day, label, full }) => {
                  const isSel = selectedDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDayOfWeek(day)}
                      title={full}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                        isSel
                          ? 'bg-emerald-900 text-white shadow-xs'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Horário Início
                </label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Horário Término
                </label>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Data Inicial
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Data Final
                </label>
                <input
                  type="date"
                  required
                  value={recurringEndDate}
                  onChange={e => setRecurringEndDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Prévia de Ocorrências e Conflitos da Série */}
            {recurringPreview && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                {recurringPreview.limitExceeded ? (
                  <div className="rounded-md border border-rose-300 bg-rose-50 p-2 text-rose-800 text-[11px] space-y-1">
                    <p className="font-bold flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
                      Limite de Período Excedido:
                    </p>
                    <p>{recurringPreview.limitError}</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between font-bold text-slate-900 mb-1.5">
                      <span>Prévia da Série Semanal:</span>
                      <span className="text-emerald-900">
                        {recurringPreview.occurrences.length} encontro(s) no período
                      </span>
                    </div>

                    {recurringPreview.conflicts.length > 0 ? (
                      <div className="rounded-md border border-rose-300 bg-rose-50 p-2 text-rose-800 text-[11px] space-y-1">
                        <p className="font-bold flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
                          A série não pode ser gravada pois contém {recurringPreview.conflicts.length} conflito(s):
                        </p>
                        {recurringPreview.conflicts.slice(0, 3).map((c: any, i: number) => (
                          <p key={i}>
                            • {formatDateKeyPortuguese(c.date)} ({c.space}, {c.startTime}-{c.endTime}) com &quot;{c.title}&quot;
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        Nenhum conflito identificado. Todas as ocorrências estão livres no espaço {space}.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Valores Combinados */}
        {isRecurring ? (
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Valor Mensal Combinado (R$) — Mensalidade de Acordo
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-xs font-bold text-slate-400">R$</span>
              <input
                type="text"
                placeholder="0,00"
                value={monthlyPriceInput}
                onChange={e => setMonthlyPriceInput(e.target.value)}
                className="w-full rounded-xl border border-slate-300 pl-10 pr-3.5 py-2.5 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-hidden"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              * Informação contratual. A cobrança mensal será gerida no módulo de mensalidades.
            </p>
          </div>
        ) : (type === 'locacao_avulsa' || type === 'evento') ? (
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Valor Combinado da Reserva (R$)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-xs font-bold text-slate-400">R$</span>
              <input
                type="text"
                placeholder="0,00"
                value={priceInput}
                onChange={e => setPriceInput(e.target.value)}
                className="w-full rounded-xl border border-slate-300 pl-10 pr-3.5 py-2.5 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-hidden"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Ao iniciar o atendimento, este valor será dividido entre os participantes da locação.
            </p>
          </div>
        ) : null}

        {/* Observações */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Observações (Opcional)
          </label>
          <textarea
            rows={2}
            placeholder="Ex: Empréstimo de 4 raquetes, bolas inclusas, etc."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-emerald-600 focus:outline-hidden resize-none"
          />
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting || (isRecurring && recurringPreview ? !recurringPreview.canConfirm : false)}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-900 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 disabled:opacity-50 transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            <span>{submitting ? 'Confirmando no servidor...' : isRecurring ? 'Criar Série Semanal' : 'Confirmar Reserva'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

export function NewAppointmentModal() {
  const {
    isNewAppointmentModalOpen,
    setIsNewAppointmentModalOpen,
    createAppointment,
    createRecurringSeries,
    getRecurringPreview,
    agendaSelectedDate,
    agendaSelectedSpace,
    newAppointmentInitialSlot,
  } = useComandas();

  if (!isNewAppointmentModalOpen) return null;

  const formKey = newAppointmentInitialSlot
    ? `${newAppointmentInitialSlot.space}_${newAppointmentInitialSlot.date}_${newAppointmentInitialSlot.startTime}_${newAppointmentInitialSlot.endTime}`
    : `${agendaSelectedSpace}_${agendaSelectedDate}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <NewAppointmentForm
        key={formKey}
        initialSlot={newAppointmentInitialSlot}
        defaultSpace={agendaSelectedSpace !== 'todos' ? agendaSelectedSpace : 'Areia 1'}
        defaultDate={agendaSelectedDate}
        onClose={() => setIsNewAppointmentModalOpen(false)}
        createAppointment={createAppointment}
        createRecurringSeries={createRecurringSeries}
        getRecurringPreview={getRecurringPreview}
      />
    </div>
  );
}
