'use client';

import React, { useState } from 'react';
import { CreditCard, Users, Calendar, Info, Search, Filter } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';

interface MensalidadeItem {
  id: string;
  tipo: 'aluno' | 'grupo_quadra';
  nome: string;
  detalhe: string;
  valor: number;
  vencimentoDia: number;
  status: 'em_dia' | 'vence_hoje' | 'em_atraso';
  mesReferencia: string;
}

const MOCK_MENSALIDADES: MensalidadeItem[] = [
  // Alunos
  {
    id: 'm-1',
    tipo: 'aluno',
    nome: 'Gabriel Pimentel',
    detalhe: 'Beach Tennis Noturno (Prof. Thiago)',
    valor: 260.0,
    vencimentoDia: 10,
    status: 'em_dia',
    mesReferencia: 'Outubro/2026',
  },
  {
    id: 'm-2',
    tipo: 'aluno',
    nome: 'Beatriz Vasconcelos',
    detalhe: 'Futevôlei Feminino (Prof. Marcelo)',
    valor: 250.0,
    vencimentoDia: 10,
    status: 'vence_hoje',
    mesReferencia: 'Outubro/2026',
  },
  {
    id: 'm-3',
    tipo: 'aluno',
    nome: 'Enzo Ramos (Resp: Paula)',
    detalhe: 'Escolinha Society Sub-11 (Prof. Renato)',
    valor: 210.0,
    vencimentoDia: 5,
    status: 'em_atraso',
    mesReferencia: 'Outubro/2026',
  },
  {
    id: 'm-4',
    tipo: 'aluno',
    nome: 'Mariana Duarte',
    detalhe: 'Beach Tennis Manhã (Prof. Thiago)',
    valor: 240.0,
    vencimentoDia: 15,
    status: 'em_dia',
    mesReferencia: 'Outubro/2026',
  },

  // Grupos Recorrentes (Locação mensal de quadra)
  {
    id: 'm-5',
    tipo: 'grupo_quadra',
    nome: 'Grupo Pelada Quarta Show (Resp: Rogério Cruz)',
    detalhe: 'Campo Society · Quartas 19:15 às 20:45',
    valor: 1100.0,
    vencimentoDia: 10,
    status: 'vence_hoje',
    mesReferencia: 'Outubro/2026',
  },
  {
    id: 'm-6',
    tipo: 'grupo_quadra',
    nome: 'Grupo Futevôlei dos Amigos (Resp: Eduardo Braga)',
    detalhe: 'Quadra 2 Areia · Terças 20:30 às 22:00',
    valor: 780.0,
    vencimentoDia: 5,
    status: 'em_dia',
    mesReferencia: 'Outubro/2026',
  },
  {
    id: 'm-7',
    tipo: 'grupo_quadra',
    nome: 'Beach Tennis Misto Quarta (Resp: Carla Menezes)',
    detalhe: 'Quadra 1 Areia · Quartas 19:30 às 21:00',
    valor: 820.0,
    vencimentoDia: 5,
    status: 'em_atraso',
    mesReferencia: 'Outubro/2026',
  },
];

export function MensalidadesView() {
  const [tab, setTab] = useState<'aulas' | 'locacoes'>('aulas');

  const filtered = MOCK_MENSALIDADES.filter(m =>
    tab === 'aulas' ? m.tipo === 'aluno' : m.tipo === 'grupo_quadra'
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
        <Info className="h-5 w-5 text-emerald-900 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-slate-900 text-sm">
            Módulo de Mensalidades — Demonstração da Estrutura
          </p>
          <p className="mt-0.5 text-slate-600 leading-relaxed">
            Aqui separamos os dois pilares de receita recorrente do Engenho da Bola: <strong>Alunos das aulas</strong> e <strong>Responsáveis por grupos de horários cativos</strong>. Na próxima etapa será conectado o recebimento automático com emissão de recibo e aviso de cobrança.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Controle de Mensalidades
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Acompanhamento de pagamentos de alunos e horistas mensais
          </p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex rounded-lg bg-slate-100 p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab('aulas')}
          className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            tab === 'aulas'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Alunos das Aulas
        </button>
        <button
          type="button"
          onClick={() => setTab('locacoes')}
          className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            tab === 'locacoes'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Grupos Mensalistas de Quadra
        </button>
      </div>

      {/* Tabela de Mensalidades */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-semibold text-slate-500 uppercase">
              <th className="py-3 px-4">Responsável / Aluno</th>
              <th className="py-3 px-4">Plano / Espaço Vinculado</th>
              <th className="py-3 px-4 text-center">Dia Vencimento</th>
              <th className="py-3 px-4 text-right">Valor Mensal</th>
              <th className="py-3 px-4 text-center">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(item => {
              let badge = { text: 'Em dia', cls: 'bg-emerald-50 text-emerald-900 border-emerald-200' };
              if (item.status === 'vence_hoje') {
                badge = { text: 'Vence hoje', cls: 'bg-amber-50 text-amber-900 border-amber-200' };
              } else if (item.status === 'em_atraso') {
                badge = { text: 'Em atraso', cls: 'bg-red-50 text-red-900 border-red-200' };
              }

              return (
                <tr key={item.id} className="hover:bg-slate-50/60">
                  <td className="py-3 px-4 font-semibold text-slate-900 text-sm">
                    {item.nome}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {item.detalhe}
                  </td>
                  <td className="py-3 px-4 text-center font-medium text-slate-700 tabular-nums">
                    Todo dia {item.vencimentoDia}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">
                    {formatCurrency(item.valor)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
                      {badge.text}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
