# CIFREN — Especificação Mestre para Vibe Coding

**Produto:** CIFREN — Gestão Financeira Inteligente
**Marca:** LORLER Sistemas de Gestão
**Versão da especificação:** 3.1 — 20/10/2026 (padrão LORLER: GitHub + VPS, Cofre SIEG, emissão fiscal, Master LORLER; compromissos recorrentes com valor estimado × valor real)
**Endereço:** `https://cifren.lorler.com.br` (teste: `https://cifren-vps.lorler.com.br`)
**Status:** projeto a implementar; nenhuma funcionalidade descrita é presumida como já existente.

### Mudanças em relação à v2.1
- Arquitetura trocada de Docker/Python/Next.js/Redis/MinIO para o **padrão LORLER** (Node + React/Vite + PostgreSQL 17 nativo + `lorler-edge`), o mesmo de ORBI, TORVEN, RUSTEN e APOLVEN, rodando **só na VPS + GitHub**.
- Publicação, backup e Google Drive passam a usar o que já existe na VPS (atualização automática, backup diário cifrado, pasta Profissional › Programação › CIFREN).
- Planos, testes grátis e cobrança passam a ser da **Área Master LORLER** (central), não de um Master próprio.
- Novos: **Cofre SIEG**, **emissão fiscal** (NFS-e/NF-e/NFC-e), leitura de boleto/Pix, cobrança por boleto/Pix, maquininhas, empréstimos, aplicações, provisão de impostos, agente do WhatsApp, vídeo-aulas, ligação com o Cérebro e API pública v1 no contrato LORLER.
- Integrações com os outros sistemas pela **API pública v1** deles (chaves `lk_<sistema>_…`), não por OAuth.
- Corrigido o nome **APOLVEN** (estava "APLOVEN").
- **v3.1:** nova seção 5.3 — compromissos recorrentes (mensalidades, CPFL, aluguel…) com **valor estimado × valor real**, reajuste por índice, cenários, indicadores de custo fixo e alerta de desvio.

## 0. INSTRUÇÕES AO AGENTE DESENVOLVEDOR

Você é o arquiteto e desenvolvedor responsável por construir o CIFREN como produto SaaS real, seguro, intuitivo e independente, **no mesmo padrão técnico e operacional dos sistemas LORLER**. Implemente incrementalmente, com código, migrations, testes, documentação e verificações. Não crie telas falsas, endpoints simulados em produção ou integrações fictícias. Nunca imprima segredos em logs, commits ou respostas. Preserve ORBI, TORVEN, RUSTEN, APOLVEN, o Gateway de Dados e o Cérebro: nada deles é alterado sem pedido específico. Não presuma credenciais, contratos de API ou acesso a contas externas; integrações só ficam habilitadas depois de autorização e teste de conectividade.

**Cenário confirmado:** a VPS LORLER já roda os sistemas pelo kit `VPS Sistemas` (`/usr/local/lib/lorler`): PostgreSQL 17 só local, Node 22, `lorler-edge` (127.0.0.1:8100) atrás do túnel da Cloudflare, atualização automática a cada 5 min, backup diário cifrado com cópia no Google Drive e verificação completa (`lorler-verificar`). O CIFREN **não existe** nela: é instalação nova, como sistema incluído (`lorler-sistema adicionar`), sem Docker.

**Regras de acesso:** nunca pedir senhas, tokens ou chaves no chat. Credenciais são coladas pelo dono só no prompt da VPS ou na tela do sistema, e ficam cifradas. Não mexer em firewall, SSH, túnel ou DNS de outros sistemas. Ações na VPS são feitas pelos scripts do kit (menu `VPS-MENU.bat`), que conferem, fazem backup antes e voltam sozinhos se falhar.

**Ordem de construção:** fundação (multiempresa, perfis, auditoria, ligação com o Master) → financeiro → documentos/IA/Cofre SIEG → emissão fiscal → integrações LORLER → WhatsApp, aulas e Cérebro → homologação → publicação.

**Procedimento de entrega (obrigatório, igual aos outros sistemas):**
1. Commits na branch `cloudflare` do repositório privado `lealves05/CIFREN` (mensagens em português, descrevendo o que muda).
2. Migrations numeradas em `backend/src/migrations` com rollback em `backend/src/migrations/rollback`.
3. A cada entrega: relatório HASH (`ORBI/ferramentas/relatorio-hash.mjs`, livro `inventario-hash.jsonl` em `D:\Programacao\Claude outputs\Relatorios-HASH`, cópia em `H:\Meu Drive\Profissional\Programação\Relatorios-HASH`) e bundle incremental em `H:\Meu Drive\Profissional\Programação\CIFREN\atualizacoes\`.
4. Scripts de publicação no PC criam backup automático em `D:\Programacao\BACKUP-Sistemas` com nome do sistema + versão sequencial, sem sobrescrever.
5. Publicação: a VPS confere a branch a cada 5 minutos → backup (banco + código, numerado) → constrói → reinicia → confere a saúde → se falhar, volta sozinha. O GitHub Actions faz só testes e o backup em Release; **não publica em Cloudflare Workers nem Supabase**.

## 1. VISÃO E PRINCÍPIOS

- CIFREN funciona integralmente sem qualquer outro produto LORLER conectado.
- Empresas podem contratar isoladamente; integrações com ORBI, TORVEN, RUSTEN e APOLVEN são opcionais, autorizadas pelo cliente, reversíveis e desacopladas.
- Multiempresa: um cliente pode ter vários CNPJs, filiais, contas bancárias, usuários e centros de custo; nenhum cliente vê outro.
- Financeiro não se confunde com estoque, documento fiscal, pagamento nem contabilidade. Cada evento tem ciclo de vida próprio.
- IA interpreta e sugere; operações sensíveis passam por regras fixas, permissões e aprovação.
- **Feito para quem é semileigo em computador:** cadastros e configurações (banco, SIEG, certificado, WhatsApp) em assistentes passo a passo, com textos simples, exemplos e teste de conexão no fim.
- Celular primeiro, pt-BR, BRL, fuso por empresa, acessibilidade WCAG 2.2 AA, estados vazios úteis, busca global e ajuda contextual.
- API-first, eventos idempotentes, exportação de dados e segurança por padrão.

## 2. POSICIONAMENTO

Padrões de mercado a cobrir: contas a pagar/receber, fluxo de caixa, conciliação, OFX/CSV, centros de custo, recorrência, DRE gerencial, documentos, aprovações, emissão de nota, cobrança por boleto/Pix e envio ao contador. Diferencial CIFREN: notas de fornecedor chegando sozinhas pelo Cofre SIEG e viradas em contas a pagar; foto da nota ou do boleto pelo celular ou pelo WhatsApp; reconciliação compra-documento-pagamento; IA auditável; conectores opt-in com o ecossistema LORLER; indicadores para o Cérebro. Não afirmar certificações, integrações bancárias ou acesso à SEFAZ sem validação formal.

## 3. ARQUITETURA — PADRÃO LORLER (GITHUB + VPS)

### 3.1 Componentes

| Camada | Como fica | Observação |
|---|---|---|
| Código | GitHub privado `lealves05/CIFREN`, branch `cloudflare` | o token só de leitura da VPS precisa incluir o repositório |
| API | Node 22, Express 5, `pg`, `zod`, `helmet`, rate limit; `backend/src/server.js` | igual TORVEN; serviço `lorler-api@cifren` só em 127.0.0.1, porta **3105** (ou a próxima livre que o `lorler-sistema` indicar) |
| Site | React 18 + Vite + Tailwind + `lucide-react`, PWA com câmera; `frontend/` com `npm run build:cloudflare` | publicado em `/var/lib/lorler/www/cifren` com troca atômica |
| Entrada | `cloudflare/worker.js` + `cloudflare/wrangler.jsonc` (mesmo formato dos outros), rodando dentro do `lorler-edge` | regras de /api, cabeçalhos, `EDGE_PROXY_KEY` e IP real; o túnel da Cloudflare entrega na VPS, nenhuma porta aberta |
| Banco | PostgreSQL 17 da VPS, banco `lorler_cifren` e usuário próprio com senha aleatória | só acesso local; RLS por empresa além da checagem na API |
| Arquivos | disco da VPS em pasta própria (`/var/lib/lorler/cifren/arquivos`), cifrados, nome por SHA-256, fora do banco | download só pela API, com permissão e link de curta duração |
| Trabalhos em segundo plano | fila em tabela do PostgreSQL (`jobs` com `FOR UPDATE SKIP LOCKED`), executada pelo próprio processo da API | sem Redis; idempotente, com tentativas e "fila de falhas" visível |
| Rotinas agendadas | `lorler-cron@cifren` (timer systemd) chamando a rota de rotina com `CRON_SECRET` | ex.: busca diária no Cofre SIEG, avisos de vencimento |
| OCR | leitura de XML no servidor; OCR de imagem no navegador (tesseract, como o TORVEN) e, nas exceções, modelo de IA configurável | nunca inventar campo que não foi lido |
| Configuração | `/etc/lorler/cifren.env` (só root), gerado pelo `lorler-sistema`; segredos das empresas cifrados no banco (`secretbox`) | nada de segredo em git |

Por que não Docker, Python, Redis e MinIO: a VPS já roda o Gateway, os 4 sistemas e o Cérebro com esse padrão. Uma segunda pilha dobraria manutenção e memória, e perderia de graça a atualização automática, o backup, a verificação e o portal da API que o kit já dá a qualquer sistema neste formato.

### 3.2 Estrutura do repositório (mesma dos sistemas LORLER)

```text
CIFREN/
  backend/
    package.json            # start, migrate, test, test:security
    src/server.js  app.js  db.js  migrate.js  security.js  secretbox.js  audit.js
    src/platform.js         # ligação com a central (Master)
    src/companyModules.js   # módulos de plano
    src/routes/             # uma rota por área
    src/fiscal/             # emissão (certificado, documento, provedores)
    src/integrations/       # sieg.js, whatsapp.js, ai.js, boleto.js, asaas.js, lorler-<sistema>.js
    src/publicApi/          # API pública v1 (/api/v1)
    src/migrations/  src/migrations/rollback/
    scripts/                # smoke, security-evidence, testes por área
  frontend/
    package.json            # build:cloudflare
    src/  public/  tools/videos/
  cloudflare/worker.js  cloudflare/wrangler.jsonc
  docs/                     # arquitetura, permissões, API, manuais, runbooks
  .github/workflows/        # testes + backup em Release (não publica em Cloudflare/Supabase)
  backup-sistema.mjs
  README.md  SECURITY.md  CHANGELOG.md  .env.example
```

### 3.3 Capacidade

A VPS é compartilhada. Antes de instalar, rodar `lorler-verificar` (memória, swap, disco) e registrar o consumo do CIFREN depois do piloto. Limite de memória do serviço pelo systemd. Arquivos grandes contam no disco e no backup: limites por plano (seção 9.4).

## 3A. INSTALAÇÃO NA VPS (pelo kit `VPS Sistemas`)

1. `VPS-MENU › V` (verificação): confere a máquina e os sistemas antes de mexer.
2. Incluir o repositório `CIFREN` no token do GitHub da VPS (só leitura).
3. `VPS-MENU › A` (`lorler-sistema adicionar`): confere o padrão do repositório, cadastra `cifren` (porta, esquema `public`, site `cifren`, origem `proprio`), cria banco, usuário e `/etc/lorler/cifren.env`, constrói e publica o site de teste `cifren-vps.lorler.com.br`.
4. Testar pelo endereço de teste; depois a virada do endereço oficial `cifren.lorler.com.br` pelo `lorler-trocar`, como os outros.
5. Conferir no `lorler-verificar` (seções de sistemas, APIs, atualização e backup) e no portal `api.lorler.com.br`.
6. Rotinas: timer `lorler-cron@cifren` criado pelo kit.
7. Nunca mexer em serviços, bancos, túnel ou DNS dos outros sistemas.

## 3B. BACKUP E RECUPERAÇÃO

- **Diário (03:30)** pelo `lorler-backup`: dump do `lorler_cifren` + configuração, cifrado (AES-256, chave `backup.key` guardada pelo dono fora da VPS), 14 dias na VPS e cópia no Google Drive (**Profissional › Programação › LORLER Backups VPS**, 30 dias). Já decidido; não perguntar pasta.
- **Arquivos do CIFREN** (fotos, PDFs, XML): entram no mesmo backup diário (pasta `/var/lib/lorler/cifren/arquivos`, que já está cifrada); o kit precisa ser ajustado para incluí-la.
- **Git do CIFREN** no Drive em **Profissional › Programação › CIFREN** (bundle quando a versão muda) e Release no GitHub a cada envio.
- **Antes de cada atualização:** backup numerado do banco e do código (`CIFREN-v001-<commit>.tar`), com volta automática se a versão nova não subir.
- **Restauração:** `lorler-restaurar`, que guarda o banco anterior antes de restaurar. Ensaio de restauração mensal em banco separado, com relatório.
- Tela **Configurações › Backups** no CIFREN mostra só o que o cliente precisa: data do último backup e como pedir uma exportação dos dados dele. A gestão de backup é da plataforma, não do cliente.
- Segredos nunca vão em claro para backup: as chaves das empresas estão cifradas no banco e a chave mestra (`secretbox`) fica só na configuração da VPS e na cópia segura do dono.

## 4. IDENTIDADE, MULTIEMPRESA E PERMISSÕES

### 4.1 Hierarquia
Plataforma LORLER (Master) → empresa cliente → CNPJs/filiais → centros de custo/projetos → registros. Usuário pode pertencer a várias empresas com papéis distintos e seletor de empresa. O administrador LORLER **não** vê dados financeiros dos clientes; suporte temporário exige consentimento, prazo e auditoria.

### 4.2 Perfis iniciais editáveis
Dono; Administrador; Gestor de unidade; Financeiro; Comprador; Funcionário de lançamentos (envia fotos e vê só os próprios envios); Aprovador de pagamentos; Contador (relatórios, XMLs e exportações); Auditor somente leitura; Perfil personalizado.

### 4.3 Permissões
Catálogo versionado `recurso.acao` (mesmo modelo dos perfis de acesso dos outros sistemas), por exemplo: `financeiro.lancamento.criar/editar/aprovar`, `financeiro.pagamento.confirmar`, `financeiro.documento.visualizar/excluir`, `financeiro.exportar`, `fiscal.nota.emitir/cancelar`, `fiscal.certificado.configurar`, `sieg.configurar`, `sieg.buscar`, `sieg.enviar`, `cobranca.emitir`, `integracao.<sistema>.configurar`, `whatsapp.configurar`, `ia.ferramenta.executar`, `usuarios.permissoes.editar`. Escopo por empresa/CNPJ/unidade/centro de custo/próprio registro, limite de valor e status. Tudo negado por padrão, negação explícita vence, segregação de funções e dupla aprovação acima de limites configuráveis. A API confere a permissão em toda operação, inclusive downloads, filtros, exportações, webhooks e ferramentas de IA.

### 4.4 Tela de permissões
Matriz perfil × módulo × ação com chaves liga/desliga, cópia de perfil, modelos, permissões temporárias, "ver como este perfil" (sem assumir a identidade), histórico e revogação imediata de sessões. Ninguém concede mais do que tem. Acesso negado sempre explica o motivo.

### 4.5 Autenticação
Convite por e-mail com validade, senha forte, verificação em duas etapas (TOTP), sessões por dispositivo e revogação, bloqueio progressivo, cookies HttpOnly/Secure/SameSite, CSRF, rotação de token. Reautenticação para ações sensíveis (certificado, chaves, emissão em produção). Sem SSO obrigatório.

## 5. MÓDULOS FINANCEIROS

1. **Início (painel):** caixa disponível, entradas/saídas, vencidas/a vencer, saldo projetado, despesas por categoria, margem, alertas e comparativos por período/empresa.
2. **Plano de contas e centros de custo:** categorias hierárquicas, competência, centros de custo, rateio, projetos, tags e regras automáticas de classificação.
3. **Contas a pagar:** fornecedores, parcelas, recorrência, anexos, retenções, aprovações, desconto/multa/juros, baixas, estornos; entrada pela foto, pelo **boleto** (seção 6.3), pelo **Cofre SIEG** (seção 6A) ou manual.
4. **Contas a receber:** clientes, títulos, parcelas, recebimento parcial, inadimplência, **cobrança por boleto e Pix** (seção 5.2), lembretes e previsão.
5. **Caixa e bancos:** várias contas, caixa físico, cartões, transferências internas, extratos OFX/CSV e conectores bancários autorizados (futuro).
6. **Conciliação:** regras por valor/data/identificador/contraparte, sugestão por IA, 1:1, 1:N e N:1, divergências, trilha e reversão.
7. **Maquininhas de cartão:** cadastro das maquininhas e taxas por bandeira/modalidade, prazo de recebimento, antecipação, previsão de recebíveis e conciliação venda × depósito (importação do extrato da adquirente ou dos sistemas LORLER).
8. **Compras e despesas:** requisição, orçamento, aprovação, pedido, recebimento, nota e pagamento separados.
9. **Empréstimos, financiamentos e consórcios:** contrato, taxa, sistema de amortização (Price/SAC), parcelas geradas no contas a pagar, saldo devedor.
10. **Aplicações e reservas:** saldo, aportes, resgates e rendimento informado; entra no caixa disponível conforme liquidez.
11. **Impostos (estimativa):** provisão do DAS do Simples e outros tributos configuráveis por alíquota informada pelo contador; sempre identificado como estimativa, sem prometer cálculo fiscal oficial.
12. **Pessoal:** pró-labore, salários, encargos e benefícios como lançamentos com categoria própria (sem folha de pagamento).
13. **Renegociação:** acordo de títulos vencidos (novo parcelamento ligado aos títulos de origem, com histórico).
14. **Orçamento:** metas por categoria/centro de custo, previsto × realizado, alertas.
14A. **Compromissos recorrentes e previsão:** contas e receitas que se repetem (fixas e variáveis), com valor estimado × valor real, reajustes, cenários e indicadores — detalhado na seção 5.3.
15. **Relatórios:** DRE gerencial por competência, fluxo de caixa realizado/projetado, aging, custos, fornecedores, compras, rentabilidade por unidade; CSV/XLSX/PDF com filtros e permissão.
16. **Fechamento do mês:** período bloqueado, reabertura excepcional com aprovação e trilha.
17. **Cartões corporativos e reembolsos:** prestação de contas, política, adiantamentos, comprovantes e conciliação.
18. **Contador:** acesso de contador, pacote do mês (lançamentos em CSV/XLSX, XMLs emitidos e recebidos, relatório de conciliação) e envio ao Cofre SIEG.
19. **Notificações:** vencimentos, pendências, divergências, orçamento estourado, notas novas no Cofre SIEG, integrações com falha; no sistema, por e-mail e pelo WhatsApp.
20. **Cadastros:** clientes, fornecedores, produtos de referência, contas, empresas, unidades, centros de custo, categorias e modelos.
21. **Importação de outros sistemas:** assistente para Conta Azul, Omie, Granatum, Nibo e planilha (modelo pronto para baixar), com pré-visualização, deduplicação e relatório (padrão do assistente de importação do financeiro do TORVEN).
22. **Exportação e portabilidade:** exportação completa dos dados da empresa em formato aberto, com anexos.

### 5.1 Regras financeiras essenciais
- Valores em `NUMERIC(18,2)` (ou maior precisão quando necessário); nunca ponto flutuante.
- Distinguir emissão do documento, obrigação, competência, pagamento, conciliação e recebimento de estoque.
- Despesa paga não significa mercadoria recebida; compra de estoque não é automaticamente CMV.
- DRE gerencial mostra as premissas e não substitui demonstrativo contábil oficial.
- Toda mudança de valor/status relevante gera evento e trilha; exclusão financeira é cancelamento/estorno, nunca deleção silenciosa.

### 5.2 Cobrança por boleto e Pix
- Provedor desacoplado, primeiro o **Asaas** (o mesmo da Área Master), com a conta Asaas **do cliente** (chave dele, cifrada); depois outros por adaptador.
- Emitir boleto/Pix a partir do título, enviar por e-mail/WhatsApp, receber o webhook validado e dar baixa automática (idempotente, sem baixa dupla).
- Pix estático (QR com chave do cliente) como opção sem provedor, com baixa manual ou pela conciliação.
- Cancelamento, 2ª via, multa/juros/desconto conforme o título.

### 5.3 Compromissos recorrentes e previsão (valor estimado × valor real)

Objetivo: o cliente cadastra uma vez o que se repete — despesas (aluguel, CPFL/energia, água, internet, telefone, contador, sistemas, mensalidades, salários, pró-labore, seguros, parcelas) e receitas (mensalidades de clientes, contratos, aluguéis recebidos, comissões previstas) — e o CIFREN projeta os próximos meses, compara com o que de fato aconteceu e avisa quando algo foge do normal.

**5.3.1 Cadastro do compromisso (`recurring_commitments`)**
- Tipo: despesa ou receita; nome ("CPFL — loja centro"), contraparte (fornecedor/cliente), categoria, centro de custo, empresa/CNPJ e conta de pagamento/recebimento.
- Frequência: mensal, bimestral, trimestral, semestral, anual, semanal, quinzenal ou personalizada; dia do vencimento (com regra para dia inexistente e fim de semana/feriado: antecipa ou posterga).
- Vigência: data de início, data de fim opcional (ou número de ocorrências) e aviso N dias antes de terminar ("contrato de aluguel vence em 60 dias").
- Situação: ativo, pausado (de/até) ou encerrado. Pausar ou encerrar nunca apaga ocorrências já realizadas.
- Identificadores para casar a conta real automaticamente: código do cliente/instalação (ex.: número da instalação da CPFL), CNPJ do emissor, convênio do boleto, palavras do extrato.
- Modelos prontos para o semileigo: "Conta de energia", "Aluguel", "Água", "Internet/telefone", "Mensalidade de cliente", "Salário", "Assinatura de sistema" — cada um já com categoria e método de estimativa sugeridos.

**5.3.2 Como o valor estimado é calculado (método por compromisso)**
| Método | Uso típico | Regra |
|---|---|---|
| Valor fixo | aluguel, mensalidade, assinatura | o valor informado (com reajuste, 5.3.3) |
| Média móvel | internet, telefone com variação pequena | média dos últimos N reais (N = 3, 6 ou 12, padrão 6) |
| Mesmo mês do ano anterior | energia, água (sazonais) | valor real do mesmo mês do ano anterior × (1 + tendência dos últimos 12 meses); sem histórico, cai para média móvel |
| Média sazonal ponderada | energia com histórico de 2+ anos | média do mesmo mês nos anos disponíveis, peso maior no mais recente |
| Faixa (mín./máx.) | conta muito variável | estimativa = valor provável, com mínimo e máximo exibidos |
| Manual | qualquer | o usuário digita a estimativa de cada mês |

- Sem histórico, a estimativa inicial é a que o usuário informar ("costuma vir uns R$ 450"); o sistema passa sozinho para o método escolhido quando houver reais suficientes, avisando a troca.
- Toda estimativa guarda **como foi calculada** (método, meses usados, valor de cada um) para o usuário entender o número; nada de valor sem explicação.
- O usuário pode corrigir a estimativa de um mês específico sem mudar o método.

**5.3.3 Reajuste automático**
- Índice: IPCA, IGP-M, INPC, percentual fixo ou valor manual; mês de aniversário (ex.: aluguel reajusta todo março).
- Valor do índice informado pelo usuário ou buscado de fonte oficial autorizada (IBGE/FGV/BCB), sempre exibindo fonte, período acumulado e data da consulta; índice negativo segue a regra do contrato (aplicar ou manter o valor).
- Antes de aplicar: aviso "O aluguel será reajustado em março: R$ 2.000,00 → R$ 2.096,40 (IPCA 12 meses 4,82%). Confirmar?" — aplica só nas ocorrências futuras; histórico preservado.

**5.3.4 Ocorrências: estimado → real**
- O CIFREN gera as ocorrências futuras dentro do horizonte de previsão (padrão 12 meses, configurável até 36) como **previstas** (`estimated`), com valor estimado, sem virar conta a pagar/receber ainda.
- Conta a pagar/receber de verdade é criada: (a) automaticamente X dias antes do vencimento, com o valor estimado e marcada "valor estimado — aguardando a conta"; ou (b) quando chega o documento real.
- **Chegada do valor real** (foto, boleto, XML, Cofre SIEG, WhatsApp, extrato/conciliação ou digitação): o sistema procura a ocorrência prevista pelo identificador (instalação, CNPJ, convênio), contraparte, período e valor aproximado; sugere o vínculo; ao confirmar, a ocorrência passa a **real** (`actual`), a conta a pagar/receber assume o valor real e a estimativa original fica guardada.
- Cada ocorrência mantém os dois valores lado a lado: **estimado**, **real**, **diferença em R$ e em %**, data estimada × data real e origem do valor real.
- Ocorrência sem valor real até o vencimento: alerta "A conta da CPFL de outubro ainda não chegou (estimado R$ 612,00)".
- Pagamento/recebimento continua seguindo o fluxo normal (baixa, conciliação); a recorrência nunca dá baixa sozinha.
- Valor real que chega sem compromisso cadastrado: o CIFREN sugere "Isto parece se repetir todo mês. Criar um compromisso recorrente?" após 2–3 ocorrências semelhantes.

**5.3.5 Alertas de desvio**
- Limite de tolerância por compromisso (padrão ±15% ou valor absoluto): acima disso, alerta "CPFL de outubro veio R$ 860,00, 41% acima do estimado (R$ 610,00)" — no painel, por e-mail e pelo WhatsApp, conforme preferências.
- Alerta de tendência: "Energia subiu 22% nos últimos 12 meses"; "Internet ficou 3 meses seguidos acima do contratado".
- Alerta de ausência: receita recorrente esperada que não entrou até X dias após o vencimento (cliente de mensalidade atrasado) — liga com cobrança (5.2) e inadimplência.
- O Agente Auditor (seção 7) pode sugerir causa provável (ex.: mês com mais dias de faturamento, bandeira tarifária), sempre como sugestão com a evidência usada.

**5.3.6 Cenários e previsão**
- Fluxo de caixa projetado usa: ocorrências reais + ocorrências previstas + títulos avulsos em aberto + parcelas de empréstimos + recebíveis de maquininha.
- Três cenários lado a lado: **pessimista** (despesas no máximo da faixa/estimado + tolerância, receitas com inadimplência histórica), **provável** (estimado) e **otimista**; parâmetros editáveis.
- Simulações sem gravar nada: "e se a energia subir 15%?", "e se eu perder 3 mensalidades?", "e se o aluguel reajustar por IGP-M?", "e se eu contratar mais um funcionário de R$ 2.500,00?" — com o efeito no saldo mês a mês e o mês em que o caixa fica negativo, se ficar.
- Cenários podem ser salvos com nome e comparados depois com o realizado.

**5.3.7 Indicadores e relatórios**
- Custos fixos do mês (estimado e real), receita recorrente (MRR) e quanto o fixo representa da receita.
- **Ponto de equilíbrio:** quanto precisa entrar no mês para cobrir os compromissos fixos e variáveis previstos.
- Precisão da previsão: diferença média estimado × real por compromisso e por categoria (ex.: "suas estimativas de energia erram em média 6%"), para o usuário escolher o melhor método.
- Evolução de cada compromisso no tempo (gráfico estimado × real, 12–36 meses) e ranking dos que mais cresceram.
- Calendário de compromissos do mês (o que vence, o que já chegou, o que falta chegar).
- Relatório "Previsto × Realizado" por categoria, centro de custo e empresa, exportável em CSV/XLSX/PDF.
- Chat gerencial (7.4): "quanto vou gastar de fixo em dezembro?", "qual foi a maior diferença entre estimado e real este ano?", "quando o caixa fica negativo no cenário pessimista?".

**5.3.8 Regras**
- Valores sempre em `NUMERIC(18,2)`; percentuais com precisão definida e arredondamento documentado.
- Ocorrência prevista **não** entra no DRE realizado nem no caixa realizado; entra só no projetado e é sempre identificada como estimativa na tela e nos relatórios.
- Alterar o compromisso (valor, método, dia) afeta só ocorrências futuras ainda previstas; reais e passadas ficam como estão, com trilha de auditoria.
- Permissões: `financeiro.recorrencia.criar/editar/pausar/encerrar`, `financeiro.previsao.visualizar`, `financeiro.cenario.criar`; funcionário de lançamentos pode enviar a conta real, mas não alterar o compromisso.
- Integrações LORLER (8.2–8.5) podem alimentar receitas recorrentes previstas (ex.: mensalidades/planos do ORBI, comissões previstas do APOLVEN) como ocorrências estimadas, substituídas pelo valor real quando o sistema de origem confirmar.

## 6. DOCUMENTOS, FOTOS E CAPTURA INTELIGENTE

### 6.1 Entradas
Câmera do celular, upload PDF/JPG/PNG/HEIC, XML NF-e/NFC-e/CT-e/NFS-e, **WhatsApp** (seção 8.7), **Cofre SIEG** (seção 6A), arrastar/soltar e lote. Limites por plano, conferência de tipo e conteúdo, barra de progresso e nova tentativa.

### 6.2 Fluxo do documento
1. Receber em quarentena, SHA-256, tipo e tamanho.
2. XML: ler estrutura, chave de acesso, emitente, itens, impostos e **duplicatas** (`cobr/dup`); não presumir autenticidade sem consulta oficial autorizada.
3. Imagem/PDF: OCR e, nas exceções, IA; extrair fornecedor, CNPJ, datas, número, itens, quantidades, preços, descontos, impostos e total.
4. Normalizar unidades e embalagens; guardar texto bruto, evidência por campo e confiança.
5. Conferir soma dos itens × total; marcar divergências.
6. Deduplicar por chave de acesso, emitente+número+série e hash.
7. Sugerir categoria, centro de custo, fornecedor e produtos; nunca inventar dado ausente.
8. Tela lado a lado (documento + campos editáveis) com destaque do que tem baixa confiança.
9. Aprovar conforme alçada; criar conta a pagar (uma por duplicata) e compra vinculadas, sem baixa automática de pagamento.
10. Registrar origem, versão da extração, correções humanas e decisões.

**Comprovante de pagamento não é nota fiscal:** extrair valor, data e identificador e sugerir vínculo com o título existente, sem lançar despesa duas vezes. Dados bancários e CPF mascarados.

### 6.3 Boleto e Pix copia-e-cola
- Ler o código de barras (foto ou câmera) ou a linha digitável colada; validar dígitos verificadores, extrair banco, valor, vencimento e fator de vencimento (incluindo a mudança de base do fator de vencimento) e, nos boletos de concessionária, o segmento.
- Ler Pix copia-e-cola/QR (BR Code): chave, recebedor, valor e identificador, com verificação do CRC.
- Gerar conta a pagar sugerida, conferindo duplicidade com títulos e notas já lançados (o boleto de uma nota do Cofre SIEG se liga à duplicata dela).
- O CIFREN **não paga** boleto nem Pix: só registra, lembra e concilia.

## 6A. COFRE SIEG (obrigatório)

Mesmo padrão já em produção no TORVEN, ORBI, RUSTEN e APOLVEN, com foco financeiro.

### 6A.1 Notas recebidas (fornecedores) → contas a pagar
- Buscar as NF-e destinadas ao CNPJ de cada empresa/filial do cliente (`POST /api/v1/baixar-xmls`, tipo NF-e, destinatário = CNPJ, até 2 meses por busca, 50 por página; resposta em ZIP lida na memória, aceitando também o formato JSON/base64 antigo).
- CT-e (frete, quando o cliente é tomador) e NFS-e tomadas, se o plano SIEG do cliente cobrir — **confirmar na documentação oficial da SIEG** os códigos de tipo e a disponibilidade antes de habilitar.
- Cada nota entra no fluxo da seção 6.2: fornecedor, itens e **duplicatas viram contas a pagar sugeridas**; nota sem duplicata vira uma conta à vista sugerida; tudo para revisão e aprovação.
- Lista "Notas de fornecedores" com filtros, situação ("nova", "lançada", "ignorada") e marcação **Já lançada**; deduplicação pela chave de acesso com as notas que chegaram por foto, XML ou WhatsApp.
- **Busca automática diária** (rotina agendada) e botão "Buscar agora"; aviso de "N notas novas".

### 6A.2 Notas emitidas → contador
- Enviar ao Cofre o XML das notas autorizadas pelo CIFREN (`POST /api/v1/enviar-xml`, corpo `{Xml}`), manual ("Enviar pendentes", 25 por vez) ou automático a cada autorização, sem travar a emissão.
- Cada nota guarda `sieg_sent_at` e `sieg_message`; se falhar, continua pendente e aparece no painel.

### 6A.3 Credenciais
- JWT: `POST /api/v1/create-jwt` com `X-Client-Id` e `X-Secret-Key`; válido 24 h, guardado só na memória do servidor.
- Demais chamadas: `Authorization: Bearer <JWT>` e `X-Api-Key`.
- **Client ID e Secret Key:** da plataforma (cadastro do CIFREN como "sistema externo" na SIEG), em `/etc/lorler/cifren.env` ou na tabela `_secrets`; opção "Avançado" para a empresa informar o próprio par. **Pendente LORLER:** cadastrar o CIFREN como sistema externo na SIEG.
- **Chave de API:** de cada empresa (Minha Conta › Integrações API SIEG › Gerar nova chave, "Acesso total"); cifrada, a tela mostra só "configurada (final ••••)".
- URL configurável por `SIEG_API_URL` (padrão `https://api.sieg.com`).
- **Testar conexão:** gera o JWT e chama `contar-xmls`, sem baixar nada.

### 6A.4 Segurança e limites
- Buscas: 2 por minuto (limite da SIEG); envios: 30 por hora; testes: 6 a cada 10 minutos.
- Permissões: configurar `sieg.configurar`; buscar `sieg.buscar`; enviar `sieg.enviar` ou `fiscal.nota.emitir`.
- Histórico de configuração, teste, envio e busca; chaves nunca em log.
- Módulo de plano `cofre_sieg`: desligado, as rotas `/sieg` respondem 403.
- Assistente de configuração passo a passo, com prints neutros e aula própria.

## 6B. EMISSÃO FISCAL (padrão LORLER)

- **Documentos:** NFS-e (serviços prestados pelo cliente do CIFREN), NF-e (venda/remessa para CNPJ) e NFC-e quando houver venda ao consumidor; emissão a partir de uma conta a receber ou de "Faturar" na tela de títulos.
- **Emitentes:** vários CNPJs por empresa, cada um com regime, inscrições, série e numeração; certificado **A1 cifrado** (senha pedida com reautenticação), aviso de vencimento do certificado.
- **Provedor:** Focus NFe primeiro, por adaptador (`fiscal/providers.js`), com **homologação e produção** separadas; texto obrigatório de homologação no 1º item.
- **Ciclo:** rascunho → enviada → autorizada/rejeitada → cancelada; consulta de situação (refresh), cancelamento no prazo legal, carta de correção quando couber, DANFE/DANFSe em PDF, envio por e-mail/WhatsApp.
- **Correções já conhecidas nos outros sistemas (não repetir):** controle de duplicidade dentro da transação; numeração/contador da DPS não avança em rejeição; `cancelled_at` gravado no refresh; chamada ao provedor **fora** da transação do banco, com reconciliação de nota órfã.
- Ao autorizar: título vinculado atualizado e XML enviado ao Cofre SIEG (se ligado).
- Módulo de plano `fiscal`. Não prometer conformidade fiscal automática: CFOP, CST/CSOSN, alíquotas e item da LC 116 vêm da configuração validada pelo contador.

## 7. AGENTES DE IA

### 7.1 Agentes
- **Documental:** OCR, XML, boleto, extração e evidências.
- **Classificador:** categorias, centros de custo, produtos e fornecedores.
- **Auditor:** duplicidade, anomalias, inconsistências e risco.
- **Integrador:** prepara eventos para conectores opt-in; nunca executa sem autorização.
- **Analista:** perguntas, painéis, previsões e explicações.
- **Orquestrador:** roteia tarefas e controla custo, ferramentas, permissões e aprovações. Não fundir com os agentes de ORBI, TORVEN, RUSTEN, APOLVEN ou do Cérebro; comunicação só por API.

### 7.2 Ferramentas com contrato
Ex.: `listar_titulos`, `consultar_fluxo_caixa`, `extrair_documento`, `ler_boleto`, `sugerir_classificacao`, `verificar_duplicidade`, `propor_lancamento`, `solicitar_aprovacao`, `buscar_notas_sieg`, `consultar_estoque_rusten`, `consultar_comissoes_apolven`. Cada ferramenta confere empresa, usuário, permissão e parâmetros e registra auditoria; nada de SQL livre gerado pela IA. Ferramentas que alteram dados exigem aprovação de uso único. Texto de documento nunca vira instrução (proteção contra prompt injection).

### 7.3 Governança
Prompts versionados, provedor substituível (chave da plataforma ou da empresa, cifrada), custo e limite por empresa, tempo limite e tentativas, minimização de dados pessoais antes de enviar a provedor externo, confiança e evidência sempre visíveis. Sem ação financeira irreversível autônoma.

### 7.4 Chat gerencial
"Quanto gastei com bebidas?", "quais fornecedores aumentaram preço?", "saldo projetado em 30 dias?", "quais notas do Cofre SIEG faltam lançar?", "quais comissões do APOLVEN estão previstas?". Respostas mostram filtros, período e fonte e abrem os registros; sem inventar valores.

## 8. INTEGRAÇÕES

### 8.1 Regras gerais
- O CIFREN opera sem conectores. Cada conector é ligado por empresa, com autorização do cliente nos dois sistemas e escolha do que sincronizar.
- **Sistemas LORLER:** pela **API pública v1** de cada um (`https://<sistema>.lorler.com.br/api/v1`; APOLVEN em `/api/public/v1`), com chave `lk_<sistema>_…` criada pelo cliente no sistema de origem, escopos mínimos, colada no assistente do CIFREN e guardada cifrada. Nunca acessar o banco de outro sistema.
- Idempotência (`Idempotency-Key`), cursores, outbox/inbox, tentativas com espera crescente, fila de falhas, reconciliação periódica e painel de falhas.
- Desconectar revoga a chave, para a sincronização e preserva o histórico.
- Mapeamento de produtos e unidades com correspondência assistida.

### 8.2 RUSTEN (bares e restaurantes)
CIFREN → RUSTEN: notas de compra aprovadas e itens para a entrada de estoque, só após confirmação de recebimento. RUSTEN → CIFREN: vendas, formas de pagamento, taxas de maquininha, contas a receber, estornos e fechamento de caixa.

### 8.3 ORBI (salões)
Produtos e insumos comprados, despesas, receitas de serviços/produtos, comissões, estornos. O CIFREN consolida; não recalcula comissão.

### 8.4 TORVEN (assistência técnica)
Peças, materiais, compras, OS, despesas por OS, recebimentos, maquininha, custos e margens; referência por ID externo, sem cobrança duplicada por reenvio.

### 8.5 APOLVEN (corretoras de seguros)
Comissões previstas/recebidas/estornadas, parcelas, apólices, seguradoras, despesas e resultado por carteira. Prêmio ≠ receita da corretora ≠ comissão prevista ≠ comissão liquidada.

### 8.6 Cérebro (Central de Decisões LORLER)
Conector de leitura para o Cérebro: indicadores do CIFREN (caixa, inadimplência, margem, despesas por categoria, notas pendentes) por chave de API v1 com escopos só de leitura, para as análises dos agentes. Sem dados pessoais.

### 8.7 Agente do WhatsApp (padrão dos 4 sistemas)
- Mesmo assistente de conexão dos outros sistemas (WhatsApp Business Cloud API da Meta, passo a passo para semileigo, teste no fim).
- O cliente envia **foto da nota, do boleto ou do comprovante** → entra no fluxo da seção 6 e volta a mensagem "Recebi: fornecedor X, R$ Y, vence em Z. Confirma?".
- Consultas rápidas ("o que vence hoje?", "saldo do caixa") só para números autorizados e com o perfil do usuário.
- Avisos de vencimento, notas novas do Cofre SIEG e aprovações pendentes; aprovação pelo WhatsApp só com PIN e alçada.
- Módulo de plano `whatsapp`.

### 8.8 Externos futuros
Open Finance via parceiros autorizados, outros provedores de cobrança e emissão, e-mail dedicado de entrada. Não anunciar antes de homologar.

## 9. TELAS E EXPERIÊNCIA

Menu lateral: Início; Caixa e Bancos; Contas a Pagar; Contas a Receber; Cobranças; Maquininhas; Compras; Documentos; Notas de Fornecedores (SIEG); Notas Fiscais; Conciliação; Empréstimos e Aplicações; Orçamentos; Relatórios; IA CIFREN; Aprovações; Integrações; Cadastros; Suporte; Configurações. Só aparece o que o perfil e o plano permitem. No celular: Início, Capturar, Pendências, Relatórios, Mais.

### 9.1 Início
Indicadores, gráficos, pendências, lançamentos recentes, vencimentos, anomalias, situação das integrações e do Cofre SIEG e o botão **"Fotografar nota ou boleto"**.

### 9.2 Captura em até cinco passos
Fotografar/anexar → aguardar leitura → conferir lado a lado → escolher centro de custo, pagamento e estoque → enviar para aprovação/concluir.

### 9.3 Central de perfis
Seção 4.4.

### 9.4 Plano, teste e cobrança — Área Master LORLER
- O CIFREN entra na **central (Master do ORBI) como mais um produto**, pelo contrato v1 já usado pelos outros (`/api/hub/v1`, chamadas assinadas com HMAC: `X-Platform-Product`, `X-Platform-Timestamp`, `X-Platform-Signature`; configuração `PLATFORM_HUB_URL`, `PLATFORM_SECRET`, `PLATFORM_PRODUCT=cifren`).
- A central decide plano, teste grátis (15/30 dias ou personalizado), carência, bloqueio e **módulos** de cada empresa; o CIFREN guarda a última situação e aplica o acesso localmente (se a central cair, vale a última situação conhecida).
- Módulos do CIFREN para os planos (lista em `FEATURES`): `financeiro`, `conciliacao_bancaria`, `maquininha`, `cobranca`, `compras`, `documentos_ia`, `cofre_sieg`, `fiscal`, `emprestimos_aplicacoes`, `orcamento`, `relatorios`, `exportacao`, `whatsapp`, `integracoes_lorler`, `contador`; quotas de documentos/mês, usuários, CNPJs e uso de IA.
- Inadimplência: bloqueio progressivo sem perda de dados, exportação mínima preservada.
- O Master continua oculto (link secreto) e a API do Master só por chave criada pelo dono; o CIFREN não cria outro painel de cobrança.

### 9.5 Suporte e vídeo-aulas
Tela Suporte no padrão dos outros sistemas: aulas curtas com cartão de abertura, "Passo X de N", legenda (.vtt), voz padrão, velocidade, "Texto da aula" clicável e busca pelo que é falado. Kit de gravação em `frontend/tools/videos`. Aulas mínimas: primeiros passos, contas a pagar/receber, foto e boleto, Cofre SIEG, emissão de nota, conciliação, maquininhas, cobrança, perfis, WhatsApp (série "Agente do WhatsApp do zero"), importação de outro sistema, relatórios e contador.

## 10. MODELO DE DADOS — ENTIDADES MÍNIMAS

`companies` (com `platform_access`), `company_units`, `users`, `memberships`, `roles`, `permissions`, `role_permissions`, `user_grants`, `sessions`, `invitations`, `cost_centers`, `chart_of_accounts`, `counterparties`, `products_reference`, `bank_accounts`, `bank_transactions`, `card_terminals`, `card_fees`, `card_receivables`, `payables`, `receivables`, `installments`, `settlements`, `transfers`, `reconciliations`, `charges` (boleto/Pix), `loans`, `loan_installments`, `investments`, `tax_provisions`, `agreements` (renegociação), `recurring_commitments` (compromisso, frequência, vigência, método de estimativa, tolerância, identificadores), `recurring_adjustments` (índice, mês de aniversário, valor aplicado, fonte), `recurring_occurrences` (competência, vencimento, `estimated_amount`, `actual_amount`, diferença, situação prevista/real/cancelada, memória do cálculo, origem do valor real, vínculo com payable/receivable), `forecast_scenarios` (parâmetros e resultado salvo), `budgets`, `purchase_requests`, `purchase_orders`, `goods_receipts`, `purchase_items`, `documents`, `document_extractions`, `document_fields`, `document_links`, `boleto_reads`, `sieg_inbound_notes` (chave de acesso única por empresa, situação, vínculo com payables), `fiscal_emitters`, `fiscal_certificates`, `invoices` (com `sieg_sent_at`, `sieg_message`, `cancelled_at`), `approval_flows`, `approval_steps`, `approval_decisions`, `integration_configs` (chaves cifradas), `external_id_mappings`, `outbox_events`, `inbox_events`, `jobs`, `sync_errors`, `ai_runs`, `ai_tool_calls`, `ai_feedback`, `whatsapp_messages`, `audit_events`, `notifications`, `api_keys` e `api_request_log` (API v1), `_secrets`.

Toda tabela de negócio tem `company_id` imutável, UUID, datas, versão otimista quando pertinente, índices e chaves estrangeiras. RLS por empresa além da checagem na API. Auditoria só de inclusão, com hash encadeado nas trilhas sensíveis. Nunca guardar cartão completo nem CVV.

## 11. API E EVENTOS

### 11.1 API interna das telas
`/api/...` por área (documents, payables, receivables, settlements, reconciliations, charges, terminals, loans, invoices, sieg, integrations, whatsapp, ai/chat, permissions, roles, dashboard), com autenticação de sessão e permissão por rota.

### 11.2 API pública v1 (contrato LORLER)
- `https://cifren.lorler.com.br/api/v1`, chaves `lk_cifren_` + 8 caracteres visíveis + parte aleatória, guardadas só como SHA-256; escopos (ex.: `payables:read/write`, `receivables:read/write`, `documents:write`, `reports:read`); limites por chave; listas com cursor; `Idempotency-Key`; registro de chamadas; tela **Configurações › API e chaves**.
- OpenAPI 3.1 em `/api/v1/openapi.json`, que aparece sozinho no portal `https://api.lorler.com.br`.

### 11.3 Eventos
`document.uploaded`, `document.extracted`, `document.reviewed`, `sieg.note_received`, `invoice.authorized`, `purchase.approved`, `goods.received`, `payable.created`, `payment.confirmed`, `charge.paid`, `integration.sync_requested/succeeded/failed`, `commission.received`. Envelope: `event_id`, `schema_version`, `company_id`, `occurred_at`, `actor_id`, `correlation_id`, `idempotency_key`, `source`, `payload`. Webhooks de saída assinados com HMAC, data e proteção contra repetição.

## 12. SEGURANÇA, LGPD E CONTINUIDADE

- Meta de engenharia OWASP ASVS 5.0 nível 2, sem declarar certificação.
- Proteção contra IDOR/BOLA, SQL injection, XSS, CSRF, SSRF (links de XML de emissor: só https de domínio, nunca IP ou rede interna), upload malicioso, prompt injection, força bruta, abuso de API, escalada de privilégio e vazamento entre empresas.
- Segredos das empresas (SIEG, Asaas, Focus, certificado A1, WhatsApp, IA) cifrados com a chave da plataforma; nunca na tela, em log ou no histórico.
- Duas etapas para administradores; reautenticação e dupla aprovação em ações críticas; bloqueio de exportação em massa sem permissão.
- LGPD: base legal por finalidade, registro de tratamento, aviso de privacidade, retenção, atendimento a titulares, minimização, contratos com operadores (SIEG, Asaas, Focus, Meta, provedor de IA) e plano de incidentes; revisão jurídica antes da venda.
- Observabilidade: logs estruturados sem dados sensíveis, saúde em `/api/health`, alertas pelo `lorler-verificar` e pelo registro de atualização/backup.
- Continuidade: seção 3B; volta automática de versão; migrations compatíveis com a versão anterior durante a troca.

## 13. GITHUB E PUBLICAÇÃO

1. Repositório privado `lealves05/CIFREN`, branch `cloudflare`; incluir no token só de leitura da VPS.
2. GitHub Actions a cada envio: lint, testes (unidade, fumaça, isolamento entre empresas, segurança), build do site e **backup em Release** (`backup-sistema.mjs`, numeração sequencial). **Não publica** em Cloudflare Workers nem Supabase; a variável `HOSPEDAGEM=cloudflare` não deve existir.
3. A VPS se atualiza sozinha pela branch (seção 0, item 5).
4. No PC: `ATUALIZAR-CIFREN.bat` (aplica o bundle, backup em `D:\Programacao\BACKUP-Sistemas`, `git push`), igual aos outros sistemas.
5. Relatório HASH e bundle no Google Drive a cada entrega (seção 0, item 3).
6. Runbooks: instalação pelo kit, atualização, volta de versão, rotação de chaves, restauração, incidentes, desligamento de cliente.

## 14. TESTES E CRITÉRIOS DE ACEITE

### 14.1 Funcionais
- Nota fotografada no celular: campos e itens com confiança e origem; diferença de totais detectada.
- **Cofre SIEG:** teste de conexão com SIEG falsa; busca traz notas, duplicatas viram contas a pagar sugeridas; mesma nota não entra duas vezes (SIEG + foto + WhatsApp); "Já lançada" funciona; envio de XML autorizado fica registrado; limites (2/min, 30/h, 6/10 min) respeitados; módulo desligado → 403.
- **Boleto:** linha digitável e código de barras validados (dígitos, valor, vencimento); boleto ligado à duplicata da nota.
- **Emissão:** homologação autorizada, rejeição sem avançar numeração, cancelamento, refresh de nota órfã, envio ao Cofre.
- **Cobrança:** boleto/Pix emitido, webhook repetido não dá baixa dupla.
- **Maquininha:** venda × depósito conciliados com taxa e prazo.
- **Recorrentes (estimado × real):**
  - aluguel fixo gera 12 ocorrências previstas; reajuste por IPCA no mês de aniversário pede confirmação e muda só as futuras;
  - CPFL com histórico de 12 meses estima pelo mesmo mês do ano anterior + tendência, mostrando a memória do cálculo; sem histórico usa a estimativa informada;
  - conta real da CPFL chega por foto/boleto/SIEG, casa pelo número da instalação com a ocorrência prevista e grava real, diferença em R$ e %;
  - conta 40% acima do estimado gera alerta; conta que não chegou até o vencimento gera alerta; mensalidade de cliente não recebida gera alerta de ausência;
  - ocorrência prevista não aparece no DRE nem no caixa realizado; cenários pessimista/provável/otimista e simulação "energia +15%" alteram só a projeção;
  - pausar/encerrar compromisso não apaga ocorrências reais; relatório Previsto × Realizado e precisão da previsão batem com as ocorrências.
- Comprovante ligado ao título sem duplicar despesa.
- Compra de bebidas gera obrigação no CIFREN; entrada no RUSTEN só após confirmação de recebimento.
- Reenvio de evento não duplica lançamento nem estoque; desligar conector não apaga histórico.
- Funcionário não vê outros usuários, unidades nem relatórios restritos; perfil personalizado por ação, empresa, unidade e limite de valor.
- Parcelas, recorrência, baixa parcial, estorno, fechamento e conciliação com trilha; DRE e painel batem com os lançamentos.
- Central (Master): teste grátis, bloqueio por inadimplência e módulo desligado por plano funcionam; central fora do ar mantém a última situação.
- API v1: chave com escopo faltando → 403; chave revogada → 401; OpenAPI aparece no portal.
- WhatsApp: foto enviada vira lançamento para confirmar; número não autorizado não consulta nada.

### 14.2 Segurança e robustez
Testes automáticos entre empresas, IDOR/BOLA, elevação de privilégio, duas etapas, sessão revogada, CSRF, XSS, upload malicioso, prompt injection em documento, repetição de webhook, SSRF no link de XML; nenhuma credencial em log, site, repositório ou relatório.

### 14.3 Infraestrutura (VPS)
- `lorler-sistema adicionar` aceita o repositório sem ajuste manual; `lorler-verificar` mostra o CIFREN com ✓ e os outros sistemas sem mudança antes/depois.
- Atualização automática com versão quebrada volta sozinha para a anterior.
- Backup diário inclui o banco e os arquivos do CIFREN; restauração em banco separado com relatório.

### 14.4 Conclusão de etapa
Pronto = banco real, API real, permissão no backend, testes verdes, documentação, aula gravada e funcionamento comprovado no endereço de teste. Funcionalidade não feita fica marcada como pendente.

## 15. ROTEIRO

**Fase A — Fundação:** repositório no padrão LORLER, instalação pelo kit no endereço de teste, autenticação, multiempresa, RLS, perfis, auditoria, ligação com a central (Master) e módulos de plano.
**Fase B — Financeiro:** cadastros, plano de contas, pagar/receber, parcelas, baixas, caixa e bancos, OFX/CSV, conciliação, **compromissos recorrentes com valor estimado × real, reajustes, alertas de desvio e fluxo projetado com cenários**, relatórios, orçamento, aprovações, fechamento.
**Fase C — Documentos, boleto e Cofre SIEG:** upload, XML, OCR, boleto/Pix, revisão, deduplicação, notas de fornecedores pela SIEG e contas a pagar sugeridas.
**Fase D — Fiscal e cobrança:** emitentes, certificado, emissão em homologação/produção, envio ao Cofre, boleto/Pix pelo Asaas, maquininhas.
**Fase E — IA, WhatsApp e integrações:** agentes, chat, agente do WhatsApp, conectores RUSTEN → ORBI → TORVEN → APOLVEN, Cérebro, API pública v1.
**Fase F — Maturidade:** empréstimos, aplicações, impostos, renegociação, importação de outros sistemas, pacote do contador, vídeo-aulas completas.
**Fase G — Produção:** testes de segurança no próprio ambiente, carga, homologação, revisão LGPD, virada para `cifren.lorler.com.br`.

## 16. PRIMEIRA RESPOSTA DO AGENTE

Antes de escrever código: (1) confirmar que vai seguir o padrão LORLER (GitHub + VPS, kit `VPS Sistemas`, sem Docker); (2) listar o que precisa do dono — repositório `CIFREN` criado e incluído no token da VPS, cadastro do CIFREN como sistema externo na SIEG, conta de homologação na Focus NFe, produto `cifren` cadastrado no Master; (3) apresentar a estrutura do repositório e o plano da Fase A; (4) começar a Fase A. Não declarar integração, emissão ou backup funcionando sem teste comprovado.

## 17. ENTREGÁVEIS

- Código versionado na branch `cloudflare`, migrations com rollback e testes.
- `README.md`, `.env.example` sem segredos, OpenAPI, contratos de webhook, diagrama de entidades, matriz de permissões.
- Manual do usuário, guia de integração, manual do administrador, vídeo-aulas.
- Relatório HASH e bundle no Drive a cada entrega; relatório de testes com evidências e pendências.

## 18. REFERÊNCIAS

- OWASP ASVS 5.0: https://owasp.org/projects/asvs
- Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
- ANPD — guia de segurança para agentes de tratamento de pequeno porte: https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-publica-guia-de-seguranca-para-agentes-de-tratamento-de-pequeno-porte
- API SIEG: documentação oficial da SIEG (conferir tipos de documento e limites antes de habilitar CT-e/NFS-e)
- Focus NFe: documentação oficial (NF-e, NFC-e, NFS-e)
- Padrões internos LORLER: `VPS Sistemas/LEIA-ME.md`, API pública v1 (`claude/api-publica-v1.md`), Cofre SIEG do TORVEN (`claude/torven-cofre-sieg.md`), emissão fiscal (`claude/emissao-fiscal-sieg-videoaulas-2026-10-11.md`)

**FIM DA ESPECIFICAÇÃO — CIFREN / LORLER.**
