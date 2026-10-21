// Alçadas de aprovação: conta a pagar, compra ou reembolso com valor ≥ alçada precisa de aprovação de outra pessoa.
import { HttpError } from '../util.js';
import { audit } from '../audit.js';
import { notifyPerm } from './notify.js';

/** A maior regra ativa que se aplica (empresa específica ou todas) com min_amount ≤ valor. */
export async function needsApproval(db, entity, companyId, amount) {
  const r = await db.one(`select id from approval_rules where active and entity=$1 and (company_id is null or company_id=$2) and min_amount <= $3
                          order by min_amount desc limit 1`, [entity, companyId, amount]);
  return !!r;
}

export async function requestApproval(db, req, { entity, entityId, companyId, amount, summary }) {
  await db.query(`insert into approvals (org_id, company_id, entity, entity_id, amount, summary, requested_by, requested_by_name)
                  values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing`,
  [db.orgId, companyId, entity, entityId, amount, summary, req.user.id, req.user.name]);
  await audit(db, { actor: { id: req.user.id, name: req.user.name }, req, action: 'aprovacao.pedida', entity, entityId, summary: `Aprovação pedida: ${summary}`, data: { amount } });
  await notifyPerm(db, 'aprovacoes.aprovar', { kind: 'aprovacao', title: 'Aprovação pendente', body: `${summary} — R$ ${Number(amount).toFixed(2)} (pedido por ${req.user.name})`,
    link: '/aprovacoes', dedupe: `aprov:${entity}:${entityId}`, exceptUser: req.user.id, companyId });
}

/** Aplica a decisão no registro de origem (título, compra ou reembolso). */
export async function applyDecision(db, ap, approved) {
  const st = approved ? 'aprovado' : 'reprovado';
  if (ap.entity === 'title') await db.query(`update titles set approval_status=$2, updated_at=now(), version=version+1
    where id=$1 or (group_id is not null and group_id = (select group_id from titles where id=$1))`, [ap.entity_id, st]);
  if (ap.entity === 'purchase') await db.query(`update purchases set approval_status=$2, status=case when status='solicitada' then $3 else status end, updated_at=now() where id=$1`,
    [ap.entity_id, st, approved ? 'aprovada' : 'reprovada']);
  if (ap.entity === 'expense') await db.query(`update expenses set approval_status=$2, status=case when status='enviada' then $3 else status end, updated_at=now() where id=$1`,
    [ap.entity_id, st, approved ? 'aprovada' : 'reprovada']);
}

export function assertApprovedForPayment(t) {
  if (t.approval_status === 'pendente') throw new HttpError(409, 'Esta conta está aguardando aprovação. Só pode ser paga depois de aprovada.', { code: 'APPROVAL_REQUIRED' });
  if (t.approval_status === 'reprovado') throw new HttpError(409, 'Esta conta foi reprovada: não pode ser paga. Cancele ou peça nova aprovação.', { code: 'APPROVAL_REQUIRED' });
}
