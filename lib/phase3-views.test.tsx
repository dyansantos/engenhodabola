import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as mockData from './mock-data';
import { getUpcomingTodayAppointments } from './dashboard-helpers';
import { aggregateReceipts } from './reports/aggregate';
import { ReceiptLine } from './reports/receipts';
import { Appointment, Comanda, Product, StaffMember } from './types';

// Mock do contexto para testar as telas em todos os estados (carregando, erro, vazio, operador, admin)
const mockUseComandas = vi.fn();

vi.mock('@/context/ComandasContext', () => ({
  useComandas: () => mockUseComandas(),
}));

import { DashboardView } from '@/components/dashboard/DashboardView';
import { CaixaAdminContent, CaixaView } from '@/components/caixa/CaixaView';
import { MensalidadesView } from '@/components/mensalidades/MensalidadesView';
import { AlunosView } from '@/components/alunos/AlunosView';
import { EventosView } from '@/components/eventos/EventosView';
import { CadastrosView } from '@/components/cadastros/CadastrosView';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { AgendaView } from '@/components/agenda/AgendaView';

const ADMIN_STAFF: StaffMember = {
  uid: 'uid-admin-1',
  email: 'admin@engenhodabola.com',
  name: 'Cauê Admin',
  role: 'admin',
  active: true,
  createdAt: '2026-01-01T12:00:00.000Z',
};

const OPERATOR_STAFF: StaffMember = {
  uid: 'uid-op-1',
  email: 'operador@engenhodabola.com',
  name: 'Operador Balcão',
  role: 'operator',
  active: true,
  createdAt: '2026-01-01T12:00:00.000Z',
};

const SAMPLE_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: 'Água Mineral sem Gás 500ml',
    category: 'Bebidas',
    priceCents: 500,
    description: 'Gelada',
  },
];

function makeBaseContext(overrides: Record<string, unknown> = {}) {
  return {
    activeModule: 'inicio',
    setActiveModule: vi.fn(),
    comandas: [] as Comanda[],
    comandasLoaded: true,
    comandasSyncError: null as string | null,
    products: SAMPLE_PRODUCTS,
    productsLoaded: true,
    productsSyncError: null as string | null,
    selectedComandaId: null,
    setSelectedComandaId: vi.fn(),
    isNewComandaModalOpen: false,
    setIsNewComandaModalOpen: vi.fn(),
    filterStatus: 'abertas',
    setFilterStatus: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
    metrics: {
      openCount: 0,
      closedCount: 0,
      pendingBalanceCents: 0,
      todayReceiptsCents: 0,
      todayReceiptsByMethodCents: {
        pix: 0,
        dinheiro: 0,
        debito: 0,
        credito: 0,
      },
    },
    currentSaoPauloDay: '2026-11-19',
    groupRentals: [],
    groupRentalsLoaded: true,
    groupRentalsSyncError: null as string | null,
    selectedGroupRentalId: null,
    setSelectedGroupRentalId: vi.fn(),
    isNewGroupRentalModalOpen: false,
    setIsNewGroupRentalModalOpen: vi.fn(),
    appointments: [] as Appointment[],
    appointmentsLoaded: true,
    appointmentsSyncError: null as string | null,
    selectedAppointmentId: null,
    setSelectedAppointmentId: vi.fn(),
    isNewAppointmentModalOpen: false,
    setIsNewAppointmentModalOpen: vi.fn(),
    agendaSelectedDate: '2026-11-19',
    setAgendaSelectedDate: vi.fn(),
    agendaSelectedSpace: 'todos',
    setAgendaSelectedSpace: vi.fn(),
    agendaFilterModality: 'todas',
    setAgendaFilterModality: vi.fn(),
    agendaFilterType: 'todos',
    setAgendaFilterType: vi.fn(),
    operatingHours: {
      configured: true,
      openTime: '07:00',
      closeTime: '23:00',
      slotIntervalMinutes: 60,
    },
    operatingHoursSyncError: null as string | null,
    isOperatingHoursModalOpen: false,
    setIsOperatingHoursModalOpen: vi.fn(),
    openNewAppointmentWithSlot: vi.fn(),
    currentStaff: ADMIN_STAFF,
    staffList: [ADMIN_STAFF, OPERATOR_STAFF],
    staffLoaded: true,
    staffSyncError: null as string | null,
    refreshStaffList: vi.fn(),
    addNewStaff: vi.fn(),
    toggleStaff: vi.fn(),
    changeRole: vi.fn(),
    ...overrides,
  };
}

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'apt-real-1',
    title: 'Treino Real Beach Tennis',
    type: 'locacao_avulsa',
    modality: 'beach_tennis',
    space: 'Areia 1',
    date: '2026-11-19',
    startTime: '19:00',
    endTime: '20:30',
    hostName: 'Lucas Responsável',
    status: 'confirmada',
    createdAt: '2026-11-19T10:00:00.000Z',
    createdByUid: 'uid-admin-1',
    createdByName: 'Cauê Admin',
    ...overrides,
  };
}

describe('Fase 3 (Etapa 3.1) — Remoção de dados fictícios e estados honestos', () => {
  beforeEach(() => {
    mockUseComandas.mockReset();
  });

  it('lib/mock-data.ts mantém apenas INITIAL_PRODUCTS para inicialização de produtos', () => {
    expect(Object.keys(mockData)).toEqual(['INITIAL_PRODUCTS']);
    expect(mockData.INITIAL_PRODUCTS.length).toBeGreaterThan(0);
    for (const p of mockData.INITIAL_PRODUCTS) {
      expect(Number.isInteger(p.priceCents)).toBe(true);
      expect(p.priceCents).toBeGreaterThan(0);
    }
  });

  it('getUpcomingTodayAppointments filtra apenas compromissos de hoje ainda não encerrados e ordena por horário', () => {
    // 14:30 em America/Sao_Paulo = 17:30 UTC
    const now = new Date('2026-11-19T17:30:00.000Z');
    const appointments: Appointment[] = [
      makeAppointment({ id: 'past', title: 'Já terminou', startTime: '10:00', endTime: '11:00' }),
      makeAppointment({ id: 'canceled', title: 'Cancelado', startTime: '18:00', endTime: '19:00', status: 'cancelada' }),
      makeAppointment({ id: 'done', title: 'Concluído', startTime: '18:00', endTime: '19:00', status: 'concluida' }),
      makeAppointment({ id: 'other-day', title: 'Amanhã', date: '2026-11-20', startTime: '08:00', endTime: '09:00' }),
      makeAppointment({ id: 'late', title: 'Society 21h', startTime: '21:00', endTime: '22:00', space: 'Society' }),
      makeAppointment({ id: 'ongoing', title: 'Em andamento', startTime: '14:00', endTime: '15:00', status: 'em_andamento' }),
      makeAppointment({ id: 'next', title: 'Areia 18h', startTime: '18:00', endTime: '19:00' }),
    ];

    const result = getUpcomingTodayAppointments(appointments, '2026-11-19', now);
    expect(result.map(a => a.id)).toEqual(['ongoing', 'next', 'late']);
  });

  describe('DashboardView (Início)', () => {
    it('exibe agenda real de hoje e rótulo correto de recebimentos, sem dados fictícios', () => {
      const todayKey = '2026-11-19';
      mockUseComandas.mockReturnValue(
        makeBaseContext({
          currentSaoPauloDay: todayKey,
          appointments: [
            makeAppointment({
              id: 'apt-1',
              title: 'Pelada Real da Quarta',
              space: 'Society',
              date: todayKey,
              startTime: '23:00',
              endTime: '23:59',
              hostName: 'Marcos Real',
            }),
          ],
          metrics: {
            openCount: 2,
            closedCount: 1,
            pendingBalanceCents: 4500,
            todayReceiptsCents: 12000,
            todayReceiptsByMethodCents: {
              pix: 7000,
              dinheiro: 5000,
              debito: 0,
              credito: 0,
            },
          },
        })
      );

      const html = renderToStaticMarkup(<DashboardView />);
      expect(html).toContain('Recebido hoje: comandas e locações');
      expect(html).toContain('Pelada Real da Quarta');
      expect(html).toContain('Marcos Real');
      expect(html).not.toContain('Exemplos');
      expect(html).not.toContain('Prof. Thiago Nogueira');
      expect(html).not.toContain('Escolinha de Futebol Sub-13');
      expect(html).not.toContain('Carla &amp; Amigas');
    });

    it('exibe estado vazio limpo quando não há agendamentos para hoje', () => {
      mockUseComandas.mockReturnValue(
        makeBaseContext({
          appointments: [],
          appointmentsLoaded: true,
        })
      );

      const html = renderToStaticMarkup(<DashboardView />);
      expect(html).toContain('Nenhum agendamento pendente para hoje.');
      expect(html).not.toContain('Prof. Thiago Nogueira');
    });

    it('NÃO exibe 0, R$ 0,00 ou "Não há comandas abertas" enquanto carrega', () => {
      mockUseComandas.mockReturnValue(
        makeBaseContext({
          comandasLoaded: false,
          groupRentalsLoaded: false,
          appointmentsLoaded: false,
        })
      );

      const html = renderToStaticMarkup(<DashboardView />);
      expect(html).toContain('Carregando…');
      expect(html).not.toContain('R$&nbsp;0,00');
      expect(html).not.toContain('R$ 0,00');
      expect(html).not.toContain('Não há comandas abertas no momento.');
      expect(html).not.toContain('Ver todas (0)');
      expect(html).not.toContain('Nenhum agendamento pendente para hoje.');
    });

    it('NÃO exibe 0, R$ 0,00 ou estado vazio em caso de erro de sincronização', () => {
      mockUseComandas.mockReturnValue(
        makeBaseContext({
          comandasLoaded: false,
          comandasSyncError: 'Permissão negada no Firestore (comandas)',
          groupRentalsLoaded: false,
          groupRentalsSyncError: 'Falha de rede (locações)',
          appointmentsLoaded: false,
          appointmentsSyncError: 'Falha ao ler agenda',
        })
      );

      const html = renderToStaticMarkup(<DashboardView />);
      expect(html).toContain('Permissão negada no Firestore (comandas)');
      expect(html).toContain('Falha ao ler agenda');
      expect(html).not.toContain('R$&nbsp;0,00');
      expect(html).not.toContain('R$ 0,00');
      expect(html).not.toContain('Não há comandas abertas no momento.');
      expect(html).not.toContain('Nenhum agendamento pendente para hoje.');
    });
  });

  describe('CaixaView e Controle de Acesso (somente admin)', () => {
    it('bloqueia acesso do perfil operador ao Caixa', () => {
      mockUseComandas.mockReturnValue(
        makeBaseContext({
          currentStaff: OPERATOR_STAFF,
        })
      );

      const html = renderToStaticMarkup(<CaixaView />);
      expect(html).toContain('Acesso Restrito ao Administrador');
      expect(html).not.toContain('Recebido hoje em dinheiro');
      expect(html).not.toContain('350,00');
      expect(html).not.toContain('80,00');
    });

    it('NÃO exibe R$ 0,00 enquanto carrega os recebimentos do dia', () => {
      const html = renderToStaticMarkup(
        <CaixaAdminContent
          todayDateKey="2026-11-19"
          isLoading={true}
          error={null}
          summary={null}
          issues={[]}
          onRetry={() => {}}
        />
      );
      expect(html).toContain('Carregando…');
      expect(html).toContain('Fechamento de caixa: ainda não integrado');
      expect(html).not.toContain('R$&nbsp;0,00');
      expect(html).not.toContain('R$ 0,00');
    });

    it('exibe erro real e NÃO exibe R$ 0,00 quando consulta de receipts falha', () => {
      const html = renderToStaticMarkup(
        <CaixaAdminContent
          todayDateKey="2026-11-19"
          isLoading={false}
          error="Índice ou permissão ausente em receipts"
          summary={null}
          issues={[]}
          onRetry={() => {}}
        />
      );
      expect(html).toContain('Erro ao consultar os recebimentos do dia');
      expect(html).toContain('Índice ou permissão ausente em receipts');
      expect(html).not.toContain('R$&nbsp;0,00');
      expect(html).not.toContain('R$ 0,00');
    });

    it('exibe somente valores reais de receipts, aviso de fechamento não integrado e ZERO fundo/sangria inventados', () => {
      const lines: ReceiptLine[] = [
        {
          id: 'rcpt-1',
          origin: 'comanda',
          refId: 'cmd-1',
          refNumber: 10,
          refLabel: 'Comanda #10',
          amountCents: 5000,
          method: 'dinheiro',
          paidAtIso: '2026-11-19T18:00:00.000Z',
          dateKey: '2026-11-19',
          operatorName: 'Cauê Admin',
          operatorUid: 'uid-admin-1',
        },
        {
          id: 'rcpt-2',
          origin: 'locacao',
          refId: 'grp-1',
          refNumber: 1,
          refLabel: 'Society 20h',
          amountCents: 3000,
          method: 'pix',
          paidAtIso: '2026-11-19T19:00:00.000Z',
          dateKey: '2026-11-19',
          operatorName: 'Cauê Admin',
          operatorUid: 'uid-admin-1',
        },
      ];
      const summary = aggregateReceipts(lines, '2026-11-19', '2026-11-19');

      const html = renderToStaticMarkup(
        <CaixaAdminContent
          todayDateKey="2026-11-19"
          isLoading={false}
          error={null}
          summary={summary}
          issues={[]}
          onRetry={() => {}}
        />
      );

      expect(html).toContain('Fechamento de caixa: ainda não integrado');
      expect(html).toContain('Recebido hoje em dinheiro (comandas e locações)');
      expect(html).toContain('Recebido hoje: comandas e locações');
      expect(html).toContain('50,00');
      expect(html).toContain('30,00');
      expect(html).toContain('80,00'); // total real 50 + 30 (não sangria!)

      // Nenhum vestígio de dados fictícios ou simulação
      expect(html).not.toContain('350,00');
      expect(html).not.toContain('Fundo de Troco');
      expect(html).not.toContain('Compra de gelo');
      expect(html).not.toContain('Dinheiro Físico na Gaveta');
      expect(html).not.toContain('Simulação');
      expect(html).not.toContain('Prévia Demonstrativa');
      expect(html).not.toContain('Operador de demonstração');
    });
  });

  describe('Navegação (Sidebar e MobileNav)', () => {
    it('oculta Caixa e Relatórios para operador e remove texto demonstrativo na Sidebar', () => {
      mockUseComandas.mockReturnValue(
        makeBaseContext({
          currentStaff: OPERATOR_STAFF,
        })
      );

      const sidebarHtml = renderToStaticMarkup(<Sidebar />);
      expect(sidebarHtml).not.toContain('Caixa');
      expect(sidebarHtml).not.toContain('Relatórios');
      expect(sidebarHtml).not.toContain('Versão 1.0 demonstrativa');

      const mobileHtml = renderToStaticMarkup(<MobileNav initialMoreOpen={true} />);
      expect(mobileHtml).not.toContain('Caixa');
      expect(mobileHtml).not.toContain('Relatórios');
    });

    it('exibe Caixa e Relatórios para administrador na Sidebar e MobileNav', () => {
      mockUseComandas.mockReturnValue(
        makeBaseContext({
          currentStaff: ADMIN_STAFF,
        })
      );

      const sidebarHtml = renderToStaticMarkup(<Sidebar />);
      expect(sidebarHtml).toContain('Caixa');
      expect(sidebarHtml).toContain('Relatórios');
      expect(sidebarHtml).not.toContain('Versão 1.0 demonstrativa');

      const mobileHtml = renderToStaticMarkup(<MobileNav initialMoreOpen={true} />);
      expect(mobileHtml).toContain('Caixa');
      expect(mobileHtml).toContain('Relatórios');
    });
  });

  describe('Telas sem integração (Mensalidades, Alunos, Eventos e abas de Cadastros)', () => {
    it('MensalidadesView mostra "Ainda não integrado" sem nomes nem valores inventados', () => {
      const html = renderToStaticMarkup(<MensalidadesView />);
      expect(html).toContain('Ainda não integrado');
      expect(html).not.toContain('Gabriel Pimentel');
      expect(html).not.toContain('Beatriz Vasconcelos');
      expect(html).not.toContain('260,00');
      expect(html).not.toContain('1.100,00');
    });

    it('AlunosView mostra "Ainda não integrado" sem turmas nem professores inventados', () => {
      const html = renderToStaticMarkup(<AlunosView />);
      expect(html).toContain('Ainda não integrado');
      expect(html).not.toContain('Prof. Thiago Nogueira');
      expect(html).not.toContain('Prof. Marcelo Bahia');
      expect(html).not.toContain('Prof. Renato Matos');
      expect(html).not.toContain('260,00');
    });

    it('EventosView mostra "Ainda não integrado" sem eventos nem valores inventados', () => {
      const html = renderToStaticMarkup(<EventosView />);
      expect(html).toContain('Ainda não integrado');
      expect(html).not.toContain('Aniversário de 10 Anos do Theo');
      expect(html).not.toContain('TechSolutions');
      expect(html).not.toContain('1.800,00');
      expect(html).not.toContain('4.500,00');
      expect(html).not.toContain('3.200,00');
    });

    it('CadastrosView remove Clientes & Mensalistas, preços fixos de espaços e professores inventados, e exibe erros de produtos/equipe', () => {
      mockUseComandas.mockReturnValue(makeBaseContext());

      const htmlEspacos = renderToStaticMarkup(<CadastrosView initialTab="espacos" />);
      expect(htmlEspacos).not.toContain('Demonstração da Estrutura');
      expect(htmlEspacos).not.toContain('Clientes &amp; Mensalistas');
      expect(htmlEspacos).toContain('Ainda não integrada');
      expect(htmlEspacos).not.toContain('140,00');
      expect(htmlEspacos).not.toContain('130,00');
      expect(htmlEspacos).not.toContain('260,00');

      const htmlProf = renderToStaticMarkup(<CadastrosView initialTab="professores" />);
      expect(htmlProf).toContain('Ainda não integrado');
      expect(htmlProf).not.toContain('Prof. Thiago Nogueira');
      expect(htmlProf).not.toContain('Prof. Marcelo Bahia');
      expect(htmlProf).not.toContain('Prof. Renato Matos');
      expect(htmlProf).not.toContain('Professores (3)');

      // Erros de sincronização em produtos e equipe aparecem explicitamente na interface
      mockUseComandas.mockReturnValue(
        makeBaseContext({
          products: [],
          productsLoaded: false,
          productsSyncError: 'Falha ao inicializar produtos no Firestore',
          staffList: [],
          staffLoaded: false,
          staffSyncError: 'Falha ao consultar coleção staff',
        })
      );

      const htmlProdErr = renderToStaticMarkup(<CadastrosView initialTab="produtos" />);
      expect(htmlProdErr).toContain('Erro ao sincronizar produtos do bar');
      expect(htmlProdErr).toContain('Falha ao inicializar produtos no Firestore');
      expect(htmlProdErr).not.toContain('Produtos do Bar (0)');

      const htmlStaffErr = renderToStaticMarkup(<CadastrosView initialTab="usuarios" />);
      expect(htmlStaffErr).toContain('Erro ao carregar equipe');
      expect(htmlStaffErr).toContain('Falha ao consultar coleção staff');
    });

    it('AgendaView exibe erro de horário de funcionamento em vez de mostrar falsamente "não configurado"', () => {
      mockUseComandas.mockReturnValue(
        makeBaseContext({
          operatingHours: null,
          operatingHoursSyncError: 'Sem permissão para ler configurações da agenda',
        })
      );

      const html = renderToStaticMarkup(<AgendaView />);
      expect(html).toContain('Erro ao sincronizar horário de funcionamento');
      expect(html).toContain('Sem permissão para ler configurações da agenda');
      expect(html).not.toContain('Horário de funcionamento não configurado');
    });
  });
});
