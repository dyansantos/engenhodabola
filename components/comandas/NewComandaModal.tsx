'use client';

import React, { useState } from 'react';
import { useComandas } from '@/context/ComandasContext';
import { X, User, Users, Store } from 'lucide-react';
import { ComandaType } from '@/lib/types';

export function NewComandaModal() {
  const { isNewComandaModalOpen, setIsNewComandaModalOpen, createComanda, setSelectedComandaId } = useComandas();

  const [type, setType] = useState<ComandaType>('individual');
  const [name, setName] = useState('');
  const [table, setTable] = useState('');
  const [responsible, setResponsible] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isNewComandaModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    const cleanName = name.trim();
    const cleanTable = table.trim();
    const cleanResponsible = responsible.trim();

    setIsSubmitting(true);
    try {
      if (type === 'individual') {
        if (!cleanName) {
          setError('Por favor, informe o nome ou identificação do cliente.');
          setIsSubmitting(false);
          return;
        }
        const res = await createComanda({
          type: 'individual',
          name: cleanName,
          table: cleanTable || undefined,
        });
        if (!res.success || !res.comanda) {
          setError(res.error || 'Erro ao abrir comanda.');
          return;
        }
        setIsNewComandaModalOpen(false);
        setSelectedComandaId(res.comanda.id);
        resetForm();
      } else {
        // Tipo Mesa
        if (!cleanTable && !cleanName) {
          setError('Por favor, informe o número ou identificação da mesa (ex: Mesa 04).');
          setIsSubmitting(false);
          return;
        }
        const tableName = cleanTable || cleanName;
        const res = await createComanda({
          type: 'mesa',
          name: tableName,
          table: tableName,
          responsible: cleanResponsible || undefined,
        });
        if (!res.success || !res.comanda) {
          setError(res.error || 'Erro ao abrir comanda.');
          return;
        }
        setIsNewComandaModalOpen(false);
        setSelectedComandaId(res.comanda.id);
        resetForm();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setName('');
    setTable('');
    setResponsible('');
    setError(null);
  };

  const handleClose = () => {
    setIsNewComandaModalOpen(false);
    resetForm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Abertura Rápida de Comanda</h2>
            <p className="text-xs text-slate-500">
              Inicie o atendimento sem exigir cadastro prévio ou burocracia
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Tipo de comanda */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Tipo de comanda
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('individual')}
                className={`flex h-12 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors ${
                  type === 'individual'
                    ? 'border-emerald-900 bg-emerald-900 text-white shadow-xs'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <User className="h-4 w-4" />
                <span>Individual</span>
              </button>

              <button
                type="button"
                onClick={() => setType('mesa')}
                className={`flex h-12 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors ${
                  type === 'mesa'
                    ? 'border-emerald-900 bg-emerald-900 text-white shadow-xs'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Store className="h-4 w-4" />
                <span>Por Mesa</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
              {error}
            </div>
          )}

          {/* Campos condicionais */}
          {type === 'individual' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome ou Identificação do Cliente <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Pedro Alcantara, Goleiro Rodrigo..."
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-800"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Mesa vinculada <span className="text-slate-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={table}
                  onChange={e => setTable(e.target.value)}
                  placeholder="Ex: Mesa 02 (várias comandas podem usar a mesma mesa)"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-800"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Dica: Clientes sentados juntos podem ter comandas individuais vinculadas à mesma mesa.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mesa ou Espaço <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={table}
                  onChange={e => setTable(e.target.value)}
                  placeholder="Ex: Mesa 04, Bistrô 02, Quiosque Society..."
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-800"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nome do Responsável pela Conta <span className="text-slate-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={responsible}
                  onChange={e => setResponsible(e.target.value)}
                  placeholder="Ex: Marcelo (Turma do Futevôlei)"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-800"
                />
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleClose}
              className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="h-10 rounded-lg bg-emerald-900 px-5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-emerald-800 active:scale-95"
            >
              Abrir Comanda
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
