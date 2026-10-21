// Contas a pagar e a receber: títulos (com parcelas), baixas (parciais), estornos, cancelamento e painel.
// Baixa: `amount` é a parte do título quitada; o caixa movimenta amount + juros + multa − desconto.
import { Router } from 'express';
import { z } from 'zod';
import { orgTx } from '../db.js';
import { HttpError, parse, notFound, uuidParam, isUuid, likeEsc, today, splitAmount, addInterval, toCents, fromCents,
  limitParam, encodeCursor, decodeCursor } from '../util.js';
import { need, assertCompany, companyAllowed } from '../auth.js';
import { audit } from '../audit.js';
import { BALANCE_SQL } from './cadastros.js';
import { needsApproval, requestApproval, assertApprovedForPayment } from '../lib/approvals.js';
import { onTitleSettled } from '../lib/recurring.js';
import { insightsFor } from '../lib/insights.js';
import { feedFromSettlement } from '../lib/rusten.js';

const actor = (req) => ({ id: req.user.id, name: req.user.name });
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data inválida (use AAAA-MM-DD)')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), 'data inválida');
const optDate = dateStr.optional().nullable().transform((v) => v || null);
const optText = (max) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const optUuid = (label) => z.string().optional().nullable().refine((v) => !v || isUuid(v), `${label} inválido`).transform((v) => v || null);
const positive = z.coerce.number().finite().positive('o valor precisa ser maior que zero').refine((v) => v < 1e13, 'valor fora do limite')
  .transform((v) => Math.round(v * 100) / 100).refine((v) => v > 0, 'o valor precisa ser maior que zero');
const nonNeg = z.coerce.number().finite().min(0).refine((v) => v < 1e13, 'valor fora do limite').transform((v) => Math.round(v * 100) / 100);

// ---------------- consulta comum ----------------
export const PAID = `coalesce((select sum(s.amount) from settlements s where s.title_id=t.id and s.reversed_at is null), 0)`;
const SELECT = `select t.id, t.kind, t.description, t.document_number, t.issue_date, t.competence_date, t.due_date, t.amount, t.status,
    t.installment, t.installments, t.group_id, t.notes, t.cancel_reason, t.version, t.created_at,
    t.approval_status, t.estimated, t.source,
    (select json_build_object('id', rc.id, 'name', rc.name) from recurring_occurrences ro join recurring_commitments rc on rc.id=ro.commitment_id where ro.id=t.recurring_occurrence_id) as recurring,
    ${PAID} as paid_amount,
    case when cp.id is null then null else json_build_object('id', cp.id, 'name', cp.name) end as counterparty,
    case when c.id is null then null else json_build_object('id', c.id, 'name', c.name) end as category,
    case when cc.id is null then null else json_build_object('id', cc.id, 'name', cc.name) end as cost_center,
    json_build_object('id', co.id, 'name', co.name) as company
  from titles t
  join companies co on co.id = t.company_id
  left join counterparties cp on cp.id = t.counterparty_id
  left join categories c on c.id = t.category_id
  left join cost_centers cc on cc.id = t.cost_center_id`;

function shape(row, day) {
  const paid = Number(row.paid_amount) || 0;
  const open = row.status === 'cancelado' ? 0 : fromCents(Math.max(0, toCents(row.amount) - toCents(paid)));
  const { version, created_at: _c, ...rest } = row;
  return { ...rest, version, paid_amount: paid, open_amount: open, overdue: open > 0 && row.due_date < day };
}

async function loadTitle(db, req, id, lock = false) {
  const t = await db.one(`select * from titles where id=$1 ${lock ? 'for update' : ''}`, [id]);
  if (!t) throw notFound('Título não encontrado.');
  if (!companyAllowed(req, t.company_id)) throw notFound('Título não encontrado.');
  return t;
}

/** Recalcula o status pelo total baixado (não estornado). */
export async function refreshStatus(db, id) {
  const r = await db.one(`update titles t set status = case
        when t.status = 'cancelado' then 'cancelado'
        when ${PAID} >= t.amount then 'pago'
        when ${PAID} > 0 then 'parcial' else 'aberto' end,
      updated_at = now(), version = t.version + 1
    where t.id = $1 returning status`, [id]);
  return r.status;
}

/** Os cadastros referenciados existem e estão ativos na organização (a RLS esconde os de outras). */
async function checkRefs(db, d, kind) {
  if (d.company_id && !(await db.one('select 1 from companies where id=$1 and active', [d.company_id]))) throw new HttpError(400, 'Empresa inválida.');
  if (d.counterparty_id && !(await db.one('select 1 from counterparties where id=$1', [d.counterparty_id]))) throw new HttpError(400, 'Cliente/fornecedor não encontrado.');
  if (d.category_id) {
    const c = await db.one('select type from categories where id=$1', [d.category_id]);
    if (!c) throw new HttpError(400, 'Categoria não encontrada.');
    if (kind && c.type !== (kind === 'pagar' ? 'despesa' : 'receita')) throw new HttpError(400, kind === 'pagar' ? 'Use uma categoria de despesa.' : 'Use uma categoria de receita.');
  }
  if (d.cost_center_id && !(await db.one('select 1 from cost_centers where id=$1', [d.cost_center_id]))) throw new HttpError(400, 'Centro de custo não encontrado.');
}

// ---------------- títulos ----------------
export const titles = Router();

titles.get('/', need('financeiro.titulos.visualizar'), async (req, res) => {
  const day = today();
  const limit = limitParam(req.query.limit, 50, 200);
  const cur = decodeCursor(req.query.cursor);
  const p = []; const w = [];
  const add = (sql, ...vals) => { let s = sql; for (const v of vals) { p.push(v); s = s.replace('?', `$${p.length}`); } w.push(s); };
  if (['pagar', 'receber'].includes(req.query.kind)) add('t.kind = ?', req.query.kind);
  const st = req.query.status || 'abertos';
  if (st === 'abertos') w.push("t.status in ('aberto','parcial')");
  else if (st === 'vencidos') add("t.status in ('aberto','parcial') and t.due_date < ?::date", day);
  else if (st === 'pagos') w.push("t.status = 'pago'");
  else if (st === 'cancelados') w.push("t.status = 'cancelado'");
  else if (st !== 'todos') throw new HttpError(400, 'status inválido');
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || ''))) add('t.due_date >= ?::date', req.query.from);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || ''))) add('t.due_date <= ?::date', req.query.to);
  if (isUuid(req.query.company_id)) add('t.company_id = ?', req.query.company_id);
  if (req.companyScope) add('t.company_id = any(?::uuid[])', req.companyScope);
  if (isUuid(req.query.counterparty_id)) add('t.counterparty_id = ?', req.query.counterparty_id);
  if (isUuid(req.query.category_id)) add('t.category_id = ?', req.query.category_id);
  if (req.query.q) { const like = `%${likeEsc(String(req.query.q).slice(0, 80))}%`; add('(t.description ilike ? or t.document_number ilike ? or cp.name ilike ?)', like, like, like); }
  const where = w.length ? `where ${w.join(' and ')}` : '';
  const out = await orgTx(req.orgId, async (db) => {
    const totals = await db.one(`select coalesce(sum(t.amount) filter (where t.status <> 'cancelado'),0) as amount,
        coalesce(sum(${PAID}) filter (where t.status <> 'cancelado'),0) as paid
      from titles t left join counterparties cp on cp.id=t.counterparty_id ${where}`, p);
    const pp = [...p]; let page = where;
    if (cur?.d && isUuid(cur.id)) { pp.push(cur.d, cur.id); page = `${where ? `${where} and` : 'where'} (t.due_date, t.id) > ($${pp.length - 1}::date, $${pp.length}::uuid)`; }
    pp.push(limit + 1);
    const rows = await db.all(`${SELECT} ${page} order by t.due_date, t.id limit $${pp.length}`, pp);
    return { totals, rows };
  });
  const more = out.rows.length > limit;
  const items = out.rows.slice(0, limit).map((r) => shape(r, day));
  const last = items[items.length - 1];
  res.json({
    items,
    totals: { amount: Number(out.totals.amount), paid: Number(out.totals.paid), open: fromCents(toCents(out.totals.amount) - toCents(out.totals.paid)) },
    next_cursor: more && last ? encodeCursor({ d: last.due_date, id: last.id }) : null,
  });
});

const createSchema = z.object({
  kind: z.enum(['pagar', 'receber']),
  company_id: z.string().refine(isUuid, 'empresa inválida'),
  description: z.string().trim().min(1, 'informe a descrição').max(200),
  due_date: dateStr, amount: positive,
  counterparty_id: optUuid('cliente/fornecedor'), category_id: optUuid('categoria'), cost_center_id: optUuid('centro de custo'),
  document_number: optText(60), issue_date: optDate, competence_date: optDate, notes: optText(2000),
  installments: z.coerce.number().int().min(1).max(120).default(1),
  interval: z.enum(['mensal', 'quinzenal', 'semanal', 'anual']).default('mensal'),
});

titles.post('/', need('financeiro.titulos.criar'), async (req, res) => {
  const d = parse(createSchema, req.body);
  assertCompany(req, d.company_id);
  const n = d.installments;
  if (toCents(d.amount) < n) throw new HttpError(400, 'O valor é pequeno demais para tantas parcelas.');
  const parts = splitAmount(d.amount, n);
  const ids = await orgTx(req.orgId, async (db) => {
    await checkRefs(db, d, d.kind);
    const group = n > 1 ? (await db.one('select gen_random_uuid() as g')).g : null;
    const out = [];
    for (let i = 0; i < n; i++) {
      const due = addInterval(d.due_date, d.interval, i);
      const comp = d.competence_date ? addInterval(d.competence_date, d.interval, i) : null;
      const row = await db.one(`insert into titles (org_id, company_id, kind, description, counterparty_id, category_id, cost_center_id, document_number,
          issue_date, competence_date, due_date, amount, group_id, installment, installments, notes, created_by)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id`,
      [req.orgId, d.company_id, d.kind, n > 1 ? `${d.description} (${i + 1}/${n})` : d.description, d.counterparty_id, d.category_id, d.cost_center_id,
        d.document_number, d.issue_date, comp, due, parts[i], group, i + 1, n, d.notes, req.user.id]);
      out.push(row.id);
    }
    await audit(db, { actor: actor(req), req, action: 'titulo.criado', entity: 'title', entityId: out[0],
      summary: `${d.kind === 'pagar' ? 'A pagar' : 'A receber'}: ${d.description} — R$ ${d.amount.toFixed(2)}${n > 1 ? ` em ${n} parcelas` : ''}`,
      data: { kind: d.kind, amount: d.amount, due_date: d.due_date, installments: n, ids: out } });
    // alçada: conta a pagar acima do valor definido só pode ser paga depois de aprovada por outra pessoa (uma aprovação para todas as parcelas)
    if (d.kind === 'pagar' && (await needsApproval(db, 'title', d.company_id, d.amount))) {
      await db.query("update titles set approval_status='pendente' where id = any($1::uuid[])", [out]);
      await requestApproval(db, req, { entity: 'title', entityId: out[0], companyId: d.company_id, amount: d.amount,
        summary: `A pagar: ${d.description}${n > 1 ? ` (${n} parcelas)` : ''}` });
    }
    return out;
  });
  res.status(201).json({ ids });
});

titles.get('/:id', need('financeiro.titulos.visualizar'), async (req, res) => {
  const id = uuidParam(req.params.id);
  const day = today();
  const out = await orgTx(req.orgId, async (db) => {
    const t = await db.one(`${SELECT} where t.id=$1`, [id]);
    if (!t || !companyAllowed(req, t.company.id)) throw notFound('Título não encontrado.');
    const settlements = await db.all(`select s.id, json_build_object('id', a.id, 'name', a.name) as account, s.paid_at, s.amount, s.interest, s.fine, s.discount,
        s.method, s.notes, s.reversed_at, s.reverse_reason, s.created_at
      from settlements s join bank_accounts a on a.id=s.account_id where s.title_id=$1 order by s.created_at`, [id]);
    const raw = await db.one('select counterparty_id, category_id, cost_center_id, company_id from titles where id=$1', [id]);
    const documents = await db.all(`select d.id, d.filename, d.kind from document_links l join documents d on d.id=l.document_id where l.entity='title' and l.entity_id=$1`, [id]);
    return { ...shape(t, day), ...raw, settlements, documents };
  });
  res.json(out);
});

const updateSchema = z.object({
  description: z.string().trim().min(1).max(200).optional(),
  due_date: dateStr.optional(), amount: positive.optional(),
  counterparty_id: optUuid('cliente/fornecedor'), category_id: optUuid('categoria'), cost_center_id: optUuid('centro de custo'),
  document_number: optText(60), issue_date: optDate, competence_date: optDate, notes: optText(2000),
  version: z.coerce.number().int().optional(),
});
titles.put('/:id', need('financeiro.titulos.editar'), async (req, res) => {
  const id = uuidParam(req.params.id);
  const body = req.body || {};
  const d = parse(updateSchema, body);
  const out = await orgTx(req.orgId, async (db) => {
    const t = await loadTitle(db, req, id, true);
    if (d.version != null && d.version !== t.version) throw new HttpError(409, 'Este título foi alterado por outra pessoa. Recarregue a tela.', { code: 'VERSION_CONFLICT' });
    if (t.status === 'cancelado') throw new HttpError(409, 'Título cancelado não pode ser alterado.');
    if (d.amount !== undefined && d.amount !== Number(t.amount)) {
      if (t.status !== 'aberto' || (await db.one('select 1 from settlements where title_id=$1 and reversed_at is null limit 1', [id]))) {
        throw new HttpError(409, 'O valor só pode mudar em títulos em aberto e sem baixa. Estorne a baixa antes.');
      }
    }
    await checkRefs(db, d, t.kind);
    // só campos presentes no corpo (null limpa os opcionais)
    const keys = ['description', 'due_date', 'amount', 'counterparty_id', 'category_id', 'cost_center_id', 'document_number', 'issue_date', 'competence_date', 'notes']
      .filter((k) => Object.prototype.hasOwnProperty.call(body, k) && d[k] !== undefined);
    if (!keys.length) throw new HttpError(400, 'Nada para alterar.');
    await db.query(`update titles set ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')}, updated_at=now(), version=version+1 where id=$1`, [id, ...keys.map((k) => d[k])]);
    // aumentou o valor de uma conta a pagar já aprovada (ou passou da alçada): volta para aprovação
    if (t.kind === 'pagar' && keys.includes('amount') && d.amount > Number(t.amount) && (await needsApproval(db, 'title', t.company_id, d.amount))) {
      await db.query("update titles set approval_status='pendente' where id=$1", [id]);
      await db.query("update approvals set status='cancelado' where entity='title' and entity_id=$1 and status='pendente'", [id]);
      await requestApproval(db, req, { entity: 'title', entityId: id, companyId: t.company_id, amount: d.amount, summary: `A pagar (valor alterado): ${d.description || t.description}` });
    }
    const before = Object.fromEntries(keys.map((k) => [k, t[k] instanceof Date ? t[k].toISOString() : t[k]]));
    await audit(db, { actor: actor(req), req, action: 'titulo.alterado', entity: 'title', entityId: id, summary: t.description,
      data: { antes: before, depois: Object.fromEntries(keys.map((k) => [k, d[k]])) } });
    return { ok: true };
  });
  res.json(out);
});

const settleSchema = z.object({
  account_id: z.string().refine(isUuid, 'conta inválida'),
  paid_at: dateStr, amount: positive,
  interest: nonNeg.default(0), fine: nonNeg.default(0), discount: nonNeg.default(0),
  method: z.enum(['pix', 'boleto', 'dinheiro', 'cartao', 'transferencia', 'outro']).default('outro'),
  notes: optText(500),
});
titles.post('/:id/settle', need('financeiro.titulos.baixar'), async (req, res) => {
  const id = uuidParam(req.params.id);
  const d = parse(settleSchema, req.body);
  const out = await orgTx(req.orgId, async (db) => {
    const t = await loadTitle(db, req, id, true);
    return settleTitle(db, req, t, d);
  });
  res.json(out);
});

/** Baixa (usada também pela conciliação e pelos reembolsos). origin: manual | conciliacao | reembolso | integracao. */
export async function settleTitle(db, req, t, d, origin = 'manual') {
    const id = t.id;
    if (t.status === 'cancelado') throw new HttpError(409, 'Título cancelado não pode receber baixa.');
    if (t.status === 'pago') throw new HttpError(409, 'Este título já está quitado.');
    assertApprovedForPayment(t);
    const acc = await db.one('select company_id, active, opening_date, name from bank_accounts where id=$1', [d.account_id]);
    if (!acc || !acc.active) throw new HttpError(400, 'Conta não encontrada ou arquivada.');
    if (acc.company_id !== t.company_id) throw new HttpError(400, 'Use uma conta da mesma empresa do título.');
    if (d.paid_at < acc.opening_date) throw new HttpError(400, `A data da baixa é anterior ao saldo inicial da conta (${acc.opening_date}).`);
    if (d.paid_at > today()) throw new HttpError(400, 'A data da baixa não pode ser futura.');
    const paid = (await db.one(`select coalesce(sum(amount),0) as v from settlements where title_id=$1 and reversed_at is null`, [id])).v;
    const open = toCents(t.amount) - toCents(paid);
    if (toCents(d.amount) > open) throw new HttpError(400, `O valor baixado passa do saldo em aberto (R$ ${fromCents(open).toFixed(2)}).`);
    if (toCents(d.discount) > toCents(d.amount) + toCents(d.interest) + toCents(d.fine)) throw new HttpError(400, 'O desconto não pode ser maior que o valor pago.');
    const s = await db.one(`insert into settlements (org_id, title_id, account_id, paid_at, amount, interest, fine, discount, method, notes, created_by, origin)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
    [db.orgId, id, d.account_id, d.paid_at, d.amount, d.interest || 0, d.fine || 0, d.discount || 0, d.method || 'outro', d.notes || null, req?.user?.id || null, origin]);
    const status = await refreshStatus(db, id);
    if (status === 'pago') await onTitleSettled(db, id);
    if (t.source === 'rusten') await feedFromSettlement(db, s.id, 'pagamento'); // fiado do RUSTEN recebido aqui: avisa o RUSTEN
    await audit(db, { actor: req?.user ? actor(req) : { id: null, name: 'Integração' }, req, action: 'titulo.baixado', entity: 'title', entityId: id,
      summary: `${t.description}: R$ ${Number(d.amount).toFixed(2)} em ${acc.name} (${status})${origin !== 'manual' ? ` — ${origin}` : ''}`, data: { settlement_id: s.id, ...d, origin } });
    return { ok: true, status, settlement_id: s.id };
}

titles.post('/:id/cancel', need('financeiro.titulos.cancelar'), async (req, res) => {
  const id = uuidParam(req.params.id);
  const d = parse(z.object({ reason: z.string().trim().min(3, 'informe o motivo').max(300) }), req.body);
  await orgTx(req.orgId, async (db) => {
    const t = await loadTitle(db, req, id, true);
    if (t.status === 'cancelado') throw new HttpError(409, 'O título já está cancelado.');
    if (await db.one('select 1 from settlements where title_id=$1 and reversed_at is null limit 1', [id])) {
      throw new HttpError(409, 'Há baixa ativa neste título. Estorne a baixa antes de cancelar.');
    }
    await db.query("update titles set status='cancelado', cancel_reason=$2, cancelled_at=now(), updated_at=now(), version=version+1 where id=$1", [id, d.reason]);
    await audit(db, { actor: actor(req), req, action: 'titulo.cancelado', entity: 'title', entityId: id, summary: `${t.description}: ${d.reason}` });
  });
  res.json({ ok: true });
});

// ---------------- estorno de baixa ----------------
export const settlements = Router();
settlements.post('/:id/reverse', need('financeiro.titulos.baixar'), async (req, res) => {
  const id = uuidParam(req.params.id);
  const d = parse(z.object({ reason: z.string().trim().min(3, 'informe o motivo').max(300) }), req.body);
  const out = await orgTx(req.orgId, async (db) => {
    const s = await db.one('select title_id, amount, reversed_at from settlements where id=$1', [id]);
    if (!s) throw notFound('Baixa não encontrada.');
    const t = await loadTitle(db, req, s.title_id, true);
    const again = await db.one('select reversed_at from settlements where id=$1 for update', [id]);
    if (again.reversed_at) throw new HttpError(409, 'Esta baixa já foi estornada.');
    if (t.source === 'rusten' && (await db.one("select 1 from settlements where id=$1 and origin='integracao'", [id]))) {
      throw new HttpError(409, 'Este recebimento veio do RUSTEN. Estorne lá, na conta do cliente: o CIFREN acompanha sozinho.');
    }
    await db.query('update settlements set reversed_at=now(), reversed_by=$2, reverse_reason=$3 where id=$1', [id, req.user.id, d.reason]);
    const status = await refreshStatus(db, s.title_id);
    if (t.source === 'rusten') await feedFromSettlement(db, id, 'estorno');
    await audit(db, { actor: actor(req), req, action: 'baixa.estornada', entity: 'title', entityId: s.title_id,
      summary: `${t.description}: estorno de R$ ${Number(s.amount).toFixed(2)} — ${d.reason}`, data: { settlement_id: id } });
    return { ok: true, status };
  });
  res.json(out);
});

// ---------------- painel ----------------
export const dashboard = Router();
dashboard.get('/', need('financeiro.painel.visualizar'), async (req, res) => {
  const day = today();
  const companyId = isUuid(req.query.company_id) ? req.query.company_id : null;
  if (companyId) assertCompany(req, companyId);
  const scope = companyId ? [companyId] : req.companyScope; // null = todas
  const out = await orgTx(req.orgId, async (db) => {
    const accounts = await db.all(`select a.id, a.name, a.type, round(${BALANCE_SQL}, 2) as balance from bank_accounts a
       where a.active and ($1::uuid[] is null or a.company_id = any($1::uuid[])) order by a.type, lower(a.name)`, [scope]);
    const open = await db.all(`select t.kind, t.due_date, t.amount - ${PAID} as open from titles t
       where t.status in ('aberto','parcial') and t.due_date <= $2::date + 30 and ($1::uuid[] is null or t.company_id = any($1::uuid[]))`, [scope, day]);
    const month = await db.all(`select t.kind, sum(t.amount - ${PAID}) as open from titles t
       where t.status in ('aberto','parcial') and date_trunc('month', t.due_date) = date_trunc('month', $2::date)
         and ($1::uuid[] is null or t.company_id = any($1::uuid[])) group by t.kind`, [scope, day]);
    const byCat = await db.all(`select coalesce(c.name, 'Sem categoria') as name, sum(s.amount + s.interest + s.fine - s.discount) as amount
       from settlements s join titles t on t.id=s.title_id left join categories c on c.id=t.category_id
       where s.reversed_at is null and t.kind='pagar' and date_trunc('month', s.paid_at) = date_trunc('month', $2::date)
         and ($1::uuid[] is null or t.company_id = any($1::uuid[]))
       group by 1 order by 2 desc limit 8`, [scope, day]);
    const upcoming = await db.all(`${SELECT} where t.status in ('aberto','parcial') and ($1::uuid[] is null or t.company_id = any($1::uuid[]))
       order by t.due_date, t.id limit 8`, [scope]);
    const pending = await db.one(`select
        (select count(*)::int from approvals where status='pendente') as approvals,
        (select count(*)::int from statement_lines l join bank_accounts a on a.id=l.account_id where l.status='pendente' and ($1::uuid[] is null or a.company_id = any($1::uuid[]))) as recon,
        (select count(*)::int from documents where status in ('recebido','processado','aguardando_ia') and ($1::uuid[] is null or company_id = any($1::uuid[]))) as docs`, [scope]);
    const missing = await db.all(`select c.name, o.due_date, o.estimated_amount as estimated from recurring_occurrences o join recurring_commitments c on c.id=o.commitment_id
        join titles t on t.id=o.title_id where o.status='lancada' and t.estimated and t.status='aberto' and o.due_date <= $2::date + 7
          and ($1::uuid[] is null or c.company_id = any($1::uuid[])) order by o.due_date limit 8`, [scope, day]);
    return { accounts, open, month, byCat, upcoming, pending, missing };
  });
  const ins = await insightsFor(req.orgId, scope).catch(() => []);
  const cashCents = out.accounts.reduce((a, x) => a + toCents(x.balance), 0);
  const next7 = addInterval(day, 'semanal', 1);
  const bucket = (kind) => {
    const rows = out.open.filter((r) => r.kind === kind);
    const sum = (arr) => fromCents(arr.reduce((a, r) => a + toCents(r.open), 0));
    const overdue = rows.filter((r) => r.due_date < day); const soon = rows.filter((r) => r.due_date >= day && r.due_date <= next7);
    return { overdue: { n: overdue.length, amount: sum(overdue) }, next7: { n: soon.length, amount: sum(soon) },
      month: { amount: Number(out.month.find((m) => m.kind === kind)?.open || 0) } };
  };
  // fluxo: 30 dias a partir de hoje; vencidos entram hoje
  const flow = []; let bal = cashCents;
  for (let i = 0; i < 30; i++) {
    const dte = new Date(Date.parse(`${day}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
    const hits = out.open.filter((r) => (i === 0 ? r.due_date <= dte : r.due_date === dte));
    const inc = hits.filter((r) => r.kind === 'receber').reduce((a, r) => a + toCents(r.open), 0);
    const outc = hits.filter((r) => r.kind === 'pagar').reduce((a, r) => a + toCents(r.open), 0);
    bal += inc - outc;
    flow.push({ date: dte, in: fromCents(inc), out: fromCents(outc), balance: fromCents(bal) });
  }
  res.json({
    cash: { total: fromCents(cashCents), accounts: out.accounts.map((a) => ({ ...a, balance: Number(a.balance) })) },
    payables: bucket('pagar'), receivables: bucket('receber'), flow,
    expenses_by_category: out.byCat.map((r) => ({ name: r.name, amount: Number(r.amount) })),
    upcoming: out.upcoming.map((r) => shape(r, day)),
    pending_approvals: out.pending.approvals, reconciliation_pending: out.pending.recon, documents_pending: out.pending.docs,
    recurring_missing: out.missing.map((m) => ({ ...m, estimated: Number(m.estimated) })),
    insights: ins.slice(0, 3),
  });
});


// ---------------- lançamento original (todas as parcelas de uma repetição) ----------------
// Edita de uma vez as parcelas ainda em aberto e sem baixa (as pagas ficam como estão) ou exclui o lançamento
// errado (cancela todas as parcelas sem baixa; o histórico fica na auditoria e na aba Cancelados).
export const titleGroups = Router();
const baseDesc = (s) => String(s || '').replace(/\s*\(\d+\/\d+\)\s*$/, '');
const INTERVALS = ['mensal', 'bimestral', 'trimestral', 'semestral', 'anual', 'semanal', 'quinzenal'];
const stepOf = (iv) => ({ bimestral: ['mensal', 2], trimestral: ['mensal', 3], semestral: ['mensal', 6] }[iv] || [iv, 1]);

async function loadGroup(db, req, gid, lock = false) {
  const rows = await db.all(`select t.*, ${PAID} as paid_amount,
      exists(select 1 from settlements s where s.title_id=t.id and s.reversed_at is null) as has_payment
    from titles t where t.group_id=$1 order by t.installment ${lock ? 'for update of t' : ''}`, [gid]);
  if (!rows.length || !companyAllowed(req, rows[0].company_id)) throw notFound('Lançamento não encontrado.');
  return rows;
}
const editable = (t) => t.status === 'aberto' && !t.has_payment;
function guessInterval(rows) {
  if (rows.length < 2) return 'mensal';
  const [a, b] = [rows[0].due_date, rows[1].due_date];
  for (const iv of INTERVALS) { const [base, k] = stepOf(iv); if (addInterval(a, base, k) === b) return iv; }
  return 'mensal';
}
async function groupShape(db, rows) {
  const f = rows[0];
  const ref = await db.one(`select (select json_build_object('id', id, 'name', name) from counterparties where id=$1) as counterparty,
      (select json_build_object('id', id, 'name', name) from categories where id=$2) as category,
      (select json_build_object('id', id, 'name', name) from cost_centers where id=$3) as cost_center,
      (select json_build_object('id', id, 'name', name) from companies where id=$4) as company`, [f.counterparty_id, f.category_id, f.cost_center_id, f.company_id]);
  const live = rows.filter((t) => t.status !== 'cancelado');
  return { group_id: f.group_id, kind: f.kind, description: baseDesc(f.description), ...ref, document_number: f.document_number, notes: f.notes,
    interval: guessInterval(live.length >= 2 ? live : rows), installments_total: live.length,
    total: fromCents(live.reduce((a, t) => a + toCents(t.amount), 0)), paid_total: fromCents(live.reduce((a, t) => a + toCents(t.paid_amount), 0)),
    editable_count: rows.filter(editable).length, locked_count: live.filter((t) => !editable(t)).length,
    items: rows.map((t) => ({ id: t.id, installment: t.installment, installments: t.installments, description: t.description, due_date: t.due_date, amount: Number(t.amount),
      paid_amount: Number(t.paid_amount), status: t.status, approval_status: t.approval_status, editable: editable(t) })) };
}

titleGroups.get('/:gid', need('financeiro.titulos.visualizar'), async (req, res) => {
  const gid = uuidParam(req.params.gid);
  res.json(await orgTx(req.orgId, async (db) => groupShape(db, await loadGroup(db, req, gid))));
});

const groupSchema = z.object({
  description: z.string().trim().min(1).max(180).optional(),
  counterparty_id: optUuid('cliente/fornecedor'), category_id: optUuid('categoria'), cost_center_id: optUuid('centro de custo'),
  document_number: optText(60), notes: optText(2000),
  amount: positive.optional(),                 // novo valor de CADA parcela em aberto
  first_due_date: dateStr.optional(),          // novo vencimento da primeira parcela em aberto; as seguintes seguem o intervalo
  interval: z.enum(INTERVALS).optional(),
  installments_total: z.coerce.number().int().min(1).max(360).optional(), // aumentar cria parcelas; diminuir exclui as últimas em aberto
});
titleGroups.put('/:gid', need('financeiro.titulos.editar'), async (req, res) => {
  const gid = uuidParam(req.params.gid);
  const body = req.body || {};
  const d = parse(groupSchema, body);
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k) && d[k] !== undefined;
  const out = await orgTx(req.orgId, async (db) => {
    let rows = await loadGroup(db, req, gid, true);
    const f = rows[0];
    await checkRefs(db, d, f.kind);
    const changes = [];
    // 1) quantidade de parcelas
    const live = rows.filter((t) => t.status !== 'cancelado');
    if (has('installments_total') && d.installments_total !== live.length) {
      if (d.installments_total < live.length) {
        const drop = live.slice(d.installments_total);
        if (drop.some((t) => !editable(t))) throw new HttpError(409, 'Só dá para tirar parcelas em aberto e sem baixa. Estorne a baixa da parcela antes.');
        for (const t of drop) await db.query("update titles set status='cancelado', cancel_reason='Parcela retirada do lançamento', cancelled_at=now(), updated_at=now(), version=version+1 where id=$1", [t.id]);
        changes.push(`${drop.length} parcela(s) retirada(s)`);
      } else {
        const last = live[live.length - 1] || f; const iv = d.interval || guessInterval(live);
        const [base, k] = stepOf(iv);
        for (let i = 1; i <= d.installments_total - live.length; i++) {
          await db.query(`insert into titles (org_id, company_id, kind, description, counterparty_id, category_id, cost_center_id, document_number, issue_date, competence_date,
              due_date, amount, group_id, installment, installments, notes, approval_status, source, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
          [req.orgId, f.company_id, f.kind, f.description, f.counterparty_id, f.category_id, f.cost_center_id, f.document_number, f.issue_date,
            addInterval(last.competence_date || last.due_date, base, k * i), addInterval(last.due_date, base, k * i), last.amount, gid,
            last.installment + i, d.installments_total, f.notes, f.approval_status === 'aprovado' ? 'aprovado' : f.approval_status, f.source, req.user.id]);
        }
        changes.push(`${d.installments_total - live.length} parcela(s) incluída(s)`);
      }
      rows = await loadGroup(db, req, gid, true);
    }
    // renumera as parcelas ativas (1/n … n/n) e aplica a descrição
    const act = rows.filter((t) => t.status !== 'cancelado'); const n = act.length;
    const desc = has('description') ? d.description : baseDesc(f.description);
    for (let i = 0; i < act.length; i++) {
      const label = n > 1 ? `${desc} (${i + 1}/${n})` : desc;
      if (act[i].description !== label || act[i].installment !== i + 1 || act[i].installments !== n) {
        await db.query('update titles set description=$2, installment=$3, installments=$4, updated_at=now(), version=version+1 where id=$1', [act[i].id, label.slice(0, 200), i + 1, n]);
      }
    }
    if (has('description') && d.description !== baseDesc(f.description)) changes.push('descrição');
    // 2) campos de cadastro: em todas as parcelas ativas (não mexe em valor nem em baixa)
    const keys = ['counterparty_id', 'category_id', 'cost_center_id', 'document_number', 'notes'].filter(has);
    if (keys.length) {
      await db.query(`update titles set ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')}, updated_at=now(), version=version+1 where group_id=$1 and status <> 'cancelado'`, [gid, ...keys.map((k) => d[k])]);
      changes.push(keys.map((k) => ({ counterparty_id: 'fornecedor/cliente', category_id: 'categoria', cost_center_id: 'centro de custo', document_number: 'documento', notes: 'observações' }[k])).join(', '));
    }
    // 3) valor e vencimentos: só parcelas em aberto e sem baixa
    const open = act.filter(editable);
    if ((has('amount') || has('first_due_date')) && !open.length) throw new HttpError(409, 'Todas as parcelas já têm baixa: valor e vencimento não mudam mais.');
    let raised = 0;
    if (has('amount')) {
      for (const t of open) if (d.amount !== Number(t.amount)) { if (d.amount > Number(t.amount)) raised += 1; await db.query('update titles set amount=$2, updated_at=now(), version=version+1 where id=$1', [t.id, d.amount]); }
      changes.push(`valor de ${open.length} parcela(s) em aberto: R$ ${d.amount.toFixed(2)}`);
    }
    if (has('first_due_date')) {
      const [base, k] = stepOf(d.interval || guessInterval(act));
      for (let i = 0; i < open.length; i++) {
        const due = addInterval(d.first_due_date, base, k * i);
        await db.query("update titles set due_date=$2, competence_date=case when competence_date is null then null else date_trunc('month', $2::date)::date end, updated_at=now(), version=version+1 where id=$1", [open[i].id, due]);
      }
      changes.push(`vencimentos a partir de ${d.first_due_date.split('-').reverse().join('/')}`);
    }
    if (!changes.length) throw new HttpError(400, 'Nada para alterar.');
    // valor maior numa conta a pagar: volta para aprovação, se a alçada pedir
    if (f.kind === 'pagar' && raised) {
      const totalOpen = d.amount * open.length;
      if (await needsApproval(db, 'title', f.company_id, totalOpen)) {
        await db.query("update titles set approval_status='pendente' where id = any($1::uuid[])", [open.map((t) => t.id)]);
        await db.query("update approvals set status='cancelado' where entity='title' and entity_id = any($1::uuid[]) and status='pendente'", [open.map((t) => t.id)]);
        await requestApproval(db, req, { entity: 'title', entityId: open[0].id, companyId: f.company_id, amount: totalOpen, summary: `A pagar (lançamento alterado): ${desc}` });
      }
    }
    await audit(db, { actor: actor(req), req, action: 'lancamento.alterado', entity: 'title_group', entityId: gid, summary: `${desc}: ${changes.join('; ')}`,
      data: { antes: { description: baseDesc(f.description), parcelas: live.length, valores: live.map((t) => Number(t.amount)), vencimentos: live.map((t) => t.due_date) }, depois: d } });
    return groupShape(db, await loadGroup(db, req, gid));
  });
  res.json(out);
});

titleGroups.post('/:gid/cancel', need('financeiro.titulos.cancelar'), async (req, res) => {
  const gid = uuidParam(req.params.gid);
  const d = parse(z.object({ reason: z.string().trim().min(3, 'informe o motivo').max(300) }), req.body);
  const out = await orgTx(req.orgId, async (db) => {
    const rows = await loadGroup(db, req, gid, true);
    const can = rows.filter((t) => t.status !== 'cancelado' && !t.has_payment);
    const kept = rows.filter((t) => t.status !== 'cancelado' && t.has_payment);
    if (!can.length) throw new HttpError(409, kept.length ? 'Todas as parcelas têm baixa. Estorne as baixas antes de excluir o lançamento.' : 'O lançamento já está excluído.');
    for (const t of can) await db.query("update titles set status='cancelado', cancel_reason=$2, cancelled_at=now(), updated_at=now(), version=version+1 where id=$1", [t.id, d.reason]);
    await db.query("update approvals set status='cancelado' where entity='title' and entity_id = any($1::uuid[]) and status='pendente'", [can.map((t) => t.id)]);
    await audit(db, { actor: actor(req), req, action: 'lancamento.excluido', entity: 'title_group', entityId: gid,
      summary: `${baseDesc(rows[0].description)}: ${can.length} parcela(s) excluída(s)${kept.length ? `, ${kept.length} com baixa mantida(s)` : ''} — ${d.reason}` });
    return { cancelled: can.length, kept: kept.length };
  });
  res.json(out);
});
