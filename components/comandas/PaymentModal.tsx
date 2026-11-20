'use client';

import React, { useState, useId } from 'react';
import { useComandas } from '@/context/ComandasContext';
import { Comanda, PaymentMethod } from '@/lib/types';
import {
  formatCents,
  calculateComandaTotals,
  reaisToCents,
  centsToReais,
} from '@/lib/formatters';
import { X, Check, Banknote, QrCode, CreditCard, AlertCircle } from 'lucide-react';

interface PaymentModalProps {
  comanda: Comanda;
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess?: () => void;
}

export function PaymentModal({ comanda, isOpen, onClose, onPaymentSuccess }: PaymentModalProps) {
  const { registerPayment, verifyPaymentStatus } = useComandas();

  const { balanceCents } = calculateComandaTotals(comanda);

  const [method, setMethod] = useState<PaymentMethod>('pix');

  // Valores em centavos inteiros
  const [amountToPayCents, setAmountToPayCents] = useState<number>(balanceCents);
  const [tenderedCents, setTenderedCents] = useState<number>(balanceCents);

  // Strings dos inputs para digitação natural do usuário
  const [amountInputStr, setAmountInputStr] = useState<string>((balanceCents / 100).toFixed(2));
  const [tenderedInputStr, setTenderedInputStr] = useState<string>((balanceCents / 100).toFixed(2));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChangeCents, setLastChangeCents] = useState<number | null>(null);
  const [paymentFinished, setPaymentFinished] = useState(false);

  // Nonce único para proteção contra duplicidade
  const [nonce, setNonce] = useState<string>(() => `nonce-${Date.now()}-${Math.random()}`);

  if (!isOpen) return null;

  // Atualizar valor a abater a partir da digitação
  const handleAmountInputChange = (val: string) => {
    setAmountInputStr(val);
    const num = parseFloat(val.replace(',', '.')) || 0;
    const cents = Math.round(num * 100);
    setAmountToPayCents(cents);
    if (method === 'dinheiro' && tenderedCents < cents) {
      setTenderedCents(cents);
      setTenderedInputStr((cents / 100).toFixed(2));
    }
  };

  // Atualizar valor entregue em dinheiro
  const handleTenderedInputChange = (val: string) => {
    setTenderedInputStr(val);
    const num = parseFloat(val.replace(',', '.')) || 0;
    setTenderedCents(Math.round(num * 100));
  };

  const handleShortcutRatio = (ratio: number) => {
    const calculatedCents = Math.round(balanceCents * ratio);
    setAmountToPayCents(calculatedCents);
    setAmountInputStr((calculatedCents / 100).toFixed(2));
    if (method === 'dinheiro') {
      setTenderedCents(calculatedCents);
      setTenderedInputStr((calculatedCents / 100).toFixed(2));
    }
  };

  const handleCashShortcut = (targetValueCents: number) => {
    setTenderedCents(targetValueCents);
    setTenderedInputStr((targetValueCents / 100).toFixed(2));
  };

  // Cálculos precisos em centavos
  const isCash = method === 'dinheiro';
  const changeCents = isCash && tenderedCents > amountToPayCents ? tenderedCents - amountToPayCents : 0;
  const resultingBalanceCents = Math.max(0, balanceCents - amountToPayCents);

  const isExceedingBalance = amountToPayCents > balanceCents;
  const isCashInsufficient = isCash && tenderedCents < amountToPayCents;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; // Trava de interface
    setError(null);

    if (amountToPayCents <= 0) {
      setError('O valor do pagamento deve ser maior que R$ 0,00.');
      return;
    }

    if (amountToPayCents > balanceCents) {
      setError(
        `O valor a ser abatido (${formatCents(amountToPayCents)}) não pode ultrapassar o saldo pendente de ${formatCents(
          balanceCents
        )}.`
      );
      return;
    }

    if (isCash && tenderedCents < amountToPayCents) {
      setError(
        `O valor entregue pelo cliente (${formatCents(tenderedCents)}) é inferior ao valor a abater da conta (${formatCents(
          amountToPayCents
        )}).`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await registerPayment(comanda.id, {
        method,
        amountCents: amountToPayCents,
        tenderedCents: isCash ? tenderedCents : undefined,
        clientNonce: nonce,
      });

      if (!result.success) {
        setError(result.error || 'Falha ao processar pagamento.');
        return;
      }

      setLastChangeCents(result.changeCents ?? changeCents);
      setPaymentFinished(true);

      if (onPaymentSuccess) {
        onPaymentSuccess();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900 sm:text-lg">
              Recebimento de Comanda
            </h2>
            <p className="text-xs text-slate-500">
              Comanda #{comanda.number} — {comanda.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {paymentFinished ? (
          <div className="py-6 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
              <Check className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Pagamento Registrado com Sucesso!</h3>
            <p className="text-xs text-slate-600">
              Valor abatido da conta: <strong>{formatCents(amountToPayCents)}</strong> via{' '}
              {method === 'dinheiro'
                ? 'Dinheiro'
                : method === 'pix'
                ? 'Pix'
                : method === 'debito'
                ? 'Cartão de Débito'
                : 'Cartão de Crédito'}
            </p>

            {isCash && lastChangeCents !== null && lastChangeCents > 0 && (
              <div className="mx-auto max-w-xs rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <span className="text-[11px] uppercase tracking-wider text-amber-700 font-semibold block">
                  Troco a Devolver
                </span>
                <p className="font-bold text-xl tabular-nums mt-0.5">
                  {formatCents(lastChangeCents)}
                </p>
                <p className="text-[11px] text-amber-800 mt-1">
                  (Valor entregue: {formatCents(tenderedCents)} · Troco não contabilizado na receita)
                </p>
              </div>
            )}

            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 border border-slate-200">
              {resultingBalanceCents === 0 ? (
                <p className="font-semibold text-emerald-800">
                  Conta quitada integralmente! Saldo restante: R$ 0,00.
                </p>
              ) : (
                <p>
                  Saldo restante na comanda:{' '}
                  <strong className="text-slate-900">{formatCents(resultingBalanceCents)}</strong>
                </p>
              )}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-lg bg-emerald-900 px-6 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                Concluir
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* Saldo Atual */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500">Saldo pendente na comanda:</span>
                <p className="text-lg font-bold text-slate-900 tabular-nums">
                  {formatCents(balanceCents)}
                </p>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => handleShortcutRatio(1)}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Quitar Tudo
                </button>
                <button
                  type="button"
                  onClick={() => handleShortcutRatio(0.5)}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  50%
                </button>
              </div>
            </div>

            {/* Formas de pagamento */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Forma de Pagamento
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  onClick={() => setMethod('pix')}
                  className={`flex h-12 flex-col items-center justify-center rounded-lg border text-xs font-semibold transition-colors ${
                    method === 'pix'
                      ? 'border-emerald-900 bg-emerald-900 text-white shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <QrCode className="h-4 w-4 mb-0.5" />
                  <span>Pix</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMethod('dinheiro');
                    setTenderedCents(amountToPayCents);
                    setTenderedInputStr((amountToPayCents / 100).toFixed(2));
                  }}
                  className={`flex h-12 flex-col items-center justify-center rounded-lg border text-xs font-semibold transition-colors ${
                    method === 'dinheiro'
                      ? 'border-emerald-900 bg-emerald-900 text-white shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Banknote className="h-4 w-4 mb-0.5" />
                  <span>Dinheiro</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod('debito')}
                  className={`flex h-12 flex-col items-center justify-center rounded-lg border text-xs font-semibold transition-colors ${
                    method === 'debito'
                      ? 'border-emerald-900 bg-emerald-900 text-white shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <CreditCard className="h-4 w-4 mb-0.5" />
                  <span>Débito</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod('credito')}
                  className={`flex h-12 flex-col items-center justify-center rounded-lg border text-xs font-semibold transition-colors ${
                    method === 'credito'
                      ? 'border-emerald-900 bg-emerald-900 text-white shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <CreditCard className="h-4 w-4 mb-0.5" />
                  <span>Crédito</span>
                </button>
              </div>
            </div>

            {/* Campo 1: Valor a ser abatido da comanda */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  Valor a abater da conta (R$)
                </label>
                <span className="text-[11px] text-slate-500">
                  Máximo: {formatCents(balanceCents)}
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs sm:text-sm font-semibold text-slate-400">
                  R$
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={centsToReais(balanceCents)}
                  value={amountInputStr}
                  onChange={e => handleAmountInputChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm sm:text-base font-bold tabular-nums text-slate-900 focus:border-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-800"
                />
              </div>
            </div>

            {/* Seção Exclusiva para Pagamento em Dinheiro */}
            {isCash && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Valor entregue pelo cliente em dinheiro (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs sm:text-sm font-semibold text-slate-400">
                      R$
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min={centsToReais(amountToPayCents)}
                      value={tenderedInputStr}
                      onChange={e => handleTenderedInputChange(e.target.value)}
                      placeholder="Valor entregue pelo cliente"
                      className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm font-bold tabular-nums text-slate-900 focus:border-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-800"
                    />
                  </div>

                  {/* Atalhos de notas comuns */}
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => handleCashShortcut(amountToPayCents)}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Exato ({formatCents(amountToPayCents)})
                    </button>
                    {amountToPayCents <= 5000 && (
                      <button
                        type="button"
                        onClick={() => handleCashShortcut(5000)}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
                      >
                        R$ 50,00
                      </button>
                    )}
                    {amountToPayCents <= 10000 && (
                      <button
                        type="button"
                        onClick={() => handleCashShortcut(10000)}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
                      >
                        R$ 100,00
                      </button>
                    )}
                    {amountToPayCents <= 20000 && (
                      <button
                        type="button"
                        onClick={() => handleCashShortcut(20000)}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
                      >
                        R$ 200,00
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
                  <span className="text-slate-700 font-semibold">Troco a devolver:</span>
                  <span className="text-base font-bold text-amber-900 tabular-nums">
                    {formatCents(changeCents)}
                  </span>
                </div>
              </div>
            )}

            {/* Painel de Conferência Antes da Confirmação */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-600">
                <span>Valor que será abatido (Receita):</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {formatCents(amountToPayCents)}
                </span>
              </div>
              {isCash && (
                <div className="flex justify-between text-slate-600">
                  <span>Valor entregue em mãos:</span>
                  <span className="font-semibold text-slate-800 tabular-nums">
                    {formatCents(tenderedCents)}
                  </span>
                </div>
              )}
              {isCash && changeCents > 0 && (
                <div className="flex justify-between text-amber-900 font-medium">
                  <span>Troco a devolver:</span>
                  <span className="font-bold tabular-nums">
                    {formatCents(changeCents)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-slate-600 pt-1 border-t border-slate-200">
                <span>Saldo resultante da comanda:</span>
                <span
                  className={`font-bold tabular-nums ${
                    resultingBalanceCents === 0 ? 'text-emerald-800' : 'text-slate-900'
                  }`}
                >
                  {formatCents(resultingBalanceCents)}
                </span>
              </div>
            </div>

            {isExceedingBalance && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  O valor a abater não pode ultrapassar o saldo pendente de {formatCents(balanceCents)}.
                </span>
              </div>
            )}

            {isCashInsufficient && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>
                  O valor entregue em dinheiro deve ser maior ou igual ao valor a abater.
                </span>
              </div>
            )}

            {error && (
              <div className="space-y-2 rounded-lg bg-red-50 p-3 text-xs text-red-800 border border-red-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-700" />
                  <div>
                    <p className="font-semibold">{error}</p>
                    <p className="text-[11px] text-red-600 mt-0.5">
                      Identificador único da operação: <code className="font-mono">{nonce}</code>
                    </p>
                  </div>
                </div>

                <div className="pt-1 flex items-center justify-between border-t border-red-100">
                  <span className="text-[11px] text-red-700">
                    A confirmação ficou incerta por perda de sinal?
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      setIsSubmitting(true);
                      try {
                        const check = await verifyPaymentStatus(comanda.id, nonce);
                        if (check.processed) {
                          setPaymentFinished(true);
                          setError(null);
                        } else {
                          setError('A operação anterior não foi efetivada no banco. Você pode tentar novamente com segurança.');
                        }
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                    className="font-semibold text-emerald-900 underline hover:text-emerald-950"
                  >
                    Consultar Status no Servidor
                  </button>
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-lg border border-slate-200 px-4 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  amountToPayCents <= 0 ||
                  isExceedingBalance ||
                  isCashInsufficient
                }
                className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-900 px-5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span>Processando no Servidor...</span>
                ) : (
                  <span>Confirmar Recebimento ({formatCents(amountToPayCents)})</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
