'use client';

import React from 'react';
import { PartyPopper, Calendar, Clock, MapPin, Info, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';

interface EventoItem {
  id: string;
  nome: string;
  tipo: string;
  data: string;
  horario: string;
  responsavel: string;
  telefoneContato: string;
  espacosUtilizados: string;
  valorTotal: number;
  sinalPago: number;
  saldoRestante: number;
  status: 'confirmado' | 'em_negociacao' | 'finalizado';
}

const MOCK_EVENTOS: EventoItem[] = [
  {
    id: 'ev-1',
    nome: 'Aniversário de 10 Anos do Theo',
    tipo: 'Festa de Aniversário Infantil',
    data: '17/10/2026 (Sábado)',
    horario: '14:00 às 18:00',
    responsavel: 'Juliana Pires (Mãe)',
    telefoneContato: '(11) 98765-4321',
    espacosUtilizados: 'Campo Society + Quiosque do Bar & Churrasqueira',
    valorTotal: 1800.0,
    sinalPago: 900.0,
    saldoRestante: 900.0,
    status: 'confirmado',
  },
  {
    id: 'ev-2',
    nome: 'Torneio Amador de Beach Tennis Engenho Open',
    tipo: 'Torneio Esportivo Interno',
    data: '24/10/2026 e 25/10/2026',
    horario: '08:00 às 18:00',
    responsavel: 'Coordenação Esportiva Engenho',
    telefoneContato: '(11) 99123-8877',
    espacosUtilizados: 'As 3 Quadras de Areia + Deck do Bar',
    valorTotal: 4500.0,
    sinalPago: 4500.0,
    saldoRestante: 0.0,
    status: 'confirmado',
  },
  {
    id: 'ev-3',
    nome: 'Confraternização de Final de Ano — TechSolutions',
    tipo: 'Evento Corporativo',
    data: '05/11/2026 (Quinta)',
    horario: '18:00 às 23:00',
    responsavel: 'Roberto Andrade (RH)',
    telefoneContato: '(11) 97654-3210',
    espacosUtilizados: 'Campo Society + Quadra 3 Areia + Toda a Área do Bar',
    valorTotal: 3200.0,
    sinalPago: 1000.0,
    saldoRestante: 2200.0,
    status: 'confirmado',
  },
];

export function EventosView() {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
        <Info className="h-5 w-5 text-emerald-900 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-slate-900 text-sm">
            Módulo de Eventos e Reservas Especiais — Demonstração da Estrutura
          </p>
          <p className="mt-0.5 text-slate-600 leading-relaxed">
            Aqui são centralizadas as reservas de aniversários, torneios e confraternizações que utilizam espaços combinados (society, quadras de areia e bar). Na próxima etapa, será possível gerar contratos e integrar o consumo do bar direto no pacote do evento.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Eventos e Reservas de Espaços
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Controle de datas, espaços combinados, sinais e saldos a receber
          </p>
        </div>

        <button
          type="button"
          className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 cursor-not-allowed opacity-75"
        >
          <Plus className="h-4 w-4" />
          <span>Novo Evento (Próxima etapa)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {MOCK_EVENTOS.map(ev => (
          <div
            key={ev.id}
            className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-2xs"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] font-bold text-emerald-900 uppercase">
                  {ev.tipo}
                </span>
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-900">
                  Confirmado
                </span>
              </div>

              <h3 className="mt-2 text-base font-bold text-slate-900">{ev.nome}</h3>
              <p className="text-xs text-slate-600 mt-1">
                Responsável: <span className="font-medium">{ev.responsavel}</span> · {ev.telefoneContato}
              </p>

              <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>{ev.data}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <span>{ev.horario}</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>{ev.espacosUtilizados}</span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block">Total</span>
                  <span className="font-bold text-slate-900 tabular-nums">
                    {formatCurrency(ev.valorTotal)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block">Sinal Pago</span>
                  <span className="font-semibold text-emerald-900 tabular-nums">
                    {formatCurrency(ev.sinalPago)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block">Saldo Restante</span>
                  <span className="font-bold text-amber-900 tabular-nums">
                    {formatCurrency(ev.saldoRestante)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
