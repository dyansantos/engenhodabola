'use client';

import React, { useState, useMemo } from 'react';
import { useComandas } from '@/context/ComandasContext';
import { Comanda } from '@/lib/types';
import { formatCents, calculateComandaTotals } from '@/lib/formatters';
import { X, ArrowRightLeft, AlertTriangle, Check, ArrowRight } from 'lucide-react';

interface TransferItemsModalProps {
  sourceComanda: Comanda;
  isOpen: boolean;
  onClose: () => void;
}

export function TransferItemsModal({
  sourceComanda,
  isOpen,
  onClose,
}: TransferItemsModalProps) {
  const { comandas, transferItems } = useComandas();

  // Outras comandas abertas
  const targetCandidates = useMemo(() => {
    return comandas.filter(c => c.status === 'aberta' && c.id !== sourceComanda.id);
  }, [comandas, sourceComanda.id]);

  const [targetComandaId, setTargetComandaId] = useState<string>(
    targetCandidates.length > 0 ? targetCandidates[0].id : ''
  );

  // Mapa de quantidades a transferir por itemId
  const [transferQuantities, setTransferQuantities] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Itens selecionados com quantidade > 0
  const selectedTransfers = useMemo(() => {
    return sourceComanda.items
      .map(item => ({
        item,
        quantityToTransfer: transferQuantities[item.id] || 0,
      }))
      .filter(t => t.quantityToTransfer > 0);
  }, [sourceComanda.items, transferQuantities]);

  const transferTotalCents = useMemo(() => {
    return selectedTransfers.reduce((acc, t) => {
      const priceCents = t.item.priceCents ?? Math.round((t.item.price || 0) * 100);
      return acc + priceCents * t.quantityToTransfer;
    }, 0);
  }, [selectedTransfers]);

  const targetComanda = comandas.find(c => c.id === targetComandaId);

  const handleQuantityChange = (itemId: string, maxQty: number, val: number) => {
    const parsed = Number.isInteger(val) ? val : 0;
    const clamped = Math.max(0, Math.min(maxQty, parsed));
    setTransferQuantities(prev => ({
      ...prev,
      [itemId]: clamped,
    }));
  };

  // Cálculos de saldo e checagem de bloqueio em centavos
  const { totalConsumedCents: sourceConsumedCents, totalPaidCents: sourcePaidCents } =
    calculateComandaTotals(sourceComanda);
  const projectedSourceConsumedCents = sourceConsumedCents - transferTotalCents;
  const isSourceBlocked = projectedSourceConsumedCents < sourcePaidCents;

  const targetTotals = targetComanda ? calculateComandaTotals(targetComanda) : null;
  const projectedTargetConsumedCents = targetTotals
    ? targetTotals.totalConsumedCents + transferTotalCents
    : 0;

  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleConfirmTransfer = async () => {
    if (isSubmitting) return;
    setError(null);

    if (!targetComanda) {
      setError('Selecione uma comanda de destino válida.');
      return;
    }

    if (selectedTransfers.length === 0) {
      setError('Selecione ao menos um item com quantidade maior que zero para transferir.');
      return;
    }

    if (isSourceBlocked) {
      setError(
        `Transferência bloqueada: a comanda de origem ficaria com consumo total de ${formatCents(
          projectedSourceConsumedCents
        )}, menor que o valor já pago de ${formatCents(sourcePaidCents)}.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = selectedTransfers.map(t => ({
        itemId: t.item.id,
        quantity: t.quantityToTransfer,
      }));

      const result = await transferItems(sourceComanda.id, targetComanda.id, payload);
      if (!result.success) {
        setError(result.error || 'Erro ao realizar a transferência.');
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-emerald-800" />
            <div>
              <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                Transferência de Itens entre Comandas
              </h2>
              <p className="text-xs text-slate-500">
                Transfira itens parciais ou totais sem duplicar o consumo
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 mb-3">
              <Check className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Transferência Concluída!</h3>
            <p className="mt-1 text-xs text-slate-600">
              Os itens foram transferidos e os totais foram atualizados nas duas comandas preservando o valor combinado exato.
            </p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-y-auto p-4 sm:p-6 space-y-5">
            {targetCandidates.length === 0 ? (
              <div className="rounded-lg bg-amber-50 p-4 text-xs text-amber-800 border border-amber-200">
                Não há outra comanda aberta no momento para receber a transferência. Abra uma nova comanda antes de realizar transferências.
              </div>
            ) : (
              <>
                {/* Seleção da Comanda de Destino */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Comanda de Destino (deve estar aberta)
                  </label>
                  <select
                    value={targetComandaId}
                    onChange={e => setTargetComandaId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs sm:text-sm text-slate-900 focus:border-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-800"
                  >
                    {targetCandidates.map(c => {
                      const cTotals = calculateComandaTotals(c);
                      return (
                        <option key={c.id} value={c.id}>
                          #{c.number} — {c.name} {c.table ? `(${c.table})` : ''} · Consumo atual:{' '}
                          {formatCents(cTotals.totalConsumedCents)}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Seleção de Itens da Comanda de Origem */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-700">
                      Itens da Comanda #{sourceComanda.number} ({sourceComanda.name})
                    </label>
                    <span className="text-xs text-slate-500">Defina a quantidade a transferir</span>
                  </div>

                  {sourceComanda.items.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-2">
                      Esta comanda não possui itens para transferir.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/50">
                      {sourceComanda.items.map(item => {
                        const currentTransferQty = transferQuantities[item.id] || 0;
                        const itemPriceCents = item.priceCents ?? Math.round((item.price || 0) * 100);
                        return (
                          <div
                            key={item.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between p-3 gap-2"
                          >
                            <div className="pr-2">
                              <p className="text-xs sm:text-sm font-semibold text-slate-900">
                                {item.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                Disponível: {item.quantity} un · Unitário: {formatCents(itemPriceCents)}
                              </p>
                              {item.notes && (
                                <p className="text-[11px] text-slate-400 italic">Obs: {item.notes}</p>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-slate-500">Transferir:</span>
                              <input
                                type="number"
                                step="1"
                                min={0}
                                max={item.quantity}
                                value={currentTransferQty}
                                onChange={e =>
                                  handleQuantityChange(
                                    item.id,
                                    item.quantity,
                                    parseInt(e.target.value, 10) || 0
                                  )
                                }
                                className="h-9 w-16 rounded-md border border-slate-300 bg-white text-center text-xs sm:text-sm font-bold tabular-nums text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-800"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleQuantityChange(item.id, item.quantity, item.quantity)
                                }
                                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                              >
                                Tudo ({item.quantity})
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Revisão do Impacto Financeiro em Centavos */}
                {selectedTransfers.length > 0 && targetComanda && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Resumo da Operação
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {/* Origem */}
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <span className="font-semibold text-slate-900">
                          Origem (#{sourceComanda.number})
                        </span>
                        <div className="mt-1 space-y-0.5 text-slate-600">
                          <p>Consumo atual: {formatCents(sourceConsumedCents)}</p>
                          <p className="font-semibold text-emerald-950">
                            Após transferência: {formatCents(projectedSourceConsumedCents)}
                          </p>
                          <p className="text-slate-500">Já pago nesta comanda: {formatCents(sourcePaidCents)}</p>
                        </div>
                      </div>

                      {/* Destino */}
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <span className="font-semibold text-slate-900">
                          Destino (#{targetComanda.number})
                        </span>
                        <div className="mt-1 space-y-0.5 text-slate-600">
                          <p>Consumo atual: {formatCents(targetTotals!.totalConsumedCents)}</p>
                          <p className="font-semibold text-emerald-950">
                            Após transferência: {formatCents(projectedTargetConsumedCents)}
                          </p>
                          <p className="text-slate-500">Valor transferido: +{formatCents(transferTotalCents)}</p>
                        </div>
                      </div>
                    </div>

                    {isSourceBlocked && (
                      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                        <div>
                          <p className="font-semibold">Transferência bloqueada</p>
                          <p className="mt-0.5">
                            O total resultante na comanda de origem ({formatCents(projectedSourceConsumedCents)}) ficaria menor do que o valor que o cliente já pagou ({formatCents(sourcePaidCents)}). Reduza os itens a transferir.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {error && (
                  <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
                    {error}
                  </div>
                )}
              </>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-lg border border-slate-200 px-4 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmTransfer}
                disabled={
                  targetCandidates.length === 0 ||
                  selectedTransfers.length === 0 ||
                  isSourceBlocked ||
                  isSubmitting
                }
                className="flex h-10 items-center gap-1.5 rounded-lg bg-emerald-900 px-5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowRight className="h-4 w-4" />
                <span>{isSubmitting ? 'Transferindo...' : `Confirmar Transferência (${formatCents(transferTotalCents)})`}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
