'use client';

import React, { useState } from 'react';
import { useComandas } from '@/context/ComandasContext';
import { Comanda, ComandaItem } from '@/lib/types';
import { formatCents, calculateComandaTotals } from '@/lib/formatters';
import { X, Trash2, AlertTriangle, Minus, Plus } from 'lucide-react';

interface AdjustOrRemoveItemModalProps {
  comanda: Comanda;
  item: ComandaItem;
  isOpen: boolean;
  onClose: () => void;
}

export function AdjustOrRemoveItemModal({
  comanda,
  item,
  isOpen,
  onClose,
}: AdjustOrRemoveItemModalProps) {
  const { updateItemQuantity } = useComandas();

  const [quantity, setQuantity] = useState(item.quantity);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const quickReasons = [
    'Erro de digitação',
    'Pedido duplicado',
    'Desistência do cliente',
    'Troca de produto',
    'Item não entregue',
  ];

  const itemPriceCents = item.priceCents ?? Math.round((item.price || 0) * 100);
  const { totalPaidCents } = calculateComandaTotals(comanda);

  // Calcula o impacto simulado em centavos inteiros
  const otherItemsTotalCents = comanda.items
    .filter(i => i.id !== item.id)
    .reduce((acc, it) => {
      const c = it.priceCents ?? Math.round((it.price || 0) * 100);
      return acc + c * it.quantity;
    }, 0);

  const projectedTotalCents = otherItemsTotalCents + itemPriceCents * quantity;
  const isBelowPaid = projectedTotalCents < totalPaidCents;

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setError(null);
    const cleanReason = reason.trim();
    if (!cleanReason) {
      setError('Por favor, informe ou selecione o motivo da alteração/remoção para registro no histórico.');
      return;
    }

    if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 0) {
      setError('A quantidade deve ser um número inteiro maior ou igual a zero.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await updateItemQuantity(comanda.id, item.id, quantity, cleanReason);
      if (!result.success) {
        setError(result.error || 'Erro ao atualizar item.');
        return;
      }
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDirectRemove = async () => {
    if (isSubmitting) return;
    setError(null);
    const cleanReason = reason.trim();
    if (!cleanReason) {
      setError('Por favor, informe ou selecione o motivo da remoção.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await updateItemQuantity(comanda.id, item.id, 0, cleanReason);
      if (!result.success) {
        setError(result.error || 'Erro ao remover item.');
        return;
      }
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">Corrigir ou Remover Item</h3>
            <p className="text-xs text-slate-500">Comanda #{comanda.number} — {comanda.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
            <p className="text-sm font-semibold text-slate-900">{item.name}</p>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-600">
              <span>Preço unitário aplicado: {formatCents(itemPriceCents)}</span>
              <span>Subtotal atual: {formatCents(itemPriceCents * item.quantity)}</span>
            </div>
            {item.notes && (
              <p className="mt-1 text-xs text-slate-500 italic">Obs original: {item.notes}</p>
            )}
          </div>

          {/* Ajuste de quantidade inteira */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Nova Quantidade (unidades inteiras)
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity(q => Math.max(0, q - 1))}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 active:scale-95"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                step="1"
                min="0"
                max="999"
                value={quantity}
                onChange={e => {
                  const parsed = parseInt(e.target.value, 10);
                  setQuantity(Number.isInteger(parsed) && parsed >= 0 ? parsed : 0);
                }}
                className="h-11 w-20 text-center rounded-lg border border-slate-300 bg-white text-base font-bold tabular-nums text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-800"
              />
              <button
                type="button"
                onClick={() => setQuantity(q => q + 1)}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 active:scale-95"
              >
                <Plus className="h-4 w-4" />
              </button>

              <span className="text-xs text-slate-500">
                {quantity === 0 ? (
                  <span className="text-red-600 font-semibold">(Item será excluído)</span>
                ) : (
                  <span>Novo subtotal: {formatCents(itemPriceCents * quantity)}</span>
                )}
              </span>
            </div>
          </div>

          {/* Alerta de bloqueio caso reduza abaixo do valor já pago */}
          {isBelowPaid && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <div>
                <p className="font-semibold">Alteração bloqueada</p>
                <p className="mt-0.5 leading-relaxed">
                  Esta alteração faria o total da comanda ficar em{' '}
                  <strong>{formatCents(projectedTotalCents)}</strong>, que é menor do que o valor já
                  recebido (<strong>{formatCents(totalPaidCents)}</strong>). Não é possível estornar
                  valores nesta etapa.
                </p>
              </div>
            </div>
          )}

          {/* Motivo da alteração */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Motivo da alteração / remoção <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Digite a justificativa da alteração..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-800"
            />
            {/* Opções rápidas de motivo */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {quickReasons.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${
                    reason === r
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
              {error}
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleDirectRemove}
              disabled={isBelowPaid || isSubmitting}
              className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{isSubmitting ? 'Processando...' : 'Remover item por completo'}</span>
            </button>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isBelowPaid || isSubmitting}
                className="h-10 rounded-lg bg-emerald-900 px-4 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Salvando...' : 'Salvar alteração'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
