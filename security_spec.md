# Especificação de Segurança Firestore — Engenho da Bola

## 1. Perfis de Acesso (RBAC / ABAC)
- **Anônimo / não verificado (`email_verified != true`)**: Bloqueado globalmente em todas as coleções (`/{document=**} allow read, write: if false`).
- **Administrador (`isAdmin()`)**:
  - Usuário ativo em `/staff/{uid}` com `role == 'admin' && active == true`, OU
  - Bootstrap inicial controlado por e-mail verificado (`caueoliveira46@gmail.com`).
  - *Nota sobre bootstrap*: Não há backend próprio / Admin SDK nem Custom Claims neste applet; remover o e-mail fixo em favor de um documento auto-provisionável sem verificação permitiria que qualquer usuário Google conectado antes do proprietário sequestrasse a conta de administrador. Mantém-se o e-mail verificado documentado como mecanismo seguro de bootstrap inicial até eventual migração para Custom Claims.
- **Operador (`isOperator()`)**:
  - Usuário ativo em `/staff/{uid}` com `role in ['operator', 'admin'] && active == true`, ou administrador bootstrap.

## 2. Matriz de Segurança por Coleção
| Coleção | `get` | `list` | `create` | `update` | `delete` | Regras de Integridade |
|---|---|---|---|---|---|---|
| `/staff/{staffUid}` | próprio UID ou Admin | Admin | Admin (ou self bootstrap) | Admin | Admin (`uid != self`) | Previne auto-elevação de cargo |
| `/metadata/{docId}` | Staff ativo | Admin | `comandas_counter`, `group_rentals_counter`: Operador/Admin; demais (`agenda_config`, etc.): **Admin** | Mesmo de create; contadores só avançam (`lastNumber >= existing.lastNumber`) | Admin | Separa contadores operacionais de configurações administrativas |
| `/comandas/{comandaId}` | Staff ativo | Staff ativo | Operador/Admin (`status == 'aberta'`, `payments == []`) | Operador/Admin (`existing.status == 'aberta'`) | Admin | `payments` append-only; `history` append-only; `priceCents` de itens já lançados imutável; quando `payments` muda, `items` deve ser idêntico |
| `/group_rentals/{rentalId}` | Staff ativo | Staff ativo | Operador/Admin (`status == 'aberta'`, `payments == []`) | Operador/Admin (`existing.status == 'aberta'`) | Admin | `payments` append-only; `history` append-only; `totalAmountCents` imutável |
| `/receipts/{receiptId}` | **Admin apenas** | **Admin apenas** | Operador/Admin (transação ao vivo) OU Admin (backfill histórico) | **`false` (proibido para todos)** | **`false` (proibido para todos)** | Append-only estrito; `amountCents > 0`; transação ao vivo exige `paidAt == request.time`, ausência de `dateKey` do cliente e acoplamento via `getAfter()` ao pagamento em `comandas`/`group_rentals`; backfill admin exige `paidAt <= request.time`, `dateKey` opcional (se presente, igual a `saoPauloDateKey(paidAt)`) e existência do doc de origem; dia contábil sempre derivado de `paidAt` em `America/Sao_Paulo` |
| `/products/{productId}` | Staff ativo | Staff ativo | Admin | Admin | Admin | Preços do cardápio controlados pelo Admin |
| `/appointments/{appointmentId}` | Staff ativo | Staff ativo | Operador/Admin | Operador/Admin | Admin | Fluxo operacional da agenda preservado |
| `/recurring_series/{seriesId}` | Staff ativo | Staff ativo | Operador/Admin | Operador/Admin | Admin | Séries da agenda preservadas |
| `/court_occupancy/{occupancyId}` | Staff ativo | Staff ativo | Operador/Admin | Operador/Admin | Admin | Controle de conflito por espaço/data preservado |
