// Integração RUSTEN → CIFREN: conexão por código, associado automático, fiado/crédito espelhados, pagamentos de volta e isolamento.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, signup } from './helpers.js';

let env; let A; let B; const ctx = {};
const day = () => new Date().toISOString().slice(0, 10);
const api = async (path, { method = 'GET', body, key = ctx.key } = {}) => {
  const r = await fetch(`${env.base}/api/integrations/lorler/v1${path}`, { method, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => null) };
};

before(async () => { env = await boot(); A = await signup(env.base, 'ru1'); B = await signup(env.base, 'ru2'); });
after(async () => { await env.close(); });

test('conectar: um código com endereço e chave; link abre o RUSTEN já conectando', async () => {
  await A.post('/api/members/fees', { amount: 50 });
  const r = await A.post('/api/integrations/connect', { system: 'rusten' });
  assert.equal(r.status, 201); assert.match(r.data.code, /^LORLER1\./);
  const j = JSON.parse(Buffer.from(r.data.code.slice(8), 'base64url').toString());
  assert.equal(j.s, 'rusten'); assert.match(j.k, /^ck_rusten_/); assert.match(j.u, /\/api\/integrations\/lorler\/v1$/);
  assert.match(r.data.connect_url, /^https:\/\/rusten\.lorler\.com\.br\/configuracoes\/cifren#codigo=LORLER1\./);
  ctx.key = j.k; ctx.keyId = r.data.id;
  const h = await api('/hello');
  assert.equal(h.status, 200); assert.equal(h.data.system, 'rusten'); assert.ok(h.data.org);
  const list = (await A.get('/api/integrations')).data;
  const ru = list.systems.find((x) => x.system === 'rusten');
  assert.equal(ru.connected, true); assert.equal(ru.settings.fiado_due_days, 30);
  // conectar de novo encerra a conexão anterior
  const r2 = await A.post('/api/integrations/connect', { system: 'rusten' });
  assert.equal((await api('/hello')).status, 401);
  ctx.key = JSON.parse(Buffer.from(r2.data.code.slice(8), 'base64url').toString()).k; ctx.keyId = r2.data.id;
  assert.equal((await A.put(`/api/integrations/${ctx.keyId}/settings`, { fiado_due_days: 10 })).status, 200);
});

test('etiqueta Associado: cria o associado (com mensalidade), atualiza, suspende e reativa', async () => {
  const r = await api('/members', { method: 'POST', body: { items: [{ external_id: '41', name: 'Carlos Bar', cpf: '52998224725', phone: '19999998888', email: null, active: true }] } });
  assert.equal(r.status, 200); assert.equal(r.data.items[0].result, 'created'); ctx.member = r.data.items[0].member_id;
  assert.equal((await api('/members', { method: 'POST', body: { items: [{ external_id: '41', name: 'Carlos Bar', cpf: '52998224725', phone: '19999998888', active: true }] } })).data.items[0].result, 'unchanged');
  const m = (await A.get(`/api/members/${ctx.member}`)).data;
  assert.equal(m.source, 'rusten'); assert.equal(m.whatsapp, '5519999998888'); assert.ok(m.fees.length >= 1, 'gera mensalidade pela tabela');
  assert.equal((await api('/members', { method: 'POST', body: { items: [{ external_id: '41', name: 'Carlos do Bar', active: false }] } })).data.items[0].result, 'suspended');
  assert.equal((await A.get(`/api/members/${ctx.member}`)).data.status, 'suspenso');
  assert.equal((await api('/members', { method: 'POST', body: { items: [{ external_id: '41', name: 'Carlos do Bar', active: true }] } })).data.items[0].result, 'reactivated');
});

test('conta: fiado vira conta a receber, pagamento baixa, crédito entra no caixa, estorno desfaz', async () => {
  const now = new Date().toISOString();
  const send = (items) => api('/account', { method: 'POST', body: { items } });
  let r = await send([{ external_id: '900', customer_external_id: '999', kind: 'fiado', amount_cents: -1000, created_at: now }]);
  assert.equal(r.data.items[0].result, 'error'); assert.equal(r.data.items[0].error.code, 'member_not_linked');
  r = await send([
    { external_id: '1', customer_external_id: '41', kind: 'fiado', amount_cents: -4590, reason: 'Consumo #10', created_at: now },
    { external_id: '2', customer_external_id: '41', kind: 'fiado', amount_cents: -2000, reason: 'Consumo #11', created_at: now },
    { external_id: '3', customer_external_id: '41', kind: 'pagamento_fiado', amount_cents: 5000, created_at: now },
    { external_id: '4', customer_external_id: '41', kind: 'credito', amount_cents: 3000, created_at: now },
    { external_id: '5', customer_external_id: '41', kind: 'uso_credito', amount_cents: -1000, created_at: now },
  ]);
  assert.deepEqual(r.data.items.map((x) => x.result), ['applied', 'applied', 'applied', 'applied', 'applied'], JSON.stringify(r.data));
  assert.equal((await send([{ external_id: '1', customer_external_id: '41', kind: 'fiado', amount_cents: -4590, created_at: now }])).data.items[0].result, 'duplicate');
  const openFiado = async () => (await A.get('/api/titles?kind=receber&status=todos')).data.items
    .filter((t) => t.source === 'rusten' && /^(Fiado|Ajuste de saldo) RUSTEN/.test(t.description) && ['aberto', 'parcial'].includes(t.status));
  const sumOpen = async () => Math.round((await openFiado()).reduce((x, t) => x + t.open_amount, 0) * 100) / 100;
  const rec = (await A.get('/api/titles?kind=receber&status=todos')).data.items.filter((t) => t.source === 'rusten');
  const fiados = rec.filter((t) => /^Fiado RUSTEN/.test(t.description));
  assert.equal(fiados.length, 2);
  const due = fiados[0].due_date; const exp = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  assert.ok(Math.abs(Date.parse(due) - Date.parse(exp)) <= 86400000 * 1.1, 'vencimento = data + prazo configurado (10 dias)');
  // regra de ouro: fiado em aberto no CIFREN = débito no RUSTEN (aqui o cliente ficou com crédito de 4,10)
  assert.equal(await sumOpen(), 0);
  assert.ok(rec.some((t) => /^Crédito antecipado RUSTEN/.test(t.description) && t.status === 'pago'));
  const acc = (await A.get('/api/accounts')).data.items.find((a) => a.name === 'RUSTEN (recebimentos)');
  assert.equal(acc.balance, 80, 'pagamento 50 + crédito 30 entraram no caixa');
  const m = (await A.get(`/api/members/${ctx.member}`)).data;
  assert.equal(m.account.balance, 4.1); assert.equal(m.account.credit, 4.1);
  // crédito do associado aparece em Contas a pagar (e não dá para pagar/editar aqui)
  const credPay = async () => (await A.get('/api/titles?kind=pagar&status=todos')).data.items.find((t) => /^Crédito do associado \(RUSTEN\)/.test(t.description));
  let cp = await credPay();
  assert.equal(cp.amount, 4.1); assert.equal(cp.status, 'aberto');
  const acc0 = (await A.get('/api/accounts')).data.items[0].id;
  assert.equal((await A.post(`/api/titles/${cp.id}/settle`, { account_id: acc0, paid_at: day(), amount: 4.1 })).status, 409);
  assert.equal((await A.put(`/api/titles/${cp.id}`, { amount: 1 })).status, 409);
  // estorno do pagamento e do 2º fiado: saldo -25,90
  r = await send([{ external_id: '6', customer_external_id: '41', kind: 'estorno', amount_cents: -5000, reverses_external_id: '3', created_at: now },
    { external_id: '7', customer_external_id: '41', kind: 'estorno', amount_cents: 2000, reverses_external_id: '2', created_at: now }]);
  assert.deepEqual(r.data.items.map((x) => x.result), ['applied', 'applied']);
  assert.equal(await sumOpen(), 25.9);
  assert.equal((await credPay()).status, 'cancelado', 'sem crédito, a conta a pagar some');
  assert.equal((await A.get('/api/accounts')).data.items.find((a) => a.name === 'RUSTEN (recebimentos)').balance, 30, 'pagamento estornado saiu do caixa');
  // perdão (ajuste +5,90): saldo -20
  await send([{ external_id: '8', customer_external_id: '41', kind: 'ajuste', amount_cents: 590, reason: 'desconto', created_at: now }]);
  assert.equal(await sumOpen(), 20);
  // novo fiado com o cliente devendo: soma
  await send([{ external_id: '9', customer_external_id: '41', kind: 'fiado', amount_cents: -1000, created_at: now }]);
  assert.equal(await sumOpen(), 30);
  assert.equal((await A.get(`/api/members/${ctx.member}`)).data.account.balance, -30);
  ctx.fiado = (await openFiado())[0].id;
});

test('pagamento feito no CIFREN volta para o RUSTEN; estorno do que veio do RUSTEN é bloqueado aqui', async () => {
  const acc = (await A.get('/api/accounts')).data.items[0].id;
  const open = (await A.get(`/api/titles/${ctx.fiado}`)).data.open_amount;
  assert.equal((await A.post(`/api/titles/${ctx.fiado}/settle`, { account_id: acc, paid_at: day(), amount: open, method: 'pix' })).status, 200);
  let p = await api('/payments?after=0');
  assert.equal(p.data.items.length, 1); assert.equal(p.data.items[0].type, 'pagamento'); assert.equal(p.data.items[0].amount_cents, Math.round(open * 100)); assert.equal(p.data.items[0].customer_external_id, '41');
  assert.equal((await A.get(`/api/members/${ctx.member}`)).data.account.balance, Math.round((-30 + open) * 100) / 100, 'o espelho já conta o recebimento');
  const t = (await A.get(`/api/titles/${ctx.fiado}`)).data;
  const mine = t.settlements.find((s) => Number(s.amount) === open);
  assert.equal((await A.post(`/api/settlements/${mine.id}/reverse`, { reason: 'errado' })).status, 200);
  p = await api(`/payments?after=${p.data.next_cursor}`);
  assert.equal(p.data.items[0].type, 'estorno'); assert.ok(p.data.items[0].reverses_cursor);
  const fromRusten = (await A.get('/api/titles?kind=receber&status=todos')).data.items.find((x) => x.status === 'pago' && /^Crédito antecipado/.test(x.description));
  const st = (await A.get(`/api/titles/${fromRusten.id}`)).data.settlements[0];
  assert.equal((await A.post(`/api/settlements/${st.id}/reverse`, { reason: 'teste' })).status, 409);
});

test('isolamento: a chave de uma organização não enxerga a outra', async () => {
  assert.equal((await B.get('/api/members')).data.items.length, 0);
  const rb = await B.post('/api/integrations/connect', { system: 'rusten' });
  const kb = JSON.parse(Buffer.from(rb.data.code.slice(8), 'base64url').toString()).k;
  const r = await api('/account', { method: 'POST', key: kb, body: { items: [{ external_id: '1', customer_external_id: '41', kind: 'fiado', amount_cents: -100, created_at: new Date().toISOString() }] } });
  assert.equal(r.data.items[0].error.code, 'member_not_linked');
  assert.equal((await api('/payments?after=0', { key: kb })).data.items.length, 0);
  assert.equal((await api('/hello', { key: 'ck_rusten_' + 'x'.repeat(30) })).status, 401);
});
