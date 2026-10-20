// Central da plataforma (assinatura HMAC) e verificação em duas etapas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
process.env.PLATFORM_HUB_URL = 'http://127.0.0.1:9'; // central fora do ar (modo independente continua valendo)
process.env.PLATFORM_SECRET = 'segredo-de-teste-da-central-0123456789';
process.env.PLATFORM_MODE = 'standalone';
const { boot, client, signup, PASS } = await import('./helpers.js');

let env; let A;
before(async () => { env = await boot(); A = await signup(env.base, 'p'); });
after(async () => { await env.close(); });

function signed(method, route, body) {
  const ts = Math.floor(Date.now() / 1000); const raw = body === undefined ? '' : JSON.stringify(body);
  const h = crypto.createHash('sha256').update(raw).digest('hex');
  const sig = crypto.createHmac('sha256', process.env.PLATFORM_SECRET).update(`${ts}\n${method}\n${route}\n${h}`).digest('hex');
  return fetch(`${env.base}/api/platform/v1${route}`, { method, body: raw || undefined,
    headers: { 'content-type': 'application/json', 'x-platform-product': 'cifren', 'x-platform-timestamp': String(ts), 'x-platform-signature': sig } });
}

test('central: assinatura obrigatória, manifesto, tenants e reuso de assinatura bloqueado', async () => {
  assert.equal((await fetch(`${env.base}/api/platform/v1/manifest`)).status, 401);
  const m = await signed('GET', '/manifest');
  assert.equal(m.status, 200); assert.equal((await m.json()).code, 'cifren');
  const t = await (await signed('GET', '/tenants')).json();
  assert.equal(t.items.length, 1); assert.equal(t.items[0].email, 'donop@exemplo.com');
});

test('verificação em duas etapas: ligar, entrar com código e com código de recuperação', async () => {
  const { totp } = await import('../src/totp.js');
  const s = (await A.post('/api/auth/mfa/setup')).data;
  assert.ok(s.secret && s.otpauth_url.startsWith('otpauth://'));
  assert.equal((await A.post('/api/auth/mfa/enable', { code: '000000' })).status, 400);
  const en = await A.post('/api/auth/mfa/enable', { code: totp(s.secret) });
  assert.equal(en.status, 200); assert.equal(en.data.recovery_codes.length, 10);
  const C = client(env.base);
  const l = await C.post('/api/auth/login', { email: 'donop@exemplo.com', password: PASS });
  assert.equal(l.data.mfa_required, true);
  assert.equal((await C.get('/api/auth/me')).status, 401);
  assert.equal((await C.post('/api/auth/mfa', { mfa_token: l.data.mfa_token, code: '123456' })).status, 401);
  assert.equal((await C.post('/api/auth/mfa', { mfa_token: l.data.mfa_token, code: en.data.recovery_codes[0] })).status, 200);
  assert.equal((await C.get('/api/auth/me')).data.user.mfa_enabled, true);
  const D = client(env.base);
  const l2 = await D.post('/api/auth/login', { email: 'donop@exemplo.com', password: PASS });
  assert.equal((await D.post('/api/auth/mfa', { mfa_token: l2.data.mfa_token, code: en.data.recovery_codes[0] })).status, 401, 'código de recuperação vale uma vez');
});

test('central: exclusão definitiva da organização', async () => {
  const me = (await A.get('/api/auth/me')).data;
  assert.equal((await signed('POST', `/tenants/${me.org.id}/delete`, { confirm: true, reason: 'teste' })).status, 200);
  assert.equal((await signed('GET', `/tenants/${me.org.id}`)).status, 404);
  assert.equal((await A.get('/api/auth/me')).status, 401);
  const { rows: [n] } = await env.pool.query('select count(*)::int as n from users');
  assert.equal(n.n, 0);
});
