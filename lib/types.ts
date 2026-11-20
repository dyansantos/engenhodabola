export type ComandaType = 'individual' | 'mesa';
export type ComandaStatus = 'aberta' | 'encerrada';
export type PaymentMethod = 'dinheiro' | 'pix' | 'debito' | 'credito';

export type StaffRole = 'admin' | 'operator';

export interface StaffMember {
  uid: string;
  email: string;
  name: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
  addedBy?: string;
}

export interface Product {
  id: string;
  name: string;
  category: 'Bebidas' | 'Porções & Petiscos' | 'Lanches' | 'Espetos' | 'Sobremesas & Outros';
  priceCents: number; // Preço em centavos inteiros (ex: 1800 = R$ 18,00)
  price?: number; // Compatibilidade legada
  description?: string;
}

export interface ComandaItem {
  id: string;
  productId: string;
  name: string;
  category: string;
  priceCents: number; // Preço unitário em centavos inteiros fixado no momento do lançamento
  price?: number; // Compatibilidade legada
  quantity: number; // Quantidade inteira positiva
  notes?: string;
  addedAt: string;
  addedByUid?: string;
  addedByName?: string;
}

export interface PaymentRecord {
  id: string; // Identificador único da transação financeira
  method: PaymentMethod;
  amountCents: number; // Valor efetivo abatido da conta em centavos inteiros
  amount?: number; // Compatibilidade legada
  tenderedCents?: number; // Para dinheiro: valor entregue em centavos inteiros
  tendered?: number;
  changeCents?: number; // Para dinheiro: troco calculado em centavos inteiros
  change?: number;
  timestamp: string;
  operator: string; // Nome do operador confirmado pelo servidor
  operatorUid?: string; // UID do funcionário autenticado
  clientNonce?: string; // Chave de idempotência para evitar cobrança duplicada
}

export type HistoryActionType =
  | 'abertura'
  | 'item_adicionado'
  | 'item_removido'
  | 'item_transferido'
  | 'pagamento'
  | 'encerramento';

export interface ComandaHistoryEntry {
  id: string;
  timestamp: string;
  operator: string;
  operatorUid?: string;
  type: HistoryActionType;
  description: string;
  details?: string;
}

export interface Comanda {
  id: string;
  number: number;
  type: ComandaType;
  name: string;
  table?: string;
  responsible?: string;
  status: ComandaStatus;
  openedAt: string;
  closedAt?: string;
  items: ComandaItem[];
  payments: PaymentRecord[];
  history: ComandaHistoryEntry[];
  lastModifiedByUid?: string;
  lastModifiedAt?: string;
}

export type ActiveModule =
  | 'inicio'
  | 'comandas'
  | 'agenda'
  | 'alunos'
  | 'mensalidades'
  | 'eventos'
  | 'caixa'
  | 'relatorios'
  | 'cadastros'
  | 'equipe';

export type CourtSpace = 'Areia 1' | 'Areia 2' | 'Areia 3' | 'Society';

export type SportModality =
  | 'beach_tennis'
  | 'futevolei'
  | 'society'
  | 'funcional_outro';

export type AppointmentType =
  | 'locacao_avulsa'
  | 'mensalista'
  | 'aula'
  | 'evento'
  | 'bloqueio';

export type AppointmentStatus =
  | 'confirmada'
  | 'em_andamento'
  | 'concluida'
  | 'cancelada';

export type AppointmentFinancialStatus =
  | 'pendente'
  | 'em_atendimento'
  | 'quitada'
  | 'mensalidade';

export interface AppointmentHistoryEntry {
  id: string;
  timestamp: string;
  operator: string;
  operatorUid?: string;
  type: 'criacao' | 'edicao' | 'inicio_atendimento' | 'status_alterado' | 'cancelamento';
  description: string;
  details?: string;
}

export interface Appointment {
  id: string;
  title: string;
  hostName: string;
  hostPhone?: string;
  space: CourtSpace;
  spaces?: CourtSpace[]; // Para eventos com múltiplos espaços
  modality: SportModality;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  type: AppointmentType;
  status: AppointmentStatus;
  financialStatus?: AppointmentFinancialStatus;
  priceCents?: number; // Valor acordado para avulsa/evento
  monthlyPriceCents?: number; // Para mensalista
  notes?: string;
  linkedGroupRentalId?: string; // ID da locação em grupo para fechamento
  recurringSeriesId?: string; // ID da série semanal fixa se houver
  occurrenceIndex?: number;
  createdAt: string;
  createdByUid: string;
  createdByName: string;
  updatedAt?: string;
  updatedByUid?: string;
  updatedByName?: string;
  cancelledAt?: string;
  cancelledByUid?: string;
  cancelledByName?: string;
  cancellationReason?: string;
  history?: AppointmentHistoryEntry[];
}

export interface RecurringSeries {
  id: string;
  hostName: string;
  hostPhone?: string;
  space: CourtSpace;
  modality: SportModality;
  type: 'mensalista' | 'aula';
  daysOfWeek: number[]; // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string;
  monthlyPriceCents?: number;
  notes?: string;
  status: 'ativa' | 'cancelada';
  createdAt: string;
  createdByUid: string;
  createdByName: string;
}

export interface OccupancySlot {
  appointmentId: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  title: string;
  type: AppointmentType;
}

export interface CourtOccupancyDoc {
  id: string; // doc ID: occ_${space}_${date}
  space: CourtSpace;
  date: string; // YYYY-MM-DD
  slots: OccupancySlot[];
  updatedAt: string;
}

export interface AgendaOperatingHours {
  configured: boolean;
  openTime: string;  // e.g. "07:00"
  closeTime: string; // e.g. "23:00"
  slotIntervalMinutes?: number; // e.g. 60
  updatedAt?: string;
  updatedByUid?: string;
  updatedByName?: string;
}

export type ParticipantStatus = 'pendente' | 'parcial' | 'pago';

export interface GroupParticipant {
  id: string;
  name: string;
  dueAmountCents: number;
  paidAmountCents: number;
  linkedComandaId?: string;
  status: ParticipantStatus;
}

export interface GroupPaymentAllocation {
  participantId: string;
  participantName: string;
  amountCents: number;
}

export interface GroupRentalPayment {
  id: string;
  clientNonce: string;
  timestamp: string;
  method: PaymentMethod;
  amountCents: number;
  tenderedCents?: number;
  changeCents?: number;
  payerName?: string;
  operator: string;
  operatorUid: string;
  allocations: GroupPaymentAllocation[];
  linkedBarPayment?: {
    comandaId: string;
    comandaNumber: number;
    amountCents: number;
  };
}

export interface GroupRentalHistoryEntry {
  id: string;
  timestamp: string;
  operator: string;
  operatorUid?: string;
  type: 'criacao' | 'ajuste_divisao' | 'pagamento' | 'encerramento' | 'vinculo_bar';
  description: string;
  details?: string;
}

export type GroupRentalStatus = 'aberta' | 'quitada' | 'cancelada';

export interface GroupRental {
  id: string;
  number: number;
  groupName: string;
  date: string;
  time: string;
  space: CourtSpace;
  totalAmountCents: number;
  status: GroupRentalStatus;
  participants: GroupParticipant[];
  payments: GroupRentalPayment[];
  history: GroupRentalHistoryEntry[];
  createdAt: string;
  closedAt?: string;
  createdByUid: string;
  createdByName: string;
  lastModifiedAt?: string;
  lastModifiedByUid?: string;
}

export type ReceiptOrigin = 'comanda' | 'locacao';
export type ReceiptKind = 'recebimento' | 'estorno';

export interface ReceiptDocument {
  id: string;
  origin: ReceiptOrigin;
  refId: string;
  refNumber: number;
  refLabel: string;
  method: PaymentMethod;
  amountCents: number; // inteiro > 0
  paidAt: unknown; // Firestore Timestamp / serverTimestamp() FieldValue
  dateKey?: string; // Legado/opcional: YYYY-MM-DD derivado de paidAt no fuso America/Sao_Paulo
  staffUid: string;
  staffName: string;
  jointPaymentId?: string;
  sourcePaymentId: string;
  kind: ReceiptKind;
}


