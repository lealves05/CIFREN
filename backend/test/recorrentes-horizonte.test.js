// Compromissos recorrentes: as contas até o fim do próximo mês aparecem em Contas a pagar já ao salvar;
// mudar o compromisso atualiza as contas intocadas; pausar tira as futuras intocadas e retomar devolve.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, signup } from './helpers.js';
import { horizonEnd } from '../src/lib/recurring.js';

let env; let A; const ctx = {};
const pad = (n) => String(n).padStart(2, '0');
const ymd = (x) => `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;

before(async () => {
  env = await boot(); A = await signup(env.base, 'rh');
  ctx.company = (await A.get('/api/auth/me')).data.companies[0].id;
});
after(async () => { await env.close(); });

const open = async () => (await A.get('/api/titles?kind=pagar&status=abertos&limit=200')).data.items.filter((t) => t.source === 'recorrente');

test('horizonte: último dia do mês que vem', () => {
  assert.equal(horizonEnd('2026-10-21'), '2026-11-30');
  assert.equal(horizonEnd('2026-12-05'), '2027-01-31');
  assert.equal(horizonEnd('2026-01-31'), '2026-02-28');
});

test('contas do compromisso até o fim do próximo mês aparecem ao salvar, mesmo com antecedência pequena', async () => {
  const now = new Date();
  const start = ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const r = await A.post('/api/recurring', { kind: 'pagar', name: 'Aluguel', company_id: ctx.company, frequency: 'mensal', due_day: 28, start_date: start, method: 'fixo', estimated_amount: 2600, tolerance_pct: 10, lead_days: 3 });
  assert.equal(r.status, 201, JSON.stringify(r.data)); ctx.rec = r.data.id;
  const list = await open();
  const end = horizonEnd(ymd(now));
  assert.equal(list.length, 2, 'mês atual e próximo mês');
  assert.ok(list.every((t) => t.due_date <= end && t.estimated && t.amount === 2600));
  ctx.titles = list.map((t) => t.id);
});

test('mudar valor e dia atualiza as contas ainda intocadas', async () => {
  const r = await A.put(`/api/recurring/${ctx.rec}`, { estimated_amount: 2750, name: 'Aluguel da loja' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const list = await open();
  assert.equal(list.length, 2);
  assert.ok(list.every((t) => t.amount === 2750 && t.description.startsWith('Aluguel da loja')));
  // conta paga não muda
  const acc = (await A.get('/api/accounts')).data.items[0].id;
  const first = list.sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  assert.equal((await A.post(`/api/titles/${first.id}/settle`, { account_id: acc, paid_at: first.due_date > ymd(new Date()) ? ymd(new Date()) : first.due_date, amount: 2750 })).status, 200);
  await A.put(`/api/recurring/${ctx.rec}`, { estimated_amount: 2900 });
  const paid = (await A.get(`/api/titles/${first.id}`)).data;
  assert.equal(paid.amount, 2750);
  const rest = await open();
  assert.equal(rest.length, 1); assert.equal(rest[0].amount, 2900);
});

test('pausar tira a conta futura intocada; retomar devolve', async () => {
  assert.equal((await A.post(`/api/recurring/${ctx.rec}/pause`, {})).status, 200);
  assert.equal((await open()).length, 0);
  const canc = (await A.get('/api/titles?kind=pagar&status=cancelados')).data.items.filter((t) => t.source === 'recorrente');
  assert.ok(canc.length >= 1);
  assert.equal((await A.post(`/api/recurring/${ctx.rec}/resume`, {})).status, 200);
  assert.equal((await open()).length, 1);
});
