// Central de Atendimento (contrato v1.4): o CIFREN repassa o chat do usuário logado para a central.
// Uma central falsa (servidor HTTP local) confere a assinatura e guarda o que recebeu.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';

const SECRET = 'segredo-de-teste-da-central-atendimento-0123';
const calls = []; const mails = [];
let reply = null; // resposta forçada da próxima chamada de chat: { status, body }
const fake = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const route = req.url.replace(/^\/api\/hub\/v1/, '');
    const ts = req.headers['x-platform-timestamp'];
    const want = crypto.createHmac('sha256', SECRET).update(`${ts}\n${req.method}\n${route}\n${crypto.createHash('sha256').update(raw).digest('hex')}`).digest('hex');
    const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.headers['x-platform-signature'] !== want || req.headers['x-platform-product'] !== 'cifren') return send(401, { error: 'assinatura' });
    if (route === '/mail/account') { mails.push(JSON.parse(raw)); return send(200, { ok: true }); } // e-mails de acesso (senha provisória)
    if (!route.startsWith('/support/')) return send(200, { access: { status: 'ACTIVE', blocked: false } }); // cadastro/situação da organização
    calls.push({ method: req.method, route, body: raw ? JSON.parse(raw) : null });
    if (reply) { const r = reply; reply = null; return send(r.status, r.body); }
    if (req.method === 'GET') return send(200, { assistant: { name: 'Lia', greeting: 'Olá!', available: true }, conversation: null, messages: [], actions: [], me: { can_approve: true } });
    if (route.endsWith('/messages')) return send(200, { handled_by: 'ia' });
    return send(200, { ok: true, id: 'x' });
  });
});
await new Promise((ok) => fake.listen(0, '127.0.0.1', ok));
process.env.PLATFORM_HUB_URL = `http://127.0.0.1:${fake.address().port}`;
process.env.PLATFORM_SECRET = SECRET;
process.env.PLATFORM_MODE = 'standalone';
const { boot, client, signup, PASS } = await import('./helpers.js');

let env; let A; let me;
before(async () => { env = await boot(); A = await signup(env.base, 'sc'); me = (await A.get('/api/auth/me')).data; });
after(async () => { await env.close(); fake.close(); });
const last = () => calls[calls.length - 1];

test('suporte: sem sessão → 401 e nada chega à central', async () => {
  const n = calls.length;
  assert.equal((await client(env.base).get('/api/support-chat')).status, 401);
  assert.equal((await client(env.base).post('/api/support-chat/messages', { body: 'oi' })).status, 401);
  assert.equal(calls.length, n);
});

test('suporte: usuário e organização vêm da sessão, não do corpo', async () => {
  const v = await A.get('/api/support-chat?after=2026-10-01T10:00:00.000Z');
  assert.equal(v.status, 200); assert.equal(v.data.assistant.name, 'Lia');
  assert.equal(last().route, `/support/tenants/${me.org.id}/chat?after=2026-10-01T10%3A00%3A00.000Z&can_approve=1&owner=1`);

  const s = await A.post('/api/support-chat/messages', { body: '  Como lanço uma conta?  ', user: { ref: 'outro', name: 'Invasor', can_approve: true, is_owner: true }, org_id: crypto.randomUUID() });
  assert.equal(s.status, 200); assert.equal(s.data.handled_by, 'ia');
  assert.equal(last().route, `/support/tenants/${me.org.id}/chat/messages`);
  assert.deepEqual(last().body, { user: { ref: me.user.id, name: 'Dono sc', can_approve: true, is_owner: true }, body: 'Como lanço uma conta?' });

  assert.equal((await A.post('/api/support-chat/messages', { body: '' })).status, 400);
  assert.equal((await A.post('/api/support-chat/messages', { body: 'x'.repeat(6001) })).status, 400);

  // perfil sem "alterar configurações" e que não é Dono/Administrador
  const inv = await A.post('/api/users', { name: 'Lu Lança', email: 'lu@sc.com', role_key: 'lancamentos' });
  // regra do ecossistema: com a central ligada, a senha provisória vai por e-mail (modelo user-temp-password) e não volta para a tela
  const mail = mails.at(-1);
  assert.equal(mail.kind, 'user-temp-password'); assert.equal(mail.to, 'lu@sc.com'); assert.match(mail.password, /^[A-Za-z0-9]{12}$/);
  assert.equal(inv.data.invite.sent, true); assert.equal(inv.data.temporary_password, undefined);
  const temp = mail.password;
  const U = client(env.base);
  await U.post('/api/auth/login', { email: 'lu@sc.com', password: temp });
  assert.equal((await U.get('/api/support-chat')).data.code, 'PASSWORD_CHANGE_REQUIRED', 'com a senha provisória, nada abre antes de criar a senha nova');
  await U.put('/api/auth/password', { current_password: temp, new_password: PASS });
  assert.equal((await U.get('/api/support-chat')).status, 200);
  assert.equal(last().route, `/support/tenants/${me.org.id}/chat`);
  const id = crypto.randomUUID();
  assert.equal((await U.post(`/api/support-chat/actions/${id}/approve`, { user: { ref: 'x', can_approve: true } })).status, 200);
  assert.equal(last().route, `/support/tenants/${me.org.id}/chat/actions/${id}/approve`);
  const lu = (await U.get('/api/auth/me')).data.user;
  assert.notEqual(lu.id, me.user.id);
  assert.deepEqual(last().body, { user: { ref: lu.id, name: 'Lu Lança', can_approve: false, is_owner: false } });

  assert.equal((await A.post('/api/support-chat/close', { rating: 5 })).status, 200);
  assert.deepEqual(last().body, { user: { ref: me.user.id, name: 'Dono sc', can_approve: true, is_owner: true }, rating: 5 });
  assert.equal((await A.post('/api/support-chat/close', { rating: 9 })).status, 400);
});

test('suporte: :id inválido é recusado antes de montar a rota da central', async () => {
  const n = calls.length;
  assert.equal((await A.post('/api/support-chat/actions/..%2F..%2Fclose/approve')).status, 400);
  assert.equal((await A.post('/api/support-chat/actions/abc/undo')).status, 400);
  assert.equal((await A.post(`/api/support-chat/actions/${crypto.randomUUID()}/apagar`)).status, 404);
  assert.equal(calls.length, n);
});

test('suporte: erro da central é repassado com o mesmo status e a mensagem dela', async () => {
  reply = { status: 409, body: { error: 'Esta proposta já foi decidida.' } };
  const r = await A.post(`/api/support-chat/actions/${crypto.randomUUID()}/reject`);
  assert.equal(r.status, 409); assert.equal(r.data.error, 'Esta proposta já foi decidida.');
  reply = { status: 429, body: { error: 'Muitas mensagens seguidas. Aguarde alguns minutos.', code: 'rate_limited' } };
  const m = await A.post('/api/support-chat/messages', { body: 'oi' });
  assert.equal(m.status, 429); assert.equal(m.data.error, 'Muitas mensagens seguidas. Aguarde alguns minutos.');
  reply = { status: 401, body: { error: 'assinatura inválida' } };
  assert.equal((await A.get('/api/support-chat')).status, 502, 'falha de assinatura com a central não derruba a sessão do usuário');
  assert.equal((await A.get('/api/auth/me')).status, 200);
});

test('suporte: liberado com a organização bloqueada; sem central configurada → 503', async () => {
  await env.pool.query('update organizations set platform_access=$2, platform_access_at=now() where id=$1', [me.org.id, JSON.stringify({ status: 'BLOCKED', blocked: true })]);
  assert.equal((await A.get('/api/titles')).status, 402);
  assert.equal((await A.get('/api/support-chat')).status, 200);
  assert.equal((await A.post('/api/support-chat/messages', { body: 'Preciso regularizar a assinatura' })).status, 200);

  const { clearPlatformConfig } = await import('../src/platform.js');
  const hub = process.env.PLATFORM_HUB_URL;
  process.env.PLATFORM_HUB_URL = ''; clearPlatformConfig();
  try {
    const r = await A.get('/api/support-chat');
    assert.equal(r.status, 503); assert.equal(r.data.error, 'A central de atendimento ainda não está ligada neste sistema.');
  } finally { process.env.PLATFORM_HUB_URL = hub; clearPlatformConfig(); }
});
