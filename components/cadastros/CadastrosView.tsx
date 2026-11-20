'use client';

import React, { useState } from 'react';
import { useComandas } from '@/context/ComandasContext';
import { formatCents } from '@/lib/formatters';
import {
  AlertCircle,
  GraduationCap,
  Info,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { StaffManagementModal } from '@/components/admin/StaffManagementModal';

export type CadastrosTab = 'produtos' | 'espacos' | 'professores' | 'usuarios';

export function CadastrosView({ initialTab = 'produtos' }: { initialTab?: CadastrosTab } = {}) {
  const {
    products,
    productsLoaded,
    productsSyncError,
    currentStaff,
    staffList,
    staffLoaded,
    staffSyncError,
    refreshStaffList,
  } = useComandas();

  const [activeTab, setActiveTab] = useState<CadastrosTab>(initialTab);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);

  const isAdmin = currentStaff?.role === 'admin';

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Cadastros Gerais
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Cardápio do bar, espaços físicos e equipe autorizada
          </p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('produtos')}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === 'produtos'
              ? 'bg-emerald-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          {productsLoaded && !productsSyncError
            ? `Produtos do Bar (${products.length})`
            : 'Produtos do Bar'}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('espacos')}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === 'espacos'
              ? 'bg-emerald-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          Espaços Esportivos
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('professores')}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === 'professores'
              ? 'bg-emerald-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          Professores
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('usuarios')}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === 'usuarios'
              ? 'bg-emerald-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          Usuários & Permissões
        </button>
      </div>

      {/* Aba: Produtos do Bar (Real — Firestore) */}
      {activeTab === 'produtos' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
          {productsSyncError ? (
            <div className="flex items-start gap-2.5 p-5 text-xs text-red-900 bg-red-50">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm text-red-950">
                  Erro ao sincronizar produtos do bar
                </p>
                <p className="mt-0.5 text-red-800">{productsSyncError}</p>
              </div>
            </div>
          ) : !productsLoaded ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Carregando…
            </div>
          ) : products.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Nenhum produto cadastrado no Firestore.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-semibold text-slate-500 uppercase">
                  <th className="py-3 px-4">Produto</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4 text-right">Preço de Venda</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{p.name}</td>
                    <td className="py-2.5 px-4 text-slate-600">{p.category}</td>
                    <td className="py-2.5 px-4 text-slate-500">{p.description || '—'}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-900 tabular-nums">
                      {formatCents(p.priceCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Aba: Espaços Esportivos (Sem preços fixos inventados) */}
      {activeTab === 'espacos' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
            <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
            <p>
              <strong>Tabela de preços por hora:</strong> Ainda não integrada. O valor cobrado por cada locação é informado diretamente na reserva ou locação em grupo.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <span className="text-[11px] font-bold uppercase text-emerald-900">Areia</span>
              <h3 className="text-base font-bold text-slate-900 mt-1">Quadra 1 — Areia</h3>
              <p className="text-xs text-slate-600 mt-1">
                Quadra de areia para Beach Tennis, Futevôlei e locações.
              </p>
              <p className="mt-3 text-xs text-slate-500">
                Tabela de preço/hora: Ainda não integrada
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <span className="text-[11px] font-bold uppercase text-emerald-900">Areia</span>
              <h3 className="text-base font-bold text-slate-900 mt-1">Quadra 2 — Areia</h3>
              <p className="text-xs text-slate-600 mt-1">
                Quadra de areia para Futevôlei, Beach Tennis e treinos.
              </p>
              <p className="mt-3 text-xs text-slate-500">
                Tabela de preço/hora: Ainda não integrada
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <span className="text-[11px] font-bold uppercase text-emerald-900">Areia</span>
              <h3 className="text-base font-bold text-slate-900 mt-1">Quadra 3 — Areia Mista</h3>
              <p className="text-xs text-slate-600 mt-1">
                Quadra de areia para aulas, recreação e locações avulsas.
              </p>
              <p className="mt-3 text-xs text-slate-500">
                Tabela de preço/hora: Ainda não integrada
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <span className="text-[11px] font-bold uppercase text-emerald-900">Grama Sintética</span>
              <h3 className="text-base font-bold text-slate-900 mt-1">Campo Society Oficial</h3>
              <p className="text-xs text-slate-600 mt-1">
                Campo de grama sintética para futebol society e escolinhas.
              </p>
              <p className="mt-3 text-xs text-slate-500">
                Tabela de preço/hora: Ainda não integrada
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Aba: Professores (Ainda não integrado) */}
      {activeTab === 'professores' && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-2xs space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Ainda não integrado</h2>
            <p className="mt-1 text-xs text-slate-600 max-w-lg mx-auto leading-relaxed">
              O cadastro de professores e o controle de repasses ainda não estão conectados ao banco de dados operacional.
            </p>
          </div>
        </div>
      )}

      {/* Aba: Usuários & Permissões (Real — Firestore) */}
      {activeTab === 'usuarios' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Controle de Acesso & Perfis Operacionais
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Apenas funcionários cadastrados e ativos possuem acesso às comandas e produtos.
                </p>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setIsStaffModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-900 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800"
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>Gerenciar Funcionários & Autorizações</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3.5">
                <span className="font-bold text-purple-900 text-xs flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-purple-800" />
                  Perfil Administrador
                </span>
                <p className="text-purple-800 mt-1 leading-relaxed text-[11px]">
                  Autoriza e gerencia a equipe de funcionários, cataloga produtos do cardápio, acessa Caixa e Relatórios financeiros.
                </p>
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3.5">
                <span className="font-bold text-emerald-900 text-xs flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-emerald-800" />
                  Perfil Operador
                </span>
                <p className="text-emerald-800 mt-1 leading-relaxed text-[11px]">
                  Abre comandas individuais e de mesas, lança itens consumidos, realiza transferências atômicas e registra pagamentos com troco e idempotência.
                </p>
              </div>
            </div>

            {/* Lista de funcionários (somente admin lista todos no Firestore) */}
            <div className="pt-2">
              {!isAdmin ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                  A listagem completa da equipe e a gestão de permissões são restritas a Administradores.
                </div>
              ) : staffSyncError ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-900">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    <span>Erro ao carregar equipe: {staffSyncError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshStaffList()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 shrink-0"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Tentar novamente</span>
                  </button>
                </div>
              ) : !staffLoaded ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                  Carregando…
                </div>
              ) : (
                <>
                  <h4 className="text-xs font-semibold text-slate-700 mb-2">
                    Funcionários Autorizados no Firestore ({staffList.length})
                  </h4>
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden">
                    {staffList.map(member => (
                      <div key={member.uid} className="flex items-center justify-between p-3 text-xs">
                        <div>
                          <span className="font-semibold text-slate-900">{member.name}</span>
                          <span className="text-slate-400 ml-2 text-[11px]">({member.email})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                              member.role === 'admin'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {member.role === 'admin' ? 'Administrador' : 'Operador'}
                          </span>
                          <span
                            className={`text-[10px] font-semibold ${
                              member.active ? 'text-emerald-700' : 'text-slate-400'
                            }`}
                          >
                            {member.active ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <StaffManagementModal
            isOpen={isStaffModalOpen}
            onClose={() => setIsStaffModalOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
