'use client';

import React, { useState } from 'react';
import { useComandas } from '@/context/ComandasContext';
import {
  X,
  Play,
  ExternalLink,
  Ban,
  Clock,
  Calendar,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Phone,
  FileText,
  User,
  History,
  Info,
  Pencil,
} from 'lucide-react';
import {
  COURT_DETAILS,
  MODALITY_LABELS,
  APPOINTMENT_TYPE_STYLES,
  APPOINTMENT_STATUS_LABELS,
  getAppointmentSpaces,
  formatDateKeyPortuguese,
} from '@/lib/agenda-helpers';
import { calculateGroupRentalTotals } from '@/lib/firestore-transactions';
import { formatCentsToBRL } from '@/lib/formatters';

export function AppointmentDetailModal({
  appointmentId,
  onClose,
}: {
  appointmentId: string;
  onClose: () => void;
}) {
  const {
    appointments,
    groupRentals,
    updateAppointmentStatus,
    cancelAppointment,
    startGroupRentalFromAppointment,
    openEditAppointmentModal,
    setSelectedGroupRentalId,
    setActiveModule,
  } = useComandas();

  const appointment = appointments.find(a => a.id === appointmentId);
  const linkedGroupRental = appointment?.linkedGroupRentalId
    ? groupRentals.find(g => g.id === appointment.linkedGroupRentalId)
    : undefined;

  // Estados de Iniciar Atendimento
  const [participantsCount, setParticipantsCount] = useState<number>(4);
  const [isStartingAttendance, setIsStartingAttendance] = useState(false);
  const [startLoading, setStartLoading] = useState(false);

  // Estados de Cancelamento
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelScope, setCancelScope] = useState<'only_this' | 'this_and_following'>('only_this');
  const [cancelLoading, setCancelLoading] = useState(false);

  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  if (!appointment) return null;

  const spaces = getAppointmentSpaces(appointment);
  const typeStyle = APPOINTMENT_TYPE_STYLES[appointment.type];
  const statusInfo = APPOINTMENT_STATUS_LABELS[appointment.status];

  // Ação: Iniciar Atendimento
  const handleStartAttendance = async () => {
    setFeedbackError(null);
    setStartLoading(true);

    try {
      const res = await startGroupRentalFromAppointment(appointment.id, participantsCount);
      if (!res.success || !res.rental) {
        setFeedbackError(res.error || 'Falha ao iniciar atendimento.');
        setStartLoading(false);
        return;
      }

      // Redireciona diretamente para o fechamento da locação
      setSelectedGroupRentalId(res.rental.id);
      setActiveModule('comandas');
      onClose();
    } catch (err: any) {
      setFeedbackError(err?.message || 'Erro inesperado.');
      setStartLoading(false);
    }
  };

  // Ação: Abrir Fechamento Existente
  const handleOpenExistingRental = () => {
    if (!appointment.linkedGroupRentalId) return;
    setSelectedGroupRentalId(appointment.linkedGroupRentalId);
    setActiveModule('comandas');
    onClose();
  };

  // Ação: Alterar Status Operacional
  const handleUpdateStatus = async (newStatus: 'em_andamento' | 'concluida') => {
    setFeedbackError(null);
    const res = await updateAppointmentStatus(appointment.id, newStatus);
    if (!res.success) {
      setFeedbackError(res.error || 'Falha ao atualizar status.');
    }
  };

  // Ação: Confirmar Cancelamento
  const handleConfirmCancel = async () => {
    if (!cancelReason.trim()) {
      setFeedbackError('Por favor informe o motivo do cancelamento.');
      return;
    }

    setFeedbackError(null);
    setCancelLoading(true);

    try {
      const res = await cancelAppointment({
        appointmentId: appointment.id,
        reason: cancelReason.trim(),
        scope: cancelScope,
      });

      if (!res.success) {
        setFeedbackError(res.error || 'Falha ao cancelar reserva.');
        setCancelLoading(false);
        return;
      }

      setIsCancelling(false);
    } catch (err: any) {
      setFeedbackError(err?.message || 'Erro ao cancelar reserva.');
      setCancelLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 my-8 overflow-hidden">
        {/* Topo colorido por tipo */}
        <div className={`px-6 py-4 border-b border-slate-200 flex items-center justify-between ${typeStyle.bg}`}>
          <div>
            <div className="flex items-center gap-2">
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${typeStyle.pillColor}`}>
                {typeStyle.label}
              </span>
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${statusInfo.badgeClass}`}>
                {statusInfo.label}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1">{appointment.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {feedbackError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <p className="font-semibold">Aviso:</p>
                <p className="mt-0.5 leading-relaxed">{feedbackError}</p>
              </div>
            </div>
          )}

          {/* Destaques da Reserva */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-xs">
            <div>
              <span className="text-slate-500 font-medium">Espaço(s):</span>
              <p className="font-bold text-slate-900 mt-0.5">{spaces.join(' + ')}</p>
            </div>
            <div>
              <span className="text-slate-500 font-medium">Modalidade:</span>
              <p className="font-bold text-slate-900 mt-0.5">{MODALITY_LABELS[appointment.modality]}</p>
            </div>
            <div>
              <span className="text-slate-500 font-medium">Horário:</span>
              <p className="font-bold text-slate-900 mt-0.5 tabular-nums">
                {appointment.startTime} às {appointment.endTime}
              </p>
            </div>
            <div>
              <span className="text-slate-500 font-medium">Data:</span>
              <p className="font-bold text-slate-900 mt-0.5">{formatDateKeyPortuguese(appointment.date)}</p>
            </div>
            <div>
              <span className="text-slate-500 font-medium">Responsável:</span>
              <p className="font-bold text-slate-900 mt-0.5">{appointment.hostName}</p>
            </div>
            <div>
              <span className="text-slate-500 font-medium">Valor Acordado:</span>
              <p className="font-bold text-emerald-950 mt-0.5">
                {appointment.priceCents !== undefined
                  ? formatCentsToBRL(appointment.priceCents)
                  : appointment.monthlyPriceCents !== undefined
                  ? `${formatCentsToBRL(appointment.monthlyPriceCents)}/mês`
                  : '—'}
              </p>
            </div>
          </div>

          {/* Telefone e Notas */}
          {(appointment.hostPhone || appointment.notes) && (
            <div className="space-y-1.5 text-xs">
              {appointment.hostPhone && (
                <div className="flex items-center gap-1.5 text-slate-700">
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-semibold">Telefone:</span> {appointment.hostPhone}
                </div>
              )}
              {appointment.notes && (
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-slate-600">
                  <span className="font-bold text-slate-800 block mb-0.5">Observações:</span>
                  <p className="leading-relaxed">{appointment.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* VÍNCULO FINANCEIRO COM LOCAÇÃO EM GRUPO */}
          {appointment.linkedGroupRentalId && linkedGroupRental && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <Play className="h-4 w-4 text-emerald-700" />
                  Fechamento por Participantes Vinculado
                </span>
                {(() => {
                  const totals = calculateGroupRentalTotals(linkedGroupRental);
                  if (totals.isFullyPaid) {
                    return (
                      <span className="text-[11px] font-bold text-emerald-800 bg-emerald-200/80 px-2 py-0.5 rounded-md">
                        Totalmente Quitada
                      </span>
                    );
                  }
                  if (totals.totalPaidCents > 0) {
                    return (
                      <span className="text-[11px] font-bold text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded-md">
                        Pagamento Parcial
                      </span>
                    );
                  }
                  return (
                    <span className="text-[11px] font-bold text-slate-700 bg-slate-200/80 px-2 py-0.5 rounded-md">
                      Pendente
                    </span>
                  );
                })()}
              </div>

              {(() => {
                const totals = calculateGroupRentalTotals(linkedGroupRental);
                return (
                  <div className="grid grid-cols-3 gap-2 bg-white/90 p-2.5 rounded-lg border border-emerald-200/60 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold block">Total Locação</span>
                      <span className="font-bold text-slate-900">{formatCentsToBRL(totals.totalAmountCents)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold block">Total Recebido</span>
                      <span className="font-bold text-emerald-700">{formatCentsToBRL(totals.totalPaidCents)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold block">Saldo Pendente</span>
                      <span className={`font-bold ${totals.pendingBalanceCents > 0 ? 'text-amber-800' : 'text-slate-900'}`}>
                        {formatCentsToBRL(totals.pendingBalanceCents)}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <button
                type="button"
                onClick={handleOpenExistingRental}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-900 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Abrir Fechamento do Grupo (Locação #{linkedGroupRental.number})</span>
              </button>
            </div>
          )}

          {/* FLUXO 1: Iniciar Atendimento para Locação Avulsa (sem locação vinculada ainda) */}
          {appointment.type === 'locacao_avulsa' && !appointment.linkedGroupRentalId && appointment.status !== 'cancelada' && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <Play className="h-4 w-4 text-emerald-700" />
                  Fechamento por Participantes
                </span>
              </div>

              {isStartingAttendance ? (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Quantidade de Participantes para Divisão:
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={participantsCount}
                        onChange={e => setParticipantsCount(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-24 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-emerald-700 focus:outline-hidden"
                      />
                      <span className="text-xs text-slate-600">
                        {appointment.priceCents
                          ? `≈ ${formatCentsToBRL(Math.round(appointment.priceCents / participantsCount))} por participante`
                          : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsStartingAttendance(false)}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      disabled={startLoading}
                      onClick={handleStartAttendance}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-900 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{startLoading ? 'Criando locação...' : 'Confirmar e Abrir Fechamento'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Aproveite os dados desta reserva para abrir o rateio individual entre os jogadores sem precisar redigitar.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsStartingAttendance(true)}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-emerald-900 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 transition-colors"
                  >
                    <Play className="h-4 w-4" />
                    <span>Iniciar Atendimento em Grupo</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* FLUXO 2: Horários Mensais e Aulas (Indicação de Cobrança Pertencente à Mensalidade) */}
          {(appointment.type === 'mensalista' || appointment.type === 'aula') && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 text-xs text-sky-950 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-sky-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Cobrança Pertencente à Mensalidade</p>
                <p className="mt-0.5 text-sky-900 leading-relaxed text-[11px]">
                  Horários mensais e aulas não geram cobrança avulsa por encontro na agenda. O recebimento é gerido via fatura mensal no módulo específico.
                </p>
              </div>
            </div>
          )}

          {/* FLUXO 3: Bloqueio Técnico */}
          {appointment.type === 'bloqueio' && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 text-xs text-rose-950 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-rose-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Bloqueio Técnico de Manutenção</p>
                <p className="mt-0.5 text-rose-900 leading-relaxed text-[11px]">
                  Este espaço está reservado para manutenção técnica, limpeza ou reparos. Não gera locação avulsa nem cobrança.
                </p>
              </div>
            </div>
          )}

          {/* Ações Operacionais de Situação da Quadra e Edição */}
          {appointment.status !== 'cancelada' && (
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-800 block">
                Ações da Reserva:
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    openEditAppointmentModal(appointment);
                    onClose();
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-2xs"
                >
                  <Pencil className="h-3.5 w-3.5 text-slate-500" />
                  <span>Editar Reserva</span>
                </button>

                {appointment.status === 'confirmada' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus('em_andamento')}
                    className="rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-900 hover:bg-blue-100 transition-colors"
                  >
                    Marcar em Andamento
                  </button>
                )}
                {appointment.status !== 'concluida' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus('concluida')}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Marcar Concluída
                  </button>
                )}
                {!isCancelling && (
                  <button
                    type="button"
                    onClick={() => setIsCancelling(true)}
                    className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 transition-colors"
                  >
                    Cancelar Reserva
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                * Concluir o uso da quadra não altera a situação financeira do cliente nem marca a conta como paga.
              </p>
            </div>
          )}

          {/* FLUXO DE CANCELAMENTO */}
          {isCancelling && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-950 flex items-center gap-1.5">
                  <Ban className="h-4 w-4 text-rose-700" />
                  Confirmar Cancelamento da Reserva
                </span>
                <button
                  type="button"
                  onClick={() => setIsCancelling(false)}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800"
                >
                  Fechar
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Motivo do Cancelamento *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Desistência do cliente, chuva, etc."
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  className="w-full rounded-xl border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-hidden"
                />
              </div>

              {appointment.recurringSeriesId && (
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Abrangência do Cancelamento:
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCancelScope('only_this')}
                      className={`flex-1 py-1.5 text-xs rounded-lg font-bold border ${
                        cancelScope === 'only_this'
                          ? 'border-rose-600 bg-rose-100 text-rose-950'
                          : 'border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      Apenas esta data
                    </button>
                    <button
                      type="button"
                      onClick={() => setCancelScope('this_and_following')}
                      className={`flex-1 py-1.5 text-xs rounded-lg font-bold border ${
                        cancelScope === 'this_and_following'
                          ? 'border-rose-600 bg-rose-100 text-rose-950'
                          : 'border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      Esta e as próximas ocorrências
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={cancelLoading}
                onClick={handleConfirmCancel}
                className="w-full rounded-xl bg-rose-700 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-rose-800 disabled:opacity-50"
              >
                {cancelLoading ? 'Cancelando...' : 'Liberar Horário e Registrar Cancelamento'}
              </button>
            </div>
          )}

          {/* Histórico de Auditoria */}
          <div className="border-t border-slate-200 pt-3">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1 mb-2">
              <History className="h-3.5 w-3.5 text-slate-400" />
              Histórico de Ações da Reserva
            </span>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {(appointment.history || []).map(h => (
                <div key={h.id} className="rounded-lg bg-slate-50 border border-slate-100 p-2 text-[11px]">
                  <div className="flex items-center justify-between text-slate-500 font-medium">
                    <span>{h.operator}</span>
                    <span className="tabular-nums">{new Date(h.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-slate-800 font-semibold mt-0.5">{h.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
