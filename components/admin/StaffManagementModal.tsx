'use client';

import React, { useState } from 'react';
import { useComandas } from '@/context/ComandasContext';
import { StaffMember, StaffRole } from '@/lib/types';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  X,
  AlertCircle,
  KeyRound,
  Info,
} from 'lucide-react';

interface StaffManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StaffManagementModal({ isOpen, onClose }: StaffManagementModalProps) {
  const {
    currentStaff,
    staffList,
    addNewStaff,
    toggleStaff,
    changeRole,
  } = useComandas();

  const [isAdding, setIsAdding] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<StaffRole>('operator');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const isAdmin = currentStaff?.role === 'admin';

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);
    setIsSubmitting(true);

    try {
      const res = await addNewStaff(newEmail, newName, newRole);
      if (!res.success) {
        setActionError(res.error || 'Erro ao cadastrar funcionário.');
        return;
      }

      setActionSuccess(`Funcionário "${newName}" autorizado com sucesso.`);
      setNewEmail('');
      setNewName('');
      setNewRole('operator');
      setIsAdding(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (member: StaffMember) => {
    if (member.uid === currentStaff?.uid) {
      setActionError('Você não pode desativar seu próprio acesso.');
      return;
    }
    setActionError(null);
    const nextStatus = !member.active;
    const res = await toggleStaff(member.uid, nextStatus);
    if (!res.success) {
      setActionError(res.error || 'Falha ao alterar status do funcionário.');
    } else {
      setActionSuccess(`Status de ${member.name} alterado para ${nextStatus ? 'Ativo' : 'Inativo'}.`);
    }
  };

  const handleChangeRole = async (member: StaffMember) => {
    if (member.uid === currentStaff?.uid) {
      setActionError('Você não pode alterar seu próprio perfil de acesso.');
      return;
    }
    setActionError(null);
    const nextRole: StaffRole = member.role === 'admin' ? 'operator' : 'admin';
    const res = await changeRole(member.uid, nextRole);
    if (!res.success) {
      setActionError(res.error || 'Falha ao alterar perfil do funcionário.');
    } else {
      setActionSuccess(`Perfil de ${member.name} alterado para ${nextRole === 'admin' ? 'Administrador' : 'Operador'}.`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-900">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Gestão de Equipe & Controle de Acesso
              </h2>
              <p className="text-xs text-slate-500">
                Acesso restrito a funcionários autorizados (Administrador & Operador)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mensagens de feedback */}
        {actionError && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {actionSuccess && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Conteúdo scrollável */}
        <div className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Caixa explicativa sobre bootstrap controlado */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900 flex items-start gap-2.5">
            <Info className="h-4 w-4 text-blue-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-blue-950">
                Cadastro Controlado do Primeiro Administrador & Regras ABAC
              </p>
              <p className="text-blue-800 leading-relaxed">
                O primeiro Administrador é autenticado de forma estrita através do e-mail verificado{' '}
                <code className="font-mono bg-blue-100 px-1 py-0.5 rounded text-[11px]">
                  caueoliveira46@gmail.com
                </code>
                . Nenhum usuário comum pode se auto-cadastrar nem elevar suas permissões. Novos operadores ou administradores devem ser adicionados aqui por um administrador já ativo.
              </p>
            </div>
          </div>

          {/* Botão de adicionar novo funcionário */}
          {isAdmin && !isAdding && (
            <div className="flex justify-between items-center pt-1">
              <span className="text-xs font-semibold text-slate-700">
                Funcionários Cadastrados ({staffList.length})
              </span>
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-900 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-800"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Autorizar Novo Funcionário</span>
              </button>
            </div>
          )}

          {/* Formulário de cadastro de funcionário */}
          {isAdding && (
            <form onSubmit={handleCreate} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <UserPlus className="h-4 w-4 text-emerald-800" />
                  Cadastrar Novo Membro da Equipe
                </span>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nome Completo</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Ex: Carlos Barman"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">E-mail da Conta Google</label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="carlos@gmail.com"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-emerald-800 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="block font-medium text-slate-700 mb-1">Perfil de Acesso</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="role"
                      value="operator"
                      checked={newRole === 'operator'}
                      onChange={() => setNewRole('operator')}
                      className="text-emerald-900"
                    />
                    <span>
                      <strong>Operador</strong> (Lança itens, atende comandas e registra pagamentos)
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="role"
                      value="admin"
                      checked={newRole === 'admin'}
                      onChange={() => setNewRole('admin')}
                      className="text-emerald-900"
                    />
                    <span>
                      <strong>Administrador</strong> (Acesso total + Gestão de equipe)
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-emerald-900 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-800 disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar Autorização'}
                </button>
              </div>
            </form>
          )}

          {/* Lista de membros */}
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
            {staffList.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Nenhum funcionário cadastrado na base remota ainda.
              </div>
            ) : (
              staffList.map(member => {
                const isSelf = member.uid === currentStaff?.uid;
                return (
                  <div
                    key={member.uid}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 gap-2 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                          member.role === 'admin'
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {member.role === 'admin' ? (
                          <ShieldCheck className="h-5 w-5 text-emerald-800" />
                        ) : (
                          <Users className="h-5 w-5 text-slate-600" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{member.name}</span>
                          {isSelf && (
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 border border-emerald-200">
                              Você
                            </span>
                          )}
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                              member.role === 'admin'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {member.role === 'admin' ? 'Administrador' : 'Operador'}
                          </span>
                          <span
                            className={`flex items-center gap-1 text-[11px] font-medium ${
                              member.active ? 'text-emerald-700' : 'text-slate-400 line-through'
                            }`}
                          >
                            {member.active ? (
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <XCircle className="h-3 w-3 text-slate-400" />
                            )}
                            {member.active ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{member.email}</p>
                      </div>
                    </div>

                    {/* Ações administrativas */}
                    {isAdmin && !isSelf && (
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleChangeRole(member)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                          title="Alternar entre Administrador e Operador"
                        >
                          Tornar {member.role === 'admin' ? 'Operador' : 'Admin'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggle(member)}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                            member.active
                              ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                              : 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                          }`}
                        >
                          {member.active ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Rodapé */}
        <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
