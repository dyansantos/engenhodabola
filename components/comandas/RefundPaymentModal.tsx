'use client';

import React, { useMemo, useState } from 'react';
import {
  Comanda,
  GroupRental,
  GroupRentalPayment,
  PaymentMethod,
  PaymentRecord,
} from '@/lib/types';
import {
  formatCents,
  formatDateTime,
  parseMonetaryInputToCents,
} from '@/lib/formatters';
import {
  getComandaPaymentRefundSummary,
  getGroupPaymentRefundSummary,
  MAX_REFUND_REASON_LENGTH,
  MIN_REFUND_REASON_LENGTH,
} from '@/lib/refunds';
import {
  X,
  RotateCcw,
  AlertTriangle,
  ExternalLink,
  Info,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  debito: 'Cartão de Débito',
  credito: 'Cartão de Crédito',
};

interface JointCounterpartShortcut {
  label: string;
  description: string;
  onOpen: () => void;
}

interface ComandaRefundModalProps {
  mode: 'comanda';
  comanda: Comanda;
  payment: PaymentRecord;
  jointShortcut?: JointCounterpartShortcut;
  onSubmit: (params: {
    sourcePaymentId: string;
    amountCents: number;
    reason: string;
    clientNonce: string;
  }) => Promise<{ success: boolean; alreadyProcessed?: boolean; reopened?: boolean; error?: string }>;
  onClose: () => void;
}

interface GroupRentalRefundModalProps {
  mode: 'locacao';
  rental: GroupRental;
  payment: GroupRentalPayment;
  jointShortcut?: JointCounterpartShortcut;
  onSubmit: (params: {
    sourcePaymentId: string;
    allocations: { participantId: string; amountCents: number }[];
    reason: string;
    clientNonce: string;
  }) => Promise<{ success: boolean; alreadyProcessed?: boolean; reopened?: boolean; error?: string }>;
  onClose: () => void;
}

export type RefundPaymentModalProps = ComandaRefundModalProps | GroupRentalRefundModalProps;

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

export function RefundPaymentModal(props: RefundPaymentModalProps) {
  const { mode, payment, jointShortcut, onClose } = props;

  const comandaSummary = useMemo(
    () => (mode === 'comanda' ? getComandaPaymentRefundSummary(props.comanda, payment.id) : null),
    [mode, props, payment.id]
  );

  const rentalSummary = useMemo(
    () => (mode === 'locacao' ? getGroupPaymentRefundSummary(props.rental, payment.id) : null),
    [mode, props, payment.id]
  );

  const refundableCents =
    mode === 'comanda'
      ? comandaSummary?.refundableCents ?? 0
      : rentalSummary?.refundableCents ?? 0;

  const refundedCents =
    mode === 'comanda'
      ? comandaSummary?.refundedCents ?? 0
      : rentalSummary?.refundedCents ?? 0;

  const originalAmountCents =
    mode === 'comanda'
      ? comandaSummary?.originalAmountCents ?? payment.amountCents
      : rentalSummary?.originalAmountCents ?? payment.amountCents;

  // Chave de idempotência fixa por abertura do modal
  const [clientNonce] = useState(
    () => `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );

  // Estado para comanda: valor único
  const [amountInput, setAmountInput] = useState<string>(() => centsToInput(refundableCents));

  // Estado para locação: valor por participante alocado no pagamento original
  const [participantInputs, setParticipantInputs] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (mode === 'locacao' && rentalSummary) {
      for (const bound of rentalSummary.participantBounds) {
        initial[bound.participantId] = centsToInput(bound.refundableCents);
      }
    }
    return initial;
  });

  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isClosedOrigin =
    mode === 'comanda'
      ? props.comanda.status === 'encerrada'
      : props.rental.status === 'quitada';

  const hasCashChange =
    payment.method === 'dinheiro' &&
    typeof payment.changeCents === 'number' &&
    payment.changeCents > 0;

  const computedTotalRefundCents = useMemo(() => {
    if (mode === 'comanda') {
      return parseMonetaryInputToCents(amountInput);
    }
    if (!rentalSummary) return 0;
    return rentalSummary.participantBounds.reduce((sum, bound) => {
      const val = parseMonetaryInputToCents(participantInputs[bound.participantId] || '0');
      return sum + val;
    }, 0);
  }, [mode, amountInput, rentalSummary, participantInputs]);

  const handleSelectFullRefund = () => {
    setError(null);
    if (mode === 'comanda') {
      setAmountInput(centsToInput(refundableCents));
    } else if (rentalSummary) {
      const next: Record<string, string> = {};
      for (const bound of rentalSummary.participantBounds) {
        next[bound.participantId] = centsToInput(bound.refundableCents);
      }
      setParticipantInputs(next);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    const trimmedReason = reason.trim();
    if (trimmedReason.length < MIN_REFUND_REASON_LENGTH) {
      setError(`Informe o motivo do estorno (mínimo de ${MIN_REFUND_REASON_LENGTH} caracteres).`);
      return;
    }
    if (trimmedReason.length > MAX_REFUND_REASON_LENGTH) {
      setError(`O motivo deve ter no máximo ${MAX_REFUND_REASON_LENGTH} caracteres.`);
      return;
    }

    if (computedTotalRefundCents <= 0) {
      setError('Informe um valor de estorno maior que zero.');
      return;
    }

    if (computedTotalRefundCents > refundableCents) {
      setError(
        `O valor informado (${formatCents(
          computedTotalRefundCents
        )}) excede o limite estornável deste pagamento (${formatCents(refundableCents)}).`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'comanda') {
        const res = await props.onSubmit({
          sourcePaymentId: payment.id,
          amountCents: computedTotalRefundCents,
          reason: trimmedReason,
          clientNonce,
        });
        if (!res.success) {
          setError(res.error || 'Não foi possível registrar o estorno.');
          return;
        }
        onClose();
      } else {
        const allocations: { participantId: string; amountCents: number }[] = [];
        for (const bound of rentalSummary?.participantBounds || []) {
          const cents = parseMonetaryInputToCents(participantInputs[bound.participantId] || '0');
          if (cents > bound.refundableCents) {
            setError(
              `O estorno para ${bound.participantName} (${formatCents(
                cents
              )}) excede o limite dele neste pagamento (${formatCents(bound.refundableCents)}).`
            );
            return;
          }
          if (cents > 0) {
            allocations.push({
              participantId: bound.participantId,
              amountCents: cents,
            });
          }
        }

        if (allocations.length === 0) {
          setError('Informe ao menos um participante com valor maior que zero.');
          return;
        }

        const res = await props.onSubmit({
          sourcePaymentId: payment.id,
          allocations,
          reason: trimmedReason,
          clientNonce,
        });
        if (!res.success) {
          setError(res.error || 'Não foi possível registrar o estorno.');
          return;
        }
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="refund-modal-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
              <RotateCcw className="h-4 w-4" />
            </span>
            <div>
              <h2 id="refund-modal-title" className="text-base font-bold text-slate-900">
                Registrar estorno
              </h2>
              <p className="text-xs text-slate-500">
                {mode === 'comanda'
                  ? `Comanda #${props.comanda.number} · ${props.comanda.name}`
                  : `Locação #${props.rental.number} · ${props.rental.groupName}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Fechar modal de estorno"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Aviso obrigatório: devolução feita fora do sistema */}
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">
                A devolução do dinheiro, do Pix ou do cartão é feita fora do sistema.
              </p>
              <p className="text-amber-900/90">
                Este registro não edita nem apaga o pagamento original: lança um estorno negativo no
                livro financeiro de hoje e atualiza o saldo pendente da conta.
              </p>
            </div>
          </div>

          {/* Aviso de pagamento conjunto + atalho para a outra parte */}
          {jointShortcut && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950 space-y-2">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-sky-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Recebimento conjunto detectado</p>
                  <p className="text-sky-900 mt-0.5">{jointShortcut.description}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={jointShortcut.onOpen}
                className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>{jointShortcut.label}</span>
              </button>
            </div>
          )}

          {/* Aviso de reabertura */}
          {isClosedOrigin && (
            <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
              <span>
                {mode === 'comanda'
                  ? 'Esta comanda está encerrada. Ao registrar o estorno, ela será reaberta automaticamente com o saldo pendente restaurado.'
                  : 'Esta locação está quitada. Ao registrar o estorno, ela será reaberta automaticamente e o(s) participante(s) voltarão a ficar com saldo pendente.'}
              </span>
            </div>
          )}

          {/* Resumo do pagamento original */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Pagamento original ({formatDateTime(payment.timestamp)})</span>
              <span className="font-bold text-slate-900 tabular-nums">{formatCents(originalAmountCents)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Forma de pagamento (mesma do original)</span>
              <span className="font-semibold text-slate-800">{METHOD_LABELS[payment.method]}</span>
            </div>
            {refundedCents > 0 && (
              <div className="flex items-center justify-between text-rose-700">
                <span>Já estornado anteriormente</span>
                <span className="font-semibold tabular-nums">-{formatCents(refundedCents)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900">
              <span>Saldo disponível para estorno</span>
              <span className="tabular-nums text-rose-700">{formatCents(refundableCents)}</span>
            </div>
            {hasCashChange && (
              <p className="text-[11px] text-slate-500 pt-1">
                Troco original de {formatCents(payment.changeCents || 0)} já devolvido no ato do pagamento; o limite de estorno considera apenas o valor abatido da conta ({formatCents(originalAmountCents)}).
              </p>
            )}
          </div>

          {/* Valor(es) do estorno */}
          {mode === 'comanda' ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="refund-amount-input" className="text-xs font-semibold text-slate-700">
                  Valor a estornar (R$)
                </label>
                <button
                  type="button"
                  onClick={handleSelectFullRefund}
                  className="text-xs font-semibold text-emerald-800 hover:underline"
                >
                  Estornar total disponível ({formatCents(refundableCents)})
                </button>
              </div>
              <input
                id="refund-amount-input"
                type="text"
                inputMode="decimal"
                value={amountInput}
                onChange={e => {
                  setAmountInput(e.target.value);
                  setError(null);
                }}
                placeholder="0,00"
                disabled={isSubmitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-900 tabular-nums focus:border-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-800/20"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  Valores a estornar por participante (quadra)
                </span>
                <button
                  type="button"
                  onClick={handleSelectFullRefund}
                  className="text-xs font-semibold text-emerald-800 hover:underline"
                >
                  Estornar total disponível
                </button>
              </div>

              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                {(rentalSummary?.participantBounds || []).map(bound => (
                  <div key={bound.participantId} className="flex items-center justify-between gap-3 p-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {bound.participantName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Disponível p/ estorno: {formatCents(bound.refundableCents)}
                      </p>
                    </div>
                    <div className="w-28 shrink-0">
                      <label htmlFor={`refund-part-${bound.participantId}`} className="sr-only">
                        Valor a estornar para {bound.participantName}
                      </label>
                      <input
                        id={`refund-part-${bound.participantId}`}
                        type="text"
                        inputMode="decimal"
                        value={participantInputs[bound.participantId] ?? '0,00'}
                        onChange={e => {
                          setParticipantInputs(prev => ({
                            ...prev,
                            [bound.participantId]: e.target.value,
                          }));
                          setError(null);
                        }}
                        disabled={isSubmitting || bound.refundableCents <= 0}
                        className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-right text-xs font-semibold text-slate-900 tabular-nums focus:border-emerald-800 focus:outline-none disabled:bg-slate-100"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between rounded-md bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">
                <span>Total deste estorno</span>
                <span className="tabular-nums">-{formatCents(computedTotalRefundCents)}</span>
              </div>
            </div>
          )}

          {/* Motivo obrigatório */}
          <div className="space-y-1.5">
            <label htmlFor="refund-reason-input" className="text-xs font-semibold text-slate-700">
              Motivo do estorno <span className="text-rose-600">*</span>
            </label>
            <textarea
              id="refund-reason-input"
              rows={3}
              value={reason}
              onChange={e => {
                setReason(e.target.value);
                setError(null);
              }}
              maxLength={MAX_REFUND_REASON_LENGTH}
              placeholder="Ex: Cobrança lançada em duplicidade, erro na forma de pagamento, item devolvido..."
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-800/20"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Obrigatório para auditoria no histórico e relatórios</span>
              <span className="tabular-nums">
                {reason.trim().length}/{MAX_REFUND_REASON_LENGTH}
              </span>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Ações */}
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || refundableCents <= 0}
              className="flex h-10 items-center gap-1.5 rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white shadow-xs hover:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Registrando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Registrar estorno</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
