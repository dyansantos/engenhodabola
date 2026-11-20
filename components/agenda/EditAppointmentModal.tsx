'use client';

import React, { useState } from 'react';
import { useComandas } from '@/context/ComandasContext';
import {
  X,
  Clock,
  MapPin,
  AlertCircle,
  Phone,
  Sparkles,
  Info,
} from 'lucide-react';
import { CourtSpace, SportModality, Appointment } from '@/lib/types';
import {
  COURT_SPACES,
  MODALITY_LABELS,
  isEndTimeAfterStartTime,
  getAppointmentSpaces,
  formatDateKeyPortuguese,
} from '@/lib/agenda-helpers';
import { parseMonetaryInputToCents } from '@/lib/formatters';

function EditAppointmentForm({
  appointment,
  onClose,
  onUpdate,
}: {
  appointment: Appointment;
  onClose: () => void;
  onUpdate: (params: any) => Promise<{ success: boolean; appointment?: Appointment; updatedCount?: number; error?: string }>;
}) {
  const [hostName, setHostName] = useState(appointment.hostName || '');
  const [hostPhone, setHostPhone] = useState(appointment.hostPhone || '');
  const [title, setTitle] = useState(appointment.title || '');
  const [space, setSpace] = useState<CourtSpace>(appointment.space);
  const [selectedSpaces, setSelectedSpaces] = useState<CourtSpace[]>(getAppointmentSpaces(appointment));
  const [modality, setModality] = useState<SportModality>(appointment.modality);
  const [date, setDate] = useState(appointment.date);
  const [startTime, setStartTime] = useState(appointment.startTime);
  const [endTime, setEndTime] = useState(appointment.endTime);
  const [priceInput, setPriceInput] = useState(
    appointment.priceCents !== undefined
      ? (appointment.priceCents / 100).toFixed(2).replace('.', ',')
      : ''
  );
  const [notes, setNotes] = useState(appointment.notes || '');
  const [scope, setScope] = useState<'only_this' | 'this_and_following'>('only_this');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMultiSpace = appointment.type === 'evento';
  const hasLinkedRental = !!appointment.linkedGroupRentalId;
  const isSeriesOccurrence = !!appointment.recurringSeriesId;

  const toggleEventSpace = (sp: CourtSpace) => {
    if (selectedSpaces.includes(sp)) {
      if (selectedSpaces.length === 1) return;
      setSelectedSpaces(selectedSpaces.filter(s => s !== sp));
    } else {
      setSelectedSpaces([...selectedSpaces, sp]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!hostName.trim()) {
      setError('Informe o responsável pela reserva.');
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
      const priceCents = priceInput.trim() ? parseMonetaryInputToCents(priceInput) : undefined;

      const res = await onUpdate({
        appointmentId: appointment.id,
        title: title.trim() || `${appointment.type === 'locacao_avulsa' ? 'Reserva' : appointment.type}: ${hostName.trim()}`,
        hostName: hostName.trim(),
        hostPhone: hostPhone.trim() || undefined,
        space,
        spaces: isMultiSpace ? selectedSpaces : undefined,
        modality,
        date,
        startTime,
        endTime,
        priceCents,
        notes: notes.trim() || undefined,
        scope: isSeriesOccurrence ? scope : 'only_this',
      });

      if (!res.success) {
        setError(res.error || 'Falha ao atualizar reserva.');
        setSubmitting(false);
        return;
      }

      onClose();
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado ao salvar alterações.');
      setSubmitting(false);
    }
  };

  return (
    <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 my-8 overflow-hidden">
      {/* Topo */}
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">Editar Reserva</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Revalidação automática de conflitos com proteção simultânea
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

      {/* Formulário */}
      <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-semibold">Não foi possível salvar:</p>
              <p className="mt-0.5 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* Seleção de Escopo para Séries Recorrentes */}
        {isSeriesOccurrence && (
          <div className="rounded-xl border border-sky-300 bg-sky-50/70 p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-sky-950">
              <Info className="h-4 w-4 text-sky-700" />
              <span>Esta reserva faz parte de uma série semanal fixa</span>
            </div>
            <p className="text-[11px] text-sky-900">
              Escolha o alcance das alterações. O histórico passado permanece preservado:
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setScope('only_this')}
                className={`rounded-xl border p-2 text-left text-xs font-bold transition-all ${
                  scope === 'only_this'
                    ? 'border-sky-600 bg-white text-sky-950 shadow-xs ring-2 ring-sky-400/30'
                    : 'border-sky-200 bg-sky-100/50 text-sky-800 hover:bg-white'
                }`}
              >
                Apenas esta ocorrência
                <span className="block text-[10px] font-normal text-slate-500 mt-0.5">
                  Modifica somente o dia {formatDateKeyPortuguese(date)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setScope('this_and_following')}
                className={`rounded-xl border p-2 text-left text-xs font-bold transition-all ${
                  scope === 'this_and_following'
                    ? 'border-sky-600 bg-white text-sky-950 shadow-xs ring-2 ring-sky-400/30'
                    : 'border-sky-200 bg-sky-100/50 text-sky-800 hover:bg-white'
                }`}
              >
                Esta e as próximas
                <span className="block text-[10px] font-normal text-slate-500 mt-0.5">
                  Aplica novo horário a todas as datas futuras
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Responsável e Telefone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Responsável / Cliente *
            </label>
            <input
              type="text"
              required
              value={hostName}
              onChange={e => setHostName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-hidden"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Phone className="h-3 w-3 text-slate-400" />
              Telefone / WhatsApp
            </label>
            <input
              type="text"
              placeholder="(11) 98765-4321"
              value={hostPhone}
              onChange={e => setHostPhone(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Espaço Físico */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-slate-400" />
            Espaço Físico {isMultiSpace ? '(Múltiplos selecionados)' : ''}
          </label>
          {isMultiSpace ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {COURT_SPACES.map(sp => {
                const isSel = selectedSpaces.includes(sp);
                return (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => toggleEventSpace(sp)}
                    className={`rounded-xl border p-2 text-center text-xs font-bold transition-all ${
                      isSel
                        ? 'border-purple-600 bg-purple-50 text-purple-950 ring-2 ring-purple-400/20'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {sp}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {COURT_SPACES.map(sp => {
                const isSel = space === sp;
                return (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => {
                      setSpace(sp);
                      setSelectedSpaces([sp]);
                    }}
                    className={`rounded-xl border p-2 text-center text-xs font-bold transition-all ${
                      isSel
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-400/20'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {sp}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Modalidade */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Modalidade
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(MODALITY_LABELS) as SportModality[]).map(mod => (
              <button
                key={mod}
                type="button"
                onClick={() => setModality(mod)}
                className={`rounded-xl border p-2 text-center text-xs font-bold transition-all ${
                  modality === mod
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-400/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {MODALITY_LABELS[mod]}
              </button>
            ))}
          </div>
        </div>

        {/* Data e Horários */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Data (Fuso SP)
            </label>
            <input
              type="date"
              required
              disabled={isSeriesOccurrence && scope === 'this_and_following'}
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-hidden disabled:bg-slate-100 disabled:text-slate-500"
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

        {/* Valor Acordado */}
        {appointment.priceCents !== undefined && (
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Valor Acordado (R$)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-xs font-bold text-slate-400">R$</span>
              <input
                type="text"
                disabled={hasLinkedRental}
                value={priceInput}
                onChange={e => setPriceInput(e.target.value)}
                className="w-full rounded-xl border border-slate-300 pl-10 pr-3.5 py-2.5 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-hidden disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>
            {hasLinkedRental && (
              <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
                <Info className="h-3 w-3 text-amber-600" />
                Atendimento já iniciado com locação em grupo ativa. O valor não pode ser alterado aqui para manter a integridade fiscal; ajuste no fechamento do grupo.
              </p>
            )}
          </div>
        )}

        {/* Observações */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Observações
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-hidden resize-none"
          />
        </div>

        {/* Botões */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-900 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            <span>{submitting ? 'Salvando no servidor...' : 'Salvar Alterações'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

export function EditAppointmentModal() {
  const {
    isEditAppointmentModalOpen,
    setIsEditAppointmentModalOpen,
    appointmentToEdit,
    updateAppointment,
  } = useComandas();

  if (!isEditAppointmentModalOpen || !appointmentToEdit) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <EditAppointmentForm
        key={appointmentToEdit.id}
        appointment={appointmentToEdit}
        onClose={() => setIsEditAppointmentModalOpen(false)}
        onUpdate={updateAppointment}
      />
    </div>
  );
}
