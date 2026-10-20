// Empresas (CNPJs), usuários, perfis e auditoria da organização.
import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { q, one, orgTx } from '../db.js';
import { HttpError, parse, notFound, uuidParam, isUuid, limitParam, encodeCursor, decodeCursor } from '../util.js';
import { need, can, revokeSessions } from '../auth.js';
import { CATALOG, ALL, isKnown } from '../permissions.js';
import { audit } from '../audit.js';
import { limitByKey } from '../security.js';

const actor = (req) => ({ id: req.user.id, name: req.user.name });
const text = (max) => z.string().trim().max(max);
const optText = (max) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

// ---------------- empresas ----------------
export const companies = Router();
const companySchema = z.object({ name: text(160).min(1, 'informe o nome'), trade_name: optText(160), document: optText(20), timezone: z.string().max(60).optional() });
companies.get('/', async (req, res) => {
  const items = await orgTx(req.orgId, (db) => db.all('select id, name, trade_name, document, timezone, active from companies order by active desc, name'));
  res.json({ items: items.filter((c) => !req.companyScope || req.companyScope.includes(c.id)) });
});
companies.post('/', need('empresas.gerenciar'), async (req, res) => {
  const d = parse(companySchema, req.body);
  const row = await orgTx(req.orgId, async (db) => {
    const c = await db.one('insert into companies (org_id, name, trade_name, document, timezone) values ($1,$2,$3,$4,coalesce($5,\'America/Sao_Paulo\')) returning *', [req.orgId, d.name, d.trade_name, d.document, d.timezone || null]);
    await audit(db, { actor: actor(req), req, action: 'empresa.criada', entity: 'company', entityId: c.id, summary: `Empresa ${c.name}` });
    return c;
  });
  res.status(201).json(row);
});
companies.put('/:id', need('empresas.gerenciar'), async (req, res) => {
  const id = uuidParam(req.params.id);
  const d = parse(companySchema.partial().extend({ active: z.boolean().optional() }), req.body);
  const row = await orgTx(req.orgId, async (db) => {
    const c = await db.one(`update companies set name=coalesce($2,name), trade_name=case when $3::boolean then $4 else trade_name end,
                              document=case when $5::boolean then $6 else document end, timezone=coalesce($7,timezone), active=coalesce($8,active)
                            where id=$1 returning *`, [id, d.name ?? null, 'trade_name' in d, d.trade_name ?? null, 'document' in d, d.document ?? null, d.timezone ?? null, d.active ?? null]);
    if (!c) throw notFound('Empresa não encontrada.');
    await audit(db, { actor: actor(req), req, action: 'empresa.alterada', entity: 'company', entityId: id, summary: `Empresa ${c.name}`, data: d });
    return c;
  });
  res.json(row);
});
companies.delete('/:id', need('empresas.gerenciar'), async (req, res) => {
  const id = uuidParam(req.params.id);
  await orgTx(req.orgId, async (db) => {
    if ((await db.one('select count(*)::int as n from companies where active')).n <= 1) throw new HttpError(409, 'A organização precisa de pelo menos uma empresa ativa.');
    const c = await db.one('update companies set active=false where id=$1 returning name', [id]);
    if (!c) throw notFound('Empresa não encontrada.');
    await audit(db, { actor: actor(req), req, action: 'empresa.arquivada', entity: 'company', entityId: id, summary: `Empresa ${c.name} arquivada` });
  });
  res.json({ ok: true });
});

// ---------------- perfis ----------------
export const roles = Router();
roles.get('/', need('perfis.gerenciar', 'usuarios.gerenciar'), async (req, res) => {
  const { rows } = await q(`select r.id, r.key, r.name, r.system, r.permissions, (select count(*)::int from memberships m where m.role_id=r.id and m.active) as members
                              from roles r where r.org_id=$1 order by r.system desc, r.name`, [req.orgId]);
  res.json({ catalog: CATALOG, roles: rows });
});
const permList = z.array(z.string().max(80)).max(200).transform((a) => [...new Set(a)]).refine((a) => a.every(isKnown), 'permissão desconhecida');
/** Ninguém concede permissão que não tem. */
function assertGrantable(req, perms) {
  const extra = perms.filter((p) => !req.perms.has(p));
  if (extra.length) throw new HttpError(403, 'Você não pode conceder permissões que o seu perfil não tem.', { permissions: extra });
}
roles.post('/', need('perfis.gerenciar'), async (req, res) => {
  const d = parse(z.object({ name: text(60).min(2, 'informe o nome'), permissions: permList.optional(), copy_from: z.string().optional() }), req.body);
  let perms = d.permissions || [];
  if (d.copy_from) {
    const src = isUuid(d.copy_from) ? await one('select permissions from roles where id=$1 and org_id=$2', [d.copy_from, req.orgId]) : null;
    if (!src) throw notFound('Perfil de origem não encontrado.');
    if (!d.permissions) perms = src.permissions;
  }
  assertGrantable(req, perms);
  const key = `p_${crypto.randomBytes(5).toString('hex')}`;
  const row = await one('insert into roles (org_id, key, name, permissions) values ($1,$2,$3,$4) returning id, key, name, system, permissions', [req.orgId, key, d.name, perms]);
  await orgTx(req.orgId, (db) => audit(db, { actor: actor(req), req, action: 'perfil.criado', entity: 'role', entityId: row.id, summary: `Perfil ${row.name}`, data: { permissions: perms } }));
  res.status(201).json({ ...row, members: 0 });
});
roles.put('/:id', need('perfis.gerenciar'), async (req, res) => {
  const id = uuidParam(req.params.id);
  const d = parse(z.object({ name: text(60).min(2).optional(), permissions: permList.optional() }), req.body);
  const cur = await one('select id, key, name, system, permissions from roles where id=$1 and org_id=$2', [id, req.orgId]);
  if (!cur) throw notFound('Perfil não encontrado.');
  if (cur.key === 'dono') throw new HttpError(409, 'O perfil Dono tem sempre todas as permissões e não pode ser alterado.');
  if (d.permissions) {
    const added = d.permissions.filter((p) => !cur.permissions.includes(p));
    assertGrantable(req, added);
  }
  const row = await one('update roles set name=coalesce($2,name), permissions=coalesce($3,permissions) where id=$1 returning id, key, name, system, permissions', [id, d.name ?? null, d.permissions ?? null]);
  await orgTx(req.orgId, (db) => audit(db, { actor: actor(req), req, action: 'perfil.alterado', entity: 'role', entityId: id, summary: `Perfil ${row.name}`,
    data: { antes: cur.permissions, depois: row.permissions } }));
  res.json(row);
});
roles.delete('/:id', need('perfis.gerenciar'), async (req, res) => {
  const id = uuidParam(req.params.id);
  const cur = await one('select name, system, (select count(*)::int from memberships m where m.role_id=r.id) as n from roles r where id=$1 and org_id=$2', [id, req.orgId]);
  if (!cur) throw notFound('Perfil não encontrado.');
  if (cur.system) throw new HttpError(409, 'Perfis padrão não podem ser apagados.');
  if (cur.n) throw new HttpError(409, 'Há usuários com este perfil. Troque o perfil deles antes.');
  await q('delete from roles where id=$1', [id]);
  await orgTx(req.orgId, (db) => audit(db, { actor: actor(req), req, action: 'perfil.apagado', entity: 'role', entityId: id, summary: `Perfil ${cur.name}` }));
  res.json({ ok: true });
});

// ---------------- usuários ----------------
export const users = Router();
users.use(need('usuarios.gerenciar'));
const tempPassword = () => `Cf-${crypto.randomBytes(6).toString('base64url')}-${crypto.randomInt(10, 99)}`;
async function roleByKey(req, key) {
  const r = await one('select id, key, name, permissions from roles where org_id=$1 and key=$2', [req.orgId, key]);
  if (!r) throw new HttpError(400, 'Perfil inválido.');
  assertGrantable(req, r.permissions);
  return r;
}
async function validCompanies(req, ids) {
  if (ids == null) { if (req.companyScope) throw new HttpError(403, 'Você só pode dar acesso às empresas que você mesmo acessa.'); return null; }
  const list = [...new Set(ids)];
  if (!list.length) throw new HttpError(400, 'Escolha pelo menos uma empresa ou "todas".');
  if (!list.every(isUuid)) throw new HttpError(400, 'Empresa inválida.');
  const n = await orgTx(req.orgId, (db) => db.one('select count(*)::int as n from companies where id = any($1::uuid[])', [list]));
  if (n.n !== list.length) throw new HttpError(400, 'Empresa inválida.');
  if (req.companyScope && !list.every((id) => req.companyScope.includes(id))) throw new HttpError(403, 'Você só pode dar acesso às empresas que você mesmo acessa.');
  return list;
}
users.get('/', async (req, res) => {
  const { rows } = await q(`select u.id, u.name, u.email, r.key as role_key, r.name as role_name, m.company_ids, m.active, m.last_login_at, u.mfa_enabled
                              from memberships m join users u on u.id=m.user_id join roles r on r.id=m.role_id
                             where m.org_id=$1 order by m.active desc, u.name`, [req.orgId]);
  res.json({ items: rows });
});
users.post('/', async (req, res) => {
  const d = parse(z.object({ name: text(120).min(2, 'informe o nome'), email: z.string().trim().toLowerCase().email('e-mail inválido').max(200),
    role_key: z.string().max(60), company_ids: z.array(z.string()).max(200).nullable().optional() }), req.body);
  await limitByKey('invite', req.orgId, 30, 3600, res);
  const role = await roleByKey(req, d.role_key);
  const companyIds = await validCompanies(req, d.company_ids === undefined ? null : d.company_ids);
  let u = await one('select id, name from users where lower(email)=$1', [d.email]);
  let temporary_password = null;
  if (u) {
    if (await one('select 1 from memberships where org_id=$1 and user_id=$2', [req.orgId, u.id])) throw new HttpError(409, 'Esta pessoa já faz parte da organização.');
  } else {
    temporary_password = tempPassword();
    u = await one('insert into users (name, email, password_hash, must_change_password) values ($1,$2,$3,true) returning id, name', [d.name, d.email, await bcrypt.hash(temporary_password, 12)]);
  }
  await q('insert into memberships (org_id, user_id, role_id, company_ids) values ($1,$2,$3,$4)', [req.orgId, u.id, role.id, companyIds]);
  await orgTx(req.orgId, (db) => audit(db, { actor: actor(req), req, action: 'usuario.convidado', entity: 'user', entityId: u.id, summary: `${d.name} (${d.email}) como ${role.name}` }));
  res.status(201).json({ id: u.id, temporary_password, existing_account: !temporary_password });
});
async function ownersLeft(req, exceptUserId) {
  return (await one(`select count(*)::int as n from memberships m join roles r on r.id=m.role_id where m.org_id=$1 and r.key='dono' and m.active and m.user_id<>$2`, [req.orgId, exceptUserId])).n;
}
users.put('/:id', async (req, res) => {
  const id = uuidParam(req.params.id);
  const d = parse(z.object({ role_key: z.string().max(60).optional(), company_ids: z.array(z.string()).max(200).nullable().optional(), active: z.boolean().optional() }), req.body);
  const cur = await one(`select m.id, r.key as role_key, r.permissions, u.name from memberships m join roles r on r.id=m.role_id join users u on u.id=m.user_id
                          where m.org_id=$1 and m.user_id=$2`, [req.orgId, id]);
  if (!cur) throw notFound('Usuário não encontrado.');
  assertGrantable(req, cur.permissions); // não mexe em quem tem mais poder que você
  const isOwner = cur.role_key === 'dono';
  const demoting = isOwner && ((d.role_key && d.role_key !== 'dono') || d.active === false);
  if (demoting && (await ownersLeft(req, id)) === 0) throw new HttpError(409, 'A organização precisa de pelo menos um Dono ativo.');
  if (id === req.user.id && d.active === false) throw new HttpError(409, 'Você não pode desativar o próprio acesso.');
  const role = d.role_key ? await roleByKey(req, d.role_key) : null;
  const companyIds = 'company_ids' in d ? await validCompanies(req, d.company_ids) : undefined;
  await q(`update memberships set role_id=coalesce($3,role_id), company_ids=case when $4::boolean then $5::uuid[] else company_ids end, active=coalesce($6,active)
            where org_id=$1 and user_id=$2`, [req.orgId, id, role?.id ?? null, companyIds !== undefined, companyIds ?? null, d.active ?? null]);
  if (d.active === false || role) {
    await q('update sessions set revoked_at=now() where user_id=$1 and org_id=$2 and revoked_at is null', [id, req.orgId]); // perfil novo vale na hora
  }
  await orgTx(req.orgId, (db) => audit(db, { actor: actor(req), req, action: 'usuario.alterado', entity: 'user', entityId: id, summary: cur.name, data: d }));
  res.json({ ok: true });
});
users.post('/:id/reset-password', async (req, res) => {
  const id = uuidParam(req.params.id);
  const cur = await one('select r.permissions, u.name from memberships m join roles r on r.id=m.role_id join users u on u.id=m.user_id where m.org_id=$1 and m.user_id=$2', [req.orgId, id]);
  if (!cur) throw notFound('Usuário não encontrado.');
  assertGrantable(req, cur.permissions);
  // conta usada em outras organizações: só o próprio dono da conta troca a senha
  if ((await one('select count(*)::int as n from memberships where user_id=$1', [id])).n > 1) throw new HttpError(409, 'Esta pessoa usa a mesma conta em outra organização: peça para ela trocar a senha em "Minha conta".');
  const temporary_password = tempPassword();
  await q('update users set password_hash=$2, must_change_password=true, mfa_enabled=false, mfa_secret=null, recovery_codes=\'{}\' where id=$1', [id, await bcrypt.hash(temporary_password, 12)]);
  await revokeSessions(id);
  await orgTx(req.orgId, (db) => audit(db, { actor: actor(req), req, action: 'usuario.senha_redefinida', entity: 'user', entityId: id, summary: cur.name }));
  res.json({ temporary_password });
});

// ---------------- auditoria ----------------
export const auditRoutes = Router();
auditRoutes.get('/', need('auditoria.visualizar'), async (req, res) => {
  const limit = limitParam(req.query.limit, 50, 200);
  const cur = decodeCursor(req.query.cursor);
  const p = []; const w = [];
  const add = (sql, v) => { p.push(v); w.push(sql.replace('?', `$${p.length}`)); };
  if (req.query.entity) add('entity = ?', String(req.query.entity).slice(0, 40));
  if (isUuid(req.query.user_id)) add('user_id = ?', req.query.user_id);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || ''))) add('at >= ?::date', req.query.from);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || ''))) add("at < ?::date + 1", req.query.to);
  if (cur?.id) add('id < ?', Number(cur.id));
  p.push(limit + 1);
  const rows = await orgTx(req.orgId, (db) => db.all(`select id, at, user_name, action, entity, entity_id, summary, ip from audit_events
     ${w.length ? `where ${w.join(' and ')}` : ''} order by id desc limit $${p.length}`, p));
  const more = rows.length > limit;
  res.json({ items: rows.slice(0, limit), next_cursor: more ? encodeCursor({ id: rows[limit - 1].id }) : null });
});
export { ALL, can };
