'use client';

import React, { useState, useMemo } from 'react';
import { useComandas } from '@/context/ComandasContext';
import { Product, Comanda } from '@/lib/types';
import { formatCents } from '@/lib/formatters';
import { Search, X, Plus, Minus, Check, Utensils } from 'lucide-react';

interface AddItemsModalProps {
  comanda: Comanda;
  isOpen: boolean;
  onClose: () => void;
}

export function AddItemsModal({ comanda, isOpen, onClose }: AddItemsModalProps) {
  const { products, addItem } = useComandas();

  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const categories = useMemo(() => {
    const list = Array.from(new Set(products.map(p => p.category)));
    return ['Todas', ...list];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCategory = selectedCategory === 'Todas' || p.category === selectedCategory;
      const matchesSearch =
        searchTerm === '' ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchTerm]);

  if (!isOpen) return null;

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setQuantity(1);
    setNotes('');
    setError(null);
  };

  const handleConfirmAdd = async () => {
    if (!selectedProduct || isSubmitting) return;
    setError(null);

    // Validação estrita de quantidade inteira positiva
    if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
      setError('A quantidade deve ser um número inteiro maior que zero.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await addItem(comanda.id, selectedProduct, quantity, notes);
      if (!result.success) {
        setError(result.error || 'Erro ao lançar item.');
        return;
      }

      setFeedbackMessage(`${quantity}x ${selectedProduct.name} adicionado com sucesso!`);
      setTimeout(() => {
        setFeedbackMessage(null);
      }, 2500);

      // Reset selection to allow adding more
      setSelectedProduct(null);
      setQuantity(1);
      setNotes('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                Lançar Pedido no Bar & Cozinha
              </h2>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                #{comanda.number}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {comanda.type === 'mesa' ? `Mesa: ${comanda.name}` : `Cliente: ${comanda.name}`}
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

        {/* Feedback visual de inclusão */}
        {feedbackMessage && (
          <div className="flex items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-800">
            <Check className="h-4 w-4 shrink-0 text-emerald-700" />
            <span>{feedbackMessage}</span>
          </div>
        )}

        <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
          {/* Lado Esquerdo: Catálogo com categorias e busca */}
          <div className="flex flex-1 flex-col overflow-hidden border-b border-slate-200 md:border-b-0 md:border-r">
            {/* Barra de pesquisa */}
            <div className="p-3 sm:p-4 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Pesquisar produto ou petisco..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-800"
                />
              </div>

              {/* Categorias */}
              <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                {categories.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`whitespace-nowrap shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                      selectedCategory === cat
                        ? 'bg-emerald-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Lista de Produtos */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 divide-y divide-slate-100">
              {filteredProducts.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Nenhum produto encontrado com esse filtro.
                </div>
              ) : (
                filteredProducts.map(product => {
                  const isSelected = selectedProduct?.id === product.id;
                  const itemPriceCents = product.priceCents ?? Math.round((product.price || 0) * 100);
                  return (
                    <div
                      key={product.id}
                      onClick={() => handleSelectProduct(product)}
                      className={`group flex cursor-pointer items-center justify-between py-2.5 px-2 rounded-lg transition-colors ${
                        isSelected
                          ? 'bg-emerald-50 border border-emerald-300'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="pr-3">
                        <p className="text-xs sm:text-sm font-semibold text-slate-900">
                          {product.name}
                        </p>
                        {product.description && (
                          <p className="line-clamp-1 text-[11px] text-slate-500">
                            {product.description}
                          </p>
                        )}
                        <span className="text-[11px] text-slate-400">{product.category}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs sm:text-sm font-bold text-slate-900 tabular-nums">
                          {formatCents(itemPriceCents)}
                        </span>
                        <button
                          type="button"
                          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                            isSelected
                              ? 'bg-emerald-900 text-white'
                              : 'bg-slate-100 text-slate-700 group-hover:bg-emerald-900 group-hover:text-white'
                          }`}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Lado Direito / Painel de Configuração do Item Selecionado */}
          <div className="w-full bg-slate-50 p-4 md:w-80 flex flex-col justify-between shrink-0">
            {selectedProduct ? (
              <div className="space-y-4">
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-emerald-800">
                    Item selecionado
                  </span>
                  <h3 className="text-base font-bold text-slate-900">
                    {selectedProduct.name}
                  </h3>
                  <p className="text-xs text-slate-600">
                    Preço unitário: <span className="font-semibold">{formatCents(selectedProduct.priceCents)}</span>
                  </p>
                </div>

                {error && (
                  <div className="rounded-lg bg-red-50 p-2 text-xs text-red-700 border border-red-200">
                    {error}
                  </div>
                )}

                {/* Seletor de Quantidade Inteira */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Quantidade (unidades)
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-xs hover:bg-slate-100 active:scale-95"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      max="999"
                      value={quantity}
                      onChange={e => {
                        const parsed = parseInt(e.target.value, 10);
                        setQuantity(Number.isInteger(parsed) && parsed > 0 ? parsed : 1);
                      }}
                      className="h-11 w-16 text-center rounded-lg border border-slate-300 bg-white text-base font-bold tabular-nums text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-800"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity(q => q + 1)}
                      className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-xs hover:bg-slate-100 active:scale-95"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Observação */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Observação do pedido <span className="text-slate-400">(opcional)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Ex: Sem cebola, com gelo e limão, bem passado..."
                    className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-800"
                  />
                </div>

                {/* Subtotal */}
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>{quantity}x {formatCents(selectedProduct.priceCents)}</span>
                    <span className="font-medium">Subtotal</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-1">
                    <span className="text-xs text-slate-500">Valor a ser adicionado:</span>
                    <span className="text-base font-bold text-emerald-950 tabular-nums">
                      {formatCents(selectedProduct.priceCents * quantity)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleConfirmAdd}
                  disabled={isSubmitting}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-900 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                  <span>{isSubmitting ? 'Adicionando...' : 'Adicionar à Comanda'}</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center py-8 text-center text-slate-400">
                <Utensils className="h-8 w-8 text-slate-300 mb-2" />
                <p className="text-xs font-medium text-slate-600">Nenhum item selecionado</p>
                <p className="text-[11px] text-slate-400 max-w-[200px] mt-0.5">
                  Toque em um produto da lista para definir quantidade e observações.
                </p>
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 mt-4">
              <button
                type="button"
                onClick={onClose}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Concluir Lançamentos
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
