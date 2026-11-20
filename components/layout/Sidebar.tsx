'use client';

import React from 'react';
import { useComandas } from '@/context/ComandasContext';
import { ActiveModule } from '@/lib/types';
import {
  LayoutDashboard,
  Receipt,
  CalendarDays,
  GraduationCap,
  CreditCard,
  PartyPopper,
  Wallet,
  BarChart3,
  SlidersHorizontal,
} from 'lucide-react';

interface NavItem {
  id: ActiveModule;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export function Sidebar() {
  const {
    activeModule,
    setActiveModule,
    metrics,
    currentStaff,
    comandasLoaded,
    comandasSyncError,
  } = useComandas();
  const isAdmin = currentStaff?.role === 'admin';
  const openBadge = comandasLoaded && !comandasSyncError ? metrics.openCount : undefined;

  const navItems: NavItem[] = [
    { id: 'inicio', label: 'Início', icon: LayoutDashboard },
    { id: 'comandas', label: 'Comandas', icon: Receipt, badge: openBadge },
    { id: 'agenda', label: 'Agenda', icon: CalendarDays },
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

  return (
    <aside className="hidden h-[calc(100vh-4rem)] w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex flex-1 flex-col justify-between p-3.5">
        <nav className="space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveModule(item.id)}
                className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-900 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`h-4 w-4 shrink-0 transition-colors ${
                      isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-900'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>

                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums ${
                      isActive
                        ? 'bg-emerald-800 text-white'
                        : 'bg-emerald-100 text-emerald-900'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Informações da unidade */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <p className="font-semibold text-slate-800">Complexo Esportivo</p>
          <p className="mt-0.5 text-slate-500">3 Quadras de Areia + 1 Society</p>
        </div>
      </div>
    </aside>
  );
}
