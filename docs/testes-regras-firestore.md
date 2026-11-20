# Testes de Regras de Segurança e Relatórios — Engenho da Bola

## 1. Testes unitários (lógica pura de relatórios, paginação e backfill)
Execute sem necessidade do emulador:

```bash
npm test
```

Arquivo coberto:
- `lib/reports/reports.test.ts`

## 2. Testes das regras do Firestore (`firestore.rules`) com Firebase Emulator
Exige **Java (JRE/JDK 11+)** instalado no ambiente para iniciar o Cloud Firestore Emulator localmente:

```bash
npm run test:rules
```

O comando executa:
```bash
firebase emulators:exec --only firestore "vitest run --config vitest.rules.config.mts"
```

Cenários validados em `firestore.rules.test.ts`:
- Usuário anônimo bloqueado em todas as coleções.
- Operador bloqueado de ler (`get` e `list`) `receipts`.
- Administrador autorizado a ler `receipts`.
- `update` e `delete` em `receipts` proibidos para todos (inclusive administrador).
- Operador bloqueado ao tentar gravar `receipt` avulso sem transação no documento de origem (`comandas` ou `group_rentals`).
- Operador autorizado a registrar pagamento e criar o `receipt` correspondente na mesma transação atômica com `serverTimestamp()`.
- Operador bloqueado ao tentar editar/apagar itens antigos de `payments`, `history` ou alterar `priceCents` de itens já lançados em `comandas`.
- Operador autorizado a avançar contadores em `metadata`, porém bloqueado em configurações administrativas como `metadata/agenda_config` (exclusivo do administrador).

## 3. Scripts legados em `/scripts`
- `scripts/test-rules-operator.mjs` e `scripts/verify-all.mjs` foram convertidos para conectar ao **Firebase Emulator (`127.0.0.1:8080`) por padrão**, evitando acesso acidental ao banco real de produção (só acessam o banco real se `ALLOW_LIVE_DB_SMOKE_TEST=true` for definido explicitamente).
