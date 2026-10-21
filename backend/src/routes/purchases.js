// Gestão de compras (solicitação → aprovação → pedido → recebimento → faturamento) e Despesas e reembolsos.
// Agente de Compras: sugere fornecedores pelo histórico (sem IA, sem inventar).
import { Router } from 'express';
import { z } from 'zod';
import { orgTx } from '../db.js';
import { HttpError, parse, notFound, uuidParam, isUuid, today, splitAmount, addInterval, toCents, fromCents, likeEsc } from '../util.js';
import { need, can, assertCompany, companyAllowed } from '../auth.js';
import { audit } from '../audit.js';
import { needsApproval, requestApproval } from '../lib/approvals.js';
import { notifyUsers } from '../lib/notify.js';
import { settleTitle } from './titles.js';

const actor = (req) => ({ id: req.user.id, name: req.user.name });
const opt = z.string().refine(isUuid).optional().nullable();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data inválida (AAAA-MM-DD)');
const money = z.coerce.number().min(0).max(1e12).transform((v) => Math.round(v * 100) / 100);
const sumCents = (arr) => fromCents(arr.reduce((a, x) => a + x, 0));

// ================= COMPRAS =================
export const purchases = Router();
const itemSchema = z.object({ description: z.string().trim().min(1).max(200), qty: z.coerce.number().positive().max(1e7).default(1), unit_price: money.default(0) });
const pShape = async (db, p) => {
  const ref = await db.one(`select (select json_build_object('id', id, 'name', name) from companies where id=$1) as company,
      (select json_build_object('id', id, 'name', name) from counterparties where id=$2) as supplier`, [p.company_id, p.supplier_id]);
  return { id: p.id, number: Number(p.number), ...ref, requester: { id: p.requester_id, name: p.requester_name }, title: p.title, items: p.items, total: Number(p.total), needed_by: p.needed_by,
    notes: p.notes, category_id: p.category_id, cost_center_id: p.cost_center_id, status: p.status, approval_status: p.approval_status, title_id: p.title_ids?.[0] || null, title_ids: p.title_ids,
    expected_at: p.expected_at, created_at: p.created_at };
};
async function loadP(db, req, id) {
  const p = await db.one('select * from purchases where id=$1 for update', [uuidParam(id)]);
  if (!p || !companyAllowed(req, p.company_id)) throw notFound('Compra não encontrada.');
  if (p.requester_id !== req.user.id && !can(req, 'compras.aprovar') && !can(req, 'compras.gerenciar') && !can(req, 'aprovacoes.aprovar')) throw notFound('Compra não encontrada.');
  return p;
}
purchases.get('/', need('compras.solicitar', 'compras.aprovar', 'compras.gerenciar'), async (req, res) => {
  const seeAll = can(req, 'compras.aprovar') || can(req, 'compras.gerenciar');
  const mine = req.query.mine === '1' || !seeAll;
  const st = String(req.query.status || '');
  const items = await orgTx(req.orgId, async (db) => {
    const rows = await db.all(`select * from purchases where ($1::boolean is false or requester_id=$2) and ($3 = '' or status=$3) order by created_at desc limit 300`, [mine, req.user.id, st]);
    return Promise.all(rows.filter((p) => companyAllowed(req, p.company_id)).map((p) => pShape(db, p)));
  });
  res.json({ items });
});
purchases.post('/', need('compras.solicitar'), async (req, res) => {
  const d = parse(z.object({ company_id: z.string().refine(isUuid, 'empresa inválida'), title: z.string().trim().min(2, 'descreva a compra').max(160), items: z.array(itemSchema).min(1, 'inclua ao menos um item').max(100),
    needed_by: dateStr.optional().nullable(), notes: z.string().max(2000).optional().nullable(), category_id: opt, cost_center_id: opt }), req.body);
  assertCompany(req, d.company_id);
  const total = sumCents(d.items.map((i) => Math.round(toCents(i.unit_price) * i.qty)));
  const out = await orgTx(req.orgId, async (db) => {
    if (!(await db.one('select 1 from companies where id=$1 and active', [d.company_id]))) throw new HttpError(400, 'Empresa inválida.');
    if (d.category_id) { const c = await db.one('select type from categories where id=$1', [d.category_id]); if (!c || c.type !== 'despesa') throw new HttpError(400, 'Use uma categoria de despesa.'); }
    const approval = await needsApproval(db, 'purchase', d.company_id, total);
    const p = await db.one(`insert into purchases (org_id, company_id, requester_id, requester_name, title, items, total, needed_by, notes, category_id, cost_center_id, status, approval_status)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
    [req.orgId, d.company_id, req.user.id, req.user.name, d.title, JSON.stringify(d.items), total, d.needed_by || null, d.notes || null, d.category_id || null, d.cost_center_id || null,
      approval ? 'solicitada' : 'aprovada', approval ? 'pendente' : null]);
    if (approval) await requestApproval(db, req, { entity: 'purchase', entityId: p.id, companyId: d.company_id, amount: total, summary: `Compra nº ${p.number}: ${d.title}` });
    await audit(db, { actor: actor(req), req, action: 'compra.solicitada', entity: 'purchase', entityId: p.id, summary: `Compra nº ${p.number}: ${d.title} — R$ ${total.toFixed(2)}` });
    return pShape(db, p);
  });
  res.status(201).json(out);
});
purchases.post('/:id/order', need('compras.gerenciar'), async (req, res) => {
  const d = parse(z.object({ supplier_id: z.string().refine(isUuid, 'escolha o fornecedor'), total: money.optional(), expected_at: dateStr.optional().nullable() }), req.body);
  const out = await orgTx(req.orgId, async (db) => {
    const p = await loadP(db, req, req.params.id);
    if (p.status !== 'aprovada') throw new HttpError(409, p.status === 'solicitada' ? 'A compra ainda aguarda aprovação.' : 'Só compras aprovadas viram pedido.');
    if (!(await db.one('select 1 from counterparties where id=$1', [d.supplier_id]))) throw new HttpError(400, 'Fornecedor não encontrado.');
    const r = await db.one("update purchases set status='pedido', supplier_id=$2, total=coalesce($3,total), expected_at=$4, ordered_at=now(), updated_at=now() where id=$1 returning *", [p.id, d.supplier_id, d.total ?? null, d.expected_at || null]);
    await audit(db, { actor: actor(req), req, action: 'compra.pedido', entity: 'purchase', entityId: p.id, summary: `Pedido da compra nº ${p.number} feito` });
    if (p.requester_id !== req.user.id) await notifyUsers(db, [p.requester_id], { kind: 'compra', title: 'Pedido feito', body: `Sua compra "${p.title}" foi pedida ao fornecedor.`, link: '/compras', dedupe: `pedido:${p.id}` });
    return pShape(db, r);
  });
  res.json(out);
});
purchases.post('/:id/receive', need('compras.gerenciar', 'compras.solicitar'), async (req, res) => {
  const out = await orgTx(req.orgId, async (db) => {
    const p = await loadP(db, req, req.params.id);
    if (p.status !== 'pedido') throw new HttpError(409, 'Só um pedido feito pode ser recebido.');
    const r = await db.one("update purchases set status='recebida', received_at=now(), updated_at=now() where id=$1 returning *", [p.id]);
    await audit(db, { actor: actor(req), req, action: 'compra.recebida', entity: 'purchase', entityId: p.id, summary: `Compra nº ${p.number} recebida` });
    return pShape(db, r);
  });
  res.json(out);
});
purchases.post('/:id/invoice', need('compras.gerenciar'), async (req, res) => {
  const d = parse(z.object({ due_date: dateStr, amount: money.optional(), installments: z.coerce.number().int().min(1).max(60).default(1), document_id: opt }), req.body);
  const out = await orgTx(req.orgId, async (db) => {
    const p = await loadP(db, req, req.params.id);
    if (!['pedido', 'recebida'].includes(p.status)) throw new HttpError(409, 'Fature a compra depois do pedido.');
    if (!p.supplier_id) throw new HttpError(409, 'Defina o fornecedor antes.');
    const total = d.amount ?? Number(p.total);
    if (!total) throw new HttpError(400, 'Informe o valor da nota.');
    const parts = splitAmount(total, d.installments); const ids = [];
    const group = d.installments > 1 ? (await db.one('select gen_random_uuid() as g')).g : null;
    for (let i = 0; i < d.installments; i++) {
      const t = await db.one(`insert into titles (org_id, company_id, kind, description, counterparty_id, category_id, cost_center_id, due_date, competence_date, amount, group_id, installment, installments,
          approval_status, source, created_by) values ($1,$2,'pagar',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'aprovado','compra',$13) returning id`,
      [req.orgId, p.company_id, `Compra nº ${p.number}: ${p.title}${d.installments > 1 ? ` (${i + 1}/${d.installments})` : ''}`, p.supplier_id, p.category_id, p.cost_center_id,
        addInterval(d.due_date, 'mensal', i), today(), parts[i], group, i + 1, d.installments, req.user.id]);
      ids.push(t.id);
      if (d.document_id) await db.query("insert into document_links (org_id, document_id, entity, entity_id) values ($1,$2,'title',$3) on conflict do nothing", [req.orgId, d.document_id, t.id]);
    }
    if (d.document_id) { await db.query("insert into document_links (org_id, document_id, entity, entity_id) values ($1,$2,'purchase',$3) on conflict do nothing", [req.orgId, d.document_id, p.id]); await db.query("update documents set status='vinculado' where id=$1", [d.document_id]); }
    const r = await db.one("update purchases set status='faturada', title_ids=$2, total=$3, updated_at=now() where id=$1 returning *", [p.id, ids, total]);
    await audit(db, { actor: actor(req), req, action: 'compra.faturada', entity: 'purchase', entityId: p.id, summary: `Compra nº ${p.number} faturada: R$ ${total.toFixed(2)} em ${d.installments} parcela(s)` });
    return pShape(db, r);
  });
  res.json(out);
});
purchases.post('/:id/cancel', need('compras.solicitar', 'compras.gerenciar'), async (req, res) => {
  const d = parse(z.object({ reason: z.string().trim().min(3, 'informe o motivo').max(300) }), req.body);
  await orgTx(req.orgId, async (db) => {
    const p = await loadP(db, req, req.params.id);
    if (['faturada', 'cancelada'].includes(p.status)) throw new HttpError(409, 'Esta compra não pode mais ser cancelada.');
    if (p.requester_id !== req.user.id && !can(req, 'compras.gerenciar')) throw new HttpError(403, 'Só quem pediu ou o responsável pelas compras cancela.');
    await db.query("update purchases set status='cancelada', cancel_reason=$2, updated_at=now() where id=$1", [p.id, d.reason]);
    await db.query("update approvals set status='cancelado' where entity='purchase' and entity_id=$1 and status='pendente'", [p.id]);
    await audit(db, { actor: actor(req), req, action: 'compra.cancelada', entity: 'purchase', entityId: p.id, summary: `Compra nº ${p.number} cancelada: ${d.reason}` });
  });
  res.json({ ok: true });
});
purchases.get('/:id/supplier-suggestions', need('compras.gerenciar', 'compras.aprovar'), async (req, res) => {
  const items = await orgTx(req.orgId, async (db) => {
    const p = await loadP(db, req, req.params.id);
    const words = [p.title, ...(p.items || []).map((i) => i.description)].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 4).slice(0, 12);
    const rows = await db.all(`select cp.id, cp.name, count(*)::int as n, max(t.due_date) as last_date,
          (array_agg(t.amount order by t.due_date desc))[1] as last_price,
          sum(case when t.category_id = $1 then 2 else 0 end + case when ${words.length ? words.map((_, i) => `lower(t.description) like $${i + 2}`).join(' or ') : 'false'} then 3 else 0 end) as score
        from titles t join counterparties cp on cp.id=t.counterparty_id
        where t.kind='pagar' and t.status <> 'cancelado' and cp.active and cp.kind in ('fornecedor','ambos')
        group by cp.id, cp.name having sum(case when t.category_id = $1 then 1 else 0 end + case when ${words.length ? words.map((_, i) => `lower(t.description) like $${i + 2}`).join(' or ') : 'false'} then 1 else 0 end) > 0
        order by score desc, n desc limit 5`, [p.category_id, ...words.map((w) => `%${w}%`)]);
    return rows.map((r) => ({ supplier: { id: r.id, name: r.name }, n: r.n, last_price: Number(r.last_price),
      reason: `${r.n} compra(s) parecida(s) ou na mesma categoria; última em ${String(r.last_date).split('-').reverse().join('/')} por R$ ${Number(r.last_price).toFixed(2)}` }));
  });
  res.json({ items });
});

// ================= DESPESAS E REEMBOLSOS =================
export const expenses = Router();
const expItem = z.object({ date: dateStr, description: z.string().trim().min(1).max(200), category_id: opt, amount: money.refine((v) => v > 0, 'valor maior que zero'), document_id: opt });
const eShape = async (db, e) => {
  const c = await db.one('select id, name from companies where id=$1', [e.company_id]);
  const m = e.member_id ? await db.one('select id, name from members where id=$1', [e.member_id]) : null;
  return { id: e.id, number: Number(e.number), company: c, user: { id: e.user_id, name: e.user_name }, title: e.title, member: m, event: e.event || null, items: e.items, total: Number(e.total), status: e.status,
    approval_status: e.approval_status, title_id: e.title_id, paid_at: e.paid_at, created_at: e.created_at };
};
async function loadE(db, req, id) {
  const e = await db.one('select * from expenses where id=$1 for update', [uuidParam(id)]);
  if (!e || !companyAllowed(req, e.company_id)) throw notFound('Despesa não encontrada.');
  if (e.user_id !== req.user.id && !can(req, 'despesas.aprovar') && !can(req, 'despesas.pagar') && !can(req, 'aprovacoes.aprovar')) throw notFound('Despesa não encontrada.');
  return e;
}
async function checkItems(db, items) {
  for (const i of items) {
    if (i.category_id) { const c = await db.one('select type from categories where id=$1', [i.category_id]); if (!c || c.type !== 'despesa') throw new HttpError(400, 'Use categorias de despesa.'); }
    if (i.document_id && !(await db.one('select 1 from documents where id=$1', [i.document_id]))) throw new HttpError(400, 'Comprovante não encontrado.');
  }
}
/** Busca de associados pelo nome para o campo Nome da despesa (só id e nome; quem lança despesa não precisa ver o cadastro). */
expenses.get('/members', need('despesas.solicitar'), async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const items = await orgTx(req.orgId, async (db) => (await db.all(`select id, name, company_id from members where status <> 'encerrado' and ($1 = '' or name ilike $2)
      order by lower(name) limit 30`, [q, `%${likeEsc(q)}%`])).filter((m) => companyAllowed(req, m.company_id)).slice(0, 15).map(({ id, name }) => ({ id, name })));
  res.json({ items });
});
async function checkMember(db, req, id) {
  if (!id) return null;
  const m = await db.one('select id, name, company_id, counterparty_id from members where id=$1', [id]);
  if (!m || !companyAllowed(req, m.company_id)) throw new HttpError(400, 'Associado não encontrado.');
  return m;
}
const optMember = z.string().refine(isUuid, 'associado inválido').nullable().optional();
const optEvent = z.string().trim().max(160).nullable().optional(); // ausente = não muda; vazio = sem evento
expenses.get('/', need('despesas.solicitar', 'despesas.aprovar', 'despesas.pagar'), async (req, res) => {
  const seeAll = can(req, 'despesas.aprovar') || can(req, 'despesas.pagar');
  const mine = req.query.mine === '1' || !seeAll;
  const st = String(req.query.status || '');
  const items = await orgTx(req.orgId, async (db) => {
    const rows = await db.all(`select * from expenses where ($1::boolean is false or user_id=$2) and ($3 = '' or status=$3) and (user_id=$2 or status <> 'rascunho') order by created_at desc limit 300`, [mine, req.user.id, st]);
    return Promise.all(rows.filter((e) => companyAllowed(req, e.company_id)).map((e) => eShape(db, e)));
  });
  res.json({ items });
});
expenses.post('/', need('despesas.solicitar'), async (req, res) => {
  const d = parse(z.object({ company_id: z.string().refine(isUuid, 'empresa inválida'), title: z.string().trim().min(2).max(160), member_id: optMember, event: optEvent,
    items: z.array(expItem).min(1, 'inclua ao menos uma despesa').max(100) }), req.body);
  assertCompany(req, d.company_id);
  const out = await orgTx(req.orgId, async (db) => {
    await checkItems(db, d.items);
    await checkMember(db, req, d.member_id);
    const total = sumCents(d.items.map((i) => toCents(i.amount)));
    const e = await db.one(`insert into expenses (org_id, company_id, user_id, user_name, title, items, total, member_id, event) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [req.orgId, d.company_id, req.user.id, req.user.name, d.title, JSON.stringify(d.items), total, d.member_id || null, d.event || null]);
    await audit(db, { actor: actor(req), req, action: 'despesa.criada', entity: 'expense', entityId: e.id, summary: `Prestação nº ${e.number}: ${d.title} — R$ ${total.toFixed(2)}` });
    return eShape(db, e);
  });
  res.status(201).json(out);
});
expenses.put('/:id', need('despesas.solicitar'), async (req, res) => {
  const d = parse(z.object({ title: z.string().trim().min(2).max(160).optional(), member_id: optMember, event: optEvent, items: z.array(expItem).min(1).max(100).optional() }), req.body);
  const out = await orgTx(req.orgId, async (db) => {
    const e = await loadE(db, req, req.params.id);
    if (e.user_id !== req.user.id) throw new HttpError(403, 'Só quem criou altera a prestação de contas.');
    if (!['rascunho', 'reprovada'].includes(e.status)) throw new HttpError(409, 'Depois de enviada, a prestação não muda.');
    if (d.items) await checkItems(db, d.items);
    if (d.member_id !== undefined) await checkMember(db, req, d.member_id);
    const items = d.items || e.items; const total = sumCents(items.map((i) => toCents(i.amount)));
    const r = await db.one(`update expenses set title=coalesce($2,title), items=$3, total=$4, member_id=$5, event=$6, status='rascunho', approval_status=null, updated_at=now() where id=$1 returning *`,
      [e.id, d.title ?? null, JSON.stringify(items), total, d.member_id === undefined ? e.member_id : d.member_id, d.event === undefined ? e.event : d.event || null]);
    return eShape(db, r);
  });
  res.json(out);
});
expenses.post('/:id/submit', need('despesas.solicitar'), async (req, res) => {
  const out = await orgTx(req.orgId, async (db) => {
    const e = await loadE(db, req, req.params.id);
    if (e.user_id !== req.user.id) throw new HttpError(403, 'Só quem criou envia.');
    if (!['rascunho', 'reprovada'].includes(e.status)) throw new HttpError(409, 'Esta prestação já foi enviada.');
    // reembolso sempre passa por aprovação de outra pessoa (regra 0 = toda prestação)
    const r = await db.one("update expenses set status='enviada', approval_status='pendente', updated_at=now() where id=$1 returning *", [e.id]);
    await requestApproval(db, req, { entity: 'expense', entityId: e.id, companyId: e.company_id, amount: Number(e.total), summary: `Reembolso nº ${e.number} de ${e.user_name}: ${e.title}${e.event ? ` (${e.event})` : ''}` });
    return eShape(db, r);
  });
  res.json(out);
});
expenses.post('/:id/pay', need('despesas.pagar'), async (req, res) => {
  const d = parse(z.object({ account_id: z.string().refine(isUuid, 'escolha a conta'), paid_at: dateStr }), req.body);
  const out = await orgTx(req.orgId, async (db) => {
    const e = await loadE(db, req, req.params.id);
    if (e.status !== 'aprovada') throw new HttpError(409, e.status === 'paga' ? 'Este reembolso já foi pago.' : 'Só reembolsos aprovados podem ser pagos.');
    // ligada a um associado: o reembolso é pago a ele (o cadastro dele vira o favorecido); sem vínculo, a quem lançou
    const mem = e.member_id ? await db.one('select counterparty_id, name from members where id=$1', [e.member_id]) : null;
    let cp = mem?.counterparty_id ? { id: mem.counterparty_id } : null;
    const payee = mem?.name || e.user_name;
    if (!cp) cp = await db.one("select id from counterparties where name=$1 and kind in ('fornecedor','ambos') limit 1", [`Reembolso — ${payee}`]);
    if (!cp) cp = await db.one("insert into counterparties (org_id, kind, name, notes) values ($1,'fornecedor',$2,'Criado para reembolsos de despesas') returning id", [req.orgId, `Reembolso — ${payee}`]);
    const cats = [...new Set((e.items || []).map((i) => i.category_id).filter(Boolean))];
    const t = await db.one(`insert into titles (org_id, company_id, kind, description, counterparty_id, category_id, due_date, competence_date, amount, approval_status, source, created_by)
        values ($1,$2,'pagar',$3,$4,$5,$6,$6,$7,'aprovado','reembolso',$8) returning *`,
    [req.orgId, e.company_id, `Reembolso nº ${e.number}: ${e.title}${e.event ? ` — ${e.event}` : ''} (${payee})`.slice(0, 200), cp.id, cats.length === 1 ? cats[0] : null, d.paid_at, e.total, req.user.id]);
    for (const i of e.items || []) if (i.document_id) await db.query("insert into document_links (org_id, document_id, entity, entity_id) values ($1,$2,'title',$3) on conflict do nothing", [req.orgId, i.document_id, t.id]);
    await settleTitle(db, req, t, { account_id: d.account_id, paid_at: d.paid_at, amount: Number(e.total), method: 'transferencia', notes: `Reembolso nº ${e.number}` }, 'reembolso');
    const r = await db.one("update expenses set status='paga', title_id=$2, paid_at=$3, updated_at=now() where id=$1 returning *", [e.id, t.id, d.paid_at]);
    await audit(db, { actor: actor(req), req, action: 'despesa.paga', entity: 'expense', entityId: e.id, summary: `Reembolso nº ${e.number} pago: R$ ${Number(e.total).toFixed(2)} a ${payee}` });
    await notifyUsers(db, [e.user_id], { kind: 'reembolso', title: 'Reembolso pago', body: `Seu reembolso "${e.title}" (R$ ${Number(e.total).toFixed(2)}) foi pago.`, link: '/despesas', dedupe: `pago:${e.id}` });
    return eShape(db, r);
  });
  res.json(out);
});
