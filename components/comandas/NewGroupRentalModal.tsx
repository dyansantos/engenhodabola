'use client';

import React, { useState } from 'react';
import { useComandas } from '@/context/ComandasContext';
import { X, Calendar, Clock, MapPin, Users, DollarSign, AlertCircle, Sparkles } from 'lucide-react';
import { CourtSpace } from '@/lib/types';
import { calculateEqualDivisionCents } from '@/lib/firestore-transactions';
import { formatCentsToBRL } from '@/lib/formatters';

const COURT_SPACES: CourtSpace[] = [
  'Areia 1',
  'Areia 2',
  'Areia 3',
  'Society',
];

export function NewGroupRentalModal() {
  const {
    isNewGroupRentalModalOpen,
    setIsNewGroupRentalModalOpen,
    createGroupRental,
    setSelectedGroupRentalId,
  } = useComandas();

  const [groupName, setGroupName] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('19:00');
  const [space, setSpace] = useState<CourtSpace>('Society');
  const [totalAmountStr, setTotalAmountStr] = useState('150,00');
  const [participantCount, setParticipantCount] = useState<number>(10);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isNewGroupRentalModalOpen) return null;

  // Converter valor em centavos
  const parseAmountToCents = (val: string): number => {
    const cleaned = val.replace(/[^\d.,]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    if (isNaN(num) || num <= 0) return 0;
    return Math.round(num * 100);
  };

  const totalCents = parseAmountToCents(totalAmountStr);
  const previewDivision =
    totalCents > 0 && participantCount > 0
      ? calculateEqualDivisionCents(totalCents, participantCount)
      : [];

  const handleClose = () => {
    if (isSubmitting) return;
    setIsNewGroupRentalModalOpen(false);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    const cleanGroupName = groupName.trim();
    if (!cleanGroupName) {
      setError('Informe o nome do grupo ou responsável (ex: Turma das Terças, Rafael Society).');
      return;
    }

    if (!date) {
      setError('Informe a data da locação.');
      return;
    }

    if (!time) {
      setError('Informe o horário da locação.');
      return;
    }

    if (totalCents <= 0) {
      setError('Informe um valor total de locação válido e maior que zero.');
      return;
    }

    if (participantCount < 1 || participantCount > 100) {
      setError('A quantidade de participantes deve estar entre 1 e 100.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createGroupRental({
        groupName: cleanGroupName,
        date,
        time,
        space,
        totalAmountCents: totalCents,
        participantsCount: participantCount,
      });

      if (!res.success || !res.rental) {
        setError(res.error || 'Erro ao registrar locação em grupo.');
        return;
      }

      setIsNewGroupRentalModalOpen(false);
      setSelectedGroupRentalId(res.rental.id);
      // Resetar formulário
      setGroupName('');
      setTotalAmountStr('150,00');
      setParticipantCount(10);
      setNotes('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha inesperada ao registrar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">
                Nova Locação em Grupo
              </h2>
              <p className="text-xs text-slate-400">
                Divisão por participantes para quadras e society
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2 text-rose-300 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Nome do Grupo ou Responsável */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Nome do Grupo ou Responsável *
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="Ex: Turma do Futevôlei, Society Sexta, Marcelo"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-sm"
            />
          </div>

          {/* Espaço (Quadra/Campo) */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Espaço / Quadra *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {COURT_SPACES.map((court) => {
                const isSelected = space === court;
                return (
                  <button
                    key={court}
                    type="button"
                    onClick={() => setSpace(court)}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-medium transition flex flex-col items-center gap-1 ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-sm'
                        : 'bg-slate-800/50 border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{court}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Data e Horário (Informativos nesta etapa) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Data do Jogo *
              </label>
              <div className="relative">
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
                />
                <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Horário *
              </label>
              <div className="relative">
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
                />
                <Clock className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Aviso informativo */}
          <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl text-xs text-slate-400 flex items-start gap-2">
            <span className="text-amber-400 font-bold">ℹ</span>
            <span>
              O horário é informativo para este acerto de contas e <strong>não</strong> representa
              reserva confirmada na grade enquanto o módulo de agendamento não for acionado.
            </span>
          </div>

          {/* Valor Total e Quantidade de Participantes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Valor Total da Locação (R$) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-slate-400 text-sm font-semibold">
                  R$
                </span>
                <input
                  type="text"
                  required
                  placeholder="150,00"
                  value={totalAmountStr}
                  onChange={(e) => setTotalAmountStr(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white font-semibold text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Qtd. de Participantes *
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="50"
                  required
                  value={participantCount}
                  onChange={(e) => setParticipantCount(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white font-semibold text-sm focus:outline-none focus:border-amber-500"
                />
                {/* Botões rápidos */}
                <div className="flex gap-1 shrink-0">
                  {[6, 8, 10, 12, 14].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setParticipantCount(n)}
                      className={`px-2 py-2 text-xs rounded-lg border ${
                        participantCount === n
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Prévia da Divisão de Contas */}
          {previewDivision.length > 0 && (
            <div className="p-3.5 bg-slate-800/70 border border-slate-700/80 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Divisão exata por pessoa:
                </span>
                <span className="text-xs text-slate-400">
                  Soma:{' '}
                  <strong className="text-slate-200">
                    {formatCentsToBRL(
                      previewDivision.reduce((acc, curr) => acc + curr, 0)
                    )}
                  </strong>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {(() => {
                  const min = Math.min(...previewDivision);
                  const max = Math.max(...previewDivision);
                  if (min === max) {
                    return (
                      <span className="px-2.5 py-1 bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded-lg font-medium">
                        {participantCount}x de <strong>{formatCentsToBRL(min)}</strong>
                      </span>
                    );
                  }
                  const maxCount = previewDivision.filter((v) => v === max).length;
                  const minCount = previewDivision.filter((v) => v === min).length;
                  return (
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded-lg font-medium">
                        {maxCount}x de <strong>{formatCentsToBRL(max)}</strong>
                      </span>
                      <span className="text-slate-500">+</span>
                      <span className="px-2 py-1 bg-slate-800 text-slate-300 border border-slate-700 rounded-lg font-medium">
                        {minCount}x de <strong>{formatCentsToBRL(min)}</strong>
                      </span>
                      <span className="text-[11px] text-slate-400">
                        (centavos distribuídos explicitamente)
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Observações Opcionais */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Observações (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: Pagam até 21h, incluir luz"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-white rounded-xl transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 text-sm font-semibold text-slate-900 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 rounded-xl transition shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                  <span>Registrando...</span>
                </>
              ) : (
                <>
                  <Users className="w-4 h-4" />
                  <span>Criar Locação em Grupo</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
