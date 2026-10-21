// Despesa para reembolso: nome ligado ao associado (ou livre), campo evento e reembolso pago ao associado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, signup, client, PASS } from './helpers.js';

let env; let A; let Col; const ctx = {};
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

before(async () => {
  env = await boot(); A = await signup(env.base, 'da1');
  ctx.co = (await A.get('/api/auth/me')).data.companies[0].id;
  ctx.acc = (await A.get('/api/accounts')).data.items[0].id;
  await A.post('/api/members/fees', { amount: 50 });
  ctx.m = (await A.post('/api/members', { company_id: ctx.co, name: 'Felipe Moto Clube', start_month: today().slice(0, 7) })).data;
  assert.ok(ctx.m.id, JSON.stringify(ctx.m));
  const inv = await A.post('/api/users', { name: 'Tesoureiro', email: 'tes@exemplo.com', role_key: 'colaborador' });
  Col = client(env.base);
  await Col.post('/api/auth/login', { email: 'tes@exemplo.com', password: inv.data.temporary_password });
  await Col.put('/api/auth/password', { current_password: inv.data.temporary_password, new_password: PASS });
});
after(async () => { await env.close(); });

test('busca de associados pelo nome (só id e nome), também para quem só lança despesa', async () => {
  const r = await Col.get('/api/expenses/members?q=felipe');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.items, [{ id: ctx.m.id, name: 'Felipe Moto Clube' }]);
  assert.equal((await Col.get('/api/expenses/members?q=ninguem')).data.items.length, 0);
});

test('despesa ligada ao associado com evento; reembolso pago ao associado', async () => {
  const e = await Col.post('/api/expenses', { company_id: ctx.co, title: 'Felipe Moto Clube', member_id: ctx.m.id, event: 'Encontro de motoclubes em Campinas',
    items: [{ date: today(), description: 'Pedágio', amount: 42.5 }] });
  assert.equal(e.status, 201, JSON.stringify(e.data));
  assert.equal(e.data.member.name, 'Felipe Moto Clube'); assert.equal(e.data.event, 'Encontro de motoclubes em Campinas');
  assert.equal((await Col.post(`/api/expenses/${e.data.id}/submit`, {})).status, 200);
  const ap = (await A.get('/api/approvals?status=pendente')).data.items.find((x) => x.entity === 'expense');
  assert.match(ap.summary, /Encontro de motoclubes/);
  assert.equal((await A.post(`/api/approvals/${ap.id}/approve`, {})).status, 200);
  const pay = await A.post(`/api/expenses/${e.data.id}/pay`, { account_id: ctx.acc, paid_at: today() });
  assert.equal(pay.status, 200, JSON.stringify(pay.data));
  const t = (await A.get(`/api/titles/${pay.data.title_id}`)).data;
  assert.equal(t.counterparty.name, 'Felipe Moto Clube', 'favorecido é o associado');
  assert.match(t.description, /Encontro de motoclubes/);
});

test('nome livre (sem associado) continua valendo; associado inexistente é recusado', async () => {
  const e = await Col.post('/api/expenses', { company_id: ctx.co, title: 'Convidado João', event: 'Churrasco', items: [{ date: today(), description: 'Carvão', amount: 30 }] });
  assert.equal(e.status, 201); assert.equal(e.data.member, null); assert.equal(e.data.event, 'Churrasco');
  const bad = await Col.post('/api/expenses', { company_id: ctx.co, title: 'X Y', member_id: '00000000-0000-4000-8000-000000000000', items: [{ date: today(), description: 'a', amount: 1 }] });
  assert.equal(bad.status, 400);
  const u = await Col.put(`/api/expenses/${e.data.id}`, { member_id: ctx.m.id, title: 'Felipe Moto Clube' });
  assert.equal(u.status, 200); assert.equal(u.data.member.id, ctx.m.id); assert.equal(u.data.event, 'Churrasco', 'evento mantido');
});
