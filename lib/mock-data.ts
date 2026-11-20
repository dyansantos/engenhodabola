import { Product, Comanda } from './types';

export interface AppointmentExample {
  id: string;
  court: string;
  title: string;
  type: string;
  time: string;
  instructorOrHost: string;
  participantsCount: number;
  status: string;
}

// Helper para gerar timestamps relativos seguros no fuso de São Paulo
function getIsoDates() {
  const now = new Date();
  const todayIso = now.toISOString();

  // Ontem (24 horas atrás)
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayIso = yesterday.toISOString();

  return { todayIso, yesterdayIso };
}

const { todayIso, yesterdayIso } = getIsoDates();

export const INITIAL_PRODUCTS: Product[] = [
  // Bebidas
  { id: 'prod-1', name: 'Cerveja Heineken 600ml', category: 'Bebidas', priceCents: 1800, price: 18.0, description: 'Garrafa retornável 600ml estupidamente gelada' },
  { id: 'prod-2', name: 'Cerveja Corona Long Neck 330ml', category: 'Bebidas', priceCents: 1400, price: 14.0, description: 'Com fatia de limão' },
  { id: 'prod-3', name: 'Chopp Artesanal Pilsen 500ml', category: 'Bebidas', priceCents: 1600, price: 16.0, description: 'Caneca congelada' },
  { id: 'prod-4', name: 'Refrigerante Lata 350ml', category: 'Bebidas', priceCents: 700, price: 7.0, description: 'Coca-Cola, Guaraná, Zero' },
  { id: 'prod-5', name: 'Água Mineral c/ ou s/ gás 500ml', category: 'Bebidas', priceCents: 600, price: 6.0, description: 'Garrafa 500ml' },
  { id: 'prod-6', name: 'Água de Coco Natural 300ml', category: 'Bebidas', priceCents: 850, price: 8.5, description: 'Copo gelado' },
  { id: 'prod-7', name: 'Isotônico Gatorade 500ml', category: 'Bebidas', priceCents: 1000, price: 10.0, description: 'Limão, Uva ou Laranja' },
  { id: 'prod-8', name: 'Suco Natural da Fruta 400ml', category: 'Bebidas', priceCents: 1100, price: 11.0, description: 'Laranja, Limão ou Maracujá' },
  { id: 'prod-9', name: 'Energético Red Bull 250ml', category: 'Bebidas', priceCents: 1500, price: 15.0, description: 'Tradicional ou Tropical' },

  // Porções & Petiscos
  { id: 'prod-10', name: 'Batata Frita Especial c/ Cheddar e Bacon', category: 'Porções & Petiscos', priceCents: 3800, price: 38.0, description: 'Porção generosa para compartilhar' },
  { id: 'prod-11', name: 'Isca de Frango Empanada Crocante', category: 'Porções & Petiscos', priceCents: 4400, price: 44.0, description: 'Acompanha molho de mostarda e mel e tártaro' },
  { id: 'prod-12', name: 'Calabresa Fatiada Acebolada', category: 'Porções & Petiscos', priceCents: 4200, price: 42.0, description: 'Acompanha cesto de pão francês e farofa' },
  { id: 'prod-13', name: 'Dadinho de Tapioca c/ Geléia de Pimenta', category: 'Porções & Petiscos', priceCents: 3600, price: 36.0, description: '12 unidades artesanais com queijo coalho' },
  { id: 'prod-14', name: 'Tiras de Filé Mignon c/ Mandioca Frita', category: 'Porções & Petiscos', priceCents: 6800, price: 68.0, description: 'Na chapa com manteiga de garrafa' },
  { id: 'prod-15', name: 'Pastéis Mistos (6 unidades)', category: 'Porções & Petiscos', priceCents: 3200, price: 32.0, description: 'Queijo, carne e palmito' },

  // Lanches
  { id: 'prod-16', name: 'Hambúrguer Engenho Especial', category: 'Lanches', priceCents: 3400, price: 34.0, description: 'Blend 180g, queijo prato, bacon crocante, alface, tomate e maionese verde' },
  { id: 'prod-17', name: 'Sanduíche de Frango Grelhado Light', category: 'Lanches', priceCents: 2800, price: 28.0, description: 'Filé grelhado, queijo branco, rúcula e pasta de ricota' },
  { id: 'prod-18', name: 'Misto Quente Especial na Baguete', category: 'Lanches', priceCents: 1900, price: 19.0, description: 'Queijo duplo, presunto e manteiga na chapa' },

  // Espetos
  { id: 'prod-19', name: 'Espeto de Alcatra', category: 'Espetos', priceCents: 1400, price: 14.0, description: 'Acompanha vinagrete e farofa' },
  { id: 'prod-20', name: 'Espeto de Frango c/ Bacon', category: 'Espetos', priceCents: 1300, price: 13.0, description: 'Acompanha vinagrete e farofa' },
  { id: 'prod-21', name: 'Espeto de Queijo Coalho c/ Melaço', category: 'Espetos', priceCents: 1300, price: 13.0, description: 'Tostado na brasa com melaço de cana' },
  { id: 'prod-22', name: 'Espeto de Kafta Temperada', category: 'Espetos', priceCents: 1300, price: 13.0, description: 'Acompanha vinagrete e molho de hortelã' },

  // Sobremesas & Outros
  { id: 'prod-23', name: 'Açaí na Tigela 400ml Especial', category: 'Sobremesas & Outros', priceCents: 2200, price: 22.0, description: 'Acompanha banana fatiada, leite em pó e granola' },
  { id: 'prod-24', name: 'Pudim de Leite Condensado Artesanal', category: 'Sobremesas & Outros', priceCents: 1200, price: 12.0, description: 'Fatia com calda de caramelo' },
  { id: 'prod-25', name: 'Picolé Frutas da Época', category: 'Sobremesas & Outros', priceCents: 800, price: 8.0, description: 'Sabores variados' },
  { id: 'prod-26', name: 'Bala ou Chiclete Avulso', category: 'Sobremesas & Outros', priceCents: 10, price: 0.1, description: 'Unidade' },
];

export const INITIAL_COMANDAS: Comanda[] = [
  {
    id: 'cmd-101',
    number: 101,
    type: 'mesa',
    name: 'Turma do Beach Tennis',
    table: 'Mesa 02',
    responsible: 'Renato Silva',
    status: 'aberta',
    openedAt: todayIso,
    items: [
      {
        id: 'item-101-1',
        productId: 'prod-1',
        name: 'Cerveja Heineken 600ml',
        category: 'Bebidas',
        priceCents: 1800,
        price: 18.0,
        quantity: 3,
        notes: 'Copos gelados',
        addedAt: todayIso,
      },
      {
        id: 'item-101-2',
        productId: 'prod-10',
        name: 'Batata Frita Especial c/ Cheddar e Bacon',
        category: 'Porções & Petiscos',
        priceCents: 3800,
        price: 38.0,
        quantity: 1,
        addedAt: todayIso,
      },
      {
        id: 'item-101-3',
        productId: 'prod-5',
        name: 'Água Mineral c/ ou s/ gás 500ml',
        category: 'Bebidas',
        priceCents: 600,
        price: 6.0,
        quantity: 2,
        notes: '1 com gás, 1 sem gás',
        addedAt: todayIso,
      },
      {
        id: 'item-101-4',
        productId: 'prod-12',
        name: 'Calabresa Fatiada Acebolada',
        category: 'Porções & Petiscos',
        priceCents: 4200,
        price: 42.0,
        quantity: 1,
        addedAt: todayIso,
      },
    ],
    payments: [
      {
        id: 'pay-101-1',
        method: 'pix',
        amountCents: 5000,
        amount: 50.0,
        timestamp: todayIso,
        operator: 'Operador de demonstração',
      },
    ],
    history: [
      {
        id: 'hist-101-1',
        timestamp: todayIso,
        operator: 'Operador de demonstração',
        type: 'abertura',
        description: 'Comanda de mesa #101 aberta para Mesa 02 (Responsável: Renato Silva).',
      },
      {
        id: 'hist-101-2',
        timestamp: todayIso,
        operator: 'Operador de demonstração',
        type: 'item_adicionado',
        description: 'Lançado 3x Cerveja Heineken 600ml (R$ 54,00).',
        details: 'Obs: Copos gelados',
      },
      {
        id: 'hist-101-3',
        timestamp: todayIso,
        operator: 'Operador de demonstração',
        type: 'pagamento',
        description: 'Pagamento parcial registrado de R$ 50,00 via Pix.',
        details: 'Saldo restante após pagamento: R$ 96,00',
      },
    ],
  },
  {
    id: 'cmd-102',
    number: 102,
    type: 'individual',
    name: 'Lucas Silveira',
    table: 'Mesa 02',
    status: 'aberta',
    openedAt: todayIso,
    items: [
      {
        id: 'item-102-1',
        productId: 'prod-7',
        name: 'Isotônico Gatorade 500ml',
        category: 'Bebidas',
        priceCents: 1000,
        price: 10.0,
        quantity: 1,
        addedAt: todayIso,
      },
      {
        id: 'item-102-2',
        productId: 'prod-17',
        name: 'Sanduíche de Frango Grelhado Light',
        category: 'Lanches',
        priceCents: 2800,
        price: 28.0,
        quantity: 1,
        notes: 'Sem cebola',
        addedAt: todayIso,
      },
    ],
    payments: [],
    history: [
      {
        id: 'hist-102-1',
        timestamp: todayIso,
        operator: 'Operador de demonstração',
        type: 'abertura',
        description: 'Comanda individual #102 aberta para Lucas Silveira (vinculada à Mesa 02).',
      },
    ],
  },
  {
    id: 'cmd-103',
    number: 103,
    type: 'mesa',
    name: 'Pelada Society — Quarta Show',
    table: 'Mesa 06',
    responsible: 'Rogério Cruz',
    status: 'aberta',
    openedAt: todayIso,
    items: [
      {
        id: 'item-103-1',
        productId: 'prod-1',
        name: 'Cerveja Heineken 600ml',
        category: 'Bebidas',
        priceCents: 1800,
        price: 18.0,
        quantity: 6,
        addedAt: todayIso,
      },
      {
        id: 'item-103-2',
        productId: 'prod-14',
        name: 'Tiras de Filé Mignon c/ Mandioca Frita',
        category: 'Porções & Petiscos',
        priceCents: 6800,
        price: 68.0,
        quantity: 1,
        addedAt: todayIso,
      },
      {
        id: 'item-103-3',
        productId: 'prod-21',
        name: 'Espeto de Queijo Coalho c/ Melaço',
        category: 'Espetos',
        priceCents: 1300,
        price: 13.0,
        quantity: 4,
        addedAt: todayIso,
      },
    ],
    payments: [],
    history: [
      {
        id: 'hist-103-1',
        timestamp: todayIso,
        operator: 'Operador de demonstração',
        type: 'abertura',
        description: 'Comanda de mesa #103 aberta para Mesa 06 (Responsável: Rogério Cruz).',
      },
    ],
  },
  {
    id: 'cmd-104',
    number: 104,
    type: 'individual',
    name: 'Mariana Costa',
    status: 'aberta',
    openedAt: todayIso,
    items: [
      {
        id: 'item-104-1',
        productId: 'prod-23',
        name: 'Açaí na Tigela 400ml Especial',
        category: 'Sobremesas & Outros',
        priceCents: 2200,
        price: 22.0,
        quantity: 1,
        notes: 'Sem granola, dobro de banana',
        addedAt: todayIso,
      },
      {
        id: 'item-104-2',
        productId: 'prod-5',
        name: 'Água Mineral c/ ou s/ gás 500ml',
        category: 'Bebidas',
        priceCents: 600,
        price: 6.0,
        quantity: 1,
        addedAt: todayIso,
      },
    ],
    payments: [],
    history: [
      {
        id: 'hist-104-1',
        timestamp: todayIso,
        operator: 'Operador de demonstração',
        type: 'abertura',
        description: 'Comanda individual #104 aberta para Mariana Costa (sem mesa).',
      },
    ],
  },
  // Comanda #105: Fechada e paga ONTEM (para comprovar que pagamento de ontem não entra nos recebimentos de hoje)
  {
    id: 'cmd-105',
    number: 105,
    type: 'mesa',
    name: 'Carlos Henrique (Ontem)',
    table: 'Mesa 01',
    responsible: 'Carlos Henrique',
    status: 'encerrada',
    openedAt: yesterdayIso,
    closedAt: yesterdayIso,
    items: [
      {
        id: 'item-105-1',
        productId: 'prod-3',
        name: 'Chopp Artesanal Pilsen 500ml',
        category: 'Bebidas',
        priceCents: 1600,
        price: 16.0,
        quantity: 3,
        addedAt: yesterdayIso,
      },
      {
        id: 'item-105-2',
        productId: 'prod-11',
        name: 'Isca de Frango Empanada Crocante',
        category: 'Porções & Petiscos',
        priceCents: 4400,
        price: 44.0,
        quantity: 1,
        addedAt: yesterdayIso,
      },
    ],
    payments: [
      {
        id: 'pay-105-1',
        method: 'debito',
        amountCents: 9200,
        amount: 92.0,
        timestamp: yesterdayIso,
        operator: 'Operador de demonstração',
      },
    ],
    history: [
      {
        id: 'hist-105-1',
        timestamp: yesterdayIso,
        operator: 'Operador de demonstração',
        type: 'abertura',
        description: 'Comanda de mesa #105 aberta ontem para Mesa 01.',
      },
      {
        id: 'hist-105-2',
        timestamp: yesterdayIso,
        operator: 'Operador de demonstração',
        type: 'pagamento',
        description: 'Pagamento total de R$ 92,00 registrado ontem via Débito.',
      },
      {
        id: 'hist-105-3',
        timestamp: yesterdayIso,
        operator: 'Operador de demonstração',
        type: 'encerramento',
        description: 'Comanda quitada e encerrada ontem.',
      },
    ],
  },
  // Comanda #106: Aberta ONTEM e ainda pendente (para comprovar que comanda antiga aberta continua no saldo pendente)
  {
    id: 'cmd-106',
    number: 106,
    type: 'individual',
    name: 'Diogo Alcantara (Aberta Ontem)',
    table: 'Mesa 05',
    status: 'aberta',
    openedAt: yesterdayIso,
    items: [
      {
        id: 'item-106-1',
        productId: 'prod-1',
        name: 'Cerveja Heineken 600ml',
        category: 'Bebidas',
        priceCents: 1800,
        price: 18.0,
        quantity: 2,
        addedAt: yesterdayIso,
      },
    ],
    payments: [],
    history: [
      {
        id: 'hist-106-1',
        timestamp: yesterdayIso,
        operator: 'Operador de demonstração',
        type: 'abertura',
        description: 'Comanda individual #106 aberta ontem para Diogo Alcantara.',
      },
    ],
  },
];

export const INITIAL_APPOINTMENTS: AppointmentExample[] = [
  {
    id: 'apt-1',
    court: 'Quadra 1 (Beach Tennis)',
    title: 'Aula Beach Tennis - Intermediário',
    type: 'aula',
    time: '18:00 - 19:30',
    instructorOrHost: 'Prof. Thiago Nogueira',
    participantsCount: 8,
    status: 'em_andamento',
  },
  {
    id: 'apt-2',
    court: 'Quadra 2 (Futevôlei)',
    title: 'Treino Futevôlei - Adulto Noturno',
    type: 'aula',
    time: '18:30 - 20:00',
    instructorOrHost: 'Prof. Marcelo Bahia',
    participantsCount: 6,
    status: 'em_andamento',
  },
  {
    id: 'apt-3',
    court: 'Campo Society',
    title: 'Escolinha de Futebol Sub-13',
    type: 'aula',
    time: '17:30 - 19:00',
    instructorOrHost: 'Prof. Renato Matos',
    participantsCount: 16,
    status: 'em_andamento',
  },
  {
    id: 'apt-4',
    court: 'Campo Society',
    title: 'Mensalista: Grupo Pelada Quarta Show',
    type: 'mensalista',
    time: '19:15 - 20:45',
    instructorOrHost: 'Resp. Rogério Cruz',
    participantsCount: 14,
    status: 'confirmado',
  },
  {
    id: 'apt-5',
    court: 'Quadra 3 (Mista Areia)',
    title: 'Locação Avulsa Beach Tennis',
    type: 'locacao_avulsa',
    time: '19:00 - 20:30',
    instructorOrHost: 'Cliente: Carla & Amigas',
    participantsCount: 4,
    status: 'confirmado',
  },
  {
    id: 'apt-6',
    court: 'Quadra 1 (Beach Tennis)',
    title: 'Locação Noturna Avulsa',
    type: 'locacao_avulsa',
    time: '20:00 - 21:30',
    instructorOrHost: 'Cliente: Fabrício Lima',
    participantsCount: 4,
    status: 'agendado',
  },
];
