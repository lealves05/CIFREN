# CIFREN — gestão financeira multiempresa (LORLER)

Contas a pagar e a receber, caixa e bancos, painel com fluxo de caixa, cadastros, usuários com perfis de acesso e
auditoria — para uma organização com uma ou várias empresas (CNPJs). Padrão LORLER: **GitHub + VPS**.

- Site: `https://cifren.lorler.com.br` (cópia de teste: `cifren-vps.lorler.com.br`)
- Branch publicada: `cloudflare` (a VPS busca sozinha; o GitHub Actions roda os testes e guarda o backup em Release)
- Especificação: `CIFREN_Especificacao_v3.1_Padrao_LORLER.md` (fases B em diante: conciliação, recorrências estimado × real,
  cobrança, Cofre SIEG, emissão fiscal, integração com o Master)

## Estrutura
| Pasta | O que é |
|---|---|
| `backend/` | API Node 22 + Express 5 + PostgreSQL (`src/server.js`). Migrações em `src/migrations/` rodam sozinhas ao iniciar. |
| `frontend/` | Site React 18 + Vite 5 + Tailwind 3 (PWA). |
| `cloudflare/` | `worker.js` + `wrangler.jsonc`: o mesmo porteiro dos outros sistemas (o lorler-edge da VPS usa estes arquivos). |
| `docs/api-interna.md` | Contrato da API usado pelas telas. |

## Segurança (resumo)
- Sessão por cookie `__Host-cifren_s` (HttpOnly, Secure, SameSite=Strict), guardada só como hash; expira em 24 h sem uso / 7 dias.
- Toda alteração exige o cabeçalho `X-CIFREN: 1` (CSRF). Senhas com bcrypt; verificação em duas etapas (TOTP) opcional.
- Isolamento entre organizações por **RLS forçada** no PostgreSQL (`app.org_id` por transação) além dos filtros da API.
- Perfis com permissões por código; ninguém concede o que não tem; o último Dono não sai.
- Auditoria só de inclusão, com hash encadeado (alterar um evento quebra a corrente).
- Na VPS a API só atende o lorler-edge (`EDGE_PROXY_KEY`); segredos ficam no banco (`_secrets`), nunca no Git.

## Desenvolvimento
```bash
# banco local com papel SEM superusuário (para a RLS valer como na VPS)
psql -U postgres -c "create role cifren_app login password 'cifren_app' nosuperuser nobypassrls"
psql -U postgres -c "create database cifren owner cifren_app"
psql -U postgres -c "create database cifren_test owner cifren_app"
cd backend && npm install && DATABASE_URL=postgres://cifren_app:cifren_app@localhost:5432/cifren npm run dev   # porta 3333
cd backend && npm test                                   # usa cifren_test
cd frontend && npm install && npm run dev                # porta 5174, /api vai para a 3333
```

## Na VPS
`VPS-MENU › A` (incluir sistema) → nome `cifren`, repositório `CIFREN`, origem **4) sistema novo**. O kit cria o banco,
a configuração, constrói, liga a API e o site e cria os endereços. Atualizações: `ATUALIZAR-CIFREN.bat` no PC
(backup local em `D:\Programacao\BACKUP-Sistemas` + envio da branch) ou `VPS-MENU › 1`.
