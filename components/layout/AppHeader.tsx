'use client';

import React, { useState } from 'react';
import { useComandas } from '@/context/ComandasContext';
import { StaffManagementModal } from '@/components/admin/StaffManagementModal';
import {
  Plus,
  Users,
  ShieldCheck,
  Cloud,
  CloudOff,
  RefreshCw,
  LogOut,
  LogIn,
  Database,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export function AppHeader() {
  const {
    setIsNewComandaModalOpen,
    syncMeta,
    authStatus,
    currentStaff,
    currentUser,
    handleGoogleLogin,
    handleLogout,
    localBackupCount,
    adminImportLocalData,
  } = useComandas();

  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const isAdmin = currentStaff?.role === 'admin';

  const onGoogleLoginClick = async () => {
    setIsLoggingIn(true);
    try {
      await handleGoogleLogin();
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleConfirmImport = async () => {
    setIsImporting(true);
    setImportResult(null);
    try {
      const res = await adminImportLocalData();
      if (!res.success) {
        setImportResult(`Falha na importação: ${res.error || 'Erro desconhecido'}`);
      } else {
        setImportResult(`Sucesso! ${res.count} comandas importadas para o banco operacional.`);
        setTimeout(() => setShowImportConfirm(false), 2500);
      }
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-sm sm:px-6">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-emerald-950 sm:text-xl">
                Engenho da Bola
              </span>
              <span className="hidden text-xs text-slate-400 sm:inline">·</span>
              <span className="hidden text-xs font-medium text-slate-500 sm:inline">
                Gestão Operacional
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span>Sincronizado via Cloud Firestore</span>
              <span className="text-slate-300">·</span>
              {syncMeta.hasPendingWrites ? (
                <span className="inline-flex items-center gap-1 font-medium text-amber-600">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Gravando alterações...
                </span>
              ) : syncMeta.fromCache ? (
                <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                  <CloudOff className="h-3 w-3 text-slate-400" />
                  Cache Offline ativo
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                  <Cloud className="h-3 w-3 text-emerald-600" />
                  Nuvem conectada
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Seção de Autenticação / Equipe */}
          {currentStaff ? (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
              <div className="flex items-center gap-1.5">
                <div
                  className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                    isAdmin ? 'bg-purple-900' : 'bg-emerald-900'
                  }`}
                >
                  {currentStaff.name ? currentStaff.name[0].toUpperCase() : 'F'}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="font-semibold text-slate-900 text-[11px] max-w-[130px] truncate leading-tight">
                    {currentStaff.name}
                  </p>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider leading-tight">
                    {isAdmin ? 'Administrador' : 'Operador'}
                  </p>
                </div>
              </div>

              {/* Botão de Gestão de Equipe (Administrador) */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setIsStaffModalOpen(true)}
                  className="ml-1 flex items-center gap-1 rounded bg-white px-2 py-1 text-[11px] font-medium text-purple-900 border border-purple-200 hover:bg-purple-50"
                  title="Gerenciar funcionários autorizados"
                >
                  <Users className="h-3 w-3" />
                  <span className="hidden md:inline">Equipe</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleLogout}
                title="Desconectar da sessão"
                className="text-slate-400 hover:text-slate-700 ml-1 p-1"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onGoogleLoginClick}
              disabled={isLoggingIn}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50"
            >
              <LogIn className="h-3.5 w-3.5 text-emerald-800" />
              <span>{isLoggingIn ? 'Conectando...' : 'Entrar com Google'}</span>
            </button>
          )}

          {/* Opção de homologação de dados locais pelo Administrador (se existirem) */}
          {isAdmin && localBackupCount > 0 && (
            <button
              type="button"
              onClick={() => setShowImportConfirm(true)}
              className="hidden lg:flex h-10 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
              title="Revisar e importar dados locais para o banco"
            >
              <Database className="h-3.5 w-3.5 text-amber-700" />
              <span>Importar Local ({localBackupCount})</span>
            </button>
          )}

          {/* Abertura de nova comanda */}
          {authStatus === 'authorized' && (
            <button
              type="button"
              onClick={() => setIsNewComandaModalOpen(true)}
              className="flex h-10 items-center gap-1.5 rounded-lg bg-emerald-900 px-3.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 active:scale-95 sm:text-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Abrir Comanda</span>
            </button>
          )}
        </div>
      </header>

      {/* Modal de Gestão de Equipe */}
      <StaffManagementModal
        isOpen={isStaffModalOpen}
        onClose={() => setIsStaffModalOpen(false)}
      />

      {/* Modal de Homologação Administrativa de Importação */}
      {showImportConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-amber-100 p-2.5 text-amber-800">
                <Database className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Homologação Administrativa de Importação
                </h3>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  Foram localizados <strong>{localBackupCount} registros de comandas</strong> salvos anteriormente neste navegador. Deseja que o Administrador revise e importe esses registros para a base oficial de dados do Firestore?
                </p>
              </div>
            </div>

            {importResult && (
              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs border border-slate-200 text-slate-800">
                {importResult}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImportConfirm(false)}
                disabled={isImporting}
                className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={isImporting}
                className="h-9 rounded-lg bg-emerald-900 px-4 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {isImporting ? 'Importando...' : 'Confirmar Importação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
