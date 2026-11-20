'use client';

import React, { useState } from 'react';
import { useComandas } from '@/context/ComandasContext';
import { Comanda, ComandaItem } from '@/lib/types';
import {
  formatCents,
  formatDateTime,
  calculateComandaTotals,
} from '@/lib/formatters';
import { AddItemsModal } from './AddItemsModal';
import { AdjustOrRemoveItemModal } from './AdjustOrRemoveItemModal';
import { TransferItemsModal } from './TransferItemsModal';
import { PaymentModal } from './PaymentModal';
import {
  X,
  Plus,
  ArrowRightLeft,
  CreditCard,
  CheckCircle2,
  Lock,
  Clock,
  User,
  Store,
  Edit2,
  History,
  AlertCircle,
  FileCheck,
} from 'lucide-react';

interface ComandaDetailModalProps {
  comandaId: string;
  onClose: () => void;
}

export function ComandaDetailModal({ comandaId, onClose }: ComandaDetailModalProps) {
  const { comandas, closeComanda } = useComandas();

  const comanda = comandas.find(c => c.id === comandaId);

  const [isAddItemsOpen, setIsAddItemsOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ComandaItem | null>(null);
  const [activeTab, setActiveTab] = useState<'consumo' | 'pagamentos' | 'historico'>('consumo');
  const [closeError, setCloseError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  if (!comanda) return null;

  const { totalConsumedCents, totalPaidCents, balanceCents } = calculateComandaTotals(comanda);

  // Status visual
  let statusBadge = {
    label: 'Aberta sem pagamento',
    bg: 'bg-amber-50 text-amber-900 border-amber-200',
  };
  if (comanda.status === 'encerrada') {
    statusBadge = {
      label: 'Encerrada e quitada',
      bg: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    };
  } else if (totalPaidCents > 0) {
    statusBadge = {
      label: 'Aberta c/ pagamento parcial',
      bg: 'bg-sky-50 text-sky-900 border-sky-200',
    };
  }

  const isClosed = comanda.status === 'encerrada';
  const canClose = !isClosed && balanceCents === 0;

  const handleCloseComanda = async () => {
    if (isClosing) return;
    setCloseError(null);
    setIsClosing(true);
    try {
      const result = await closeComanda(comanda.id);
      if (!result.success) {
        setCloseError(result.error || 'Erro ao encerrar comanda.');
      }
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-2 sm:p-4 backdrop-blur-xs">
        <div className="flex max-h-[94vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl">
          {/* Cabeçalho */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6 gap-2">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-900 text-sm font-bold text-white tabular-nums shadow-xs">
                #{comanda.number}
              </span>

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    {comanda.name}
                  </h2>
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${statusBadge.bg}`}
                  >
                    {statusBadge.label}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-0.5">
                  <span className="inline-flex items-center gap-1">
                    {comanda.type === 'individual' ? (
                      <User className="h-3 w-3 text-slate-400" />
                    ) : (
                      <Store className="h-3 w-3 text-slate-400" />
                    )}
                    {comanda.type === 'individual' ? 'Comanda Individual' : 'Comanda de Mesa'}
                  </span>
                  {comanda.table && (
                    <>
                      <span>·</span>
                      <span className="font-medium text-slate-700">{comanda.table}</span>
                    </>
                  )}
                  {comanda.responsible && (
                    <>
                      <span>·</span>
                      <span>Resp: {comanda.responsible}</span>
                    </>
                  )}
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3 text-slate-400" />
                    Aberta às {formatDateTime(comanda.openedAt)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              {canClose && (
                <button
                  type="button"
                  onClick={handleCloseComanda}
                  disabled={isClosing}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-900 px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  <FileCheck className="h-3.5 w-3.5" />
                  <span>{isClosing ? 'Encerrando...' : 'Encerrar Comanda'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Banner de Comanda Encerrada */}
          {isClosed && (
            <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2 border-b border-emerald-200 text-xs text-emerald-900">
              <Lock className="h-4 w-4 text-emerald-800 shrink-0" />
              <span>
                Esta comanda foi encerrada e quitada em {comanda.closedAt ? formatDateTime(comanda.closedAt) : 'hoje'}. Não é possível lançar novos itens ou pagamentos.
              </span>
            </div>
          )}

          {closeError && (
            <div className="flex items-center gap-2 bg-red-50 px-4 py-2 border-b border-red-200 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              <span>{closeError}</span>
            </div>
          )}

          {/* Resumo Financeiro da Comanda em Centavos Inteiros */}
          <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 divide-x divide-slate-200 text-center">
            <div className="p-3">
              <span className="text-[11px] font-medium text-slate-500 uppercase">
                Total Consumido
              </span>
              <p className="text-base sm:text-lg font-bold text-slate-900 tabular-nums">
                {formatCents(totalConsumedCents)}
              </p>
            </div>
            <div className="p-3">
              <span className="text-[11px] font-medium text-slate-500 uppercase">
                Total Pago
              </span>
              <p className="text-base sm:text-lg font-bold text-slate-900 tabular-nums">
                {formatCents(totalPaidCents)}
              </p>
            </div>
            <div className="p-3">
              <span className="text-[11px] font-medium text-slate-500 uppercase">
                Saldo Restante
              </span>
              <p
                className={`text-base sm:text-lg font-bold tabular-nums ${
                  balanceCents === 0 ? 'text-emerald-800' : 'text-amber-800'
                }`}
              >
                {formatCents(balanceCents)}
              </p>
            </div>
          </div>

          {/* Abas de Navegação Interna */}
          <div className="flex border-b border-slate-200 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setActiveTab('consumo')}
              className={`border-b-2 py-3 px-3 text-xs sm:text-sm font-semibold transition-colors ${
                activeTab === 'consumo'
                  ? 'border-emerald-900 text-emerald-950'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Itens Consumidos ({comanda.items.reduce((s, i) => s + i.quantity, 0)})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pagamentos')}
              className={`border-b-2 py-3 px-3 text-xs sm:text-sm font-semibold transition-colors ${
                activeTab === 'pagamentos'
                  ? 'border-emerald-900 text-emerald-950'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Pagamentos ({comanda.payments.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('historico')}
              className={`border-b-2 py-3 px-3 text-xs sm:text-sm font-semibold transition-colors ${
                activeTab === 'historico'
                  ? 'border-emerald-900 text-emerald-950'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Histórico da Comanda ({comanda.history.length})
            </button>
          </div>

          {/* Conteúdo da Aba */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {activeTab === 'consumo' && (
              <div className="space-y-4">
                {/* Barra de Ações Rápidas */}
                {!isClosed && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">
                      Itens lançados no bar e cozinha
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsTransferOpen(true)}
                        disabled={comanda.items.length === 0}
                        className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5 text-slate-500" />
                        <span>Transferir Itens</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsAddItemsOpen(true)}
                        className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-900 px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>+ Adicionar Produtos</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Lista de Itens */}
                {comanda.items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-10 text-center">
                    <p className="text-xs sm:text-sm font-medium text-slate-600">
                      Nenhum item lançado nesta comanda
                    </p>
                    <p className="mt-1 text-xs text-slate-400 max-w-xs">
                      Clique em &quot;Adicionar Produtos&quot; para consultar o catálogo do bar e registrar pedidos.
                    </p>
                    {!isClosed && (
                      <button
                        type="button"
                        onClick={() => setIsAddItemsOpen(true)}
                        className="mt-3 flex h-9 items-center gap-1.5 rounded-lg bg-emerald-900 px-4 text-xs font-semibold text-white hover:bg-emerald-800"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Adicionar Primeiro Item</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                    {comanda.items.map(item => {
                      const itemPriceCents = item.priceCents ?? Math.round((item.price || 0) * 100);
                      const subtotalCents = itemPriceCents * item.quantity;
                      return (
                        <div
                          key={item.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 gap-2 hover:bg-slate-50/50 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-slate-800 tabular-nums shrink-0 mt-0.5">
                              {item.quantity}x
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                              <p className="text-xs text-slate-500">
                                {formatCents(itemPriceCents)} un · Categoria: {item.category}
                              </p>
                              {item.notes && (
                                <p className="text-xs text-amber-900 italic mt-0.5">
                                  Obs: {item.notes}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                            <span className="text-sm font-bold text-slate-900 tabular-nums">
                              {formatCents(subtotalCents)}
                            </span>

                            {!isClosed && (
                              <button
                                type="button"
                                onClick={() => setEditingItem(item)}
                                className="flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                                title="Corrigir quantidade ou remover"
                              >
                                <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                                <span className="hidden sm:inline">Corrigir</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'pagamentos' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-slate-900">
                      Recebimentos Registrados
                    </h3>
                    <p className="text-xs text-slate-500">
                      Pagamentos parciais e múltiplos são suportados
                    </p>
                  </div>

                  {!isClosed && balanceCents > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsPaymentOpen(true)}
                      className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-900 px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      <span>Registrar Pagamento</span>
                    </button>
                  )}
                </div>

                {comanda.payments.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">
                    Nenhum pagamento registrado nesta comanda até o momento.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                    {comanda.payments.map(pay => {
                      const payAmountCents = pay.amountCents ?? Math.round((pay.amount || 0) * 100);
                      const payTenderedCents =
                        typeof pay.tenderedCents === 'number'
                          ? pay.tenderedCents
                          : typeof pay.tendered === 'number'
                          ? Math.round(pay.tendered * 100)
                          : undefined;
                      const payChangeCents =
                        typeof pay.changeCents === 'number'
                          ? pay.changeCents
                          : typeof pay.change === 'number'
                          ? Math.round(pay.change * 100)
                          : undefined;

                      return (
                        <div
                          key={pay.id}
                          className="flex items-center justify-between p-3.5"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold uppercase text-slate-800">
                                {pay.method === 'dinheiro'
                                  ? 'Dinheiro'
                                  : pay.method === 'pix'
                                  ? 'Pix'
                                  : pay.method === 'debito'
                                  ? 'Cartão de Débito'
                                  : 'Cartão de Crédito'}
                              </span>
                              <span className="text-xs text-slate-400">·</span>
                              <span className="text-xs text-slate-500">
                                {formatDateTime(pay.timestamp)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Recebido por: {pay.operator}
                              {payTenderedCents && payTenderedCents > payAmountCents && (
                                <span>
                                  {' '}(Entregue: {formatCents(payTenderedCents)} | Troco: {formatCents(payChangeCents || 0)})
                                </span>
                              )}
                            </p>
                          </div>

                          <span className="text-sm font-bold text-emerald-900 tabular-nums">
                            +{formatCents(payAmountCents)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'historico' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-slate-500 pb-2 border-b border-slate-100">
                  <History className="h-4 w-4" />
                  <span>Auditoria cronológica da comanda (Operador de demonstração)</span>
                </div>

                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {comanda.history.map(entry => (
                    <div key={entry.id} className="relative">
                      <div className="absolute -left-6 top-1 h-3 w-3 rounded-full border-2 border-white bg-emerald-800" />
                      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 text-xs">
                        <div className="flex items-center justify-between text-slate-500 text-[11px] mb-0.5">
                          <span className="flex items-center gap-1.5 font-medium text-slate-700">
                            {entry.operator}
                            {entry.operatorUid ? (
                              <span className="rounded bg-emerald-50 px-1 py-0.2 text-[9px] font-semibold text-emerald-800 border border-emerald-200">
                                Confirmado
                              </span>
                            ) : (
                              <span className="rounded bg-slate-100 px-1 py-0.2 text-[9px] text-slate-500">
                                Demonstração
                              </span>
                            )}
                          </span>
                          <span className="tabular-nums">{formatDateTime(entry.timestamp)}</span>
                        </div>
                        <p className="font-semibold text-slate-900">{entry.description}</p>
                        {entry.details && (
                          <p className="mt-0.5 text-slate-600 italic">{entry.details}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Rodapé com Ações Financeiras Rápidas */}
          <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-6 gap-3">
            <div className="text-xs text-slate-600">
              <span>Saldo a quitar: </span>
              <strong className="text-slate-900 text-sm tabular-nums">
                {formatCents(balanceCents)}
              </strong>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {!isClosed && balanceCents > 0 && (
                <button
                  type="button"
                  onClick={() => setIsPaymentOpen(true)}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-900 px-4 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 active:scale-95"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>Registrar Pagamento</span>
                </button>
              )}

              {canClose && (
                <button
                  type="button"
                  onClick={handleCloseComanda}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-900 px-4 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 active:scale-95"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Encerrar Comanda</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Fechar Detalhes
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modais Aninhados */}
      {isAddItemsOpen && (
        <AddItemsModal
          comanda={comanda}
          isOpen={isAddItemsOpen}
          onClose={() => setIsAddItemsOpen(false)}
        />
      )}

      {editingItem && (
        <AdjustOrRemoveItemModal
          comanda={comanda}
          item={editingItem}
          isOpen={!!editingItem}
          onClose={() => setEditingItem(null)}
        />
      )}

      {isTransferOpen && (
        <TransferItemsModal
          sourceComanda={comanda}
          isOpen={isTransferOpen}
          onClose={() => setIsTransferOpen(false)}
        />
      )}

      {isPaymentOpen && (
        <PaymentModal
          comanda={comanda}
          isOpen={isPaymentOpen}
          onClose={() => setIsPaymentOpen(false)}
        />
      )}
    </>
  );
}
