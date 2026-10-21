// Pagar a mensalidade (ou outra conta do associado) com o crédito que ele tem no RUSTEN:
// baixa sem mexer no saldo do banco, crédito diminui (espelho, conta de crédito e retorno ao RUSTEN), estorno devolve.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, signup } from './helpers.js';

let env; let A; const ctx = {};
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const lorler = async (path, { method = 'GET', body } = {}) => {
  const r = await fetch(`${env.base}/api/integrations/lorler/v1${path}`, { method, headers: { authorization: `Bearer ${ctx.key}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const entry = (id, kind, cents) => lorler('/account', { method: 'POST', body: { items: [{ external_id: id, customer_external_id: '77', kind, amount_cents: cents, created_at: new Date().toISOString() }] } });
const rustenAccount = async () => (await A.get('/api/accounts')).data.items.find((a) => a.name === 'RUSTEN (recebimentos)');
const creditPayable = async () => (await A.get('/api/titles?kind=pagar&status=abertos')).data.items.find((t) => t.member_credit);

before(async () => {
  env = await boot(); A = await signup(env.base, 'cr1');
  await A.post('/api/members/fees', { amount: 50 });
  const r = await A.post('/api/integrations/connect', { system: 'rusten' });
  ctx.key = JSON.parse(Buffer.from(r.data.code.slice(8), 'base64url').toString()).k;
  const m = await lorler('/members', { method: 'POST', body: { items: [{ external_id: '77', name: 'Norris Associado', cpf: null, active: true }] } });
  ctx.member = m.data.items[0].member_id;
  ctx.fee = (await A.get(`/api/members/${ctx.member}`)).data.fees.find((f) => f.status !== 'cancelado');
  assert.ok(ctx.fee, 'mensalidade gerada');
  ctx.feeId = ctx.fee.title_id || ctx.fee.id;
});
after(async () => { await env.close(); });

test('crédito menor que a conta: recusa sem gravar nada', async () => {
  assert.equal((await entry('c1', 'credito', 3000)).data.items[0].result, 'applied');
  assert.equal((await A.get(`/api/titles/${ctx.feeId}`)).data.rusten_credit, 30);
  const r = await A.post(`/api/titles/${ctx.feeId}/settle`, { method: 'credito_rusten', paid_at: today(), amount: 50 });
  assert.equal(r.status, 409); assert.equal(r.data.code, 'CREDIT_LOW');
  assert.equal((await A.post(`/api/titles/${ctx.feeId}/settle`, { method: 'credito_rusten', paid_at: today(), amount: 30, fine: 2 })).status, 400, 'sem juros/multa');
});

test('paga a mensalidade com o crédito: banco não muda, crédito diminui e o RUSTEN fica sabendo', async () => {
  assert.equal((await entry('c2', 'credito', 9000)).data.items[0].result, 'applied'); // crédito total: 120
  const before = (await rustenAccount()).balance;
  const r = await A.post(`/api/titles/${ctx.feeId}/settle`, { method: 'credito_rusten', paid_at: today(), amount: 50 });
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.status, 'pago'); ctx.sid = r.data.settlement_id;
  const t = (await A.get(`/api/titles/${ctx.feeId}`)).data;
  assert.equal(t.status, 'pago'); assert.equal(t.settlements[0].method, 'credito_rusten'); assert.equal(t.rusten_credit, 70);
  assert.equal((await rustenAccount()).balance, before, 'o dinheiro já tinha entrado com o crédito');
  assert.equal((await creditPayable()).amount, 70, 'crédito do associado em Contas a pagar acompanha');
  const pagos = (await A.get('/api/titles?kind=pagar&status=pagos')).data.items;
  assert.ok(pagos.some((x) => x.description.startsWith('Uso do crédito do associado (RUSTEN)') && x.amount === 50));
  const feed = (await lorler('/payments')).data.items;
  const use = feed.find((x) => x.type === 'uso_credito');
  assert.equal(use.amount_cents, 5000); assert.equal(use.customer_external_id, '77'); ctx.useCursor = use.cursor;
});

test('a saída que equilibra não se estorna sozinha; estornar a baixa devolve o crédito', async () => {
  const pagos = (await A.get('/api/titles?kind=pagar&status=pagos')).data.items;
  const off = (await A.get(`/api/titles/${pagos.find((x) => x.description.startsWith('Uso do crédito')).id}`)).data;
  assert.equal((await A.post(`/api/settlements/${off.settlements[0].id}/reverse`, { reason: 'teste errado' })).status, 409);
  const r = await A.post(`/api/settlements/${ctx.sid}/reverse`, { reason: 'Pago em dinheiro' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const t = (await A.get(`/api/titles/${ctx.feeId}`)).data;
  assert.equal(t.status === 'aberto' || t.status === 'vencido' || t.open_amount === 50, true); assert.equal(t.rusten_credit, 120);
  assert.equal((await A.get(`/api/titles/${off.id}`)).data.status, 'cancelado');
  assert.equal((await creditPayable()).amount, 120);
  const back = (await lorler('/payments')).data.items.find((x) => x.type === 'estorno_uso_credito');
  assert.equal(back.amount_cents, 5000); assert.equal(back.reverses_cursor, ctx.useCursor);
});

test('conta a receber que não é de associado do RUSTEN não aceita a forma', async () => {
  const co = (await A.get('/api/auth/me')).data.companies[0].id;
  const t = await A.post('/api/titles', { company_id: co, kind: 'receber', description: 'Venda avulsa', amount: 10, due_date: today() });
  assert.equal((await A.get(`/api/titles/${t.data.ids[0]}`)).data.rusten_credit, null);
  assert.equal((await A.post(`/api/titles/${t.data.ids[0]}/settle`, { method: 'credito_rusten', paid_at: today(), amount: 10 })).status, 409);
  assert.equal((await A.post(`/api/titles/${t.data.ids[0]}/settle`, { method: 'pix', paid_at: today(), amount: 10 })).status, 400, 'sem conta: pede a conta');
});

test('ficha do associado: Mensalidades mostra só mensalidades (não o crédito, o uso do crédito nem o fiado)', async () => {
  const m = (await A.get(`/api/members/${ctx.member}`)).data;
  assert.ok(m.fees.length >= 1);
  assert.ok(m.fees.every((f) => /^Mensalidade/.test(f.description || 'Mensalidade')), JSON.stringify(m.fees.map((f) => f.description)));
  assert.ok(!m.fees.some((f) => /Crédito|Uso do crédito/.test(f.description || '')));
  assert.ok(!m.next_fee || m.next_fee.amount <= 50);
});

test('inadimplência conferida com o RUSTEN: crédito cobre a mensalidade, quitar pelo relatório e "contas que eu devo" sem o saldo de crédito', async () => {
  const pagar = (await A.get('/api/reports/aging?kind=pagar')).data;
  assert.equal(pagar.buckets.reduce((a, b) => a + b.n, 0), 0, 'o saldo de crédito do associado não é dívida');
  const fee = (await A.get(`/api/titles/${ctx.feeId}`)).data;
  const late = fee.due_date < today();
  const r = (await A.get('/api/reports/aging?kind=receber')).data;
  if (late) {
    const me = r.top.find((t) => t.member_id === ctx.member);
    assert.ok(me, JSON.stringify(r.top));
    assert.equal(me.rusten, true); assert.equal(me.fees, 50); assert.equal(me.credit, 120); assert.equal(me.covered, 50); assert.equal(me.net, 0);
    assert.equal(r.rusten.covered_by_credit, 50);
  }
  const p = await A.post(`/api/members/${ctx.member}/pay-with-credit`, {});
  assert.equal(p.status, 200, JSON.stringify(p.data)); assert.equal(p.data.paid, 50); assert.equal(p.data.credit_left, 70);
  assert.equal((await A.get(`/api/titles/${ctx.feeId}`)).data.status, 'pago');
  assert.equal((await A.post(`/api/members/${ctx.member}/pay-with-credit`, {})).status, 409, 'nada mais em aberto');
});

test('inadimplência: a dívida do associado soma mensalidades e todo o fiado do RUSTEN (vencido ou não)', async () => {
  const m = await lorler('/members', { method: 'POST', body: { items: [{ external_id: '88', name: 'Bruno Fiado', cpf: null, active: true }] } });
  const id = m.data.items[0].member_id;
  const r1 = await lorler('/account', { method: 'POST', body: { items: [{ external_id: 'f88', customer_external_id: '88', kind: 'fiado', amount_cents: -8590, created_at: new Date().toISOString() }] } });
  assert.equal(r1.data.items[0].result, 'applied');
  const fee = (await A.get(`/api/members/${id}`)).data.fees.find((f) => f.status !== 'cancelado');
  const feeLate = fee && fee.due_date < today();
  const r = (await A.get('/api/reports/aging?kind=receber')).data;
  const me = r.top.find((t) => t.member_id === id);
  assert.ok(me, 'associado com fiado a vencer entra na lista');
  assert.equal(me.fiado, 85.9); assert.equal(me.fiado_due, 85.9);
  assert.equal(me.amount, Math.round(((fee ? Number(fee.amount) : 0) + 85.9) * 100) / 100, 'dívida total = mensalidade + fiado');
  assert.equal(me.overdue, feeLate ? Number(fee.amount) : 0);
  assert.equal(r.rusten.fiado_total >= 85.9, true);
});
