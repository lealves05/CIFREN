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

---

# FASE B — arquitetura completa (módulos, entradas, agentes de IA, saídas)

Mesmas regras gerais (cookie, `X-CIFREN: 1`, erros em português, `?limit&cursor`). Toda rota abaixo respeita `company_scope` e permissões; o site esconde o que o usuário não pode usar (lista em `me.permissions`).
Os módulos novos também respeitam o plano (`me.modules`): 403 `FEATURE_DISABLED` mostra "Módulo fora do seu plano".

## Perfis e permissões novos
Perfis de sistema agora: `dono`, `administrador`, `gestor`, `financeiro`, `aprovador`, `lancamentos`, `colaborador`, `contador`, `auditor`.
Códigos novos (além dos da Fase A):
`aprovacoes.aprovar`, `aprovacoes.configurar`, `conciliacao.importar`, `conciliacao.conciliar`, `recorrencias.gerenciar`, `previsao.visualizar`,
`relatorios.dre`, `exportacao.contabil`, `compras.solicitar`, `compras.aprovar`, `compras.gerenciar`, `despesas.solicitar`, `despesas.aprovar`, `despesas.pagar`,
`documentos.visualizar`, `documentos.enviar`, `documentos.gerenciar`, `ia.usar`, `ia.configurar`, `integracoes.gerenciar`, `notificacoes.configurar`,
`cadastros.dados_sensiveis` (ver CPF/CNPJ, e-mail e telefone completos; sem ela vêm mascarados, ex.: `***.***.789-**`), `seguranca.configurar`.
`GET /api/roles` já devolve o catálogo atualizado (grupos novos: Aprovações, Conciliação, Previsão e recorrências, Relatórios, Compras, Despesas e reembolsos, Documentos, Inteligência artificial, Integrações, Segurança).

## Aprovações — `/api/approvals`
- `GET /api/approvals?status=pendente|aprovado|reprovado|todos&entity=title|purchase|expense` → `{ items: [{ id, entity, entity_id, company: {id,name}, summary, amount, requested_by: {id,name}, requested_at, status, decided_by, decided_at, reason, can_decide }] }`.
  `can_decide=false` quando o usuário é quem pediu (quem pede não aprova) ou não tem a permissão.
- `POST /api/approvals/:id/approve` `{ note? }` · `POST /api/approvals/:id/reject` `{ reason }` (obrigatório) → `{ ok: true }`.
- Regras (alçadas): `GET /api/approval-rules` → `{ items: [{ id, entity: "title"|"purchase"|"expense", company_id|null, min_amount, active }] }`; `POST`, `PUT /:id`, `DELETE /:id` (`aprovacoes.configurar`).
- Efeito em contas a pagar: título a pagar com valor ≥ alçada nasce com `approval_status: "pendente"`; baixa recusada (409 `APPROVAL_REQUIRED`) até aprovar. Reprovado não paga (pode cancelar). Os títulos (lista e detalhe) ganham `approval_status: null|"pendente"|"aprovado"|"reprovado"`.

## Conciliação bancária — `/api/reconciliation`
- `POST /api/reconciliation/imports` `{ account_id, filename, content_base64 }` (OFX ou CSV, até 5 MB) → 201 `{ id, lines: n, duplicates: n, period: {from,to} }`. CSV: o servidor detecta colunas de data, descrição e valor (ou crédito/débito) com `;` ou `,`.
- `GET /api/reconciliation/imports?account_id=` → `{ items: [{ id, account: {id,name}, filename, created_at, lines, matched, pending }] }`.
- `GET /api/reconciliation/lines?account_id=&status=pendente|conciliada|ignorada|todas&limit&cursor` → `{ items: [Linha], next_cursor }`. Linha:
```json
{ "id": "uuid", "account": {"id":"uuid","name":"Banco X"}, "date": "2026-10-10", "description": "PIX ENVIADO CPFL", "amount": -612.4,
  "status": "pendente|conciliada|ignorada", "settlement_id": null, "title": null,
  "suggestions": [{ "type": "title", "title_id": "uuid", "description": "CPFL — out/26", "counterparty": "CPFL", "due_date": "2026-10-10", "open_amount": 612.4, "score": 0.95, "reason": "mesmo valor, vencimento no mesmo dia" },
                  { "type": "settlement", "settlement_id": "uuid", "description": "…", "paid_at": "…", "amount": 612.4, "score": 0.9, "reason": "baixa já lançada com mesmo valor" }] }
```
  `amount` negativo = saída (débito); positivo = entrada.
- `POST /api/reconciliation/lines/:id/match` `{ title_id }` → baixa o título pelo valor da linha (data da linha, conta da linha) e marca conciliada. `{ settlement_id }` → só liga a uma baixa já existente.
- `POST /api/reconciliation/lines/:id/create` `{ description, category_id?, counterparty_id?, cost_center_id? }` → cria título + baixa a partir da linha (despesa/receita avulsa, ex.: tarifa bancária).
- `POST /api/reconciliation/lines/:id/ignore` `{ reason? }` · `POST /api/reconciliation/lines/:id/undo` (desfaz: se a conciliação criou a baixa, estorna).
- `POST /api/reconciliation/auto` `{ account_id }` → concilia sozinho só as sugestões com `score ≥ 0.95` e valor exato → `{ matched: n }`.
- `POST /api/reconciliation/lines/:id/ai-suggest` → `{ category_id, category_name, counterparty_name, confidence, reason }` (Agente de Conciliação; precisa da IA ligada; 409 `AI_NOT_CONFIGURED`).

## Compromissos recorrentes e previsão — `/api/recurring`
- `GET /api/recurring` → `{ items: [Compromisso] }`. Compromisso:
```json
{ "id": "uuid", "kind": "pagar|receber", "name": "CPFL — loja centro", "company": {...}, "counterparty": {...}|null, "category": {...}|null, "cost_center": null,
  "frequency": "mensal|bimestral|trimestral|semestral|anual|semanal|quinzenal", "due_day": 10, "start_date": "2026-01-10", "end_date": null,
  "method": "fixo|media|manual", "average_n": 6, "estimated_amount": 450, "tolerance_pct": 15, "lead_days": 10, "status": "ativo|pausado|encerrado",
  "next_due": "2026-11-10", "next_estimated": 455.2, "last_actual": 470.1, "avg_error_pct": 4.2 }
```
- `POST /api/recurring` (campos acima, sem os calculados) · `PUT /:id` (afeta só ocorrências futuras previstas) · `POST /:id/pause` · `POST /:id/resume` · `POST /:id/end`.
- Modelos prontos: `GET /api/recurring/templates` → `[{ key, name, kind, category_name, method, frequency }]` (Conta de energia, Aluguel, Água, Internet/telefone, Mensalidade de cliente, Salário, Assinatura de sistema, Contador).
- Ocorrências: `GET /api/recurring/:id/occurrences` → `{ items: [{ id, due_date, estimated_amount, actual_amount, diff_amount, diff_pct, status: "prevista|lancada|real", title_id, estimate_explain }] }`.
  - `estimate_explain`: texto ("média dos últimos 6 valores reais: 430, 452, …").
  - `POST /api/recurring/occurrences/:id/actual` `{ amount }` → informa o valor real (atualiza o título ligado, se existir); `PUT /api/recurring/occurrences/:id` `{ estimated_amount }` corrige a estimativa daquele mês.
- O sistema gera as ocorrências previstas para 12 meses e cria a conta a pagar/receber `lead_days` antes do vencimento, marcada com `estimated: true` ("valor estimado — aguardando a conta"). Títulos ganham `estimated: boolean` e `recurring: { id, name }|null`.
- Relatório: `GET /api/recurring/report?year=2026` → `{ months: [{ month: "2026-01", fixed_estimated, fixed_actual, recurring_revenue_estimated, recurring_revenue_actual }], deviations: [{ commitment, month, estimated, actual, diff_pct }], break_even_month: { month, required_revenue } }`.

## Relatórios — `/api/reports`
- Fluxo de caixa previsto × realizado: `GET /api/reports/cashflow?from=2026-01&to=2026-12&company_id=` →
  `{ months: [{ month, realized_in, realized_out, forecast_in, forecast_out, realized_balance, forecast_balance }], opening_balance, notes: ["Previsto = títulos em aberto + compromissos recorrentes previstos; realizado = baixas."] }`.
- DRE gerencial: `GET /api/reports/dre?year=2026&basis=competencia|caixa&company_id=` →
```json
{ "basis": "competencia", "months": ["2026-01", "..."], "rows": [
  { "key": "receita_bruta", "label": "Receita bruta", "type": "group", "values": [..12], "total": 0 },
  { "key": "cat:<uuid>", "label": "Vendas de produtos", "type": "category", "parent": "receita_bruta", "values": [...], "total": 0 },
  { "key": "receita_liquida", "label": "Receita líquida", "type": "subtotal", "values": [...], "total": 0 } ],
  "premises": ["DRE gerencial por competência; não substitui o demonstrativo contábil oficial.", "..."] }
```
  Grupos: `receita_bruta`, `deducoes`, `receita_liquida` (subtotal), `custos`, `lucro_bruto` (subtotal), `despesas_operacionais`, `resultado_operacional` (subtotal), `outras_receitas`, `despesas_financeiras`, `resultado_liquido` (subtotal), `sem_grupo` (categorias sem grupo — mostrar aviso).
  Categorias ganham `dre_group` (editável em Cadastros › Categorias: select com os grupos acima, exceto subtotais).
- Custos por centro de custo: `GET /api/reports/cost-centers?from=YYYY-MM&to=YYYY-MM` → `{ items: [{ cost_center: {id,name}|null, expenses, revenues, result }] }`.
- Aging (inadimplência): `GET /api/reports/aging?kind=receber|pagar` → `{ buckets: [{ label: "a vencer", amount, n }, { label: "1–30 dias" }, { label: "31–60" }, { label: "61–90" }, { label: "> 90" }], top: [{ counterparty, amount, n }] }`.

## Compras — `/api/purchases`
- `GET /api/purchases?status=&mine=1` → `{ items: [{ id, number, company, requester: {id,name}, title, items: [{ description, qty, unit_price }], total, needed_by, supplier: {id,name}|null, status: "solicitada|aprovada|reprovada|pedido|recebida|faturada|cancelada", approval_status, title_id, created_at }] }`. `mine=1` = só as minhas (Colaborador vê só as dele).
- `POST /api/purchases` `{ company_id, title, items, needed_by?, notes?, category_id?, cost_center_id? }` (`compras.solicitar`) → 201. Vai para aprovação se a alçada pedir; senão já `aprovada`.
- `POST /api/purchases/:id/order` `{ supplier_id, total?, expected_at? }` (`compras.gerenciar`; só aprovada) · `POST /:id/receive` · `POST /:id/invoice` `{ due_date, amount?, installments?, document_id? }` → cria a conta a pagar (`faturada`) · `POST /:id/cancel` `{ reason }`.
- Agente de Compras: `GET /api/purchases/:id/supplier-suggestions` → `{ items: [{ supplier: {id,name}, reason: "comprou 4 vezes nesta categoria; último valor R$ 320,00 em 12/09", last_price, n }] }` (histórico; sem IA não inventa).

## Despesas e reembolsos — `/api/expenses`
- `GET /api/expenses?status=&mine=1` → `{ items: [{ id, number, company, user: {id,name}, title, items: [{ date, description, category_id, amount, document_id }], total, status: "rascunho|enviada|aprovada|reprovada|paga", approval_status, title_id, created_at }] }`.
- `POST /api/expenses` `{ company_id, title, items }` (`despesas.solicitar`) → rascunho · `PUT /:id` (só rascunho, só o dono) · `POST /:id/submit` (vai para aprovação) ·
  `POST /:id/pay` `{ account_id, paid_at }` (`despesas.pagar`, só aprovada: cria conta a pagar "Reembolso — <nome>" e já baixa) → `paga`.
- Comprovantes: `document_id` vem de `POST /api/documents`.

## Documentos — `/api/documents`
- `POST /api/documents` `{ company_id, filename, mime, content_base64, kind?: "auto" }` (até 10 MB; PDF, JPG, PNG, XML) → 201 Documento (a leitura de XML é imediata; imagem/PDF fica `aguardando_ia` ou `recebido` se a IA estiver desligada).
- `POST /api/documents/code` `{ company_id, text }` → lê **linha digitável de boleto** (47/48 dígitos), **Pix copia-e-cola** (BR Code) ou **QR da NFC-e** (link da SEFAZ) e devolve um Documento sem arquivo.
- Documento:
```json
{ "id": "uuid", "kind": "nfe|nfce|boleto|pix|comprovante|imagem|pdf|outro", "filename": "...", "mime": "...", "size": 12345, "sha256": "...",
  "status": "recebido|processado|aguardando_ia|vinculado|descartado", "duplicate_of": null,
  "extracted": { "supplier_name": "...", "supplier_document": "12.345.678/0001-90", "number": "123", "issue_date": "2026-10-01", "total": 1500,
                 "access_key": "3526…", "due_dates": [{ "number": "001", "due_date": "2026-11-10", "amount": 750 }], "barcode": "...", "bank": "341",
                 "pix_key": "...", "confidence": 0.9, "source": "xml|boleto|pix|nfce|ia" },
  "warnings": ["Soma das duplicatas diferente do total"], "links": [{ "entity": "title", "id": "uuid" }], "created_at": "...", "uploaded_by": {...} }
```
- `GET /api/documents?status=&kind=&q=&limit&cursor` · `GET /api/documents/:id` · `GET /api/documents/:id/file` (o arquivo) · `POST /api/documents/:id/discard`.
- `POST /api/documents/:id/extract` → (re)extrai com IA (Agente de Documentos; 409 `AI_NOT_CONFIGURED` sem IA).
- `POST /api/documents/:id/create-titles` `{ kind: "pagar"|"receber", counterparty_id?, category_id?, cost_center_id?, due_dates?: [{ due_date, amount }] }` → cria uma conta por duplicata (ou uma só), liga ao documento → `{ ids }`. 409 `DUPLICATE` se a mesma nota já foi lançada.
- `POST /api/documents/:id/link` `{ entity: "title", id }` (comprovante → título).
- Títulos ganham `documents: [{ id, filename, kind }]` no detalhe.

## Agentes de IA — `/api/ai`
- Configuração (`ia.configurar`): `GET /api/ai/settings` → `{ enabled, model, models: [{id,name}], key_set, monthly_limit, used_this_month }`; `PUT /api/ai/settings` `{ enabled?, model?, api_key?, monthly_limit? }` (a chave nunca volta). Provedor: Anthropic (Claude).
- Agente Financeiro: `POST /api/ai/ask` `{ question }` (`ia.usar`) → `{ answer, sources: ["Caixa atual (contas ativas)", "Títulos em aberto até 2026-11-20", …], period }`. 409 `AI_NOT_CONFIGURED`.
- Agente de Insights: `GET /api/insights` (sem IA, sempre) → `{ items: [{ level: "risco|atencao|oportunidade", title, detail, link }] }`; `POST /api/ai/insights` → mesmo formato, com texto da IA (`ia.usar`).
- Os outros agentes estão nas rotas de cada módulo (documentos, conciliação, compras).

## Exportações — `/api/export` (`relatorios.visualizar`; contábil exige `exportacao.contabil`)
`GET /api/export/titles.csv|titles.xlsx?kind=&from=&to=&status=` · `GET /api/export/dre.xlsx?year=&basis=` · `GET /api/export/cashflow.xlsx?from=&to=` ·
`GET /api/export/contabil.csv?from=YYYY-MM-DD&to=YYYY-MM-DD` (lançamentos: data; conta débito; conta crédito; valor; histórico; documento — layout genérico para importação pelo contador; **não é SPED**).
Baixar com `<a href>` (cookie vai junto).

## Notificações — `/api/notifications`
- `GET /api/notifications?unread=1` → `{ items: [{ id, kind, title, body, link, created_at, read_at }], unread: n }`; `POST /api/notifications/:id/read` · `POST /api/notifications/read-all`.
- Preferências do usuário: `GET/PUT /api/notifications/preferences` `{ email_daily: boolean }` (resumo diário por e-mail, se o e-mail da instalação estiver configurado).
- Configuração do e-mail da instalação (`notificacoes.configurar`, só Dono): `GET/PUT /api/notifications/email-settings` `{ host, port, user, password?, from, secure }` (senha nunca volta) · `POST /api/notifications/email-test`.
- WhatsApp: ainda não (aparece "em breve").

## Integrações com os sistemas LORLER — `/api/integrations`
- `GET /api/integrations` (`integracoes.gerenciar`) → `{ items: [{ id, system: "orbi|torven|rusten|apolven|cerebro", name, prefix: "ck_torven_ab12", scopes, created_at, last_used_at, active }], endpoint: "https://cifren.lorler.com.br/api/integrations/lorler/v1" }`.
- `POST /api/integrations` `{ system, name }` → `{ id, key }` (a chave aparece **uma vez**; o cliente cola no sistema de origem) · `DELETE /api/integrations/:id` (revoga).
- Recebimento (usado pelos sistemas, não pelo site): `POST /api/integrations/lorler/v1/movements` com `Authorization: Bearer <chave>`; `GET /api/integrations/lorler/v1/indicators` (só leitura, para o Cérebro).
- Movimentos importados aparecem nos títulos com `source: "torven"` etc. (lista de títulos ganha `source`).

## Segurança da organização — `/api/security`
- `GET/PUT /api/security` `{ require_mfa: boolean }` (`seguranca.configurar`): exige 2 etapas de todos; quem não tiver recebe 403 `MFA_SETUP_REQUIRED` (levar a /conta, mesmo fluxo do CFTV).

## Painel (acréscimos)
`GET /api/dashboard` ganha `pending_approvals: n`, `reconciliation_pending: n`, `documents_pending: n`, `recurring_missing: [{ name, due_date, estimated }]` (contas recorrentes que ainda não chegaram) e `insights: [até 3 do /api/insights]`.

---
# ASSOCIADOS E MENSALIDADES — `/api/members` (permissões `associados.visualizar`, `associados.gerenciar`, `associados.configurar`)
- `GET /api/members?q=&situacao=atraso|em_dia&status=ativo|suspenso|encerrado|todos` → `{ items: [Associado + overdue{count,amount,oldest_due,days}, next_fee, last_payment], totals }`.
- `POST /api/members` `{ company_id, name, email?, whatsapp?, document?, monthly_fee, due_day, start_month: "AAAA-MM", category_id?, notify_email, notify_whatsapp, notes? }` → gera as mensalidades (contas a receber `source: "mensalidade"`) do mês de início até o mês que vence nos próximos 15 dias.
- `GET/PUT /api/members/:id` (`apply_to_open` ajusta valor/dia das em aberto sem pagamento) · `POST /:id/status {status, end_month?}` · `DELETE /:id` (só sem pagamento) · `POST /:id/generate`.
- Cobrança: `POST /:id/remind {channel: email|whatsapp}` · `POST /:id/whatsapp-link` → `{ url: "https://wa.me/…?text=…", text }` · `POST /fees/:titleId/pay`.
- Relatório: `GET /api/members/overdue` · `/overdue.csv` · `/overdue.xlsx` · `POST /overdue/send-report` (para o e-mail de quem pediu).
- Avisos: `GET/PUT /api/members/settings` (dias depois do vencimento, lembrete antes, horário, textos com {nome} {valor} {descricao} {vencimento} {meses} {empresa} {pix}, chave Pix, WhatsApp oficial da Meta: ID do número, token cifrado, modelos aprovados; relatório semanal) · `POST /settings/test-whatsapp {to}`.
- Rotina (a cada 10 min): gera mensalidades, manda avisos automáticos (uma vez por etapa, só no horário) e o relatório semanal por e-mail + sino.
