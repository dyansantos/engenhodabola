'use client';

import React, { useState } from 'react';
import { useComandas } from '@/context/ComandasContext';
import { ActiveModule } from '@/lib/types';
import {
  LayoutDashboard,
  Receipt,
  CalendarDays,
  Menu,
  X,
  GraduationCap,
  CreditCard,
  PartyPopper,
  Wallet,
  BarChart3,
  SlidersHorizontal,
} from 'lucide-react';

export function MobileNav({ initialMoreOpen = false }: { initialMoreOpen?: boolean } = {}) {
  const {
    activeModule,
    setActiveModule,
    metrics,
    currentStaff,
    comandasLoaded,
    comandasSyncError,
  } = useComandas();
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(initialMoreOpen);
  const isAdmin = currentStaff?.role === 'admin';
  const showOpenBadge = comandasLoaded && !comandasSyncError && metrics.openCount > 0;

  const moreItems: { id: ActiveModule; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'alunos', label: 'Alunos e turmas', icon: GraduationCap },
    { id: 'mensalidades', label: 'Mensalidades', icon: CreditCard },
    { id: 'eventos', label: 'Eventos', icon: PartyPopper },
    ...(isAdmin
      ? [
          { id: 'caixa' as ActiveModule, label: 'Caixa', icon: Wallet },
          { id: 'relatorios' as ActiveModule, label: 'Relatórios', icon: BarChart3 },
        ]
      : []),
    { id: 'cadastros', label: 'Cadastros', icon: SlidersHorizontal },
  ];

  const handleSelectModule = (id: ActiveModule) => {
    setActiveModule(id);
    setIsMoreMenuOpen(false);
  };

  const isMoreActive = moreItems.some(item => item.id === activeModule);

  return (
    <>
      {/* Modal/Drawer de "Mais" */}
      {isMoreMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMoreMenuOpen(false)}
          />

          <div className="fixed inset-x-0 bottom-16 z-50 rounded-t-2xl border-t border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-800">Mais Módulos</span>
              <button
                type="button"
                onClick={() => setIsMoreMenuOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {moreItems.map(item => {
                const Icon = item.icon;
                const isActive = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectModule(item.id)}
                    className={`flex h-12 items-center gap-2.5 rounded-lg border px-3 text-left text-xs font-medium transition-colors ${
                      isActive
                        ? 'border-emerald-900 bg-emerald-900 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-600'}`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Barra de Navegação Inferior Fixa */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-slate-200 bg-white px-2 lg:hidden">
        <button
          type="button"
          onClick={() => handleSelectModule('inicio')}
          className={`flex flex-1 flex-col items-center justify-center py-1 text-xs font-medium transition-colors ${
            activeModule === 'inicio' ? 'text-emerald-900 font-semibold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <LayoutDashboard className={`h-5 w-5 ${activeModule === 'inicio' ? 'text-emerald-900' : 'text-slate-500'}`} />
          <span className="mt-1">Início</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectModule('comandas')}
          className={`relative flex flex-1 flex-col items-center justify-center py-1 text-xs font-medium transition-colors ${
            activeModule === 'comandas' ? 'text-emerald-900 font-semibold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <div className="relative">
            <Receipt className={`h-5 w-5 ${activeModule === 'comandas' ? 'text-emerald-900' : 'text-slate-500'}`} />
            {showOpenBadge && (
              <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-900 px-1 text-[10px] font-bold text-white">
                {metrics.openCount}
              </span>
            )}
          </div>
          <span className="mt-1">Comandas</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectModule('agenda')}
          className={`flex flex-1 flex-col items-center justify-center py-1 text-xs font-medium transition-colors ${
            activeModule === 'agenda' ? 'text-emerald-900 font-semibold' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <CalendarDays className={`h-5 w-5 ${activeModule === 'agenda' ? 'text-emerald-900' : 'text-slate-500'}`} />
          <span className="mt-1">Agenda</span>
        </button>

        <button
          type="button"
          onClick={() => setIsMoreMenuOpen(prev => !prev)}
          className={`flex flex-1 flex-col items-center justify-center py-1 text-xs font-medium transition-colors ${
            isMoreActive || isMoreMenuOpen
              ? 'text-emerald-900 font-semibold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Menu
            className={`h-5 w-5 ${
              isMoreActive || isMoreMenuOpen ? 'text-emerald-900' : 'text-slate-500'
            }`}
          />
          <span className="mt-1">Mais</span>
        </button>
      </nav>
    </>
  );
}
