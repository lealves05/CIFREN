// Sessões por cookie HttpOnly (o token fica só no navegador, como hash no banco), proteção CSRF e permissões.
import { q, one } from './db.js';
import { HttpError, forbidden } from './util.js';
import { sha256, randomToken } from './secrets.js';

const isProd = () => process.env.NODE_ENV === 'production';
export const COOKIE = () => (isProd() ? '__Host-cifren_s' : 'cifren_s');
const MAX_AGE_S = 7 * 24 * 3600;      // validade máxima da sessão
const IDLE_MS = 24 * 3600 * 1000;     // sem uso por 24 h, a sessão expira

export function readCookie(req, name = COOKIE()) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function setCookie(res, value, maxAge) {
  const attrs = [`${COOKIE()}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`];
  if (isProd()) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
}

export async function createSession(res, req, user, orgId) {
  const token = randomToken(32);
  await q(`insert into sessions (user_id, org_id, token_hash, auth_version, expires_at, ip, user_agent)
           values ($1,$2,$3,$4, now() + make_interval(secs => $5), $6, $7)`,
  [user.id, orgId, sha256(token), user.auth_version, MAX_AGE_S, req.ip || null, String(req.headers['user-agent'] || '').slice(0, 200)]);
  await q('update users set last_login_at = now() where id = $1', [user.id]);
  if (orgId) await q('update memberships set last_login_at = now() where user_id = $1 and org_id = $2', [user.id, orgId]);
  setCookie(res, token, MAX_AGE_S);
}

export function clearCookie(res) { setCookie(res, '', 0); }

/** Encerra as sessões de um usuário (todas ou todas menos a atual). */
export const revokeSessions = (userId, exceptId = null) =>
  q('update sessions set revoked_at = now() where user_id = $1 and revoked_at is null and ($2::uuid is null or id <> $2)', [userId, exceptId]);

/** Requisições que alteram dados precisam do cabeçalho X-CIFREN: 1 (outro site não consegue enviá-lo sem CORS). */
export function requireCsrfHeader(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers['x-cifren'] !== '1') throw new HttpError(403, 'Requisição recusada (proteção do navegador). Recarregue a página.');
  next();
}

/** Carrega sessão, usuário, organização atual, perfil e escopo de empresas. */
export async function requireAuth(req, _res, next) {
  const token = readCookie(req);
  if (!token || token.length > 100) throw new HttpError(401, 'Entre para continuar.');
  const s = await one(`select s.id, s.user_id, s.org_id, s.auth_version, s.last_seen_at, s.expires_at,
                              u.name, u.email, u.active, u.auth_version as user_av, u.mfa_enabled, u.must_change_password
                         from sessions s join users u on u.id = s.user_id
                        where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()`, [sha256(token)]);
  if (!s || !s.active || s.auth_version !== s.user_av || Date.now() - new Date(s.last_seen_at).getTime() > IDLE_MS) {
    throw new HttpError(401, 'Sessão encerrada. Entre novamente.');
  }
  let m = s.org_id ? await one(`select m.org_id, m.company_ids, r.key as role_key, r.name as role_name, r.permissions, o.name as org_name
                                  from memberships m join roles r on r.id = m.role_id join organizations o on o.id = m.org_id
                                 where m.user_id = $1 and m.org_id = $2 and m.active`, [s.user_id, s.org_id]) : null;
  if (!m) {
    m = await one(`select m.org_id, m.company_ids, r.key as role_key, r.name as role_name, r.permissions, o.name as org_name
                     from memberships m join roles r on r.id = m.role_id join organizations o on o.id = m.org_id
                    where m.user_id = $1 and m.active order by m.created_at limit 1`, [s.user_id]);
    if (!m) throw new HttpError(403, 'Seu acesso a esta organização foi removido. Fale com o administrador.');
    await q('update sessions set org_id = $2 where id = $1', [s.id, m.org_id]);
  }
  if (Date.now() - new Date(s.last_seen_at).getTime() > 5 * 60 * 1000) q('update sessions set last_seen_at = now() where id = $1', [s.id]).catch(() => {});
  req.sessionId = s.id;
  req.user = { id: s.user_id, name: s.name, email: s.email, mfa_enabled: s.mfa_enabled, must_change_password: s.must_change_password };
  req.orgId = m.org_id;
  req.org = { id: m.org_id, name: m.org_name };
  req.role = { key: m.role_key, name: m.role_name };
  req.perms = new Set(m.permissions || []);
  req.companyScope = m.company_ids && m.company_ids.length ? m.company_ids : null;
  next();
}

export const can = (req, code) => req.perms?.has(code);
/** Exige pelo menos uma das permissões. */
export const need = (...codes) => (req, _res, next) => { if (codes.some((c) => can(req, c))) return next(); throw forbidden(); };

/** A empresa está no escopo do usuário? */
export const companyAllowed = (req, companyId) => !req.companyScope || req.companyScope.includes(companyId);
export function assertCompany(req, companyId) {
  if (!companyAllowed(req, companyId)) throw forbidden('Você não tem acesso a esta empresa.');
}
