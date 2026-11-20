'use client';

import React, { useState } from 'react';
import { GraduationCap, Users, Clock, Info, Search, Plus } from 'lucide-react';

interface Turma {
  id: string;
  modalidade: 'Beach Tennis' | 'Futevôlei' | 'Escolinha de Futebol';
  nome: string;
  professor: string;
  diasHorario: string;
  alunosMatriculados: number;
  capacidade: number;
  mensalidadeBase: number;
}

const MOCK_TURMAS: Turma[] = [
  {
    id: 't-1',
    modalidade: 'Beach Tennis',
    nome: 'Turma Iniciante Noturno',
    professor: 'Prof. Thiago Nogueira',
    diasHorario: 'Terças e Quintas · 18:00 às 19:15',
    alunosMatriculados: 8,
    capacidade: 8,
    mensalidadeBase: 260.0,
  },
  {
    id: 't-2',
    modalidade: 'Beach Tennis',
    nome: 'Turma Intermediário Manhã',
    professor: 'Prof. Thiago Nogueira',
    diasHorario: 'Segundas e Quartas · 07:30 às 08:45',
    alunosMatriculados: 6,
    capacidade: 8,
    mensalidadeBase: 240.0,
  },
  {
    id: 't-3',
    modalidade: 'Futevôlei',
    nome: 'Futevôlei Feminino & Misto',
    professor: 'Prof. Marcelo Bahia',
    diasHorario: 'Segundas e Quartas · 19:00 às 20:15',
    alunosMatriculados: 7,
    capacidade: 8,
    mensalidadeBase: 250.0,
  },
  {
    id: 't-4',
    modalidade: 'Futevôlei',
    nome: 'Futevôlei Avançado / Jogos',
    professor: 'Prof. Marcelo Bahia',
    diasHorario: 'Terças e Quintas · 20:00 às 21:15',
    alunosMatriculados: 8,
    capacidade: 8,
    mensalidadeBase: 280.0,
  },
  {
    id: 't-5',
    modalidade: 'Escolinha de Futebol',
    nome: 'Escolinha Society Sub-09 e Sub-11',
    professor: 'Prof. Renato Matos',
    diasHorario: 'Segundas, Quartas e Sextas · 17:30 às 18:45',
    alunosMatriculados: 18,
    capacidade: 20,
    mensalidadeBase: 210.0,
  },
  {
    id: 't-6',
    modalidade: 'Escolinha de Futebol',
    nome: 'Escolinha Society Sub-13 e Sub-15',
    professor: 'Prof. Renato Matos',
    diasHorario: 'Terças e Quintas · 17:30 às 19:00',
    alunosMatriculados: 16,
    capacidade: 20,
    mensalidadeBase: 220.0,
  },
];

export function AlunosView() {
  const [selectedMod, setSelectedMod] = useState<string>('Todas');

  const modalities = ['Todas', 'Beach Tennis', 'Futevôlei', 'Escolinha de Futebol'];

  const filtered = MOCK_TURMAS.filter(t => {
    if (selectedMod === 'Todas') return true;
    return t.modalidade === selectedMod;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
        <Info className="h-5 w-5 text-emerald-900 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-slate-900 text-sm">
            Módulo de Alunos e Turmas — Demonstração da Estrutura
          </p>
          <p className="mt-0.5 text-slate-600 leading-relaxed">
            Nesta etapa demonstrativa, organizamos a estrutura para as 3 modalidades do Engenho da Bola (Beach Tennis, Futevôlei e Escolinha de Futebol). Na próxima etapa serão implementados: matrícula completa, controle de chamada e integração direta com o módulo de mensalidades.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Alunos e Turmas
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Aulas das três modalidades esportivas do complexo
          </p>
        </div>

        <button
          type="button"
          className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 cursor-not-allowed opacity-75"
        >
          <Plus className="h-4 w-4" />
          <span>Nova Turma (Próxima etapa)</span>
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {modalities.map(mod => (
          <button
            key={mod}
            type="button"
            onClick={() => setSelectedMod(mod)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              selectedMod === mod
                ? 'bg-emerald-900 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {mod}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filtered.map(turma => (
          <div
            key={turma.id}
            className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-2xs"
          >
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900">
                {turma.modalidade}
              </span>
              <h3 className="mt-1 text-base font-bold text-slate-900">{turma.nome}</h3>
              <p className="text-xs text-slate-600 mt-0.5">{turma.professor}</p>
              <p className="mt-2 text-xs text-slate-500">{turma.diasHorario}</p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800">
                {turma.alunosMatriculados}/{turma.capacidade} alunos
              </span>
              <span className="font-bold text-emerald-950 tabular-nums">
                R$ {turma.mensalidadeBase.toFixed(2).replace('.', ',')}/mês
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
