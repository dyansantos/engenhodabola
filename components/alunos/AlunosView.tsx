'use client';

import React from 'react';
import { GraduationCap, Info } from 'lucide-react';

export function AlunosView() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          Alunos e Turmas
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
          Gestão de turmas e matrículas das modalidades esportivas do complexo
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-2xs space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <GraduationCap className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">Ainda não integrado</h2>
          <p className="mt-1 text-xs text-slate-600 max-w-lg mx-auto leading-relaxed">
            O cadastro de alunos, turmas e matrículas ainda não está conectado ao banco de dados operacional. Nenhum valor desta tela compõe os totais de recebimentos.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-600">
          <Info className="h-3.5 w-3.5 text-slate-500" />
          <span>Sem registros fictícios exibidos</span>
        </div>
      </div>
    </div>
  );
}
