export const SAO_PAULO_TZ = 'America/Sao_Paulo';

/**
 * Converte valor em Reais (com decimais) para centavos inteiros.
 * Ex: 18.5 -> 1850; 0.1 -> 10.
 */
export function reaisToCents(reais: number): number {
  if (!Number.isFinite(reais)) return 0;
  return Math.round(reais * 100);
}

/**
 * Converte centavos inteiros para Reais.
 * Ex: 1850 -> 18.5.
 */
export function centsToReais(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return cents / 100;
}

/**
 * Formata um valor em centavos inteiros no padrão de moeda brasileiro (R$ 0,00).
 */
export function formatCents(cents: number): string {
  if (!Number.isFinite(cents)) return 'R$ 0,00';
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const formatCentsToBRL = formatCents;

/**
 * Formata um valor numérico em Reais (ou centavos se for grande e especificado).
 * Mantido para compatibilidade onde números diretos em Reais são passados.
 */
export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Converte string digitada pelo usuário ("10,50" ou "10.50" ou "10") para centavos inteiros.
 */
export function parseMonetaryInputToCents(text: string): number {
  if (!text || typeof text !== 'string') return 0;
  const clean = text.trim().replace(/\s/g, '').replace('R$', '').trim();
  if (!clean) return 0;
  // Substituir vírgula por ponto para parse
  const normalized = clean.replace(',', '.');
  const num = parseFloat(normalized);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100);
}

/**
 * Retorna a chave de data 'YYYY-MM-DD' no fuso horário 'America/Sao_Paulo'.
 */
export function getSaoPauloDateKey(dateInput?: Date | string | number): string {
  const date =
    dateInput === undefined
      ? new Date()
      : typeof dateInput === 'string' || typeof dateInput === 'number'
      ? new Date(dateInput)
      : dateInput;

  if (isNaN(date.getTime())) {
    return '1970-01-01';
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Verifica se uma data corresponde ao dia de hoje no fuso horário 'America/Sao_Paulo'.
 */
export function isTodaySaoPaulo(
  dateInput: Date | string | number,
  referenceDate: Date = new Date()
): boolean {
  return getSaoPauloDateKey(dateInput) === getSaoPauloDateKey(referenceDate);
}

export function formatDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: SAO_PAULO_TZ,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return isoString;
  }
}

export function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: SAO_PAULO_TZ,
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return isoString;
  }
}

export function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: SAO_PAULO_TZ,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  } catch {
    return isoString;
  }
}

/**
 * Calcula totais da comanda usando estritamente centavos inteiros.
 */
export function calculateComandaTotals(comanda: {
  items: { priceCents?: number; price?: number; quantity: number }[];
  payments: { amountCents?: number; amount?: number }[];
}) {
  const totalConsumedCents = comanda.items.reduce((acc, item) => {
    const unitCents =
      typeof item.priceCents === 'number'
        ? item.priceCents
        : typeof item.price === 'number'
        ? Math.round(item.price * 100)
        : 0;
    const qty = Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 0;
    return acc + unitCents * qty;
  }, 0);

  const totalPaidCents = comanda.payments.reduce((acc, p) => {
    const payCents =
      typeof p.amountCents === 'number'
        ? p.amountCents
        : typeof p.amount === 'number'
        ? Math.round(p.amount * 100)
        : 0;
    return acc + payCents;
  }, 0);

  const balanceCents = Math.max(0, totalConsumedCents - totalPaidCents);

  return {
    totalConsumedCents,
    totalPaidCents,
    balanceCents,
    // Compatibilidade legada em Reais:
    totalConsumed: totalConsumedCents / 100,
    totalPaid: totalPaidCents / 100,
    balance: balanceCents / 100,
  };
}
