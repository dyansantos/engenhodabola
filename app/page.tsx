'use client';

import React from 'react';
import { ComandasProvider, useComandas } from '@/context/ComandasContext';
import { AppHeader } from '@/components/layout/AppHeader';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { ComandasView } from '@/components/comandas/ComandasView';
import { AgendaView } from '@/components/agenda/AgendaView';
import { AlunosView } from '@/components/alunos/AlunosView';
import { MensalidadesView } from '@/components/mensalidades/MensalidadesView';
import { EventosView } from '@/components/eventos/EventosView';
import { CaixaView } from '@/components/caixa/CaixaView';
import { RelatoriosView } from '@/components/relatorios/RelatoriosView';
import { CadastrosView } from '@/components/cadastros/CadastrosView';
import { NewComandaModal } from '@/components/comandas/NewComandaModal';
import { ComandaDetailModal } from '@/components/comandas/ComandaDetailModal';
import { NewGroupRentalModal } from '@/components/comandas/NewGroupRentalModal';
import { GroupRentalDetailModal } from '@/components/comandas/GroupRentalDetailModal';
import { StorageNotification } from '@/components/layout/StorageNotification';
import {
  Lock,
  LogIn,
  ShieldAlert,
  LogOut,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

function AppContent() {
  const {
    activeModule,
    selectedComandaId,
    setSelectedComandaId,
    selectedGroupRentalId,
    setSelectedGroupRentalId,
    authStatus,
    currentUser,
    unauthorizedReason,
    handleGoogleLogin,
    handleLogout,
  } = useComandas();

  const renderActiveView = () => {
    switch (activeModule) {
      case 'inicio':
        return <DashboardView />;
      case 'comandas':
        return <ComandasView />;
      case 'agenda':
        return <AgendaView />;
      case 'alunos':
        return <AlunosView />;
      case 'mensalidades':
        return <MensalidadesView />;
      case 'eventos':
        return <EventosView />;
      case 'caixa':
        return <CaixaView />;
      case 'relatorios':
        return <RelatoriosView />;
      case 'cadastros':
        return <CadastrosView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans">
      <AppHeader />
      <StorageNotification />

      <div className="flex flex-1 overflow-hidden">
        {authStatus === 'authorized' && <Sidebar />}

        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 pb-24 lg:pb-8">
          <div className="mx-auto max-w-7xl">
            {/* Estado 1: Carregando autorização */}
            {authStatus === 'loading' && (
              <div className="flex flex-col items-center justify-center py-28 text-center">
                <RefreshCw className="h-8 w-8 text-emerald-900 animate-spin mb-3" />
                <p className="text-sm font-semibold text-slate-800">
                  Verificando credenciais e autorização de funcionário...
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Validando perfil e regras de segurança no servidor
                </p>
              </div>
            )}

            {/* Estado 2: Usuário não autenticado */}
            {authStatus === 'unauthenticated' && (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl text-center space-y-5">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-900">
                    <Lock className="h-7 w-7" />
                  </div>

                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      Engenho da Bola — Acesso Restrito
                    </h2>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                      O acesso a comandas, cardápio e recebimentos é restrito exclusivamente a funcionários autorizados (Administradores e Operadores).
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-left text-xs text-slate-600 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                      <ShieldCheck className="h-4 w-4 text-emerald-800" />
                      Políticas de Controle de Acesso (ABAC):
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-500 pl-1">
                      <li>Autenticação por conta Google corporativa/autorizada.</li>
                      <li>Cadastro ativo prévio confirmado no banco de dados.</li>
                      <li>Nenhum dado é exposto sem autorização confirmada.</li>
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 transition-colors"
                  >
                    <LogIn className="h-4 w-4" />
                    <span>Conectar com Conta Google</span>
                  </button>
                </div>
              </div>
            )}

            {/* Estado 3: Usuário autenticado com Google, mas SEM autorização de funcionário */}
            {authStatus === 'unauthorized' && (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-8 shadow-xl text-center space-y-5">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-700">
                    <ShieldAlert className="h-7 w-7" />
                  </div>

                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      Acesso Não Autorizado
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Conectado como:{' '}
                      <strong className="text-slate-800">
                        {currentUser?.email || 'Usuário Google'}
                      </strong>
                    </p>
                  </div>

                  <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-left text-xs text-red-900 leading-relaxed">
                    <p className="font-semibold mb-1">Motivo da Restrição:</p>
                    <p>
                      {unauthorizedReason ||
                        'Sua conta Google conectada não possui cadastro ativo de funcionário no Engenho da Bola. Solicite a um Administrador a liberação do seu acesso.'}
                    </p>
                  </div>

                  <div className="text-xs text-slate-500 leading-relaxed">
                    Por motivos de segurança e conformidade operacional, os dados das comandas e produtos não são carregados na memória deste dispositivo.
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <LogOut className="h-4 w-4 text-slate-500" />
                      <span>Desconectar / Trocar de Conta</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Estado 4: Funcionário Autorizado */}
            {authStatus === 'authorized' && renderActiveView()}
          </div>
        </main>
      </div>

      {authStatus === 'authorized' && <MobileNav />}

      {/* Modais Globais */}
      {authStatus === 'authorized' && (
        <>
          <NewComandaModal />

          {selectedComandaId && (
            <ComandaDetailModal
              comandaId={selectedComandaId}
              onClose={() => setSelectedComandaId(null)}
            />
          )}

          <NewGroupRentalModal />

          {selectedGroupRentalId && (
            <GroupRentalDetailModal
              rentalId={selectedGroupRentalId}
              onClose={() => setSelectedGroupRentalId(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <ComandasProvider>
      <AppContent />
    </ComandasProvider>
  );
}
