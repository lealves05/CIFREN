// /api/auth — criar conta, entrar (com 2 etapas), sair, minha conta, sessões.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { q, one, tx, orgTx } from '../db.js';
import { HttpError, parse, passwordProblem, isUuid } from '../util.js';
import { createSession, clearCookie, requireAuth, revokeSessions, readCookie } from '../auth.js';
import { limitByIp, limitByKey, clearHits } from '../security.js';
import { seal, unseal, sha256, randomToken } from '../secrets.js';
import { newSecret, verifyTotp, otpauthUrl, recoveryCodes } from '../totp.js';
import { seedOrganization } from '../permissions.js';
import { audit } from '../audit.js';
import { registerOrganization, accessFor, modulesFrom, platformMode } from '../platform.js';

const r = Router();
const email = z.string().trim().toLowerCase().email('e-mail inválido').max(200);
const password = z.string().max(200).superRefine((p, ctx) => { const m = passwordProblem(p); if (m) ctx.addIssue({ code: 'custom', message: m }); });
const DUMMY_HASH = bcrypt.hashSync('cifren-senha-inexistente-1', 10);

r.get('/state', (_req, res) => res.json({ signup_open: process.env.SIGNUP_OPEN !== '0' }));

r.post('/signup', limitByIp('signup', 5, 3600, 'Muitos cadastros a partir deste endereço. Tente mais tarde.'), async (req, res) => {
  if (process.env.SIGNUP_OPEN === '0') throw new HttpError(403, 'Novos cadastros estão fechados nesta instalação.');
  const d = parse(z.object({
    name: z.string().trim().min(2, 'informe seu nome').max(120),
    email, password,
    company_name: z.string().trim().min(2, 'informe o nome da empresa').max(160),
    document: z.string().trim().max(20).optional().nullable(),
  }), req.body);
  if (await one('select 1 from users where lower(email) = $1', [d.email])) throw new HttpError(409, 'Já existe uma conta com este e-mail. Entre ou recupere a senha.');
  const hash = await bcrypt.hash(d.password, 12);
  // tudo numa transação só: ou nasce a conta completa (usuário, organização, perfis, empresa, caixa) ou nada
  const { user, orgId } = await tx(async (c) => {
    const u = (await c.query('insert into users (name, email, password_hash) values ($1,$2,$3) returning id, name, email, auth_version', [d.name, d.email, hash])).rows[0];
    const o = (await c.query('insert into organizations (name) values ($1) returning id', [d.company_name])).rows[0];
    await c.query("select set_config('app.org_id', $1, true)", [o.id]);
    const db = { query: (t, p) => c.query(t, p), one: async (t, p) => (await c.query(t, p)).rows[0] || null, all: async (t, p) => (await c.query(t, p)).rows, orgId: o.id };
    const ownerRole = await seedOrganization(db);
    await db.query('insert into memberships (org_id, user_id, role_id) values ($1,$2,$3)', [o.id, u.id, ownerRole]);
    const comp = await db.one('insert into companies (org_id, name, document) values ($1,$2,$3) returning id', [o.id, d.company_name, d.document || null]);
    await db.query(`insert into bank_accounts (org_id, company_id, name, type) values ($1,$2,'Caixa','caixa')`, [o.id, comp.id]);
    await audit(db, { actor: u, req, action: 'organizacao.criada', entity: 'organization', entityId: o.id, summary: `Conta criada por ${u.name}` });
    return { user: u, orgId: o.id };
  });
  registerOrganization(orgId).catch((e) => console.warn('[central] cadastro da organização falhou:', e.message));
  await createSession(res, req, user, orgId);
  res.status(201).json({ ok: true });
});

r.post('/login', limitByIp('login', 20, 900), async (req, res) => {
  const d = parse(z.object({ email, password: z.string().min(1, 'informe a senha').max(200) }), req.body);
  await limitByKey('login', d.email, 8, 900, res, 'Muitas tentativas para este e-mail. Aguarde 15 minutos.');
  const u = await one('select id, name, email, password_hash, active, mfa_enabled, auth_version from users where lower(email) = $1', [d.email]);
  const ok = await bcrypt.compare(d.password, u?.password_hash || DUMMY_HASH);
  if (!u || !ok || !u.active) throw new HttpError(401, 'E-mail ou senha incorretos.');
  clearHits(`login:id:${d.email}`);
  if (u.mfa_enabled) {
    const token = randomToken(24);
    await q("insert into login_challenges (token_hash, user_id, expires_at) values ($1,$2, now() + interval '5 minutes')", [sha256(token), u.id]);
    return res.json({ mfa_required: true, mfa_token: token });
  }
  const m = await one('select org_id from memberships where user_id=$1 and active order by last_login_at desc nulls last, created_at limit 1', [u.id]);
  await createSession(res, req, u, m?.org_id || null);
  if (m) await orgTx(m.org_id, (db) => audit(db, { actor: u, req, action: 'login', entity: 'user', entityId: u.id, summary: 'Entrou no sistema' }));
  res.json({ ok: true });
});

r.post('/mfa', limitByIp('mfa', 30, 900), async (req, res) => {
  const d = parse(z.object({ mfa_token: z.string().min(10).max(100), code: z.string().trim().min(6).max(20) }), req.body);
  const ch = await one('select user_id, attempts from login_challenges where token_hash=$1 and expires_at > now()', [sha256(d.mfa_token)]);
  if (!ch || ch.attempts >= 5) throw new HttpError(401, 'O tempo para digitar o código acabou. Entre de novo.');
  const u = await one('select id, name, email, mfa_secret, recovery_codes, auth_version, active from users where id=$1', [ch.user_id]);
  let ok = false; let usedRecovery = null;
  if (/^\d{6}$/.test(d.code.replace(/\s/g, ''))) ok = verifyTotp(unseal(u.mfa_secret, 'mfa'), d.code);
  else { const h = sha256(d.code.toLowerCase()); if (u.recovery_codes.includes(h)) { ok = true; usedRecovery = h; } }
  if (!ok || !u.active) {
    await q('update login_challenges set attempts = attempts + 1 where token_hash=$1', [sha256(d.mfa_token)]);
    throw new HttpError(401, 'Código incorreto.');
  }
  await q('delete from login_challenges where token_hash=$1 or expires_at < now()', [sha256(d.mfa_token)]);
  if (usedRecovery) await q('update users set recovery_codes = array_remove(recovery_codes, $2) where id=$1', [u.id, usedRecovery]);
  const m = await one('select org_id from memberships where user_id=$1 and active order by last_login_at desc nulls last, created_at limit 1', [u.id]);
  await createSession(res, req, u, m?.org_id || null);
  if (m) await orgTx(m.org_id, (db) => audit(db, { actor: u, req, action: usedRecovery ? 'login.codigo_recuperacao' : 'login', entity: 'user', entityId: u.id, summary: usedRecovery ? 'Entrou com código de recuperação' : 'Entrou no sistema (2 etapas)' }));
  res.json({ ok: true });
});

r.post('/logout', async (req, res) => {
  const t = readCookie(req);
  if (t) await q('update sessions set revoked_at = now() where token_hash=$1 and revoked_at is null', [sha256(t)]);
  clearCookie(res);
  res.json({ ok: true });
});

// ---------------- daqui em diante: com sessão ----------------
r.use(requireAuth);

r.get('/me', async (req, res) => {
  const orgs = (await q(`select o.id, o.name, r.name as role_name from memberships m join organizations o on o.id=m.org_id join roles r on r.id=m.role_id
                          where m.user_id=$1 and m.active order by o.name`, [req.user.id])).rows;
  const companies = await orgTx(req.orgId, (db) => db.all('select id, name, trade_name, document from companies where active order by name'));
  let access = null;
  try { access = await accessFor(req.orgId); } catch { access = null; }
  res.json({
    user: req.user, org: req.org, orgs, role: req.role, permissions: [...req.perms].sort(),
    companies: companies.filter((c) => !req.companyScope || req.companyScope.includes(c.id)),
    company_scope: req.companyScope, modules: modulesFrom(access),
    access: access ? { status: access.status, blocked: !!access.blocked, trial_ends_at: access.trial_ends_at || null } : null,
    mode: await platformMode(),
  });
});

r.post('/switch-org', async (req, res) => {
  const d = parse(z.object({ org_id: z.string().refine(isUuid, 'organização inválida') }), req.body);
  if (!(await one('select 1 from memberships where user_id=$1 and org_id=$2 and active', [req.user.id, d.org_id]))) throw new HttpError(403, 'Você não tem acesso a esta organização.');
  await q('update sessions set org_id=$2 where id=$1', [req.sessionId, d.org_id]);
  res.json({ ok: true });
});

r.put('/password', async (req, res) => {
  const d = parse(z.object({ current_password: z.string().min(1).max(200), new_password: password }), req.body);
  await limitByKey('pwd', req.user.id, 5, 900, res);
  const u = await one('select password_hash from users where id=$1', [req.user.id]);
  if (!(await bcrypt.compare(d.current_password, u.password_hash))) throw new HttpError(400, 'A senha atual está incorreta.');
  if (d.current_password === d.new_password) throw new HttpError(400, 'A nova senha precisa ser diferente da atual.');
  await q('update users set password_hash=$2, must_change_password=false where id=$1', [req.user.id, await bcrypt.hash(d.new_password, 12)]);
  await revokeSessions(req.user.id, req.sessionId);
  await orgTx(req.orgId, (db) => audit(db, { actor: req.user, req, action: 'senha.alterada', entity: 'user', entityId: req.user.id, summary: 'Trocou a própria senha' }));
  res.json({ ok: true });
});

r.post('/mfa/setup', async (req, res) => {
  if (req.user.mfa_enabled) throw new HttpError(409, 'A verificação em duas etapas já está ligada.');
  const secret = newSecret();
  await q('update users set mfa_pending_secret=$2 where id=$1', [req.user.id, seal(secret, 'mfa')]);
  res.json({ secret, otpauth_url: otpauthUrl(secret, req.user.email) });
});

r.post('/mfa/enable', async (req, res) => {
  const d = parse(z.object({ code: z.string().trim().min(6).max(10) }), req.body);
  await limitByKey('mfa-enable', req.user.id, 6, 600, res);
  const u = await one('select mfa_pending_secret from users where id=$1', [req.user.id]);
  if (!u?.mfa_pending_secret) throw new HttpError(409, 'Comece a configuração de novo.');
  const secret = unseal(u.mfa_pending_secret, 'mfa');
  if (!verifyTotp(secret, d.code)) throw new HttpError(400, 'Código incorreto. Confira a hora do celular e tente o próximo código.');
  const codes = recoveryCodes();
  await q(`update users set mfa_enabled=true, mfa_secret=$2, mfa_pending_secret=null, recovery_codes=$3, auth_version=auth_version+1 where id=$1`,
    [req.user.id, seal(secret, 'mfa'), codes.map((c) => sha256(c))]);
  await q('update sessions set auth_version = auth_version + 1 where id=$1', [req.sessionId]); // a sessão atual continua valendo
  await revokeSessions(req.user.id, req.sessionId);
  await orgTx(req.orgId, (db) => audit(db, { actor: req.user, req, action: 'mfa.ligada', entity: 'user', entityId: req.user.id, summary: 'Ligou a verificação em duas etapas' }));
  res.json({ recovery_codes: codes });
});

r.post('/mfa/disable', async (req, res) => {
  const d = parse(z.object({ password: z.string().min(1).max(200) }), req.body);
  await limitByKey('mfa-disable', req.user.id, 5, 900, res);
  const u = await one('select password_hash from users where id=$1', [req.user.id]);
  if (!(await bcrypt.compare(d.password, u.password_hash))) throw new HttpError(400, 'Senha incorreta.');
  await q("update users set mfa_enabled=false, mfa_secret=null, mfa_pending_secret=null, recovery_codes='{}' where id=$1", [req.user.id]);
  await orgTx(req.orgId, (db) => audit(db, { actor: req.user, req, action: 'mfa.desligada', entity: 'user', entityId: req.user.id, summary: 'Desligou a verificação em duas etapas' }));
  res.json({ ok: true });
});

r.get('/sessions', async (req, res) => {
  const { rows } = await q(`select id, created_at, last_seen_at, ip, user_agent from sessions
                             where user_id=$1 and revoked_at is null and expires_at > now() order by last_seen_at desc limit 50`, [req.user.id]);
  res.json({ items: rows.map((s) => ({ ...s, current: s.id === req.sessionId })) });
});

r.delete('/sessions/:id', async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'Sessão não encontrada.');
  await q('update sessions set revoked_at=now() where id=$1 and user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

export default r;
