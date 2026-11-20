'use client';

import React, { useState, useMemo } from 'react';
import { useComandas } from '@/context/ComandasContext';
import {
  GroupRental,
  GroupParticipant,
  PaymentMethod,
  ParticipantStatus,
} from '@/lib/types';
import {
  formatCents,
  formatDateTime,
  formatDate,
  parseMonetaryInputToCents,
} from '@/lib/formatters';
import { calculateGroupRentalTotals } from '@/lib/firestore-transactions';
import {
  X,
  Users,
  Calendar,
  Clock,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Search,
  Check,
  Edit2,
  CreditCard,
  QrCode,
  Banknote,
  Link,
  Unlink,
  Sliders,
  History,
  Lock,
  ArrowRight,
  ShieldCheck,
  Coffee,
} from 'lucide-react';

interface GroupRentalDetailModalProps {
  rentalId: string;
  onClose: () => void;
}

export function GroupRentalDetailModal({ rentalId, onClose }: GroupRentalDetailModalProps) {
  const {
    groupRentals,
    comandas,
    updateParticipantName,
    adjustGroupDivision,
    linkBarComanda,
    registerGroupPayment,
    closeGroupRental,
    verifyGroupPaymentStatus,
  } = useComandas();

  const rental = groupRentals.find(r => r.id === rentalId);

  // Filtros e busca de participantes
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pendentes' | 'quitados'>('todos');

  // Seleção múltipla para pagamento coletivo
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);

  // Modais internos
  const [quickPayParticipant, setQuickPayParticipant] = useState<GroupParticipant | null>(null);
  const [quickPayMethod, setQuickPayMethod] = useState<PaymentMethod>('pix');
  const [quickPayPartial, setQuickPayPartial] = useState(false);
  const [quickPayCustomAmount, setQuickPayCustomAmount] = useState('');
  const [quickPayTendered, setQuickPayTendered] = useState('');
  const [includeBarInQuickPay, setIncludeBarInQuickPay] = useState(true);
  const [quickPayPayerName, setQuickPayPayerName] = useState('');
  const [quickPayNonce, setQuickPayNonce] = useState('');

  // Pagamento coletivo
  const [isBulkPayOpen, setIsBulkPayOpen] = useState(false);
  const [bulkPayerName, setBulkPayerName] = useState('');
  const [bulkMethod, setBulkMethod] = useState<PaymentMethod>('pix');
  const [bulkTendered, setBulkTendered] = useState('');
  const [bulkIsPartial, setBulkIsPartial] = useState(false);
  const [bulkCustomAllocations, setBulkCustomAllocations] = useState<Record<string, string>>({});
  const [bulkNonce, setBulkNonce] = useState('');

  // Ajuste de partes
  const [isAdjustDivisionOpen, setIsAdjustDivisionOpen] = useState(false);
  const [customPartsInput, setCustomPartsInput] = useState<Record<string, string>>({});

  // Edição inline de nome
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [editingNameInput, setEditingNameInput] = useState('');

  // Vínculo de comanda de bar
  const [linkBarParticipantId, setLinkBarParticipantId] = useState<string | null>(null);

  // Aba ativa de exibição
  const [activeTab, setActiveTab] = useState<'participantes' | 'historico'>('participantes');

  // Estados de submissão e erro
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Lista de comandas abertas de tipo individual para vincular ao consumo do bar
  const openIndividualComandas = useMemo(() => {
    return comandas.filter(c => c.status === 'aberta' && c.type === 'individual');
  }, [comandas]);

  // Participantes filtrados
  const filteredParticipants = useMemo(() => {
    const list = rental?.participants || [];
    return list.filter(p => {
      // Filtro de status
      if (statusFilter === 'pendentes' && p.status === 'pago') return false;
      if (statusFilter === 'quitados' && p.status !== 'pago') return false;

      // Busca por nome
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase().trim();
        if (!p.name.toLowerCase().includes(query)) return false;
      }

      return true;
    });
  }, [rental, statusFilter, searchQuery]);

  // Soma calculada no modal de ajuste
  const sumOfAdjustedPartsCents = useMemo(() => {
    return Object.values(customPartsInput).reduce((sum, str) => {
      return sum + parseMonetaryInputToCents(str);
    }, 0);
  }, [customPartsInput]);

  if (!rental) return null;

  const totals = calculateGroupRentalTotals(rental);

  // Percentual pago
  const percentPaid = totals.totalAmountCents > 0
    ? Math.min(100, Math.round((totals.totalPaidCents / totals.totalAmountCents) * 100))
    : 100;

  // Toggle de seleção de participante
  const toggleSelectParticipant = (id: string) => {
    const part = rental.participants.find(p => p.id === id);
    if (!part || part.status === 'pago') return; // Já pago não precisa selecionar

    setSelectedParticipantIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllPending = () => {
    const pendingIds = (rental.participants || [])
      .filter(p => p.status !== 'pago')
      .map(p => p.id);
    setSelectedParticipantIds(pendingIds);
  };

  const handleClearSelection = () => {
    setSelectedParticipantIds([]);
  };

  // Abrir recebimento rápido para um participante
  const handleOpenQuickPay = (participant: GroupParticipant, method: PaymentMethod) => {
    setActionError(null);
    setQuickPayParticipant(participant);
    setQuickPayMethod(method);
    setQuickPayPartial(false);
    const pendingCents = participant.dueAmountCents - participant.paidAmountCents;
    setQuickPayCustomAmount((pendingCents / 100).toFixed(2).replace('.', ','));
    setQuickPayTendered('');
    setIncludeBarInQuickPay(true);
    setQuickPayPayerName(participant.name);
    // Identificador estável da intenção de pagamento
    setQuickPayNonce(`pay-gr-${rental.id}-${participant.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  };

  // Confirmar recebimento rápido
  const handleConfirmQuickPay = async () => {
    if (!quickPayParticipant || isSubmitting) return;
    setActionError(null);

    const pendingCents = quickPayParticipant.dueAmountCents - quickPayParticipant.paidAmountCents;
    let amountToPayCents = pendingCents;

    if (quickPayPartial) {
      amountToPayCents = parseMonetaryInputToCents(quickPayCustomAmount);
      if (amountToPayCents <= 0 || amountToPayCents > pendingCents) {
        setActionError(`Valor a pagar deve ser entre R$ 0,01 e ${formatCents(pendingCents)}.`);
        return;
      }
    }

    // Verificar se há comanda de bar vinculada com saldo
    let linkedBarPaymentParam: { participantId: string; comandaId: string; amountCents: number } | undefined = undefined;
    if (includeBarInQuickPay && quickPayParticipant.linkedComandaId) {
      const linkedCmd = comandas.find(c => c.id === quickPayParticipant.linkedComandaId);
      if (linkedCmd && linkedCmd.status === 'aberta') {
        const barBalanceCents = linkedCmd.items.reduce((acc, it) => acc + it.priceCents * it.quantity, 0)
          - linkedCmd.payments.reduce((acc, p) => acc + p.amountCents, 0);
        if (barBalanceCents > 0) {
          linkedBarPaymentParam = {
            participantId: quickPayParticipant.id,
            comandaId: linkedCmd.id,
            amountCents: barBalanceCents,
          };
        }
      }
    }

    const totalOperationCents = amountToPayCents + (linkedBarPaymentParam?.amountCents || 0);

    let tenderedCents: number | undefined = undefined;
    if (quickPayMethod === 'dinheiro') {
      const tendered = parseMonetaryInputToCents(quickPayTendered) || totalOperationCents;
      if (tendered < totalOperationCents) {
        setActionError(`Valor entregue (${formatCents(tendered)}) é menor que o total de ${formatCents(totalOperationCents)}.`);
        return;
      }
      tenderedCents = tendered;
    }

    const nonce = quickPayNonce || `pay-gr-${rental.id}-${quickPayParticipant.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (!quickPayNonce) {
      setQuickPayNonce(nonce);
    }

    setIsSubmitting(true);
    try {
      const res = await registerGroupPayment(rental.id, {
        clientNonce: nonce,
        method: quickPayMethod,
        tenderedCents,
        payerName: quickPayPayerName.trim() || undefined,
        allocations: [
          {
            participantId: quickPayParticipant.id,
            amountCents: amountToPayCents,
          },
        ],
        linkedBarPayment: linkedBarPaymentParam,
      });

      if (!res.success) {
        setActionError(res.error || 'Erro ao registrar pagamento.');
        return;
      }

      setQuickPayParticipant(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Abrir modal de pagamento coletivo para selecionados
  const handleOpenBulkPay = () => {
    setActionError(null);
    setBulkPayerName('');
    setBulkMethod('pix');
    setBulkTendered('');
    setBulkIsPartial(false);

    // Identificador estável da intenção de pagamento coletivo
    setBulkNonce(`pay-gr-bulk-${rental.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);

    // Inicializar alocações com o saldo devedor integral de cada um
    const initialAlloc: Record<string, string> = {};
    selectedParticipantIds.forEach(id => {
      const part = rental.participants.find(p => p.id === id);
      if (part) {
        const due = part.dueAmountCents - part.paidAmountCents;
        initialAlloc[id] = (due / 100).toFixed(2).replace('.', ',');
      }
    });
    setBulkCustomAllocations(initialAlloc);
    setIsBulkPayOpen(true);
  };

  // Confirmar pagamento coletivo
  const handleConfirmBulkPay = async () => {
    if (selectedParticipantIds.length === 0 || isSubmitting) return;
    setActionError(null);

    const allocations: { participantId: string; amountCents: number }[] = [];
    let totalBulkCents = 0;

    for (const id of selectedParticipantIds) {
      const part = rental.participants.find(p => p.id === id);
      if (!part) continue;

      const pendingForPart = part.dueAmountCents - part.paidAmountCents;
      let amtCents = pendingForPart;

      if (bulkIsPartial) {
        amtCents = parseMonetaryInputToCents(bulkCustomAllocations[id] || '0');
        if (amtCents <= 0) {
          setActionError(`Defina um valor maior que zero para "${part.name}" ou desmarque-o.`);
          return;
        }
        if (amtCents > pendingForPart) {
          setActionError(`O valor de ${formatCents(amtCents)} para "${part.name}" ultrapassa seu saldo de ${formatCents(pendingForPart)}.`);
          return;
        }
      }

      totalBulkCents += amtCents;
      allocations.push({
        participantId: part.id,
        amountCents: amtCents,
      });
    }

    if (totalBulkCents <= 0) {
      setActionError('O valor total a receber deve ser maior que zero.');
      return;
    }

    let tenderedCents: number | undefined = undefined;
    if (bulkMethod === 'dinheiro') {
      const tendered = parseMonetaryInputToCents(bulkTendered) || totalBulkCents;
      if (tendered < totalBulkCents) {
        setActionError(`Valor entregue (${formatCents(tendered)}) é menor que o total (${formatCents(totalBulkCents)}).`);
        return;
      }
      tenderedCents = tendered;
    }

    const nonce = bulkNonce || `pay-gr-bulk-${rental.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (!bulkNonce) {
      setBulkNonce(nonce);
    }

    setIsSubmitting(true);
    try {
      const res = await registerGroupPayment(rental.id, {
        clientNonce: nonce,
        method: bulkMethod,
        tenderedCents,
        payerName: bulkPayerName.trim() || undefined,
        allocations,
      });

      if (!res.success) {
        setActionError(res.error || 'Erro ao registrar pagamento coletivo.');
        return;
      }

      setIsBulkPayOpen(false);
      setSelectedParticipantIds([]);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Salvar edição de nome
  const handleSaveParticipantName = async (participantId: string) => {
    if (!editingNameInput.trim()) return;
    try {
      await updateParticipantName(rental.id, participantId, editingNameInput.trim());
      setEditingParticipantId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao atualizar nome.');
    }
  };

  // Abrir ajuste de divisão
  const handleOpenAdjustDivision = () => {
    setActionError(null);
    const initialParts: Record<string, string> = {};
    rental.participants.forEach(p => {
      initialParts[p.id] = (p.dueAmountCents / 100).toFixed(2).replace('.', ',');
    });
    setCustomPartsInput(initialParts);
    setIsAdjustDivisionOpen(true);
  };

  // Confirmar ajuste de divisão
  const handleConfirmAdjustDivision = async () => {
    if (isSubmitting) return;
    setActionError(null);

    if (sumOfAdjustedPartsCents !== rental.totalAmountCents) {
      setActionError(
        `A soma das partes (${formatCents(sumOfAdjustedPartsCents)}) deve ser rigorosamente igual ao total da locação (${formatCents(
          rental.totalAmountCents
        )}). Diferença: ${formatCents(Math.abs(rental.totalAmountCents - sumOfAdjustedPartsCents))}.`
      );
      return;
    }

    const newDueAmounts: { participantId: string; dueAmountCents: number }[] = [];
    for (const p of rental.participants) {
      const cents = parseMonetaryInputToCents(customPartsInput[p.id] || '0');
      if (cents < p.paidAmountCents) {
        setActionError(
          `O participante "${p.name}" já pagou ${formatCents(p.paidAmountCents)}. Sua parte não pode ser menor que o valor já recebido.`
        );
        return;
      }
      newDueAmounts.push({
        participantId: p.id,
        dueAmountCents: cents,
      });
    }

    setIsSubmitting(true);
    try {
      const res = await adjustGroupDivision(rental.id, newDueAmounts);
      if (!res.success) {
        setActionError(res.error || 'Erro ao ajustar divisão.');
        return;
      }
      setIsAdjustDivisionOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Encerrar locação
  const handleCloseRental = async () => {
    if (totals.pendingBalanceCents > 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await closeGroupRental(rental.id);
      if (!res.success) {
        setActionError(res.error || 'Erro ao encerrar locação.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-2 sm:p-4 backdrop-blur-xs">
      <div className="flex max-h-[96vh] w-full max-w-5xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Cabeçalho Superior da Locação */}
        <div className="border-b border-slate-200 bg-slate-50/70 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-emerald-900 px-2 py-0.5 text-xs font-mono font-bold text-white">
                  Locação #{rental.number}
                </span>
                <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-800">
                  {rental.space}
                </span>
                {rental.status === 'quitada' ? (
                  <span className="flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                    <CheckCircle2 className="h-3 w-3" />
                    Quitada e Finalizada
                  </span>
                ) : (
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                    Aberta com Pendências
                  </span>
                )}
                <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-2xs text-slate-600">
                  Horário informativo
                </span>
              </div>

              <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                {rental.groupName}
              </h1>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  {formatDate(rental.date)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  {rental.time}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                  {rental.participants?.length || 0} participantes
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* KPI Cards do Topo */}
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
              <span className="text-2xs font-semibold uppercase tracking-wider text-slate-500">
                Valor Total da Locação
              </span>
              <p className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
                {formatCents(totals.totalAmountCents)}
              </p>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 shadow-2xs">
              <span className="text-2xs font-semibold uppercase tracking-wider text-emerald-700">
                Total Recebido
              </span>
              <p className="text-base sm:text-lg font-bold text-emerald-900 mt-0.5">
                {formatCents(totals.totalPaidCents)}
              </p>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 shadow-2xs">
              <span className="text-2xs font-semibold uppercase tracking-wider text-amber-700">
                Saldo Pendente
              </span>
              <p className="text-base sm:text-lg font-bold text-amber-900 mt-0.5">
                {formatCents(totals.pendingBalanceCents)}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-2xs font-semibold uppercase tracking-wider text-slate-500">
                  Quitados
                </span>
                <span className="text-xs font-bold text-slate-700">{percentPaid}%</span>
              </div>
              <p className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
                {totals.paidParticipantsCount} de {totals.totalParticipantsCount}
              </p>
              <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
                <div
                  className="bg-emerald-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${percentPaid}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Alerta de erro de ação se houver */}
        {actionError && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p>{actionError}</p>
            </div>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-red-500 hover:text-red-700 font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* Barra de Ferramentas e Filtros */}
        <div className="border-b border-slate-200 bg-white px-4 py-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Seletor de Abas */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab('participantes')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === 'participantes'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>Participantes ({rental.participants?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('historico')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === 'historico'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span>Histórico ({rental.payments?.length || 0})</span>
            </button>
          </div>

          {/* Botões de Ação Global da Locação */}
          <div className="flex flex-wrap items-center gap-2">
            {rental.status === 'aberta' && (
              <button
                type="button"
                onClick={handleOpenAdjustDivision}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Sliders className="h-3.5 w-3.5 text-slate-500" />
                <span>Ajustar Divisão</span>
              </button>
            )}

            {rental.status === 'aberta' && totals.pendingBalanceCents === 0 && (
              <button
                type="button"
                onClick={handleCloseRental}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Encerrar como Quitado</span>
              </button>
            )}
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {activeTab === 'participantes' && (
            <div className="space-y-4">
              {/* Barra de Busca, Filtros de Pendência e Seleção Múltipla */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Pesquisar participante por nome..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-800 focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-1 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('todos')}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                      statusFilter === 'todos'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('pendentes')}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                      statusFilter === 'pendentes'
                        ? 'bg-amber-800 text-white'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Pendentes ({totals.totalParticipantsCount - totals.paidParticipantsCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('quitados')}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                      statusFilter === 'quitados'
                        ? 'bg-emerald-800 text-white'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Quitados ({totals.paidParticipantsCount})
                  </button>
                </div>
              </div>

              {/* Barra de Ação de Pagamento Coletivo (quando 1 ou mais selecionados) */}
              {selectedParticipantIds.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-800 text-xs font-bold text-white">
                      {selectedParticipantIds.length}
                    </span>
                    <span className="text-xs sm:text-sm font-semibold text-emerald-950">
                      participante(s) selecionado(s) para recebimento conjunto
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      Desmarcar
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenBulkPay}
                      className="flex items-center gap-1.5 rounded-md bg-emerald-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 transition-colors"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      <span>Receber Selecionados Juntos</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Tabela de Participantes */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-2xs font-semibold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="w-10 px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={
                              rental.participants.filter(p => p.status !== 'pago').length > 0 &&
                              selectedParticipantIds.length ===
                                rental.participants.filter(p => p.status !== 'pago').length
                            }
                            onChange={e => {
                              if (e.target.checked) {
                                handleSelectAllPending();
                              } else {
                                handleClearSelection();
                              }
                            }}
                            className="rounded border-slate-300 text-emerald-900 focus:ring-emerald-800"
                          />
                        </th>
                        <th className="px-3 py-3">Participante</th>
                        <th className="px-3 py-3">Comanda Bar</th>
                        <th className="px-3 py-3 text-right">Valor Devido</th>
                        <th className="px-3 py-3 text-right">Recebido</th>
                        <th className="px-3 py-3 text-right">Saldo</th>
                        <th className="px-3 py-3 text-center">Situação</th>
                        <th className="px-3 py-3 text-right">Recebimento Rápido</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-normal">
                      {filteredParticipants.map(participant => {
                        const pendingCents = participant.dueAmountCents - participant.paidAmountCents;
                        const isSelected = selectedParticipantIds.includes(participant.id);
                        const linkedCmd = participant.linkedComandaId
                          ? comandas.find(c => c.id === participant.linkedComandaId)
                          : null;

                        // Saldo da comanda vinculada
                        const linkedBarBalanceCents = linkedCmd
                          ? linkedCmd.items.reduce((acc, it) => acc + it.priceCents * it.quantity, 0) -
                            linkedCmd.payments.reduce((acc, p) => acc + p.amountCents, 0)
                          : 0;

                        return (
                          <tr
                            key={participant.id}
                            className={`transition-colors ${
                              isSelected ? 'bg-emerald-50/50' : 'hover:bg-slate-50/60'
                            }`}
                          >
                            {/* Checkbox de seleção */}
                            <td className="px-3 py-3 text-center">
                              <input
                                type="checkbox"
                                disabled={participant.status === 'pago'}
                                checked={isSelected}
                                onChange={() => toggleSelectParticipant(participant.id)}
                                className="rounded border-slate-300 text-emerald-900 focus:ring-emerald-800 disabled:opacity-30"
                              />
                            </td>

                            {/* Nome com edição inline rápida */}
                            <td className="px-3 py-3">
                              {editingParticipantId === participant.id ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={editingNameInput}
                                    onChange={e => setEditingNameInput(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleSaveParticipantName(participant.id);
                                      if (e.key === 'Escape') setEditingParticipantId(null);
                                    }}
                                    className="rounded border border-emerald-800 bg-white px-2 py-0.5 text-xs font-semibold text-slate-900 focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveParticipantName(participant.id)}
                                    className="rounded bg-emerald-800 p-1 text-white hover:bg-emerald-700"
                                  >
                                    <Check className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingParticipantId(null)}
                                    className="rounded bg-slate-200 p-1 text-slate-600 hover:bg-slate-300"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 group">
                                  <span className="font-semibold text-slate-900">
                                    {participant.name}
                                  </span>
                                  {rental.status === 'aberta' && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingParticipantId(participant.id);
                                        setEditingNameInput(participant.name);
                                      }}
                                      title="Editar nome do participante"
                                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 transition-opacity p-0.5"
                                    >
                                      <Edit2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Comanda de Bar vinculada */}
                            <td className="px-3 py-3">
                              {linkedCmd ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-2xs font-semibold text-amber-900">
                                    <Coffee className="h-3 w-3 text-amber-700" />
                                    <span>#{linkedCmd.number} ({formatCents(linkedBarBalanceCents)})</span>
                                  </span>
                                  {rental.status === 'aberta' && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          await linkBarComanda(rental.id, participant.id, null);
                                        } catch (err) {
                                          setActionError(err instanceof Error ? err.message : 'Falha ao desvincular.');
                                        }
                                      }}
                                      title="Remover vínculo da comanda"
                                      className="text-slate-400 hover:text-red-600 transition-colors"
                                    >
                                      <Unlink className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              ) : (
                                rental.status === 'aberta' && (
                                  <button
                                    type="button"
                                    onClick={() => setLinkBarParticipantId(participant.id)}
                                    className="inline-flex items-center gap-1 rounded border border-dashed border-slate-300 px-1.5 py-0.5 text-2xs text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors"
                                  >
                                    <Link className="h-2.5 w-2.5" />
                                    <span>Vincular Bar</span>
                                  </button>
                                )
                              )}
                            </td>

                            {/* Valor Devido */}
                            <td className="px-3 py-3 text-right font-medium text-slate-700">
                              {formatCents(participant.dueAmountCents)}
                            </td>

                            {/* Recebido */}
                            <td className="px-3 py-3 text-right font-medium text-emerald-800">
                              {formatCents(participant.paidAmountCents)}
                            </td>

                            {/* Saldo */}
                            <td className="px-3 py-3 text-right font-bold text-slate-900">
                              {formatCents(pendingCents)}
                            </td>

                            {/* Situação */}
                            <td className="px-3 py-3 text-center">
                              {participant.status === 'pago' ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-2xs font-semibold text-emerald-800">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Pago
                                </span>
                              ) : participant.status === 'parcial' ? (
                                <span className="inline-flex items-center rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-2xs font-semibold text-sky-800">
                                  Parcial
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-2xs font-semibold text-amber-800">
                                  Pendente
                                </span>
                              )}
                            </td>

                            {/* Ações de Recebimento Rápido na Linha */}
                            <td className="px-3 py-3 text-right">
                              {participant.status === 'pago' ? (
                                <span className="text-2xs font-semibold text-emerald-700">
                                  ✓ Quitado
                                </span>
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenQuickPay(participant, 'pix')}
                                    title="Receber via Pix"
                                    className="rounded border border-emerald-700 bg-emerald-50 px-2 py-1 text-2xs font-bold text-emerald-900 hover:bg-emerald-100 transition-colors"
                                  >
                                    Pix
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenQuickPay(participant, 'dinheiro')}
                                    title="Receber em Dinheiro com troco"
                                    className="rounded border border-slate-300 bg-white px-2 py-1 text-2xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                  >
                                    Dinheiro
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenQuickPay(participant, 'debito')}
                                    title="Receber no Cartão de Débito"
                                    className="rounded border border-slate-300 bg-white px-2 py-1 text-2xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors hidden sm:inline-block"
                                  >
                                    Débito
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenQuickPay(participant, 'credito')}
                                    title="Receber no Cartão de Crédito"
                                    className="rounded border border-slate-300 bg-white px-2 py-1 text-2xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors hidden sm:inline-block"
                                  >
                                    Crédito
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Aba de Histórico de Recebimentos */}
          {activeTab === 'historico' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  <span>Auditoria e Histórico de Transações do Servidor</span>
                </h3>

                {(!rental.payments || rental.payments.length === 0) ? (
                  <p className="text-xs text-slate-500 italic py-4 text-center">
                    Nenhum recebimento registrado até o momento.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {rental.payments.map((pay, idx) => (
                      <div key={pay.id || idx} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-2xs font-bold text-emerald-900 uppercase">
                              {pay.method}
                            </span>
                            <span className="text-sm font-bold text-slate-900">
                              {formatCents(pay.amountCents)}
                            </span>
                            {pay.payerName && (
                              <span className="text-xs text-slate-600">
                                • Pago por <strong>{pay.payerName}</strong>
                              </span>
                            )}
                          </div>

                          {/* Detalhes de Alocação por Participante */}
                          <div className="text-xs text-slate-600">
                            Distribuído para:{' '}
                            {pay.allocations?.map((a, i) => (
                              <span key={a.participantId}>
                                {i > 0 && ', '}
                                <strong>{a.participantName}</strong> ({formatCents(a.amountCents)})
                              </span>
                            ))}
                          </div>

                          {/* Se incluiu Bar */}
                          {pay.linkedBarPayment && (
                            <div className="text-2xs text-amber-800 font-semibold flex items-center gap-1">
                              <Coffee className="h-3 w-3" />
                              <span>
                                Incluiu Bar (Comanda #{pay.linkedBarPayment.comandaNumber} - {formatCents(pay.linkedBarPayment.amountCents)})
                              </span>
                            </div>
                          )}

                          {pay.changeCents && pay.changeCents > 0 && (
                            <div className="text-2xs text-slate-500">
                              Troco devolvido: {formatCents(pay.changeCents)}
                            </div>
                          )}
                        </div>

                        <div className="text-right text-2xs text-slate-400">
                          <p>{formatDateTime(pay.timestamp)}</p>
                          <p>Operador: {pay.operator}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Rodapé de Fechamento */}
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {totals.isFullyPaid ? (
              <span className="text-emerald-800 font-semibold">
                ✓ Locação 100% quitada no servidor
              </span>
            ) : (
              <span>
                Faltam <strong>{formatCents(totals.pendingBalanceCents)}</strong> para quitação integral
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Fechar Janela
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL COMPACTO DE RECEBIMENTO RÁPIDO INDIVIDUAL OU COM BAR */}
      {/* ========================================================================= */}
      {quickPayParticipant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-2xs">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-900">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Receber de {quickPayParticipant.name}
                  </h3>
                  <p className="text-2xs text-slate-500">Confirmação compacta de recebimento</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickPayParticipant(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {actionError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 space-y-1.5">
                <p>{actionError}</p>
                {quickPayNonce && (
                  <button
                    type="button"
                    onClick={async () => {
                      setActionError('Consultando status no servidor...');
                      const status = await verifyGroupPaymentStatus(rental.id, quickPayNonce);
                      if (status.processed) {
                        setActionError('✓ Pagamento já confirmado com sucesso no servidor!');
                        setTimeout(() => setQuickPayParticipant(null), 1400);
                      } else {
                        setActionError('Nenhum pagamento registrado com esta chave ainda. Você pode tentar confirmar novamente.');
                      }
                    }}
                    className="inline-flex items-center gap-1 font-semibold text-emerald-900 underline hover:text-emerald-950 block text-[11px]"
                  >
                    Verificar se pagamento já foi gravado no servidor
                  </button>
                )}
              </div>
            )}

            <div className="mt-4 space-y-3.5">
              {/* Forma de Pagamento */}
              <div>
                <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Forma de Pagamento
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['pix', 'dinheiro', 'debito', 'credito'] as PaymentMethod[]).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setQuickPayMethod(m)}
                      className={`rounded-lg border px-2 py-2 text-xs font-semibold capitalize transition-all ${
                        quickPayMethod === m
                          ? 'border-emerald-800 bg-emerald-900 text-white shadow-xs'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Valor da Locação a Receber */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Parte da Quadra (Locação)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickPayPartial(!quickPayPartial);
                      const fullPending = quickPayParticipant.dueAmountCents - quickPayParticipant.paidAmountCents;
                      setQuickPayCustomAmount((fullPending / 100).toFixed(2).replace('.', ','));
                    }}
                    className="text-2xs font-semibold text-emerald-800 hover:underline"
                  >
                    {quickPayPartial ? 'Quitar saldo integral' : 'Pagamento parcial?'}
                  </button>
                </div>

                {quickPayPartial ? (
                  <input
                    type="text"
                    value={quickPayCustomAmount}
                    onChange={e => setQuickPayCustomAmount(e.target.value)}
                    placeholder="Ex: 10,00"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900 focus:border-emerald-800 focus:outline-none"
                  />
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-base font-bold text-slate-900">
                    {formatCents(quickPayParticipant.dueAmountCents - quickPayParticipant.paidAmountCents)}
                  </div>
                )}
              </div>

              {/* Opção de Incluir Comanda de Bar Vinculada (se existir) */}
              {quickPayParticipant.linkedComandaId && (() => {
                const linkedCmd = comandas.find(c => c.id === quickPayParticipant.linkedComandaId);
                if (!linkedCmd || linkedCmd.status !== 'aberta') return null;
                const barBal = linkedCmd.items.reduce((acc, it) => acc + it.priceCents * it.quantity, 0)
                  - linkedCmd.payments.reduce((acc, p) => acc + p.amountCents, 0);
                if (barBal <= 0) return null;

                const quadraCents = quickPayPartial
                  ? parseMonetaryInputToCents(quickPayCustomAmount)
                  : quickPayParticipant.dueAmountCents - quickPayParticipant.paidAmountCents;
                const grandTotalCents = quadraCents + (includeBarInQuickPay ? barBal : 0);

                return (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer font-semibold text-amber-950">
                      <input
                        type="checkbox"
                        checked={includeBarInQuickPay}
                        onChange={e => setIncludeBarInQuickPay(e.target.checked)}
                        className="rounded border-amber-300 text-amber-900 focus:ring-amber-800"
                      />
                      <span>Incluir consumo do Bar (Comanda #{linkedCmd.number})?</span>
                    </label>

                    {includeBarInQuickPay && (
                      <div className="rounded border border-amber-200 bg-white p-2 text-2xs space-y-1">
                        <div className="flex justify-between text-slate-600">
                          <span>Locação da quadra:</span>
                          <span className="font-semibold">{formatCents(quadraCents)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Bar & Cozinha (#{linkedCmd.number}):</span>
                          <span className="font-semibold">{formatCents(barBal)}</span>
                        </div>
                        <div className="border-t border-slate-100 pt-1 flex justify-between text-slate-900 font-bold text-xs">
                          <span>Total conjunto a receber:</span>
                          <span className="text-emerald-900">{formatCents(grandTotalCents)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Se for dinheiro: Troco */}
              {quickPayMethod === 'dinheiro' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Valor Entregue pelo Cliente (R$)
                  </label>
                  <input
                    type="text"
                    value={quickPayTendered}
                    onChange={e => setQuickPayTendered(e.target.value)}
                    placeholder="Ex: 50,00"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 focus:border-emerald-800 focus:outline-none"
                  />
                  {(() => {
                    const quadraCents = quickPayPartial
                      ? parseMonetaryInputToCents(quickPayCustomAmount)
                      : quickPayParticipant.dueAmountCents - quickPayParticipant.paidAmountCents;

                    let barCents = 0;
                    if (includeBarInQuickPay && quickPayParticipant.linkedComandaId) {
                      const linkedCmd = comandas.find(c => c.id === quickPayParticipant.linkedComandaId);
                      if (linkedCmd && linkedCmd.status === 'aberta') {
                        barCents = linkedCmd.items.reduce((acc, it) => acc + it.priceCents * it.quantity, 0)
                          - linkedCmd.payments.reduce((acc, p) => acc + p.amountCents, 0);
                      }
                    }
                    const totalReq = quadraCents + barCents;
                    const tendered = parseMonetaryInputToCents(quickPayTendered);
                    const change = Math.max(0, tendered - totalReq);

                    if (tendered >= totalReq && tendered > 0) {
                      return (
                        <p className="mt-1 text-xs font-bold text-emerald-800">
                          Troco a devolver: {formatCents(change)}
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}

              {/* Nome de quem efetuou o pagamento */}
              <div>
                <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Nome do Pagador (Opcional)
                </label>
                <input
                  type="text"
                  value={quickPayPayerName}
                  onChange={e => setQuickPayPayerName(e.target.value)}
                  placeholder="Nome do cliente que pagou (ou deixe em branco)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-emerald-800 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQuickPayParticipant(null)}
                  disabled={isSubmitting}
                  className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmQuickPay}
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 disabled:opacity-50"
                >
                  {isSubmitting ? 'Gravando no Servidor...' : 'Confirmar Recebimento'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE PAGAMENTO COLETIVO ("UMA PESSOA PAGANDO POR VÁRIAS") */}
      {/* ========================================================================= */}
      {isBulkPayOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-2xs">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-900">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Recebimento Coletivo ({selectedParticipantIds.length} participantes)
                  </h3>
                  <p className="text-2xs text-slate-500">
                    Uma pessoa quitando o saldo de múltiplos participantes em uma única operação
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkPayOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {actionError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 space-y-1.5">
                <p>{actionError}</p>
                {bulkNonce && (
                  <button
                    type="button"
                    onClick={async () => {
                      setActionError('Consultando status no servidor...');
                      const status = await verifyGroupPaymentStatus(rental.id, bulkNonce);
                      if (status.processed) {
                        setActionError('✓ Pagamento coletivo já confirmado com sucesso no servidor!');
                        setTimeout(() => {
                          setIsBulkPayOpen(false);
                          setSelectedParticipantIds([]);
                        }, 1400);
                      } else {
                        setActionError('Nenhum pagamento registrado com esta chave ainda. Você pode tentar confirmar novamente.');
                      }
                    }}
                    className="inline-flex items-center gap-1 font-semibold text-emerald-900 underline hover:text-emerald-950 block text-[11px]"
                  >
                    Verificar se recebimento coletivo já foi gravado no servidor
                  </button>
                )}
              </div>
            )}

            <div className="mt-4 space-y-4">
              {/* Nome do Pagador */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome de quem está pagando (Opcional)
                </label>
                <input
                  type="text"
                  value={bulkPayerName}
                  onChange={e => setBulkPayerName(e.target.value)}
                  placeholder="Ex: Carlos (o organizador), Bruno, etc."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-800 focus:outline-none"
                />
              </div>

              {/* Forma de Pagamento */}
              <div>
                <label className="block text-2xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Forma de Pagamento
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['pix', 'dinheiro', 'debito', 'credito'] as PaymentMethod[]).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setBulkMethod(m)}
                      className={`rounded-lg border px-2 py-2 text-xs font-semibold capitalize transition-all ${
                        bulkMethod === m
                          ? 'border-emerald-800 bg-emerald-900 text-white shadow-xs'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Distribuição explícita por participante */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Distribuição entre os Participantes
                  </label>
                  <label className="flex items-center gap-1.5 text-2xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkIsPartial}
                      onChange={e => setBulkIsPartial(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-900 focus:ring-emerald-800"
                    />
                    <span>Personalizar valores parciais</span>
                  </label>
                </div>

                <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {selectedParticipantIds.map(id => {
                    const part = rental.participants.find(p => p.id === id);
                    if (!part) return null;
                    const pending = part.dueAmountCents - part.paidAmountCents;

                    return (
                      <div key={id} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                        <span className="font-semibold text-slate-900">{part.name}</span>
                        {bulkIsPartial ? (
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400">R$</span>
                            <input
                              type="text"
                              value={bulkCustomAllocations[id] || ''}
                              onChange={e =>
                                setBulkCustomAllocations({
                                  ...bulkCustomAllocations,
                                  [id]: e.target.value,
                                })
                              }
                              className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-800"
                            />
                          </div>
                        ) : (
                          <span className="font-bold text-slate-900">{formatCents(pending)}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total do Recebimento Coletivo */}
              {(() => {
                const totalCents = selectedParticipantIds.reduce((sum, id) => {
                  const part = rental.participants.find(p => p.id === id);
                  if (!part) return sum;
                  if (bulkIsPartial) {
                    return sum + parseMonetaryInputToCents(bulkCustomAllocations[id] || '0');
                  }
                  return sum + (part.dueAmountCents - part.paidAmountCents);
                }, 0);

                return (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-950">
                      Total Coletivo a Receber:
                    </span>
                    <span className="text-base font-bold text-emerald-950">
                      {formatCents(totalCents)}
                    </span>
                  </div>
                );
              })()}

              {/* Se for dinheiro: Troco */}
              {bulkMethod === 'dinheiro' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Valor Entregue pelo Pagador (R$)
                  </label>
                  <input
                    type="text"
                    value={bulkTendered}
                    onChange={e => setBulkTendered(e.target.value)}
                    placeholder="Ex: 100,00"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 focus:border-emerald-800 focus:outline-none"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsBulkPayOpen(false)}
                  disabled={isSubmitting}
                  className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBulkPay}
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 disabled:opacity-50"
                >
                  {isSubmitting ? 'Processando Transação...' : 'Confirmar Recebimento Coletivo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE AJUSTE MANUAL DE DIVISÃO */}
      {/* ========================================================================= */}
      {isAdjustDivisionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-2xs">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Ajustar Divisão da Locação</h3>
                <p className="text-2xs text-slate-500">
                  A soma das partes deve ser exatamente {formatCents(rental.totalAmountCents)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAdjustDivisionOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {actionError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                {actionError}
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-60 overflow-y-auto">
                {rental.participants.map(p => (
                  <div key={p.id} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      {p.paidAmountCents > 0 && (
                        <p className="text-2xs text-emerald-800">
                          Já pago: {formatCents(p.paidAmountCents)} (não pode ser menor que isso)
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">R$</span>
                      <input
                        type="text"
                        value={customPartsInput[p.id] || ''}
                        onChange={e =>
                          setCustomPartsInput({
                            ...customPartsInput,
                            [p.id]: e.target.value,
                          })
                        }
                        className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-800"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Verificação da Soma */}
              <div
                className={`rounded-lg p-3 text-xs flex items-center justify-between ${
                  sumOfAdjustedPartsCents === rental.totalAmountCents
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-950 font-bold'
                    : 'bg-red-50 border border-red-200 text-red-900 font-bold'
                }`}
              >
                <span>Soma das partes: {formatCents(sumOfAdjustedPartsCents)}</span>
                <span>
                  {sumOfAdjustedPartsCents === rental.totalAmountCents
                    ? '✓ Bate com o total exato'
                    : `Diferença: ${formatCents(rental.totalAmountCents - sumOfAdjustedPartsCents)}`}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAdjustDivisionOpen(false)}
                  disabled={isSubmitting}
                  className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAdjustDivision}
                  disabled={isSubmitting || sumOfAdjustedPartsCents !== rental.totalAmountCents}
                  className="rounded-lg bg-emerald-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Confirmar Ajuste'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE SELEÇÃO DE COMANDA DE BAR PARA VINCULAR */}
      {/* ========================================================================= */}
      {linkBarParticipantId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-2xs">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Vincular Comanda do Bar</h3>
                <p className="text-2xs text-slate-500">
                  Selecione uma comanda individual aberta para receber junto com a quadra
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLinkBarParticipantId(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {openIndividualComandas.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-3 text-center">
                  Não há comandas individuais abertas no momento.
                </p>
              ) : (
                <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  {openIndividualComandas.map(cmd => {
                    const balance =
                      cmd.items.reduce((acc, it) => acc + it.priceCents * it.quantity, 0) -
                      cmd.payments.reduce((acc, p) => acc + p.amountCents, 0);

                    return (
                      <button
                        key={cmd.id}
                        type="button"
                        onClick={async () => {
                          try {
                            await linkBarComanda(rental.id, linkBarParticipantId, cmd.id);
                            setLinkBarParticipantId(null);
                          } catch (err) {
                            setActionError(err instanceof Error ? err.message : 'Falha ao vincular comanda.');
                          }
                        }}
                        className="w-full p-2.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
                      >
                        <div>
                          <p className="text-xs font-bold text-slate-900">
                            Comanda #{cmd.number} • {cmd.name}
                          </p>
                          <p className="text-2xs text-slate-500">
                            {cmd.items.length} itens lançados
                          </p>
                        </div>
                        <span className="text-xs font-bold text-emerald-900">
                          {formatCents(balance)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setLinkBarParticipantId(null)}
                  className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
