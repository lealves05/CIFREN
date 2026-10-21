# CIFREN — Fase B (arquitetura completa)

Data: 21/10/2026 · Repositório `lealves05/CIFREN`, branch `cloudflare` · versão da API `2026.10-b`.
Base: a imagem de arquitetura enviada pelo Leandro (usuários, entradas, módulos, agentes de IA, segurança, saídas).

## O que entrou

**Perfis** (prontos, editáveis em Usuários › Perfis): Dono, Administrador, Gestor, Financeiro, Aprovador, Lançamentos, Colaborador, Contador, Auditor.
Organizações antigas recebem os perfis e permissões novos sozinhas na subida (`perm_version`).

**Entradas**
- Notas fiscais: upload do XML da NF-e (leitura exata, uma conta por duplicata, nota repetida recusada pela chave de acesso); foto/PDF lidos pela IA; QR da NFC-e.
- Extratos: OFX e CSV (colunas detectadas) → conciliação.
- Boletos (linha digitável 47/48 com dígitos verificadores) e Pix copia-e-cola (CRC).
- Movimentos dos sistemas LORLER (TORVEN, ORBI, RUSTEN, APOLVEN) por chave de integração.
- Lançamentos manuais com aprovação por alçada.

**Módulos**: Contas a pagar (com aprovação) e a receber · Conciliação bancária · Fluxo de caixa previsto × realizado · DRE gerencial (competência ou caixa) · Centros de custo · Gestão de compras (solicitação → aprovação → pedido → recebimento → faturamento) · Despesas e reembolsos · Gestão de documentos · Compromissos recorrentes (estimado × real).

**Agentes de IA** (Anthropic/Claude, chave da própria organização em Configurações › IA, cifrada, limite mensal): Documentos (extrai foto/PDF), Financeiro (pergunte ao financeiro, só com os números do sistema), Conciliação (sugere categoria), Insights (com e sem IA). Agente de Compras usa só o histórico (sem IA). A IA só sugere; quem grava é o usuário. Texto de documento é tratado como dado, nunca instrução.

**Segurança**: 2 etapas (e exigência para toda a organização → 403 `MFA_SETUP_REQUIRED`), perfis personalizados, escopo por empresa, dados sensíveis mascarados sem `cadastros.dados_sensiveis`, auditoria encadeada por hash, RLS em todas as tabelas novas.

**Saídas**: relatórios, painel com pendências e insights, exportação CSV/XLSX (contas, DRE, fluxo) e lançamentos para o contador (layout genérico, não é SPED), notificações no sino + resumo diário por e-mail (SMTP da organização), API de indicadores para o Cérebro.

## Fora desta fase
WhatsApp, SPED/ECD, cobrança por boleto/Pix emitido pelo CIFREN, maquininhas, Cofre SIEG, emissão de nota. Docker/Redis da imagem foram trocados pelo padrão LORLER (systemd + PostgreSQL na VPS; rotina em segundo plano a cada 10 min no próprio processo).

## Para o dono ligar
1. Configurações › IA: colar a chave da Anthropic (`sk-ant-…`), escolher o modelo, ligar.
2. Configurações › Notificações: e-mail (SMTP) da organização, se quiser o resumo diário.
3. Configurações › Aprovações: alçadas (ex.: contas a pagar acima de R$ 1.000).
4. Configurações › Integrações: gerar a chave de cada sistema LORLER e colar no sistema de origem.

## Testes
`cd backend && npm test` — 29 testes (14 da Fase A + 15 da Fase B); telas testadas no navegador em celular e computador, com papel sem superusuário (RLS valendo) e uma Anthropic falsa local.
