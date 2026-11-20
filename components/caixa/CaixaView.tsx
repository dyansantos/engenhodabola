'use client';

import React, { useState } from 'react';
import { useComandas } from '@/context/ComandasContext';
import { formatCents } from '@/lib/formatters';
import { ArrowDownRight, ArrowUpRight, Info, Lock } from 'lucide-react';

export function CaixaView() {
  const { metrics } = useComandas();

  // Valores de exemplo em centavos inteiros
  const initialFloatCents = 35000; // R$ 350,00 (Fundo de troco fictício de abertura)
  const withdrawalsCents = 8000; // R$ 80,00 (Exemplo de sangria para compra de gelo)
  const [showClosingModal, setShowClosingModal] = useState(false);

  // Dinheiro físico na gaveta = Fundo de troco + Recebimentos em Dinheiro de hoje - Sangrias
  const cashInDrawerCents = initialFloatCents + metrics.todayReceiptsByMethodCents.dinheiro - withdrawalsCents;

  return (
    <div className="space-y-5">
      {/* Aviso explicativo obrigatório */}
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
        <Info className="h-5 w-5 text-emerald-900 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-slate-900 text-sm">
            Prévia do Módulo de Caixa — Reage às Comandas Locais Desta Demonstração
          </p>
          <p className="mt-0.5 text-slate-600 leading-relaxed">
            Esta tela é uma <strong>prévia demonstrativa</strong> do módulo de caixa. Os valores de recebimentos reagem diretamente às comandas locais operadas neste dispositivo. O <strong>fundo de troco</strong> e as <strong>retiradas</strong> são identificados como exemplos ilustrativos para demonstrar a conferência da gaveta de dinheiro e <strong>não compõem receita nem vendas</strong>.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Prévia do Caixa Operacional
            </h1>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              Prévia Demonstrativa
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Sessão operacional do dia atual · Operador de demonstração
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowClosingModal(true)}
          className="flex h-10 items-center gap-1.5 rounded-lg bg-emerald-900 px-4 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800"
        >
          <Lock className="h-3.5 w-3.5" />
          <span>Fechamento do Caixa (Simulação)</span>
        </button>
      </div>

      {/* Cards de Resumo Segregando Receita de Dinheiro Físico */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block">
            Fundo de Troco (Exemplo)
          </span>
          <p className="mt-2 text-xl font-bold text-slate-900 tabular-nums">
            {formatCents(initialFloatCents)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Abertura de gaveta (não é receita)</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">
              Recebimentos das Comandas Hoje
            </span>
            <ArrowDownRight className="h-4 w-4 text-emerald-800" />
          </div>
          <p className="mt-2 text-xl font-bold text-emerald-950 tabular-nums">
            +{formatCents(metrics.todayReceiptsCents)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Receita de vendas do dia (todas as formas)</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">
              Retiradas / Sangrias (Exemplo)
            </span>
            <ArrowUpRight className="h-4 w-4 text-red-600" />
          </div>
          <p className="mt-2 text-xl font-bold text-red-700 tabular-nums">
            -{formatCents(withdrawalsCents)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Ex: Compra de gelo (fictício)</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block">
            Dinheiro Físico na Gaveta
          </span>
          <p className="mt-2 text-xl font-bold text-slate-900 tabular-nums">
            {formatCents(cashInDrawerCents)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Fundo + Dinheiro das comandas - Sangrias</p>
        </div>
      </div>

      {/* Detalhamento por Forma de Pagamento */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
        <h2 className="text-base font-bold text-slate-900 mb-1">
          Receitas das Comandas de Hoje por Forma de Pagamento
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          Somatório exclusivo das transações registradas na data de hoje (fuso America/Sao_Paulo)
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="text-slate-500 font-medium">Pix</span>
            <p className="mt-1 text-base font-bold text-slate-900 tabular-nums">
              {formatCents(metrics.todayReceiptsByMethodCents.pix)}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="text-slate-500 font-medium">Dinheiro em Espécie</span>
            <p className="mt-1 text-base font-bold text-slate-900 tabular-nums">
              {formatCents(metrics.todayReceiptsByMethodCents.dinheiro)}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="text-slate-500 font-medium">Cartão de Débito</span>
            <p className="mt-1 text-base font-bold text-slate-900 tabular-nums">
              {formatCents(metrics.todayReceiptsByMethodCents.debito)}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="text-slate-500 font-medium">Cartão de Crédito</span>
            <p className="mt-1 text-base font-bold text-slate-900 tabular-nums">
              {formatCents(metrics.todayReceiptsByMethodCents.credito)}
            </p>
          </div>
        </div>
      </div>

      {/* Modal Demonstrativo de Fechamento de Caixa */}
      {showClosingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">
              Conferência e Fechamento de Caixa (Prévia)
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Resumo da sessão atual do operador
            </p>

            <div className="mt-4 space-y-2 rounded-lg bg-slate-50 p-3 text-xs border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-600">Fundo de abertura (Exemplo):</span>
                <span className="font-semibold">{formatCents(initialFloatCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Receita total de hoje (Bar):</span>
                <span className="font-semibold text-emerald-900">+{formatCents(metrics.todayReceiptsCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Entradas físicas em dinheiro:</span>
                <span className="font-semibold text-slate-800">+{formatCents(metrics.todayReceiptsByMethodCents.dinheiro)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Total de sangrias (Exemplo):</span>
                <span className="font-semibold text-red-700">-{formatCents(withdrawalsCents)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 font-bold text-sm">
                <span>Dinheiro físico esperado na gaveta:</span>
                <span className="text-slate-900">{formatCents(cashInDrawerCents)}</span>
              </div>
            </div>

            <p className="mt-3 text-[11px] text-slate-500 leading-relaxed italic">
              * O fechamento com conferência cega e impressão de relatório diário será implementado na próxima etapa do sistema.
            </p>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowClosingModal(false)}
                className="h-10 rounded-lg bg-emerald-900 px-4 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                Fechar janela
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
