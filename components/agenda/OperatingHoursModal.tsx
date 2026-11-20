'use client';

import React, { useState } from 'react';
import { useComandas } from '@/context/ComandasContext';
import {
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  Settings,
} from 'lucide-react';
import { AgendaOperatingHours } from '@/lib/types';

function OperatingHoursForm({
  operatingHours,
  onClose,
  onSave,
}: {
  operatingHours: AgendaOperatingHours | null;
  onClose: () => void;
  onSave: (openTime: string, closeTime: string, slotInterval: number) => Promise<{ success: boolean; error?: string }>;
}) {
  const [openTime, setOpenTime] = useState(operatingHours?.configured ? operatingHours.openTime : '07:00');
  const [closeTime, setCloseTime] = useState(operatingHours?.configured ? operatingHours.closeTime : '23:00');
  const [slotInterval, setSlotInterval] = useState(operatingHours?.slotIntervalMinutes || 60);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!openTime || !closeTime) {
      setError('Informe os horários de abertura e fechamento.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await onSave(openTime, closeTime, slotInterval);
      if (!res.success) {
        setError(res.error || 'Falha ao salvar horários.');
        setSubmitting(false);
        return;
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado ao salvar.');
      setSubmitting(false);
    }
  };

  return (
    <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
      {/* Topo */}
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-emerald-100 p-1.5 text-emerald-900 border border-emerald-300">
            <Clock className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Horário de Funcionamento</h2>
            <p className="text-xs text-slate-500">Configuração operacional da grade da agenda</p>
          </div>
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
      <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-semibold">Erro ao salvar:</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        <p className="text-slate-600 leading-relaxed">
          Defina o horário oficial de abertura e fechamento das quadras para que a visualização diária da grade no computador reflita com precisão os horários reais do Engenho da Bola.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Abertura *
            </label>
            <input
              type="time"
              required
              value={openTime}
              onChange={e => setOpenTime(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-hidden"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Fechamento *
            </label>
            <input
              type="time"
              required
              value={closeTime}
              onChange={e => setCloseTime(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-hidden"
            />
          </div>
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1.5">
            Sugestões Rápidas:
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setOpenTime('07:00');
                setCloseTime('23:00');
              }}
              className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-left hover:bg-slate-100 transition-colors"
            >
              <span className="font-bold text-slate-900 block">07:00 às 23:00</span>
              <span className="text-[10px] text-slate-500">Padrão Arenas Esportivas</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpenTime('06:00');
                setCloseTime('00:00');
              }}
              className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-left hover:bg-slate-100 transition-colors"
            >
              <span className="font-bold text-slate-900 block">06:00 às 00:00</span>
              <span className="text-[10px] text-slate-500">Horário Estendido</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-900 px-4 py-2 font-bold text-white shadow-xs hover:bg-emerald-800 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>{submitting ? 'Salvando...' : 'Salvar Horário'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

export function OperatingHoursModal() {
  const {
    isOperatingHoursModalOpen,
    setIsOperatingHoursModalOpen,
    operatingHours,
    saveOperatingHours,
  } = useComandas();

  if (!isOperatingHoursModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <OperatingHoursForm
        key={operatingHours?.updatedAt || (operatingHours?.configured ? 'configured' : 'empty')}
        operatingHours={operatingHours}
        onClose={() => setIsOperatingHoursModalOpen(false)}
        onSave={saveOperatingHours}
      />
    </div>
  );
}
