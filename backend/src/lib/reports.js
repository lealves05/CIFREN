// Relatórios gerenciais: fluxo de caixa previsto × realizado, DRE (competência ou caixa), centros de custo e inadimplência.
// Premissas sempre explícitas. Ocorrência prevista de recorrência só entra no previsto (nunca no realizado).
import { today, toCents, fromCents } from '../util.js';
import { BALANCE_SQL } from '../routes/cadastros.js';

const PAID = `coalesce((select sum(s.amount) from settlements s where s.title_id=t.id and s.reversed_at is null), 0)`;
const CASH = '(s.amount + s.interest + s.fine - s.discount)';
const monthsBetween = (from, to) => { const out = []; let [y, m] = from.split('-').map(Number); const [ty, tm] = to.split('-').map(Number); while (y < ty || (y === ty && m <= tm)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } if (out.length > 60) break; } return out; };

export async function cashflow(db, { from, to, scope }) {
  const months = monthsBetween(from, to);
  const start = `${months[0]}-01`; const endExcl = (() => { const [y, m] = months[months.length - 1].split('-').map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`; })();
  const sc = '($1::uuid[] is null or t.company_id = any($1::uuid[]))';
  const realized = await db.all(`select to_char(s.paid_at,'YYYY-MM') as m, sum(${CASH}) filter (where t.kind='receber') as i, sum(${CASH}) filter (where t.kind='pagar') as o
      from settlements s join titles t on t.id=s.title_id where s.reversed_at is null and s.paid_at >= $2 and s.paid_at < $3 and ${sc} group by 1`, [scope, start, endExcl]);
  const day = today();
  const forecastT = await db.all(`select to_char(greatest(t.due_date, $4::date),'YYYY-MM') as m, sum(t.amount - ${PAID}) filter (where t.kind='receber') as i, sum(t.amount - ${PAID}) filter (where t.kind='pagar') as o
      from titles t where t.status in ('aberto','parcial') and not (t.source = 'rusten' and t.external_id like 'credito:%') and greatest(t.due_date, $4::date) >= $2 and greatest(t.due_date, $4::date) < $3 and ${sc} group by 1`, [scope, start, endExcl, day]);
  const forecastR = await db.all(`select to_char(o.due_date,'YYYY-MM') as m, sum(o.estimated_amount) filter (where c.kind='receber') as i, sum(o.estimated_amount) filter (where c.kind='pagar') as o
      from recurring_occurrences o join recurring_commitments c on c.id=o.commitment_id where o.status='prevista' and o.due_date >= greatest($2::date, $4::date) and o.due_date < $3
        and ($1::uuid[] is null or c.company_id = any($1::uuid[])) group by 1`, [scope, start, endExcl, day]);
  // saldo de abertura: caixa hoje menos o realizado depois do início (ou caixa hoje se o período começa no futuro)
  const cashNow = Number((await db.one(`select coalesce(sum(${BALANCE_SQL}),0) as v from bank_accounts a where a.active and ($1::uuid[] is null or a.company_id = any($1::uuid[]))`, [scope])).v);
  const after = await db.one(`select coalesce(sum(case when t.kind='receber' then 1 else -1 end * ${CASH}),0) as v from settlements s join titles t on t.id=s.title_id
      where s.reversed_at is null and s.paid_at >= $2 and ${sc}`, [scope, start]);
  const opening = fromCents(toCents(cashNow) - toCents(after.v));
  let rb = toCents(opening); let fb = toCents(opening);
  const g = (arr, m, k) => toCents(arr.find((r) => r.m === m)?.[k] || 0);
  const rows = months.map((m) => {
    const ri = g(realized, m, 'i'); const ro = g(realized, m, 'o');
    const fi = g(forecastT, m, 'i') + g(forecastR, m, 'i'); const fo = g(forecastT, m, 'o') + g(forecastR, m, 'o');
    rb += ri - ro; fb += ri - ro + fi - fo;
    return { month: m, realized_in: fromCents(ri), realized_out: fromCents(ro), forecast_in: fromCents(fi), forecast_out: fromCents(fo), realized_balance: fromCents(rb), forecast_balance: fromCents(fb) };
  });
  return { months: rows, opening_balance: opening, notes: [
    'Realizado = baixas (pagamentos e recebimentos), com juros, multa e desconto.',
    'Previsto = contas em aberto (vencidas entram no mês atual) + compromissos recorrentes ainda previstos (estimativas).',
    'Saldo previsto = realizado + previsto acumulados a partir do saldo de abertura.'] };
}

export const DRE_GROUPS = [
  { key: 'receita_bruta', label: 'Receita bruta', sign: 1 },
  { key: 'deducoes', label: '(−) Deduções e impostos sobre vendas', sign: -1 },
  { key: 'receita_liquida', label: 'Receita líquida', subtotal: ['receita_bruta', 'deducoes'] },
  { key: 'custos', label: '(−) Custos (mercadorias, insumos)', sign: -1 },
  { key: 'lucro_bruto', label: 'Lucro bruto', subtotal: ['receita_liquida', 'custos'] },
  { key: 'despesas_operacionais', label: '(−) Despesas operacionais', sign: -1 },
  { key: 'resultado_operacional', label: 'Resultado operacional', subtotal: ['lucro_bruto', 'despesas_operacionais'] },
  { key: 'outras_receitas', label: '(+) Outras receitas', sign: 1 },
  { key: 'despesas_financeiras', label: '(−) Despesas financeiras', sign: -1 },
  { key: 'resultado_liquido', label: 'Resultado líquido', subtotal: ['resultado_operacional', 'outras_receitas', 'despesas_financeiras'] },
];

export async function dre(db, { year, basis, scope }) {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const sc = '($1::uuid[] is null or t.company_id = any($1::uuid[]))';
  // competência: valor do título no mês de competência (ou do vencimento); caixa: o que foi pago/recebido no mês
  const data = basis === 'caixa'
    ? await db.all(`select t.category_id, t.kind, to_char(s.paid_at,'YYYY-MM') as m, sum(${CASH}) as v from settlements s join titles t on t.id=s.title_id
        where s.reversed_at is null and extract(year from s.paid_at) = $2 and ${sc} group by 1,2,3`, [scope, year])
    : await db.all(`select t.category_id, t.kind, to_char(coalesce(t.competence_date, t.due_date),'YYYY-MM') as m, sum(t.amount) as v from titles t
        where t.status <> 'cancelado' and extract(year from coalesce(t.competence_date, t.due_date)) = $2 and ${sc} group by 1,2,3`, [scope, year]);
  const cats = await db.all('select c.id, c.name, c.dre_group, c.type, c.parent_id, p.dre_group as parent_group, p.name as parent_name from categories c left join categories p on p.id=c.parent_id');
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const groupOf = (catId, kind) => { const c = catMap.get(catId); return c?.dre_group || c?.parent_group || (c ? 'sem_grupo' : (kind === 'receber' ? 'sem_grupo' : 'sem_grupo')); };
  const byGroup = new Map(); const byCat = new Map();
  for (const r of data) {
    const g = groupOf(r.category_id, r.kind); const i = months.indexOf(r.m); if (i < 0) continue;
    // sinal pelo tipo do lançamento: receita soma, despesa subtrai (o grupo só organiza)
    const val = toCents(r.v) * (r.kind === 'receber' ? 1 : -1);
    if (!byGroup.has(g)) byGroup.set(g, Array(12).fill(0)); byGroup.get(g)[i] += val;
    const ck = `${g}|${r.category_id || 'sem'}`; if (!byCat.has(ck)) byCat.set(ck, { g, id: r.category_id, values: Array(12).fill(0) }); byCat.get(ck).values[i] += val;
  }
  const totals = new Map(); const rows = [];
  const fmt = (arr) => arr.map(fromCents);
  for (const gdef of DRE_GROUPS) {
    let values;
    if (gdef.subtotal) { values = Array(12).fill(0); for (const k of gdef.subtotal) totals.get(k)?.forEach((v, i) => { values[i] += v; }); }
    else values = byGroup.get(gdef.key) || Array(12).fill(0);
    totals.set(gdef.key, values);
    rows.push({ key: gdef.key, label: gdef.label, type: gdef.subtotal ? 'subtotal' : 'group', values: fmt(values), total: fromCents(values.reduce((a, b) => a + b, 0)) });
    if (!gdef.subtotal) for (const c of [...byCat.values()].filter((x) => x.g === gdef.key)) {
      const cat = catMap.get(c.id);
      rows.push({ key: `cat:${c.id || 'sem'}`, label: cat ? (cat.parent_name ? `${cat.parent_name} › ${cat.name}` : cat.name) : 'Sem categoria', type: 'category', parent: gdef.key, values: fmt(c.values), total: fromCents(c.values.reduce((a, b) => a + b, 0)) });
    }
  }
  const sem = byGroup.get('sem_grupo');
  if (sem) {
    rows.push({ key: 'sem_grupo', label: 'Sem grupo no DRE (configure em Cadastros › Categorias)', type: 'group', values: fmt(sem), total: fromCents(sem.reduce((a, b) => a + b, 0)) });
    for (const c of [...byCat.values()].filter((x) => x.g === 'sem_grupo')) { const cat = catMap.get(c.id); rows.push({ key: `cat:${c.id || 'sem'}`, label: cat?.name || 'Sem categoria', type: 'category', parent: 'sem_grupo', values: fmt(c.values), total: fromCents(c.values.reduce((a, b) => a + b, 0)) }); }
  }
  return { basis, year, months, rows, premises: [
    basis === 'caixa' ? 'Regime de caixa: o que foi efetivamente pago e recebido em cada mês (com juros, multa e desconto).' : 'Regime de competência: valor de cada conta no mês de competência (ou do vencimento, quando a competência não foi informada). Contas canceladas não entram.',
    'DRE gerencial: não substitui o demonstrativo contábil oficial do contador.',
    'Receitas somam e despesas subtraem; os grupos seguem o "Grupo no DRE" de cada categoria (ou da categoria-mãe).',
    ...(sem ? ['Há lançamentos em categorias sem grupo no DRE ou sem categoria: eles aparecem em "Sem grupo".'] : [])] };
}

export async function costCenters(db, { from, to, scope }) {
  const rows = await db.all(`select cc.id, cc.name, sum(${CASH}) filter (where t.kind='pagar') as e, sum(${CASH}) filter (where t.kind='receber') as r
      from settlements s join titles t on t.id=s.title_id left join cost_centers cc on cc.id=t.cost_center_id
      where s.reversed_at is null and s.paid_at >= ($2 || '-01')::date and s.paid_at < (($3 || '-01')::date + interval '1 month') and ($1::uuid[] is null or t.company_id = any($1::uuid[]))
      group by cc.id, cc.name order by cc.name nulls last`, [scope, from, to]);
  return { items: rows.map((r) => ({ cost_center: r.id ? { id: r.id, name: r.name } : null, expenses: Number(r.e || 0), revenues: Number(r.r || 0), result: fromCents(toCents(r.r || 0) - toCents(r.e || 0)) })) };
}

export async function aging(db, { kind, scope }) {
  const day = today();
  const rows = await db.all(`select t.due_date, t.amount - ${PAID} as open, cp.name as cp from titles t left join counterparties cp on cp.id=t.counterparty_id
      where t.kind=$2 and t.status in ('aberto','parcial') and ($1::uuid[] is null or t.company_id = any($1::uuid[]))`, [scope, kind]);
  const b = [['a vencer', -1e9, 0], ['1–30 dias', 1, 30], ['31–60 dias', 31, 60], ['61–90 dias', 61, 90], ['mais de 90 dias', 91, 1e9]].map(([label, a, z]) => ({ label, a, z, amount: 0, n: 0 }));
  const top = new Map();
  for (const r of rows) {
    const late = Math.round((Date.parse(day) - Date.parse(r.due_date)) / 86400000);
    const k = b.find((x) => (x.a === -1e9 ? late <= 0 : late >= x.a && late <= x.z)); k.amount += toCents(r.open); k.n++;
    if (late > 0) { const key = r.cp || 'Sem cliente/fornecedor'; const t = top.get(key) || { counterparty: key, amount: 0, n: 0 }; t.amount += toCents(r.open); t.n++; top.set(key, t); }
  }
  return { buckets: b.map(({ label, amount, n }) => ({ label, amount: fromCents(amount), n })),
    top: [...top.values()].sort((x, y) => y.amount - x.amount).slice(0, 10).map((t) => ({ ...t, amount: fromCents(t.amount) })) };
}
export { monthsBetween };
