# CIFREN — API interna das telas (contrato da Fase A)

Base: mesma origem do site, prefixo `/api`. JSON em UTF-8. Datas `YYYY-MM-DD`; instantes ISO 8601; valores em reais como número com 2 casas (ex.: `1234.5`).

## Regras gerais
- **Sessão:** cookie HttpOnly `__Host-cifren_s` (em desenvolvimento `cifren_s`), definido pelo servidor no login. O site nunca lê o cookie; usa `fetch(..., { credentials: 'same-origin' })`.
- **Toda requisição que altera dados** (POST/PUT/PATCH/DELETE) precisa do cabeçalho `X-CIFREN: 1` (proteção CSRF). Sem ele: 403.
- **Erros:** `{ "error": "mensagem em português", "code"?: "CODIGO", ...extra }` com status HTTP. 401 = sessão expirada (ir para /entrar). 403 = sem permissão (mostrar a mensagem). 402 = assinatura suspensa (`code: TENANT_BLOCKED`). 403 com `code: FEATURE_DISABLED` = módulo fora do plano.
- **Listas paginadas:** `?limit=50&cursor=<texto>`; resposta `{ items: [...], next_cursor: "..." | null }`.
- **Permissões:** a API devolve 403 quando falta permissão; o site esconde o que o usuário não pode fazer usando `permissions` do `/api/auth/me`.

## Autenticação (`/api/auth`)
| Método e rota | Corpo | Resposta |
|---|---|---|
| `GET /api/auth/state` | — | `{ signup_open: true }` |
| `POST /api/auth/signup` | `{ name, email, password, company_name, document? }` | 201 `{ ok: true }` + cookie de sessão (cria a organização, a primeira empresa e o usuário dono) |
| `POST /api/auth/login` | `{ email, password }` | `{ ok: true }` + cookie, **ou** `{ mfa_required: true, mfa_token }` |
| `POST /api/auth/mfa` | `{ mfa_token, code }` (código de 6 dígitos ou código de recuperação) | `{ ok: true }` + cookie |
| `POST /api/auth/logout` | — | `{ ok: true }` |
| `GET /api/auth/me` | — | ver abaixo |
| `POST /api/auth/switch-org` | `{ org_id }` | `{ ok: true }` |
| `PUT /api/auth/password` | `{ current_password, new_password }` | `{ ok: true }` (encerra as outras sessões) |
| `POST /api/auth/mfa/setup` | — | `{ secret, otpauth_url }` (mostrar QR do `otpauth_url` e o segredo para digitar) |
| `POST /api/auth/mfa/enable` | `{ code }` | `{ recovery_codes: ["xxxx-xxxx", ...] }` (mostrar uma única vez) |
| `POST /api/auth/mfa/disable` | `{ password }` | `{ ok: true }` |
| `GET /api/auth/sessions` | — | `{ items: [{ id, created_at, last_seen_at, ip, user_agent, current }] }` |
| `DELETE /api/auth/sessions/:id` | — | `{ ok: true }` |

Senha: mínimo 10 caracteres, com letras e números; mensagens de erro em português vêm da API.

`GET /api/auth/me`:
```json
{
  "user": { "id": "uuid", "name": "Leandro", "email": "x@y.com", "mfa_enabled": false },
  "org": { "id": "uuid", "name": "Minha Empresa" },
  "orgs": [{ "id": "uuid", "name": "Minha Empresa", "role_name": "Dono" }],
  "role": { "key": "dono", "name": "Dono" },
  "permissions": ["financeiro.titulos.visualizar", "..."],
  "companies": [{ "id": "uuid", "name": "Loja Centro", "document": "12.345.678/0001-90" }],
  "company_scope": null,
  "modules": { "financeiro": true, "conciliacao_bancaria": true, "cofre_sieg": false },
  "access": { "status": "TRIAL", "blocked": false, "trial_ends_at": "2026-11-03" }
}
```
`company_scope: null` = todas as empresas; senão lista de ids permitidos. `access: null` = sem central de assinaturas (acesso livre).

## Catálogo de permissões e perfis
`GET /api/roles` → `{ catalog: [{ group: "Financeiro", items: [{ code, label, risk: "baixo"|"medio"|"alto" }] }], roles: [{ id, key, name, system, permissions: [codes], members: n }] }`
`POST /api/roles` `{ name, permissions: [codes], copy_from?: role_id }` · `PUT /api/roles/:id` `{ name?, permissions? }` (perfis de sistema: só o Dono não pode ser alterado) · `DELETE /api/roles/:id` (só sem membros e não-sistema).

Códigos (Fase A):
`financeiro.titulos.visualizar`, `financeiro.titulos.criar`, `financeiro.titulos.editar`, `financeiro.titulos.baixar`, `financeiro.titulos.cancelar`, `financeiro.painel.visualizar`, `cadastros.visualizar`, `cadastros.gerenciar`, `contas.gerenciar`, `empresas.gerenciar`, `usuarios.gerenciar`, `perfis.gerenciar`, `auditoria.visualizar`, `relatorios.visualizar`, `configuracoes.gerenciar`.

Perfis de sistema: `dono`, `administrador`, `financeiro`, `lancamentos`, `contador`, `auditor`.

## Empresas (CNPJs) — `/api/companies`
`GET` → `{ items: [{ id, name, trade_name, document, timezone, active }] }` · `POST` `{ name, trade_name?, document?, timezone? }` · `PUT /:id` · `DELETE /:id` (arquiva; não apaga).

## Usuários — `/api/users`
`GET` → `{ items: [{ id, name, email, role_key, role_name, company_ids: null|[ids], active, last_login_at, mfa_enabled }] }`
`POST` `{ name, email, role_key, company_ids?: null|[ids] }` → 201 `{ id, temporary_password }` (mostrar uma única vez; o usuário troca no primeiro acesso)
`PUT /:id` `{ role_key?, company_ids?, active? }` · `POST /:id/reset-password` → `{ temporary_password }`
Regras: ninguém dá perfil com mais permissões do que tem; o último Dono não pode ser desativado nem rebaixado.

## Auditoria — `GET /api/audit?entity=&user_id=&from=&to=&limit=&cursor=`
`{ items: [{ id, at, user_name, action, entity, entity_id, summary, ip }], next_cursor }`

## Cadastros
- `GET /api/counterparties?q=&kind=cliente|fornecedor&active=true` → `{ items: [{ id, kind: "cliente"|"fornecedor"|"ambos", name, document, email, phone, notes, active }] }`; `POST`, `PUT /:id`, `DELETE /:id` (arquiva).
- `GET /api/categories` → `{ items: [{ id, name, type: "receita"|"despesa", parent_id, active }] }`; `POST { name, type, parent_id? }`, `PUT /:id`, `DELETE /:id` (arquiva). Uma organização nova já vem com categorias padrão.
- `GET /api/cost-centers` → `{ items: [{ id, name, active }] }`; `POST { name }`, `PUT /:id`, `DELETE /:id`.
- `GET /api/accounts` → `{ items: [{ id, company_id, name, type: "banco"|"caixa"|"cartao"|"aplicacao", bank_name, agency, number, opening_balance, opening_date, balance, active }] }`; `POST { company_id, name, type, bank_name?, agency?, number?, opening_balance?, opening_date? }`, `PUT /:id`, `DELETE /:id` (arquiva).

## Contas a pagar e a receber — `/api/titles`
- `GET /api/titles?kind=pagar|receber&status=abertos|vencidos|pagos|cancelados|todos&from=&to=&company_id=&q=&limit=&cursor=` (datas filtram o vencimento) →
```json
{ "items": [{ "id": "uuid", "kind": "pagar", "description": "Aluguel", "counterparty": { "id": "uuid", "name": "Imobiliária" },
  "category": { "id": "uuid", "name": "Aluguel" }, "cost_center": null, "company": { "id": "uuid", "name": "Loja" },
  "document_number": "123", "issue_date": "2026-10-01", "competence_date": "2026-10-01", "due_date": "2026-10-10",
  "amount": 2000, "paid_amount": 0, "open_amount": 2000, "status": "aberto", "overdue": false,
  "installment": 1, "installments": 1 }],
  "totals": { "amount": 2000, "paid": 0, "open": 2000 }, "next_cursor": null }
```
  `status`: `aberto`, `parcial`, `pago`, `cancelado`.
- `POST /api/titles` `{ kind, company_id, description, due_date, amount, counterparty_id?, category_id?, cost_center_id?, document_number?, issue_date?, competence_date?, notes?, installments?: 1..120, interval?: "mensal"|"quinzenal"|"semanal"|"anual" }` → 201 `{ ids: [...] }` (parcelas com o valor dividido; centavos na última).
- `GET /api/titles/:id` → título + `settlements: [{ id, account: { id, name }, paid_at, amount, interest, fine, discount, method, reversed_at, notes }]`.
- `PUT /api/titles/:id` (só abertos sem baixa podem mudar valor; descrição/categoria/centro/vencimento sempre).
- `POST /api/titles/:id/settle` `{ account_id, paid_at, amount, interest?, fine?, discount?, method?: "pix"|"boleto"|"dinheiro"|"cartao"|"transferencia"|"outro", notes? }` → `{ ok: true, status }` (baixa parcial permitida).
- `POST /api/settlements/:id/reverse` `{ reason }` (estorno; o título volta a aberto/parcial).
- `POST /api/titles/:id/cancel` `{ reason }` (só sem baixa ativa).

## Painel — `GET /api/dashboard?company_id=`
```json
{
  "cash": { "total": 15320.1, "accounts": [{ "id": "uuid", "name": "Banco X", "type": "banco", "balance": 12000 }] },
  "payables": { "overdue": { "n": 2, "amount": 900 }, "next7": { "n": 3, "amount": 2500 }, "month": { "amount": 8000 } },
  "receivables": { "overdue": { "n": 1, "amount": 300 }, "next7": { "n": 4, "amount": 5200 }, "month": { "amount": 12000 } },
  "flow": [{ "date": "2026-10-20", "in": 0, "out": 500, "balance": 14820.1 }],
  "expenses_by_category": [{ "name": "Aluguel", "amount": 2000 }],
  "upcoming": [ /* próximos 8 títulos abertos, mesmo formato da lista */ ]
}
```
`flow`: próximos 30 dias, saldo projetado a partir do caixa atual e dos títulos em aberto (vencidos entram hoje).

## Saúde — `GET /api/health` → `{ ok: true, version }`
