// Compromissos recorrentes (spec 5.3): ocorrências previstas para 12 meses, valor estimado com explicação,
// conta a pagar/receber criada N dias antes do vencimento ("valor estimado — aguardando a conta"), valor real e desvio.
import { addInterval, today, toCents, fromCents } from '../util.js';
import { audit } from '../audit.js';
import { notifyPerm } from './notify.js';

export const HORIZON_MONTHS = 12;
const STEP = { semanal: ['semanal', 1], quinzenal: ['quinzenal', 1], mensal: ['mensal', 1], bimestral: ['mensal', 2], trimestral: ['mensal', 3], semestral: ['mensal', 6], anual: ['anual', 1] };

function withDay(date, day) {
  if (!day) return date;
  const [y, m] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}
/** Datas de vencimento do compromisso entre from e to (inclusive). */
export function dueDates(c, from, to) {
  const [interval, k] = STEP[c.frequency];
  const start = ['semanal', 'quinzenal'].includes(c.frequency) ? c.start_date : withDay(c.start_date, c.due_day);
  const out = [];
  for (let i = 0; i < 400; i++) {
    let d = addInterval(start, interval, i * k);
    if (!['semanal', 'quinzenal'].includes(c.frequency)) d = withDay(d, c.due_day);
    if (c.end_date && d > c.end_date) break;
    if (d > to) break;
    if (d >= from && d >= c.start_date) out.push(d);
  }
  return out;
}

/** Valor estimado + explicação (nunca valor sem explicação). */
export async function estimate(db, c) {
  if (c.method === 'media') {
    const { rows } = await db.query(`select actual_amount, due_date from recurring_occurrences where commitment_id=$1 and status='real' and actual_amount is not null
                                     order by due_date desc limit $2`, [c.id, c.average_n]);
    if (rows.length >= 2) {
      const avg = fromCents(Math.round(rows.reduce((a, r) => a + toCents(r.actual_amount), 0) / rows.length));
      return { amount: avg, explain: `média dos últimos ${rows.length} valores reais: ${rows.map((r) => Number(r.actual_amount).toFixed(2).replace('.', ',')).join('; ')}` };
    }
    return { amount: Number(c.estimated_amount), explain: `valor informado (ainda há ${rows.length} valor real; a média começa com 2)` };
  }
  if (c.method === 'manual') return { amount: Number(c.estimated_amount), explain: 'estimativa manual (corrija mês a mês se precisar)' };
  return { amount: Number(c.estimated_amount), explain: 'valor fixo informado no compromisso' };
}

/** Cria as ocorrências previstas que faltam no horizonte e atualiza a estimativa das futuras ainda previstas. */
export async function generate(db, c) {
  if (c.status !== 'ativo') return 0;
  const day = today();
  const to = addInterval(day, 'mensal', HORIZON_MONTHS);
  const from = c.start_date > day ? c.start_date : addInterval(day, 'mensal', -1);
  const est = await estimate(db, c);
  let n = 0;
  for (const d of dueDates(c, from, to)) {
    const r = await db.query(`insert into recurring_occurrences (org_id, commitment_id, due_date, estimated_amount, estimate_explain) values ($1,$2,$3,$4,$5)
                              on conflict (commitment_id, due_date) do nothing`, [db.orgId, c.id, d, est.amount, est.explain]);
    n += r.rowCount;
  }
  await db.query(`update recurring_occurrences set estimated_amount=$2, estimate_explain=$3 where commitment_id=$1 and status='prevista' and not estimate_manual and due_date >= $4`,
    [c.id, est.amount, est.explain, day]);
  return n;
}

/** Cria a conta a pagar/receber das ocorrências que vencem dentro do prazo de antecedência. */
export async function materialize(db, c) {
  if (c.status !== 'ativo') return 0;
  const limit = addInterval(today(), 'semanal', 0);
  const { rows } = await db.query(`select * from recurring_occurrences where commitment_id=$1 and status='prevista' and due_date <= ($2::date + $3::int) order by due_date`,
    [c.id, limit, c.lead_days]);
  for (const o of rows) {
    const t = await db.one(`insert into titles (org_id, company_id, kind, description, counterparty_id, category_id, cost_center_id, due_date, competence_date, amount,
          estimated, recurring_occurrence_id, notes, source) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,'recorrente') returning id`,
    [db.orgId, c.company_id, c.kind, `${c.name} — ${o.due_date.slice(5, 7)}/${o.due_date.slice(0, 4)}`, c.counterparty_id, c.category_id, c.cost_center_id, o.due_date,
      `${o.due_date.slice(0, 7)}-01`, Math.max(Number(o.estimated_amount), 0.01), o.id, 'Valor estimado — aguardando a conta real (compromisso recorrente).']);
    await db.query("update recurring_occurrences set status='lancada', title_id=$2 where id=$1", [o.id, t.id]);
  }
  return rows.length;
}

/** Valor real chegou: guarda ao lado do estimado, ajusta o título (se ainda não pago) e avisa se fugiu da tolerância. */
export async function setActual(db, req, occ, amount) {
  const c = await db.one('select * from recurring_commitments where id=$1', [occ.commitment_id]);
  await db.query("update recurring_occurrences set actual_amount=$2, actual_at=now(), status='real' where id=$1", [occ.id, amount]);
  if (occ.title_id) {
    const paid = (await db.one('select coalesce(sum(amount),0) as v from settlements where title_id=$1 and reversed_at is null', [occ.title_id])).v;
    if (Number(paid) === 0) await db.query("update titles set amount=$2, estimated=false, notes=null, updated_at=now(), version=version+1 where id=$1 and status in ('aberto')", [occ.title_id, amount]);
    else await db.query('update titles set estimated=false where id=$1', [occ.title_id]);
  }
  const est = Number(occ.estimated_amount);
  const diffPct = est ? ((amount - est) / est) * 100 : 0;
  if (Math.abs(diffPct) > Number(c.tolerance_pct)) {
    await notifyPerm(db, 'previsao.visualizar', { kind: 'desvio', title: 'Conta fora do normal',
      body: `${c.name} (${occ.due_date.slice(5, 7)}/${occ.due_date.slice(0, 4)}) veio R$ ${amount.toFixed(2)}, ${Math.abs(diffPct).toFixed(0)}% ${diffPct > 0 ? 'acima' : 'abaixo'} do estimado (R$ ${est.toFixed(2)}).`,
      link: `/recorrentes/${c.id}`, dedupe: `desvio:${occ.id}`, companyId: c.company_id });
  }
  if (req) await audit(db, { actor: { id: req.user.id, name: req.user.name }, req, action: 'recorrente.valor_real', entity: 'recurring', entityId: c.id,
    summary: `${c.name} ${occ.due_date}: estimado R$ ${est.toFixed(2)} → real R$ ${amount.toFixed(2)}`, data: { estimated: est, actual: amount } });
  await generate(db, c); // método "média" recalcula as próximas
}

/** Ao dar baixa num título estimado de recorrência: o valor pago vira o valor real. */
export async function onTitleSettled(db, titleId) {
  const t = await db.one('select recurring_occurrence_id, estimated, amount from titles where id=$1', [titleId]);
  if (!t?.recurring_occurrence_id) return;
  const o = await db.one('select * from recurring_occurrences where id=$1', [t.recurring_occurrence_id]);
  if (o && o.status !== 'real') await setActual(db, null, o, Number(t.amount));
}

/** Rotina: gera, cria contas e avisa as que não chegaram. */
export async function runRecurring(db) {
  const list = (await db.query("select * from recurring_commitments where status='ativo'")).rows;
  for (const c of list) { await generate(db, c); await materialize(db, c); }
  const missing = (await db.query(`select o.id, o.due_date, o.estimated_amount, c.name, c.company_id from recurring_occurrences o join recurring_commitments c on c.id=o.commitment_id
      join titles t on t.id=o.title_id where o.status='lancada' and t.estimated and o.due_date <= $1::date + 2 and t.status in ('aberto')`, [today()])).rows;
  for (const m of missing) {
    await notifyPerm(db, 'previsao.visualizar', { kind: 'recorrente', title: 'Conta ainda não chegou', body: `${m.name} vence em ${m.due_date.split('-').reverse().join('/')} (estimado R$ ${Number(m.estimated_amount).toFixed(2)}).`,
      link: '/recorrentes', dedupe: `faltando:${m.id}`, companyId: m.company_id });
  }
}
