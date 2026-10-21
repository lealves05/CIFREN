# Integração RUSTEN ⇄ CIFREN — associados, fiado e crédito (contrato v1)

Objetivo: no RUSTEN, o cliente marcado como **Associado** é cadastrado sozinho no CIFREN (Associados e mensalidades) e
toda a conta dele no RUSTEN (fiado, pagamento de fiado, crédito antecipado, uso de crédito, estorno, ajuste) aparece no CIFREN
ligada ao cadastro. Pagamentos de fiado registrados no CIFREN voltam para o RUSTEN.

## Conexão (1 código, sem digitar URL nem chave)
- No CIFREN: Configurações › Integrações › RUSTEN › **Conectar** gera um **código de conexão**:
  `LORLER1.` + base64url(JSON `{ "u": "<endpoint>", "k": "<chave ck_rusten_…>", "o": "<nome da organização>", "s": "rusten" }`)
  - `u` = `https://cifren.lorler.com.br/api/integrations/lorler/v1` (sem barra no fim).
- O CIFREN oferece o botão **Abrir o RUSTEN para conectar**: `https://rusten.lorler.com.br/configuracoes/cifren#codigo=<código>`
  (o código vai no `#`, que o navegador não envia ao servidor nem grava em log).
- No RUSTEN: Configurações › CIFREN: lê `#codigo=` (ou o usuário cola o código), chama `GET {u}/hello` com `Authorization: Bearer {k}`,
  mostra "Conectar ao CIFREN de <o>?" e grava (chave cifrada). Desconectar apaga a chave.

## API do CIFREN (Bearer ck_rusten_…; JSON; limite 120 req/min por chave)
### `GET {u}/hello` → `200 { ok: true, system: "rusten", org: "<nome>", features: ["members","account","payments"], settings: { member_fees: true } }`
### `POST {u}/members` `{ items: [Membro] }` (até 200) → `{ items: [{ external_id, member_id, result, error? }] }`
Membro: `{ external_id: "<id do cliente no RUSTEN, texto>", name, cpf: "11 dígitos"|null, phone|null, email|null, active: boolean }`
- `active: true` (etiqueta Associado ligada): cria ou atualiza o associado no CIFREN e o vincula (`result: created|updated|unchanged|reactivated`).
- `active: false` (etiqueta desligada): o associado é **suspenso** no CIFREN (para de gerar mensalidade; histórico fica) → `result: suspended`.
- Idempotente: reenviar o mesmo membro não duplica.
### `POST {u}/account` `{ items: [Lançamento] }` (até 500, na ordem em que aconteceram) → `{ items: [{ external_id, result, error? }] }`
Lançamento: `{ external_id: "<id do lançamento no RUSTEN>", customer_external_id, kind, amount_cents, reverses_external_id?, reason?, created_at }`
- `kind` e sinal iguais ao RUSTEN (`customer_account`): positivo = crédito do cliente; negativo = fiado/consumo.
  - `fiado` (−): vira **conta a receber** no CIFREN ("Fiado RUSTEN — …"), vencimento = data + prazo configurado (padrão 30 dias), ligada ao associado.
  - `pagamento_fiado` (+): dá **baixa** nas contas de fiado em aberto do associado, das mais antigas para as mais novas.
  - `credito` (+): entrada de dinheiro (conta a receber já recebida "Crédito antecipado RUSTEN") e aumenta o saldo de crédito do associado.
  - `uso_credito` (−): só movimenta o saldo de crédito (o dinheiro já entrou no `credito`).
  - O saldo de crédito do associado aparece em **Contas a pagar** ("Crédito do associado (RUSTEN) — nome"), uma conta por associado que acompanha o saldo; o fiado em aberto aparece em **Contas a receber**.
  - `estorno` (sinal oposto ao original, com `reverses_external_id`): desfaz o efeito do lançamento original.
  - `ajuste`: + perdoa fiado (reduz as contas em aberto, sem dinheiro); − aumenta o débito (nova conta a receber).
- `result`: `applied` | `duplicate` (já recebido) | `error` (`error.code`: `member_not_linked`, `invalid`…). Enviar o membro antes da conta.
### `GET {u}/payments?after=<cursor>` → `{ items: [{ cursor, type: "pagamento"|"estorno", customer_external_id, amount_cents, paid_at, note }], next_cursor }`
Pagamentos (e estornos deles, com `reverses_cursor` = cursor do pagamento estornado) registrados **no CIFREN** em contas de fiado vindas do RUSTEN. O RUSTEN grava como
`pagamento_fiado` (sem caixa, `reason: "Recebido no CIFREN"`, `idempotency_key: "cifren:<cursor>"`) — e esses lançamentos NÃO voltam para o CIFREN.
Baixas que o próprio RUSTEN mandou (`pagamento_fiado`) não aparecem aqui.

## Erros
`401` chave inválida/revogada · `403` chave sem permissão · `429` limite · `400 { error }` dados inválidos.
