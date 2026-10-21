// Compromissos recorrentes e previsão (valor estimado × valor real) — spec 5.3.
import { Router } from 'express';
import { z } from 'zod';
import { orgTx } from '../db.js';
import { HttpError, parse, notFound, uuidParam, isUuid, today, toCents, fromCents } from '../util.js';
import { need, assertCompany, companyAllowed } from '../auth.js';
import { audit } from '../audit.js';
import { generate, materialize, setActual, dueDates, estimate, syncLaunched, withdrawLaunched } from '../lib/recurring.js';

export const recurring = Router();
const actor = (req) => ({ id: req.user.id, name: req.user.name });
const opt = z.string().refine(isUuid).optional().nullable();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data inválida (AAAA-MM-DD)');
const schema = z.object({
  company_id: z.string().refine(isUuid, 'empresa inválida'), kind: z.enum(['pagar', 'receber']), name: z.string().trim().min(2, 'dê um nome').max(120),
  counterparty_id: opt, category_id: opt, cost_center_id: opt,
  frequency: z.enum(['semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual']).default('mensal'),
  due_day: z.coerce.number().int().min(1).max(31).optional().nullable(), start_date: dateStr, end_date: dateStr.optional().nullable(),
  method: z.enum(['fixo', 'media', 'manual']).default('fixo'), average_n: z.coerce.number().int().min(2).max(24).default(6),
  estimated_amount: z.coerce.number().min(0).max(1e12).transform((v) => Math.round(v * 100) / 100),
  tolerance_pct: z.coerce.number().min(0).max(1000).default(15), lead_days: z.coerce.number().int().min(0).max(60).default(10),
});
export const TEMPLATES = [
  { key: 'energia', name: 'Conta de energia', kind: 'pagar', category_name: 'Energia elétrica', method: 'media', frequency: 'mensal' },
  { key: 'aluguel', name: 'Aluguel', kind: 'pagar', category_name: 'Aluguel', method: 'fixo', frequency: 'mensal' },
  { key: 'agua', name: 'Água', kind: 'pagar', category_name: 'Água', method: 'media', frequency: 'mensal' },
  { key: 'internet', name: 'Internet/telefone', kind: 'pagar', category_name: 'Internet e telefone', method: 'fixo', frequency: 'mensal' },
  { key: 'mensalidade', name: 'Mensalidade de cliente', kind: 'receber', category_name: 'Prestação de serviços', method: 'fixo', frequency: 'mensal' },
  { key: 'salario', name: 'Salário', kind: 'pagar', category_name: 'Salários', method: 'fixo', frequency: 'mensal' },
  { key: 'sistema', name: 'Assinatura de sistema', kind: 'pagar', category_name: 'Sistemas e assinaturas', method: 'fixo', frequency: 'mensal' },
  { key: 'contador', name: 'Contador', kind: 'pagar', category_name: 'Contador', method: 'fixo', frequency: 'mensal' },
];

async function shapeOne(db, c) {
  const day = today();
  const next = await db.one("select due_date, estimated_amount from recurring_occurrences where commitment_id=$1 and due_date >= $2 and status <> 'cancelada' order by due_date limit 1", [c.id, day]);
  const last = await db.one("select actual_amount from recurring_occurrences where commitment_id=$1 and status='real' order by due_date desc limit 1", [c.id]);
  const err = await db.one("select avg(abs(actual_amount - estimated_amount) / nullif(estimated_amount,0) * 100) as e from recurring_occurrences where commitment_id=$1 and status='real'", [c.id]);
  const ref = await db.one(`select (select json_build_object('id', id, 'name', name) from companies where id=$1) as company,
      (select json_build_object('id', id, 'name', name) from counterparties where id=$2) as counterparty,
      (select json_build_object('id', id, 'name', name) from categories where id=$3) as category,
      (select json_build_object('id', id, 'name', name) from cost_centers where id=$4) as cost_center`, [c.company_id, c.counterparty_id, c.category_id, c.cost_center_id]);
  return { id: c.id, kind: c.kind, name: c.name, ...ref, frequency: c.frequency, due_day: c.due_day, start_date: c.start_date, end_date: c.end_date, method: c.method,
    average_n: c.average_n, estimated_amount: Number(c.estimated_amount), tolerance_pct: Number(c.tolerance_pct), lead_days: c.lead_days, status: c.status,
    next_due: next?.due_date || null, next_estimated: next ? Number(next.estimated_amount) : null, last_actual: last ? Number(last.actual_amount) : null,
    avg_error_pct: err?.e != null ? Math.round(Number(err.e) * 10) / 10 : null };
}
async function loadC(db, req, id) {
  const c = await db.one('select * from recurring_commitments where id=$1', [uuidParam(id)]);
  if (!c || !companyAllowed(req, c.company_id)) throw notFound('Compromisso não encontrado.');
  return c;
}
async function checkRefs(db, d) {
  if (!(await db.one('select 1 from companies where id=$1 and active', [d.company_id]))) throw new HttpError(400, 'Empresa inválida.');
  if (d.counterparty_id && !(await db.one('select 1 from counterparties where id=$1', [d.counterparty_id]))) throw new HttpError(400, 'Fornecedor/cliente não encontrado.');
  if (d.category_id) { const c = await db.one('select type from categories where id=$1', [d.category_id]); if (!c) throw new HttpError(400, 'Categoria não encontrada.'); if (c.type !== (d.kind === 'pagar' ? 'despesa' : 'receita')) throw new HttpError(400, d.kind === 'pagar' ? 'Use uma categoria de despesa.' : 'Use uma categoria de receita.'); }
  if (d.cost_center_id && !(await db.one('select 1 from cost_centers where id=$1', [d.cost_center_id]))) throw new HttpError(400, 'Centro de custo não encontrado.');
  if (d.end_date && d.end_date < d.start_date) throw new HttpError(400, 'O fim precisa ser depois do início.');
}

recurring.get('/templates', need('previsao.visualizar', 'recorrencias.gerenciar'), (_req, res) => res.json(TEMPLATES));
recurring.get('/', need('previsao.visualizar', 'recorrencias.gerenciar'), async (req, res) => {
  const items = await orgTx(req.orgId, async (db) => {
    const list = await db.all("select * from recurring_commitments order by status='encerrado', status='pausado', kind, lower(name)");
    return Promise.all(list.filter((c) => companyAllowed(req, c.company_id)).map((c) => shapeOne(db, c)));
  });
  res.json({ items });
});
recurring.post('/', need('recorrencias.gerenciar'), async (req, res) => {
  const d = parse(schema, req.body);
  assertCompany(req, d.company_id);
  const out = await orgTx(req.orgId, async (db) => {
    await checkRefs(db, d);
    const dueDay = ['semanal', 'quinzenal'].includes(d.frequency) ? null : d.due_day || Number(d.start_date.slice(8, 10));
    const c = await db.one(`insert into recurring_commitments (org_id, company_id, kind, name, counterparty_id, category_id, cost_center_id, frequency, due_day, start_date, end_date,
        method, average_n, estimated_amount, tolerance_pct, lead_days, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning *`,
    [req.orgId, d.company_id, d.kind, d.name, d.counterparty_id || null, d.category_id || null, d.cost_center_id || null, d.frequency, dueDay, d.start_date, d.end_date || null,
      d.method, d.average_n, d.estimated_amount, d.tolerance_pct, d.lead_days, req.user.id]);
    await generate(db, c); await materialize(db, c);
    await audit(db, { actor: actor(req), req, action: 'recorrente.criado', entity: 'recurring', entityId: c.id, summary: `${c.name} (${c.frequency}, estimado R$ ${d.estimated_amount.toFixed(2)})` });
    return shapeOne(db, c);
  });
  res.status(201).json(out);
});
recurring.put('/:id', need('recorrencias.gerenciar'), async (req, res) => {
  const d = parse(schema.partial(), req.body);
  const out = await orgTx(req.orgId, async (db) => {
    const cur = await loadC(db, req, req.params.id);
    const m = { ...cur, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) };
    if (d.company_id && d.company_id !== cur.company_id) throw new HttpError(400, 'A empresa do compromisso não muda. Encerre e crie outro.');
    await checkRefs(db, m);
    const c = await db.one(`update recurring_commitments set name=$2, counterparty_id=$3, category_id=$4, cost_center_id=$5, frequency=$6, due_day=$7, start_date=$8, end_date=$9,
        method=$10, average_n=$11, estimated_amount=$12, tolerance_pct=$13, lead_days=$14, updated_at=now() where id=$1 returning *`,
    [cur.id, m.name, m.counterparty_id || null, m.category_id || null, m.cost_center_id || null, m.frequency, ['semanal', 'quinzenal'].includes(m.frequency) ? null : m.due_day, m.start_date, m.end_date || null,
      m.method, m.average_n, m.estimated_amount, m.tolerance_pct, m.lead_days]);
    // muda só o futuro ainda previsto: ocorrências previstas que não batem mais com as datas novas saem
    const valid = new Set(dueDates(c, today(), '2999-12-31'));
    await db.query("delete from recurring_occurrences where commitment_id=$1 and status='prevista' and due_date >= $2 and not (due_date = any($3::date[]))", [c.id, today(), [...valid].slice(0, 500)]);
    await syncLaunched(db, c);
    await generate(db, c); await materialize(db, c);
    await audit(db, { actor: actor(req), req, action: 'recorrente.alterado', entity: 'recurring', entityId: c.id, summary: c.name, data: d });
    return shapeOne(db, c);
  });
  res.json(out);
});
for (const [path, status, label] of [['pause', 'pausado', 'pausado'], ['resume', 'ativo', 'retomado'], ['end', 'encerrado', 'encerrado']]) {
  recurring.post(`/:id/${path}`, need('recorrencias.gerenciar'), async (req, res) => {
    await orgTx(req.orgId, async (db) => {
      const c = await loadC(db, req, req.params.id);
      if (c.status === 'encerrado' && status !== 'encerrado') throw new HttpError(409, 'Compromisso encerrado não volta. Crie outro.');
      await db.query('update recurring_commitments set status=$2, updated_at=now() where id=$1', [c.id, status]);
      if (status !== 'ativo') {
        // contas futuras que o compromisso criou e ninguém mexeu saem junto (as pagas, com baixa ou com valor real ficam como estão)
        await withdrawLaunched(db, c, `Compromisso recorrente ${label}.`);
        await db.query("delete from recurring_occurrences where commitment_id=$1 and status='prevista'", [c.id]);
      } else { await generate(db, { ...c, status }); await materialize(db, { ...c, status }); }
      await audit(db, { actor: actor(req), req, action: `recorrente.${path}`, entity: 'recurring', entityId: c.id, summary: `${c.name} ${label}` });
    });
    res.json({ ok: true });
  });
}
recurring.get('/:id/occurrences', need('previsao.visualizar', 'recorrencias.gerenciar'), async (req, res) => {
  const items = await orgTx(req.orgId, async (db) => {
    const c = await loadC(db, req, req.params.id);
    const rows = await db.all("select * from recurring_occurrences where commitment_id=$1 and status <> 'cancelada' order by due_date", [c.id]);
    return rows.map((o) => {
      const est = Number(o.estimated_amount); const act = o.actual_amount == null ? null : Number(o.actual_amount);
      return { id: o.id, due_date: o.due_date, estimated_amount: est, actual_amount: act, diff_amount: act == null ? null : fromCents(toCents(act) - toCents(est)),
        diff_pct: act == null || !est ? null : Math.round(((act - est) / est) * 1000) / 10, status: o.status, title_id: o.title_id, estimate_explain: o.estimate_explain, estimate_manual: o.estimate_manual };
    });
  });
  res.json({ items });
});
async function loadOcc(db, req, id) {
  const o = await db.one('select o.*, c.company_id from recurring_occurrences o join recurring_commitments c on c.id=o.commitment_id where o.id=$1', [uuidParam(id)]);
  if (!o || !companyAllowed(req, o.company_id)) throw notFound('Ocorrência não encontrada.');
  return o;
}
recurring.post('/occurrences/:id/actual', need('recorrencias.gerenciar', 'financeiro.titulos.criar'), async (req, res) => {
  const d = parse(z.object({ amount: z.coerce.number().positive('o valor precisa ser maior que zero').max(1e12).transform((v) => Math.round(v * 100) / 100) }), req.body);
  await orgTx(req.orgId, async (db) => { const o = await loadOcc(db, req, req.params.id); await setActual(db, req, o, d.amount); });
  res.json({ ok: true });
});
recurring.put('/occurrences/:id', need('recorrencias.gerenciar'), async (req, res) => {
  const d = parse(z.object({ estimated_amount: z.coerce.number().min(0).max(1e12).transform((v) => Math.round(v * 100) / 100) }), req.body);
  await orgTx(req.orgId, async (db) => {
    const o = await loadOcc(db, req, req.params.id);
    if (o.status === 'real') throw new HttpError(409, 'Esta ocorrência já tem o valor real.');
    await db.query("update recurring_occurrences set estimated_amount=$2, estimate_manual=true, estimate_explain='corrigido à mão para este mês' where id=$1", [o.id, d.estimated_amount]);
    if (o.title_id) await db.query("update titles set amount=$2, updated_at=now(), version=version+1 where id=$1 and estimated and status='aberto'", [o.title_id, Math.max(d.estimated_amount, 0.01)]);
    await audit(db, { actor: actor(req), req, action: 'recorrente.estimativa_mes', entity: 'recurring', entityId: o.commitment_id, summary: `Estimativa de ${o.due_date}: R$ ${d.estimated_amount.toFixed(2)}` });
  });
  res.json({ ok: true });
});

recurring.get('/report', need('previsao.visualizar'), async (req, res) => {
  const year = Number(req.query.year) || Number(today().slice(0, 4));
  const out = await orgTx(req.orgId, async (db) => {
    const scope = req.companyScope;
    const rows = await db.all(`select to_char(o.due_date, 'YYYY-MM') as month, c.kind, sum(o.estimated_amount) as est, sum(o.actual_amount) filter (where o.status='real') as act
        from recurring_occurrences o join recurring_commitments c on c.id=o.commitment_id
        where o.status <> 'cancelada' and extract(year from o.due_date) = $1 and ($2::uuid[] is null or c.company_id = any($2::uuid[])) group by 1, 2 order by 1`, [year, scope]);
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).map((m) => {
      const p = rows.find((r) => r.month === m && r.kind === 'pagar'); const r = rows.find((x) => x.month === m && x.kind === 'receber');
      return { month: m, fixed_estimated: Number(p?.est || 0), fixed_actual: p?.act == null ? null : Number(p.act), recurring_revenue_estimated: Number(r?.est || 0), recurring_revenue_actual: r?.act == null ? null : Number(r.act) };
    });
    const deviations = (await db.all(`select c.name as commitment, to_char(o.due_date,'YYYY-MM') as month, o.estimated_amount as estimated, o.actual_amount as actual,
          round((o.actual_amount - o.estimated_amount) / nullif(o.estimated_amount,0) * 100, 1) as diff_pct
        from recurring_occurrences o join recurring_commitments c on c.id=o.commitment_id
        where o.status='real' and extract(year from o.due_date) = $1 and o.estimated_amount > 0 and abs(o.actual_amount - o.estimated_amount) / o.estimated_amount * 100 > c.tolerance_pct
          and ($2::uuid[] is null or c.company_id = any($2::uuid[])) order by abs(o.actual_amount - o.estimated_amount) desc limit 20`, [year, scope]))
      .map((d) => ({ ...d, estimated: Number(d.estimated), actual: Number(d.actual), diff_pct: Number(d.diff_pct) }));
    const cur = months.find((m) => m.month === today().slice(0, 7)) || months[0];
    return { months, deviations, break_even_month: { month: cur.month, required_revenue: cur.fixed_actual ?? cur.fixed_estimated } };
  });
  res.json(out);
});
// mantém a função de estimativa disponível para a tela de teste do método (futuro)
export { estimate };
