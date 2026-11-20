'use client';

import React, { useState } from 'react';
import { useComandas } from '@/context/ComandasContext';
import { formatCurrency, formatCents } from '@/lib/formatters';
import { SlidersHorizontal, Users, Utensils, MapPin, GraduationCap, ShieldCheck, Info } from 'lucide-react';
import { StaffManagementModal } from '@/components/admin/StaffManagementModal';

export function CadastrosView() {
  const { products, currentStaff, staffList } = useComandas();

  const [activeTab, setActiveTab] = useState<'produtos' | 'espacos' | 'professores' | 'clientes' | 'usuarios'>('produtos');
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
        <Info className="h-5 w-5 text-emerald-900 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-slate-900 text-sm">
            Módulo de Cadastros Básicos — Demonstração da Estrutura
          </p>
          <p className="mt-0.5 text-slate-600 leading-relaxed">
            Consulte a base de produtos do bar, espaços físicos, professores e operadores. <strong>Nota importante:</strong> O repasse aos professores ainda não possui cálculo automático, pois as regras de comissionamento estão em definição com a diretoria do Engenho da Bola.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Cadastros Gerais
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Itens do bar, quadras, professores e equipe de atendimento
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
          Produtos do Bar ({products.length})
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
          Espaços Esportivos (4)
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
          Professores (3)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('clientes')}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === 'clientes'
              ? 'bg-emerald-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          Clientes & Mensalistas
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

      {/* Conteúdo da Aba */}
      {activeTab === 'produtos' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
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
                    {formatCents(p.priceCents ?? Math.round((p.price || 0) * 100))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'espacos' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <span className="text-[11px] font-bold uppercase text-emerald-900">Areia</span>
            <h3 className="text-base font-bold text-slate-900 mt-1">Quadra 1 — Areia</h3>
            <p className="text-xs text-slate-600 mt-1">
              Compartilhada entre Beach Tennis e Futevôlei com iluminação em LED e rede com ajuste de altura oficial.
            </p>
            <p className="mt-3 text-xs font-semibold text-slate-800">Locação avulsa: R$ 140,00/hora</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <span className="text-[11px] font-bold uppercase text-emerald-900">Areia</span>
            <h3 className="text-base font-bold text-slate-900 mt-1">Quadra 2 — Areia</h3>
            <p className="text-xs text-slate-600 mt-1">
              Areia tratada especial para Futevôlei e treinos funcionais na areia com arquibancada lateral.
            </p>
            <p className="mt-3 text-xs font-semibold text-slate-800">Locação avulsa: R$ 130,00/hora</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <span className="text-[11px] font-bold uppercase text-emerald-900">Areia</span>
            <h3 className="text-base font-bold text-slate-900 mt-1">Quadra 3 — Areia Mista</h3>
            <p className="text-xs text-slate-600 mt-1">
              Quadra de areia para recreação, aulas e locações avulsas nos finais de semana e noites.
            </p>
            <p className="mt-3 text-xs font-semibold text-slate-800">Locação avulsa: R$ 130,00/hora</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <span className="text-[11px] font-bold uppercase text-emerald-900">Grama Sintética</span>
            <h3 className="text-base font-bold text-slate-900 mt-1">Campo Society Oficial</h3>
            <p className="text-xs text-slate-600 mt-1">
              Grama sintética monofilamento com amortecimento, alambrado completo e vestiários integrados.
            </p>
            <p className="mt-3 text-xs font-semibold text-slate-800">Locação avulsa: R$ 260,00/hora</p>
          </div>
        </div>
      )}

      {activeTab === 'professores' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <strong>Aviso sobre repasses:</strong> Conforme definição estratégica, o cálculo automático de repasse aos professores não foi implementado nesta etapa e aguarda alinhamento das políticas contratuais.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <h3 className="text-base font-bold text-slate-900">Prof. Thiago Nogueira</h3>
              <p className="text-xs text-emerald-900 font-semibold mt-0.5">Beach Tennis</p>
              <p className="text-xs text-slate-500 mt-2">
                Responsável pelas turmas iniciantes e intermediárias matutinas e noturnas.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <h3 className="text-base font-bold text-slate-900">Prof. Marcelo Bahia</h3>
              <p className="text-xs text-emerald-900 font-semibold mt-0.5">Futevôlei</p>
              <p className="text-xs text-slate-500 mt-2">
                Responsável pelas turmas femininas, mistas e de jogo avançado.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <h3 className="text-base font-bold text-slate-900">Prof. Renato Matos</h3>
              <p className="text-xs text-emerald-900 font-semibold mt-0.5">Escolinha de Futebol Society</p>
              <p className="text-xs text-slate-500 mt-2">
                Responsável pelas categorias Sub-09, Sub-11, Sub-13 e Sub-15.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'clientes' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
          A base unificada de clientes (avulsos, alunos e mensalistas de quadra) com histórico completo de consumo e frequência será ativada na próxima etapa.
        </div>
      )}

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

              {currentStaff?.role === 'admin' && (
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
                  Autoriza e gerencia a equipe de funcionários, cataloga produtos do cardápio, revisa importações administrativas e audita o fechamento de caixa.
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

            {/* Lista resumida de funcionários */}
            <div className="pt-2">
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
                      <span className={`text-[10px] font-semibold ${member.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {member.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
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
