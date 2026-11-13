// Teste local do bloqueio de login do CIFREN (5 erros), desbloqueio por token, liberação automática e
// anti-enumeração. E-mail/alerta ao Master saem pela central (hub); aqui sem central (melhor esforço).
// Sessão por cookie: o login responde { ok:true }. Não toca produção.
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import pg from 'pg';

const ADMIN = process.env.LOCK_ADMIN_DSN || 'postgres://postgres:postgres@localhost';
if (!/@(localhost|127\.0\.0\.1)(:\d+)?$/.test(ADMIN)) { console.error('só roda contra banco local'); process.exit(1); }
const DBNAME = 'cifren_lock_test';
const DB = `${ADMIN}/${DBNAME}`;
const PORT = 3362;
const API = `http://127.0.0.1:${PORT}/api`;
const PW = 'Senha-Teste-2026!';
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
let fails = 0; const ok = (c, m) => { console.log(`${c ? '  OK ' : 'FALHA'} ${m}`); if (!c) fails++; };

const root = new pg.Client({ connectionString: `${ADMIN}/postgres` });
await root.connect();
await root.query(`drop database if exists ${DBNAME} with (force)`);
await root.query(`create database ${DBNAME}`);
await root.end();

process.env.DATABASE_URL = DB;
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.AGENT_ROUTINES = 'off';
delete process.env.PLATFORM_HUB_URL;
execSync('node src/migrate.js', { stdio: 'inherit', env: process.env });

const { createApp } = await import('../src/app.js');
const server = createApp().listen(PORT);
await new Promise((r) => server.once('listening', r));
const db = new pg.Client({ connectionString: DB }); await db.connect();

const H = { 'content-type': 'application/json', 'X-CIFREN': '1' };
const post = async (path, body) => {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch { /* html */ }
  return { status: r.status, j };
};
const login = (email, password) => post('/auth/login', { email, password });

try {
  const reg = await post('/auth/signup', { company_name: 'Empresa Teste', name: 'Dono Teste', email: 'dono@teste.local', password: PW });
  ok(reg.status < 400, `cadastro do dono (status ${reg.status})`);
  const u = (await db.query("select id from users where lower(email)='dono@teste.local'")).rows[0];

  for (let i = 1; i <= 4; i++) { const r = await login('dono@teste.local', 'errada'); ok(r.status === 401, `erro ${i}: 401`); }
  const f4 = (await db.query('select failed_logins, locked_at, login_fail_log from users where id=$1', [u.id])).rows[0];
  ok(f4.failed_logins === 4 && !f4.locked_at, `após 4 erros: contador=4, sem bloqueio`);
  ok(Array.isArray(f4.login_fail_log) && f4.login_fail_log.length === 4 && f4.login_fail_log[0].ip, `tentativas com IP/horário (${f4.login_fail_log.length})`);

  const fifth = await login('dono@teste.local', 'errada');
  ok(fifth.status === 423, `5º erro: 423 (bloqueado)`);
  const locked = (await db.query('select locked_at, lock_auto_until, login_fail_log from users where id=$1', [u.id])).rows[0];
  ok(!!locked.locked_at && !!locked.lock_auto_until && locked.login_fail_log.length === 5, `travada + 5 tentativas registradas`);

  const correctLocked = await login('dono@teste.local', PW);
  ok(correctLocked.status === 423, `senha correta com conta travada: 423 (não revela acerto)`);

  for (let i = 1; i <= 6; i++) { const r = await login('naoexiste@teste.local', 'x'); ok(r.status === 401, `inexistente ${i}: 401`); }
  const ghost = (await db.query("select count(*)::int n from users where lower(email)='naoexiste@teste.local'")).rows[0].n;
  ok(ghost === 0, `nenhum usuário criado para e-mail inexistente`);

  const raw = crypto.randomBytes(32).toString('hex');
  await db.query(`insert into user_unlock_tokens (user_id, token_hash, expires_at) values ($1,$2, now() + interval '60 minutes')`, [u.id, sha(raw)]);
  const unlock = await fetch(`${API}/auth/unlock?token=${raw}`, { method: 'POST', headers: H });
  ok(unlock.status === 200, `POST /auth/unlock: 200`);
  const afterUnlock = (await db.query('select failed_logins, locked_at, login_fail_log from users where id=$1', [u.id])).rows[0];
  ok(afterUnlock.failed_logins === 0 && !afterUnlock.locked_at && afterUnlock.login_fail_log.length === 0, `conta liberada e registro limpo após o token`);
  const reuse = await (await fetch(`${API}/auth/unlock?token=${raw}`, { method: 'POST', headers: H })).text();
  ok(/inválido|expirado/i.test(reuse), `token é de uso único (2ª vez: inválido)`);
  const loginOk = await login('dono@teste.local', PW);
  ok(loginOk.status === 200 && loginOk.j?.ok, `login correto após desbloqueio: 200 ok`);

  for (let i = 1; i <= 5; i++) await login('dono@teste.local', 'errada');
  const relocked = (await db.query('select locked_at from users where id=$1', [u.id])).rows[0];
  ok(!!relocked.locked_at, `travou novamente após 5 erros`);
  await db.query("update users set lock_auto_until = now() - interval '1 minute' where id=$1", [u.id]);
  const autoRelease = await login('dono@teste.local', PW);
  ok(autoRelease.status === 200 && autoRelease.j?.ok, `liberação automática após a janela: login 200`);
} catch (e) {
  console.error('ERRO NO TESTE:', e); fails++;
} finally {
  await db.end(); try { server.close(); } catch { /* */ }
  console.log(fails === 0 ? '\n✅ TODOS OS TESTES PASSARAM' : `\n❌ ${fails} FALHA(S)`);
  process.exit(fails === 0 ? 0 : 1);
}
