// Filtro por categoria em Contas a pagar/receber: categoria exata, principal com subcategorias, "sem categoria" e totais.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, signup } from './helpers.js';

let env; let A; const ctx = {};
const d = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

before(async () => {
  env = await boot(); A = await signup(env.base, 'fc');
  ctx.company = (await A.get('/api/auth/me')).data.companies[0].id;
  const pai = await A.post('/api/categories', { name: 'Ocupação', type: 'despesa' });
  assert.equal(pai.status, 201, JSON.stringify(pai.data));
  ctx.pai = pai.data.id;
  ctx.filha = (await A.post('/api/categories', { name: 'Condomínio', type: 'despesa', parent_id: ctx.pai })).data.id;
  ctx.outra = (await A.post('/api/categories', { name: 'Marketing teste', type: 'despesa' })).data.id;
  const mk = (description, amount, category_id) => A.post('/api/titles', { company_id: ctx.company, kind: 'pagar', description, amount, due_date: d(5), category_id });
  for (const r of [await mk('Aluguel sala', 1000, ctx.pai), await mk('Condomínio out', 300, ctx.filha), await mk('Anúncio', 50, ctx.outra), await mk('Sem cat', 20, null)]) assert.equal(r.status, 201, JSON.stringify(r.data));
});
after(async () => { await env.close(); });

const names = (r) => r.data.items.map((t) => t.description).sort();

test('filtra por categoria (principal traz as subcategorias) e por "sem categoria"', async () => {
  let r = await A.get(`/api/titles?kind=pagar&category_id=${ctx.pai}`);
  assert.deepEqual(names(r), ['Aluguel sala', 'Condomínio out']);
  assert.equal(r.data.totals.amount, 1300);
  r = await A.get(`/api/titles?kind=pagar&category_id=${ctx.filha}`);
  assert.deepEqual(names(r), ['Condomínio out']);
  r = await A.get(`/api/titles?kind=pagar&category_id=${ctx.outra}`);
  assert.deepEqual(names(r), ['Anúncio']);
  r = await A.get('/api/titles?kind=pagar&category_id=sem');
  assert.deepEqual(names(r), ['Sem cat']);
  assert.equal(r.data.totals.amount, 20);
  r = await A.get('/api/titles?kind=pagar&category_id=xyz');
  assert.equal(r.data.items.length, 4, 'valor inválido é ignorado');
});
