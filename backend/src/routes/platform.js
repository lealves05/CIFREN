// Central da plataforma (Master LORLER) → CIFREN: /api/platform/v1, chamadas assinadas (contrato v1, igual aos outros sistemas).
// O "tenant" do CIFREN é a organização (um grupo de empresas/CNPJs).
import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { q, one, tx, orgTx } from '../db.js';
import { parse, HttpError, notFound, isUuid } from '../util.js';
import { FEATURES, verifyHubRequest, tenantPayload, storeAccess, accessFor, modulesFrom } from '../platform.js';
import { revokeSessions } from '../auth.js';
import { audit } from '../audit.js';
import { need } from '../auth.js';

export const platformApi = Router();
platformApi.use(verifyHubRequest);

async function org(id) {
  if (!isUuid(id)) throw notFound('Organização não encontrada.');
  const o = await one('select id, is_demo from organizations where id=$1', [id]);
  if (!o || o.is_demo) throw notFound('Organização não encontrada.');
  return o;
}
const HUB = { id: null, name: 'Central da plataforma' };

platformApi.get('/manifest', (_req, res) => res.json({
  code: 'cifren', name: 'CIFREN', contract: 1, contract_minor: 0, version: process.env.CIFREN_VERSION || '2026.10',
  description: 'Gestão financeira multiempresa: contas a pagar e a receber, caixa, conciliação, Cofre SIEG e notas fiscais.',
  features: Object.fromEntries(Object.entries(FEATURES).map(([k, v]) => [k, v.label])),
}));

platformApi.get('/tenants', async (_req, res) => {
  const { rows } = await q('select id from organizations where not is_demo order by created_at limit 5000');
  const items = [];
  for (const r of rows) { const t = await tenantPayload(r.id); if (t) { const { is_demo: _d, ...x } = t; items.push(x); } }
  res.json({ items });
});

platformApi.get('/tenants/:id', async (req, res) => {
  const o = await org(req.params.id);
  const { is_demo: _d, ...t } = await tenantPayload(o.id);
  const { rows: users } = await q(`select u.name, u.email, r.name as role_label, m.active, m.last_login_at
      from memberships m join users u on u.id=m.user_id join roles r on r.id=m.role_id where m.org_id=$1 order by r.key='dono' desc, u.name limit 200`, [o.id]);
  const companies = await orgTx(o.id, (db) => db.all('select name, document, active from companies order by created_at'));
  res.json({ tenant: { ...t, users: { n: users.length, active: users.filter((u) => u.active).length, list: users }, units: companies } });
});

platformApi.post('/tenants/:id/access', async (req, res) => {
  const o = await org(req.params.id);
  const d = parse(z.object({ access: z.object({ status: z.string(), blocked: z.boolean() }).passthrough() }), req.body);
  await storeAccess(o.id, d.access);
  res.json({ ok: true });
});

/** Senha provisória para o Dono (exibida uma vez na central). Conta usada em outra organização: não troca (é dela). */
platformApi.post('/tenants/:id/owner-reset', async (req, res) => {
  const o = await org(req.params.id);
  const owner = await one(`select u.id, u.email from memberships m join roles r on r.id=m.role_id join users u on u.id=m.user_id
      where m.org_id=$1 and r.key='dono' order by m.created_at limit 1`, [o.id]);
  if (!owner) throw new HttpError(404, 'Esta organização não tem Dono.');
  if ((await one('select count(*)::int as n from memberships where user_id=$1', [owner.id])).n > 1) {
    throw new HttpError(409, 'O Dono usa a mesma conta em outra organização; peça que ele use "Esqueci a senha" ou troque em "Minha conta".');
  }
  const temp = `Cf-${crypto.randomBytes(6).toString('base64url')}-${crypto.randomInt(10, 99)}`;
  await q('update users set password_hash=$2, must_change_password=true, active=true, auth_version=auth_version+1 where id=$1', [owner.id, await bcrypt.hash(temp, 12)]);
  await revokeSessions(owner.id);
  await orgTx(o.id, (db) => audit(db, { actor: HUB, action: 'plataforma.senha_dono', entity: 'user', entityId: owner.id, summary: 'Senha provisória do Dono criada pela central' }));
  res.json({ ok: true, user_id: owner.id, email: owner.email, temporary_password: temp,
    message: 'Senha provisória criada. Oriente o responsável a trocá-la logo no primeiro acesso.' });
});

/** Exclusão definitiva (pedido confirmado no Master com o nome digitado e o motivo). */
platformApi.post('/tenants/:id/delete', async (req, res) => {
  const o = await org(req.params.id);
  parse(z.object({ confirm: z.literal(true), reason: z.string().max(500).nullable().optional() }), req.body || {});
  const removed = await tx(async (db) => {
    await db.query("select set_config('app.allow_org_delete', 'on', true), set_config('app.org_id', $1, true)", [o.id]);
    const { rows: [n] } = await db.query('select count(*)::int as usuarios from memberships where org_id=$1', [o.id]);
    await db.query('delete from organizations where id=$1', [o.id]);
    // contas que não pertencem a mais nenhuma organização deixam de existir
    await db.query('delete from users u where not exists (select 1 from memberships m where m.user_id=u.id)');
    return n;
  });
  res.json({ ok: true, removed });
});

// ---------------- portal da assinatura (/api/billing) ----------------
export const billing = Router();
billing.get('/', need('configuracoes.gerenciar', 'usuarios.gerenciar'), async (req, res) => {
  const access = await accessFor(req.orgId);
  res.json({ access, modules: modulesFrom(access) });
});
