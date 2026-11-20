'use client';

import React from 'react';
import { useComandas } from '@/context/ComandasContext';
import {
  AlertTriangle,
  X,
  CloudOff,
} from 'lucide-react';

export function StorageNotification() {
  const {
    storageError,
    dismissStorageError,
    syncMeta,
  } = useComandas();

  return (
    <>
      {/* Banner de Erro de Operação ou Conexão */}
      {storageError && (
        <div className="sticky top-16 z-30 flex items-center justify-between gap-3 border-b border-red-300 bg-red-50 px-4 py-2.5 text-xs text-red-950 sm:px-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-700" />
            <span>
              <strong>Atenção na Operação:</strong> {storageError}
            </span>
          </div>
          <button
            type="button"
            onClick={dismissStorageError}
            className="rounded-md p-1 text-red-800 hover:bg-red-100 hover:text-red-950"
            title="Fechar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Banner discreto de modo offline */}
      {!syncMeta.isOnline && (
        <div className="bg-slate-800 text-slate-200 px-4 py-1.5 text-xs flex items-center justify-center gap-2">
          <CloudOff className="h-3.5 w-3.5 text-amber-400" />
          <span>
            Modo offline ativo. Para registrar pagamentos ou transferências, conecte-se à internet.
          </span>
        </div>
      )}
    </>
  );
}
