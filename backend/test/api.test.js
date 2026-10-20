// Integração da Fase A: conta, permissões, cadastros, títulos, baixas, painel, auditoria e isolamento entre organizações (RLS).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, client, signup, PASS } from './helpers.js';

let env; let A; let B;
const ctx = {};
before(async () => { env = await boot(); A = await signup(env.base, 'a'); B = await signup(env.base, 'b'); });
after(async () => { await env.close(); });

test('saúde e proteção do navegador (CSRF)', async () => {
  const c = client(env.base);
  assert.equal((await c.get('/api/health')).data.ok, true);
  const r = await A.post('/api/counterparties', { name: 'X' }, { 'x-cifren': '0' });
  assert.equal(r.status, 403);
  assert.equal((await c.get('/api/titles')).status, 401);
});

test('me: dono com todas as permissões, uma empresa, conta Caixa e categorias padrão', async () => {
  const me = (await A.get('/api/auth/me')).data;
  assert.equal(me.role.key, 'dono');
  assert.ok(me.permissions.includes('perfis.gerenciar'));
  assert.equal(me.companies.length, 1);
  assert.equal(me.company_scope, null);
  assert.equal(me.access, null);
  ctx.companyA = me.companies[0].id;
  const acc = (await A.get('/api/accounts')).data.items;
  assert.equal(acc.length, 1); assert.equal(acc[0].name, 'Caixa');
  const cats = (await A.get('/api/categories')).data.items;
  assert.ok(cats.length > 20);
  ctx.catAluguel = cats.find((c) => c.name === 'Aluguel').id;
  ctx.catVendas = cats.find((c) => c.name === 'Vendas de produtos').id;
});

test('cadastros e conta bancária com saldo inicial', async () => {
  const f = await A.post('/api/counterparties', { kind: 'fornecedor', name: 'Imobiliária Sol', document: '12.345.678/0001-90' });
  assert.equal(f.status, 201); ctx.forn = f.data.id;
  assert.equal((await A.post('/api/counterparties', { name: 'Y', email: 'não-é-email' })).status, 400);
  const a = await A.post('/api/accounts', { company_id: ctx.companyA, name: 'Banco X', type: 'banco', opening_balance: 1000, opening_date: '2026-01-01' });
  assert.equal(a.status, 201); assert.equal(a.data.balance, 1000); ctx.acc = a.data.id;
  const cc = await A.post('/api/cost-centers', { name: 'Loja' });
  assert.equal(cc.status, 201);
  // categoria de receita não serve para conta a pagar
  const bad = await A.post('/api/titles', { kind: 'pagar', company_id: ctx.companyA, description: 'x', due_date: '2026-10-10', amount: 10, category_id: ctx.catVendas });
  assert.equal(bad.status, 400);
});

test('título parcelado: centavos na última parcela', async () => {
  const r = await A.post('/api/titles', { kind: 'pagar', company_id: ctx.companyA, description: 'Aluguel', due_date: '2026-01-31', amount: 1000,
    installments: 3, counterparty_id: ctx.forn, category_id: ctx.catAluguel });
  assert.equal(r.status, 201); assert.equal(r.data.ids.length, 3);
  ctx.parc = r.data.ids;
  const l = (await A.get('/api/titles?kind=pagar&status=todos')).data;
  assert.deepEqual(l.items.map((t) => t.amount), [333.33, 333.33, 333.34]);
  assert.deepEqual(l.items.map((t) => t.due_date), ['2026-01-31', '2026-02-28', '2026-03-31']);
  assert.equal(l.totals.amount, 1000);
  assert.equal(l.items[0].counterparty.name, 'Imobiliária Sol');
  // paginação
  const p1 = (await A.get('/api/titles?kind=pagar&status=todos&limit=2')).data;
  assert.equal(p1.items.length, 2); assert.ok(p1.next_cursor);
  const p2 = (await A.get(`/api/titles?kind=pagar&status=todos&limit=2&cursor=${p1.next_cursor}`)).data;
  assert.equal(p2.items.length, 1); assert.equal(p2.next_cursor, null);
});

test('baixa parcial, quitação com juros, estorno e saldo da conta', async () => {
  const id = ctx.parc[0];
  let r = await A.post(`/api/titles/${id}/settle`, { account_id: ctx.acc, paid_at: '2026-02-01', amount: 100, method: 'pix' });
  assert.equal(r.status, 200); assert.equal(r.data.status, 'parcial');
  r = await A.post(`/api/titles/${id}/settle`, { account_id: ctx.acc, paid_at: '2026-02-02', amount: 500 });
  assert.equal(r.status, 400, 'não baixa mais que o saldo em aberto');
  r = await A.post(`/api/titles/${id}/settle`, { account_id: ctx.acc, paid_at: '2026-02-02', amount: 233.33, interest: 5, fine: 2 });
  assert.equal(r.data.status, 'pago');
  let acc = (await A.get('/api/accounts')).data.items.find((a) => a.id === ctx.acc);
  assert.equal(acc.balance, 1000 - 100 - 240.33);
  const t = (await A.get(`/api/titles/${id}`)).data;
  assert.equal(t.settlements.length, 2); assert.equal(t.open_amount, 0);
  r = await A.post(`/api/settlements/${t.settlements[1].id}/reverse`, { reason: 'lançado errado' });
  assert.equal(r.data.status, 'parcial');
  assert.equal((await A.post(`/api/settlements/${t.settlements[1].id}/reverse`, { reason: 'de novo' })).status, 409);
  acc = (await A.get('/api/accounts')).data.items.find((a) => a.id === ctx.acc);
  assert.equal(acc.balance, 900);
  // valor não muda com baixa ativa; cancelar também não
  assert.equal((await A.put(`/api/titles/${id}`, { amount: 10 })).status, 409);
  assert.equal((await A.post(`/api/titles/${id}/cancel`, { reason: 'teste' })).status, 409);
  // título sem baixa: altera e cancela
  assert.equal((await A.put(`/api/titles/${ctx.parc[2]}`, { amount: 400, due_date: '2026-04-05' })).status, 200);
  assert.equal((await A.post(`/api/titles/${ctx.parc[2]}/cancel`, { reason: 'contrato encerrado' })).status, 200);
  assert.equal((await A.post(`/api/titles/${ctx.parc[2]}/settle`, { account_id: ctx.acc, paid_at: '2026-02-02', amount: 1 })).status, 409);
});

test('painel: caixa, vencidos e fluxo', async () => {
  await A.post('/api/titles', { kind: 'receber', company_id: ctx.companyA, description: 'Venda', due_date: '2026-01-10', amount: 250, category_id: ctx.catVendas });
  const d = (await A.get('/api/dashboard')).data;
  assert.equal(d.cash.total, 900);
  assert.equal(d.receivables.overdue.n, 1);
  assert.equal(d.payables.overdue.amount, 566.66);
  assert.equal(d.flow.length, 30);
  assert.equal(d.flow[0].balance, 583.34);
  assert.ok(d.upcoming.length >= 2);
});

test('isolamento entre organizações (API e RLS do banco)', async () => {
  assert.equal((await B.get(`/api/titles/${ctx.parc[0]}`)).status, 404);
  assert.equal((await B.get('/api/titles?status=todos')).data.items.length, 0);
  assert.equal((await B.put(`/api/accounts/${ctx.acc}`, { name: 'roubada' })).status, 404);
  assert.equal((await B.post(`/api/titles/${ctx.parc[1]}/settle`, { account_id: ctx.acc, paid_at: '2026-02-01', amount: 1 })).status, 404);
  const meB = (await B.get('/api/auth/me')).data;
  const r = await B.post('/api/titles', { kind: 'pagar', company_id: ctx.companyA, description: 'x', due_date: '2026-10-10', amount: 1 });
  assert.equal(r.status, 400, 'empresa de outra organização é inválida');
  const r2 = await B.post('/api/titles', { kind: 'pagar', company_id: meB.companies[0].id, description: 'x', due_date: '2026-10-10', amount: 1, counterparty_id: ctx.forn });
  assert.equal(r2.status, 400, 'cadastro de outra organização é inválido');
  // direto no banco, sem app.org_id: nada aparece; com o id de B: só B
  const { rows: [n0] } = await env.pool.query('select count(*)::int as n from titles');
  assert.equal(n0.n, 0);
  const c = await env.pool.connect();
  try {
    await c.query('begin'); await c.query("select set_config('app.org_id', $1, true)", [meB.org.id]);
    const { rows: [n1] } = await c.query('select count(*)::int as n from companies');
    assert.equal(n1.n, 1);
    await assert.rejects(c.query('insert into companies (org_id, name) values ($1, $2)', [(await A.get('/api/auth/me')).data.org.id, 'invasora']));
  } finally { await c.query('rollback'); c.release(); }
});

test('usuários e perfis: convite, senha provisória, permissões e escalada', async () => {
  const inv = await A.post('/api/users', { name: 'Ana Lança', email: 'ana@exemplo.com', role_key: 'lancamentos' });
  assert.equal(inv.status, 201); assert.ok(inv.data.temporary_password);
  const U = client(env.base);
  assert.equal((await U.post('/api/auth/login', { email: 'ana@exemplo.com', password: inv.data.temporary_password })).status, 200);
  const blocked = await U.get('/api/titles');
  assert.equal(blocked.status, 403); assert.equal(blocked.data.code, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await U.put('/api/auth/password', { current_password: inv.data.temporary_password, new_password: 'curta' })).status, 400);
  assert.equal((await U.put('/api/auth/password', { current_password: inv.data.temporary_password, new_password: PASS })).status, 200);
  assert.equal((await U.get('/api/titles')).status, 200);
  assert.equal((await U.post(`/api/titles/${ctx.parc[1]}/settle`, { account_id: ctx.acc, paid_at: '2026-02-01', amount: 1 })).status, 403);
  assert.equal((await U.get('/api/users')).status, 403);
  assert.equal((await U.get('/api/audit')).status, 403);
  // administrador não concede o que não tem (perfis.gerenciar)
  const adm = await A.post('/api/users', { name: 'Adm', email: 'adm@exemplo.com', role_key: 'administrador' });
  const D = client(env.base);
  await D.post('/api/auth/login', { email: 'adm@exemplo.com', password: adm.data.temporary_password });
  assert.equal(adm.status, 201, JSON.stringify(adm.data));
  const ch = await D.put('/api/auth/password', { current_password: adm.data.temporary_password, new_password: PASS });
  assert.equal(ch.status, 200, JSON.stringify(ch.data));
  const esc = await D.post('/api/users', { name: 'Zeca', email: 'z@exemplo.com', role_key: 'dono' });
  assert.equal(esc.status, 403, JSON.stringify(esc.data));
  const me = (await A.get('/api/auth/me')).data;
  assert.equal((await D.put(`/api/users/${me.user.id}`, { active: false })).status, 403, 'não mexe em quem tem mais poder');
  // o último Dono não sai
  assert.equal((await A.put(`/api/users/${me.user.id}`, { role_key: 'financeiro' })).status, 409);
  // perfil personalizado
  const roles = (await A.get('/api/roles')).data;
  assert.ok(roles.catalog.length > 0);
  const nr = await A.post('/api/roles', { name: 'Só painel', permissions: ['financeiro.painel.visualizar'] });
  assert.equal(nr.status, 201);
  assert.equal((await A.post('/api/roles', { name: 'Ruim', permissions: ['nao.existe'] })).status, 400);
  // mudar o perfil vale na hora (sessões do usuário caem)
  const ana = (await A.get('/api/users')).data.items.find((u) => u.email === 'ana@exemplo.com');
  assert.equal((await A.put(`/api/users/${ana.id}`, { role_key: nr.data.key })).status, 200);
  assert.equal((await U.get('/api/titles')).status, 401);
});

test('escopo de empresas: usuário só vê a empresa permitida', async () => {
  const c2 = await A.post('/api/companies', { name: 'Filial Norte', document: '98.765.432/0001-10' });
  assert.equal(c2.status, 201);
  await A.post('/api/titles', { kind: 'pagar', company_id: c2.data.id, description: 'Energia filial', due_date: '2026-11-10', amount: 80 });
  const inv = await A.post('/api/users', { name: 'Filial', email: 'filial@exemplo.com', role_key: 'financeiro', company_ids: [c2.data.id] });
  const F = client(env.base);
  await F.post('/api/auth/login', { email: 'filial@exemplo.com', password: inv.data.temporary_password });
  await F.put('/api/auth/password', { current_password: inv.data.temporary_password, new_password: PASS });
  const l = (await F.get('/api/titles?status=todos')).data.items;
  assert.equal(l.length, 1); assert.equal(l[0].description, 'Energia filial');
  assert.equal((await F.get(`/api/titles/${ctx.parc[1]}`)).status, 404);
  assert.equal((await F.post('/api/titles', { kind: 'pagar', company_id: ctx.companyA, description: 'x', due_date: '2026-10-10', amount: 1 })).status, 403);
  assert.deepEqual((await F.get('/api/auth/me')).data.companies.map((c) => c.id), [c2.data.id]);
});

test('auditoria encadeada e íntegra; eventos não podem ser alterados', async () => {
  const a = (await A.get('/api/audit?limit=5')).data;
  assert.equal(a.items.length, 5); assert.ok(a.next_cursor);
  const me = (await A.get('/api/auth/me')).data;
  const { orgTx } = await import('../src/db.js');
  const { verifyChain } = await import('../src/audit.js');
  const v = await orgTx(me.org.id, (db) => verifyChain(db));
  assert.equal(v.ok, true); assert.ok(v.n > 10);
  await assert.rejects(orgTx(me.org.id, (db) => db.query("update audit_events set summary='x'")));
});

test('sessões: sair encerra a sessão', async () => {
  const C = client(env.base);
  await C.post('/api/auth/login', { email: 'donob@exemplo.com', password: PASS });
  assert.equal((await C.get('/api/auth/me')).status, 200);
  assert.equal((await C.post('/api/auth/login', { email: 'donob@exemplo.com', password: 'errada-123456' })).status, 401);
  await C.post('/api/auth/logout');
  assert.equal((await C.get('/api/auth/me')).status, 401);
});
