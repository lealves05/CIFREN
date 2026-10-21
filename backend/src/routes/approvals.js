// Aprovações (contas a pagar, compras, reembolsos) e alçadas. Quem pede não aprova.
import { Router } from 'express';
import { z } from 'zod';
import { orgTx } from '../db.js';
import { HttpError, parse, notFound, uuidParam, isUuid } from '../util.js';
import { need, can, companyAllowed } from '../auth.js';
import { audit } from '../audit.js';
import { applyDecision } from '../lib/approvals.js';
import { notifyUsers } from '../lib/notify.js';

export const approvals = Router();
const actor = (req) => ({ id: req.user.id, name: req.user.name });
const LINK = { title: '/pagar', purchase: '/compras', expense: '/despesas' };

approvals.get('/', need('aprovacoes.aprovar', 'compras.aprovar', 'despesas.aprovar', 'financeiro.titulos.visualizar'), async (req, res) => {
  const st = ['pendente', 'aprovado', 'reprovado'].includes(req.query.status) ? req.query.status : req.query.status === 'todos' ? null : 'pendente';
  const ent = ['title', 'purchase', 'expense'].includes(req.query.entity) ? req.query.entity : null;
  const rows = await orgTx(req.orgId, (db) => db.all(`select a.*, c.name as company_name from approvals a left join companies c on c.id=a.company_id
      where ($1::text is null or a.status=$1) and ($2::text is null or a.entity=$2) and a.status <> 'cancelado' order by a.requested_at desc limit 300`, [st, ent]));
  const canDecide = can(req, 'aprovacoes.aprovar');
  res.json({ items: rows.filter((a) => !a.company_id || companyAllowed(req, a.company_id)).map((a) => ({
    id: a.id, entity: a.entity, entity_id: a.entity_id, company: a.company_id ? { id: a.company_id, name: a.company_name } : null, summary: a.summary, amount: Number(a.amount),
    requested_by: { id: a.requested_by, name: a.requested_by_name }, requested_at: a.requested_at, status: a.status,
    decided_by: a.decided_by ? { id: a.decided_by, name: a.decided_by_name } : null, decided_at: a.decided_at, reason: a.reason,
    can_decide: a.status === 'pendente' && canDecide && a.requested_by !== req.user.id, link: LINK[a.entity],
  })) });
});

async function decide(req, res, approved) {
  const id = uuidParam(req.params.id);
  const d = parse(approved ? z.object({ note: z.string().trim().max(300).optional().nullable() }) : z.object({ reason: z.string().trim().min(3, 'informe o motivo').max(300) }), req.body || {});
  await orgTx(req.orgId, async (db) => {
    const a = await db.one('select * from approvals where id=$1 for update', [id]);
    if (!a || (a.company_id && !companyAllowed(req, a.company_id))) throw notFound('Aprovação não encontrada.');
    if (a.status !== 'pendente') throw new HttpError(409, 'Esta aprovação já foi decidida.');
    if (a.requested_by === req.user.id) throw new HttpError(403, 'Quem pediu não pode aprovar o próprio pedido. Outra pessoa com permissão precisa decidir.');
    await db.query('update approvals set status=$2, decided_by=$3, decided_by_name=$4, decided_at=now(), reason=$5 where id=$1',
      [id, approved ? 'aprovado' : 'reprovado', req.user.id, req.user.name, approved ? d.note || null : d.reason]);
    await applyDecision(db, a, approved);
    await audit(db, { actor: actor(req), req, action: approved ? 'aprovacao.aprovada' : 'aprovacao.reprovada', entity: a.entity, entityId: a.entity_id,
      summary: `${a.summary} — ${approved ? 'aprovado' : `reprovado: ${d.reason}`}`, data: { amount: Number(a.amount) } });
    if (a.requested_by) await notifyUsers(db, [a.requested_by], { kind: 'aprovacao', title: approved ? 'Pedido aprovado' : 'Pedido reprovado',
      body: `${a.summary}${approved ? '' : ` — motivo: ${d.reason}`}`, link: LINK[a.entity], dedupe: `decisao:${a.id}` });
  });
  res.json({ ok: true });
}
approvals.post('/:id/approve', need('aprovacoes.aprovar'), (req, res) => decide(req, res, true));
approvals.post('/:id/reject', need('aprovacoes.aprovar'), (req, res) => decide(req, res, false));

export const approvalRules = Router();
const ruleSchema = z.object({ entity: z.enum(['title', 'purchase', 'expense']), company_id: z.string().refine(isUuid).nullable().optional(),
  min_amount: z.coerce.number().min(0).max(1e12), active: z.boolean().optional() });
approvalRules.get('/', need('aprovacoes.configurar', 'aprovacoes.aprovar'), async (req, res) => {
  res.json({ items: await orgTx(req.orgId, (db) => db.all('select id, entity, company_id, min_amount, active from approval_rules order by entity, min_amount')) });
});
approvalRules.post('/', need('aprovacoes.configurar'), async (req, res) => {
  const d = parse(ruleSchema, req.body);
  const row = await orgTx(req.orgId, async (db) => {
    if (d.company_id && !(await db.one('select 1 from companies where id=$1', [d.company_id]))) throw new HttpError(400, 'Empresa inválida.');
    const r = await db.one('insert into approval_rules (org_id, entity, company_id, min_amount, active) values ($1,$2,$3,$4,coalesce($5,true)) returning id, entity, company_id, min_amount, active',
      [req.orgId, d.entity, d.company_id || null, d.min_amount, d.active ?? null]);
    await audit(db, { actor: actor(req), req, action: 'alcada.criada', entity: 'approval_rule', entityId: r.id, summary: `Alçada ${d.entity} a partir de R$ ${d.min_amount.toFixed(2)}` });
    return r;
  });
  res.status(201).json(row);
});
approvalRules.put('/:id', need('aprovacoes.configurar'), async (req, res) => {
  const id = uuidParam(req.params.id);
  const d = parse(ruleSchema.partial(), req.body);
  const row = await orgTx(req.orgId, async (db) => {
    const r = await db.one(`update approval_rules set min_amount=coalesce($2,min_amount), active=coalesce($3,active), company_id=case when $4::boolean then $5::uuid else company_id end
                            where id=$1 returning id, entity, company_id, min_amount, active`, [id, d.min_amount ?? null, d.active ?? null, 'company_id' in d, d.company_id || null]);
    if (!r) throw notFound();
    await audit(db, { actor: actor(req), req, action: 'alcada.alterada', entity: 'approval_rule', entityId: id, summary: `Alçada ${r.entity}`, data: d });
    return r;
  });
  res.json(row);
});
approvalRules.delete('/:id', need('aprovacoes.configurar'), async (req, res) => {
  const id = uuidParam(req.params.id);
  await orgTx(req.orgId, async (db) => {
    const r = await db.one('delete from approval_rules where id=$1 returning entity, min_amount', [id]);
    if (!r) throw notFound();
    await audit(db, { actor: actor(req), req, action: 'alcada.apagada', entity: 'approval_rule', entityId: id, summary: `Alçada ${r.entity} removida` });
  });
  res.json({ ok: true });
});
