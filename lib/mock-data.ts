import { Product } from './types';

/**
 * Catálogo base inicial de produtos utilizado apenas quando a coleção `products`
 * está vazia no primeiro provisionamento do administrador.
 */
export const INITIAL_PRODUCTS: Product[] = [
  // Bebidas
  { id: 'prod-1', name: 'Cerveja Heineken 600ml', category: 'Bebidas', priceCents: 1800, description: 'Garrafa retornável 600ml estupidamente gelada' },
  { id: 'prod-2', name: 'Cerveja Corona Long Neck 330ml', category: 'Bebidas', priceCents: 1400, description: 'Com fatia de limão' },
  { id: 'prod-3', name: 'Chopp Artesanal Pilsen 500ml', category: 'Bebidas', priceCents: 1600, description: 'Caneca congelada' },
  { id: 'prod-4', name: 'Refrigerante Lata 350ml', category: 'Bebidas', priceCents: 700, description: 'Coca-Cola, Guaraná, Zero' },
  { id: 'prod-5', name: 'Água Mineral c/ ou s/ gás 500ml', category: 'Bebidas', priceCents: 600, description: 'Garrafa 500ml' },
  { id: 'prod-6', name: 'Água de Coco Natural 300ml', category: 'Bebidas', priceCents: 850, description: 'Copo gelado' },
  { id: 'prod-7', name: 'Isotônico Gatorade 500ml', category: 'Bebidas', priceCents: 1000, description: 'Limão, Uva ou Laranja' },
  { id: 'prod-8', name: 'Suco Natural da Fruta 400ml', category: 'Bebidas', priceCents: 1100, description: 'Laranja, Limão ou Maracujá' },
  { id: 'prod-9', name: 'Energético Red Bull 250ml', category: 'Bebidas', priceCents: 1500, description: 'Tradicional ou Tropical' },

  // Porções & Petiscos
  { id: 'prod-10', name: 'Batata Frita Especial c/ Cheddar e Bacon', category: 'Porções & Petiscos', priceCents: 3800, description: 'Porção generosa para compartilhar' },
  { id: 'prod-11', name: 'Isca de Frango Empanada Crocante', category: 'Porções & Petiscos', priceCents: 4400, description: 'Acompanha molho de mostarda e mel e tártaro' },
  { id: 'prod-12', name: 'Calabresa Fatiada Acebolada', category: 'Porções & Petiscos', priceCents: 4200, description: 'Acompanha cesto de pão francês e farofa' },
  { id: 'prod-13', name: 'Dadinho de Tapioca c/ Geléia de Pimenta', category: 'Porções & Petiscos', priceCents: 3600, description: '12 unidades artesanais com queijo coalho' },
  { id: 'prod-14', name: 'Tiras de Filé Mignon c/ Mandioca Frita', category: 'Porções & Petiscos', priceCents: 6800, description: 'Na chapa com manteiga de garrafa' },
  { id: 'prod-15', name: 'Pastéis Mistos (6 unidades)', category: 'Porções & Petiscos', priceCents: 3200, description: 'Queijo, carne e palmito' },

  // Lanches
  { id: 'prod-16', name: 'Hambúrguer Engenho Especial', category: 'Lanches', priceCents: 3400, description: 'Blend 180g, queijo prato, bacon crocante, alface, tomate e maionese verde' },
  { id: 'prod-17', name: 'Sanduíche de Frango Grelhado Light', category: 'Lanches', priceCents: 2800, description: 'Filé grelhado, queijo branco, rúcula e pasta de ricota' },
  { id: 'prod-18', name: 'Misto Quente Especial na Baguete', category: 'Lanches', priceCents: 1900, description: 'Queijo duplo, presunto e manteiga na chapa' },

  // Espetos
  { id: 'prod-19', name: 'Espeto de Alcatra', category: 'Espetos', priceCents: 1400, description: 'Acompanha vinagrete e farofa' },
  { id: 'prod-20', name: 'Espeto de Frango c/ Bacon', category: 'Espetos', priceCents: 1300, description: 'Acompanha vinagrete e farofa' },
  { id: 'prod-21', name: 'Espeto de Queijo Coalho c/ Melaço', category: 'Espetos', priceCents: 1300, description: 'Tostado na brasa com melaço de cana' },
  { id: 'prod-22', name: 'Espeto de Kafta Temperada', category: 'Espetos', priceCents: 1300, description: 'Acompanha vinagrete e molho de hortelã' },

  // Sobremesas & Outros
  { id: 'prod-23', name: 'Açaí na Tigela 400ml Especial', category: 'Sobremesas & Outros', priceCents: 2200, description: 'Acompanha banana fatiada, leite em pó e granola' },
  { id: 'prod-24', name: 'Pudim de Leite Condensado Artesanal', category: 'Sobremesas & Outros', priceCents: 1200, description: 'Fatia com calda de caramelo' },
  { id: 'prod-25', name: 'Picolé Frutas da Época', category: 'Sobremesas & Outros', priceCents: 800, description: 'Sabores variados' },
  { id: 'prod-26', name: 'Bala ou Chiclete Avulso', category: 'Sobremesas & Outros', priceCents: 10, description: 'Unidade' },
];
