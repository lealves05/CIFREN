// Usuário master do ecossistema LORLER. A senha e o 2FA ficam só na central (Master do ORBI): este sistema manda para lá
// apenas o que foi digitado em logins do domínio reservado @master.lorler; as senhas dos clientes nunca saem daqui.
// Toda entrada numa organização usa o usuário dedicado Suporter2l2 e fica registrada no histórico dela e na central.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { q, one, tx, orgTx } from './db.js';
import { hubCall } from './platform.js';
import { HttpError } from './util.js';
import { seedOrganization } from './permissions.js';
import { audit } from './audit.js';

export const SUPPORT_USER_NAME = 'Suporter2l2';
const SUPPORT_EMAIL = 'suporte@suporte.cifren.invalid';
export const isEcoLogin = (login) => String(login || '').trim().toLowerCase().endsWith('@master.lorler');

/** Chamada à central: a recusa dela (login, senha, código, sessão) volta como 401; sem resposta, ninguém entra. */
async function central(route, body) {
  try { return await hubCall('POST', `/ecosystem/${route}`, body); } catch (e) {
    if (e?.status === 502) throw new HttpError(401, e.message);
    throw e;
  }
}
export const ecoLogin = (login, password, ip) => central('login', { login, password, ip: ip || null });
export const ecoMfa = (mfa_token, code, ip) => central('mfa', { mfa_token, code, ip: ip || null });

// a sessão aberta é conferida na central a cada 5 minutos: desativar no Master encerra em pouco tempo, e central fora do ar não mantém o acesso
const checked = new Map();
const inflight = new Map();
export async function ecoGuard(sv, until) {
  if (!until || Number(until) * 1000 <= Date.now()) throw new HttpError(401, 'Acesso master encerrado. Entre novamente.');
  const at = checked.get(sv) || 0;
  if (Date.now() - at < 5 * 60 * 1000) return;
  // requisições simultâneas compartilham a mesma conferência; o nonce evita assinatura repetida entre instâncias
  let check = inflight.get(sv);
  if (!check) {
    check = central('check', { sv, nonce: crypto.randomUUID() }).then((x) => !!x.valid).catch(() => false).finally(() => inflight.delete(sv));
    inflight.set(sv, check);
  }
  if (!(await check)) { checked.delete(sv); throw new HttpError(401, 'Acesso master encerrado. Entre novamente.'); }
  checked.set(sv, Date.now());
}

async function supportUser() {
  const cur = await one('select id, name, email, auth_version, active from users where is_support limit 1');
  if (cur) {
    if (!cur.active) await q('update users set active = true where id = $1', [cur.id]);
    return cur;
  }
  const hash = await bcrypt.hash(`!${crypto.randomBytes(24).toString('base64url')}`, 10); // nunca conhecida: login normal é impossível
  const u = await one(`insert into users (name, email, password_hash, is_support, active) values ($1,$2,$3,true,true)
              on conflict (lower(email)) do nothing returning id, name, email, auth_version`, [SUPPORT_USER_NAME, SUPPORT_EMAIL, hash]);
  // o e-mail reservado está com outra conta: nunca usar essa conta como suporte
  if (!u) throw new HttpError(409, 'O endereço reservado do suporte está em uso por outra conta. Avise a administração da plataforma.');
  return u;
}

/** Organização própria do usuário master, criada na primeira entrada. */
export async function internalOrg() {
  const cur = await one('select id from organizations where is_internal');
  if (cur) return cur.id;
  return tx(async (c) => {
    await c.query("select pg_advisory_xact_lock(hashtext('cifren-internal-org'))");
    const again = (await c.query('select id from organizations where is_internal')).rows[0];
    if (again) return again.id;
    const o = (await c.query(`insert into organizations (name, is_demo, is_internal) values ('LORLER Master', true, true) returning id`)).rows[0];
    await c.query("select set_config('app.org_id', $1, true)", [o.id]);
    const db = { query: (t, p) => c.query(t, p), one: async (t, p) => (await c.query(t, p)).rows[0] || null, all: async (t, p) => (await c.query(t, p)).rows, orgId: o.id };
    await seedOrganization(db);
    const comp = await db.one(`insert into companies (org_id, name) values ($1,'LORLER Master') returning id`, [o.id]);
    await db.query(`insert into bank_accounts (org_id, company_id, name, type) values ($1,$2,'Caixa','caixa')`, [o.id, comp.id]);
    return o.id;
  });
}

/** Registra a entrada e deixa o usuário Suporter2l2 só nessa organização. Sem registro na central e no histórico dela, não entra. */
export async function ecoEnter({ sv, orgId = null, reason = null, ip = null, req }) {
  const target = orgId || await internalOrg();
  const o = await one('select id, name, is_internal from organizations where id=$1', [target]);
  if (!o) throw new HttpError(404, 'Organização não encontrada.');
  await central('access', { sv, company_id: o.is_internal ? null : o.id, company_name: o.name, reason, ip: ip || null });
  const user = await supportUser();
  await orgTx(o.id, async (db) => {
    const role = await db.one(`select id from roles where org_id=$1 and key='dono'`, [o.id]);
    if (!role) throw new HttpError(409, 'Esta organização não tem o perfil Dono.');
    await db.query(`insert into memberships (org_id, user_id, role_id) values ($1,$2,$3)
                    on conflict (org_id, user_id) do update set active = true, role_id = excluded.role_id, company_ids = '{}'`, [o.id, user.id, role.id]);
    await audit(db, { actor: { id: user.id, name: SUPPORT_USER_NAME }, req, action: 'auth.ecosystem_login', entity: 'user', entityId: user.id, summary: reason ? `Acesso do usuário master. Motivo: ${String(reason).slice(0, 200)}` : 'Acesso do usuário master' });
  });
  await q('update memberships set active = false where user_id=$1 and org_id<>$2', [user.id, o.id]); // só fica na organização em que entrou agora
  return { user, orgId: o.id, internal: o.is_internal };
}

export async function ecoCompanies(term) {
  const t = String(term || '').trim().slice(0, 80).replace(/[%_]/g, '');
  const { rows } = await q(`select id, name from organizations where not is_internal and not is_demo ${t ? 'and name ilike $1' : ''} order by lower(name) limit 200`, t ? [`%${t}%`] : []);
  return rows;
}
