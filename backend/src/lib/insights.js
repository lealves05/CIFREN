// Agente de Insights (sem IA): regras simples e explicáveis sobre os dados — riscos, pontos de atenção e oportunidades.
// A versão com IA (rota /api/ai/insights) recebe estes mesmos números e escreve o texto; nunca inventa valores.
import { orgTx } from '../db.js';
import { today, addInterval, toCents, fromCents } from '../util.js';
import { BALANCE_SQL } from '../routes/cadastros.js';

const brl = (n) => `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PAID = `coalesce((select sum(s.amount) from settlements s where s.title_id=t.id and s.reversed_at is null), 0)`;

export async function insightsFor(orgId, scope = null) {
  const day = today();
  return orgTx(orgId, async (db) => {
    const out = [];
    const sc = '($1::uuid[] is null or t.company_id = any($1::uuid[]))';
    const od = await db.all(`select t.kind, count(*)::int as n, sum(t.amount - ${PAID}) as v from titles t where t.status in ('aberto','parcial') and t.due_date < $2 and ${sc} group by t.kind`, [scope, day]);
    const rec = od.find((r) => r.kind === 'receber'); const pag = od.find((r) => r.kind === 'pagar');
    if (rec?.n) out.push({ level: 'risco', title: `${brl(rec.v)} a receber vencidos`, detail: `${rec.n} conta(s) de clientes passaram do vencimento. Cobre os maiores primeiro.`, link: '/receber?status=vencidos' });
    if (pag?.n) out.push({ level: 'atencao', title: `${brl(pag.v)} a pagar vencidos`, detail: `${pag.n} conta(s) atrasada(s): juros e multa podem estar correndo.`, link: '/pagar?status=vencidos' });

    const cash = (await db.one(`select coalesce(sum(round(${BALANCE_SQL},2)),0) as v from bank_accounts a where a.active and ($1::uuid[] is null or a.company_id = any($1::uuid[]))`, [scope])).v;
    const flow = await db.all(`select t.due_date, sum(case when t.kind='receber' then 1 else -1 end * (t.amount - ${PAID})) as v from titles t
        where t.status in ('aberto','parcial') and t.due_date <= $2::date + 30 and ${sc} group by 1 order by 1`, [scope, day]);
    let bal = toCents(cash); let negDay = null;
    for (const f of flow) { bal += toCents(f.v); if (bal < 0 && !negDay) negDay = f.due_date < day ? day : f.due_date; }
    if (negDay) out.push({ level: 'risco', title: 'O caixa fica negativo nos próximos 30 dias', detail: `Pelo que está lançado, o saldo fica negativo em ${negDay.split('-').reverse().join('/')}. Antecipe recebimentos ou renegocie pagamentos.`, link: '/relatorios/fluxo' });

    const cat = await db.all(`with m as (select coalesce(c.name,'Sem categoria') as name, date_trunc('month', s.paid_at)::date as mes, sum(s.amount+s.interest+s.fine-s.discount) as v
          from settlements s join titles t on t.id=s.title_id left join categories c on c.id=t.category_id
          where s.reversed_at is null and t.kind='pagar' and s.paid_at >= date_trunc('month', $2::date) - interval '3 months' and ${sc} group by 1,2)
        select name, sum(v) filter (where mes = date_trunc('month', $2::date)) as atual, sum(v) filter (where mes < date_trunc('month', $2::date)) / 3 as media from m group by name`, [scope, day]);
    for (const c of cat) if (Number(c.media) > 100 && Number(c.atual) > Number(c.media) * 1.3) {
      out.push({ level: 'atencao', title: `${c.name}: gasto acima do normal`, detail: `Este mês ${brl(c.atual)} contra média de ${brl(c.media)} nos 3 meses anteriores (+${Math.round((c.atual / c.media - 1) * 100)}%).`, link: '/relatorios/dre' });
    }
    const dev = await db.all(`select c.name, o.due_date, o.estimated_amount, o.actual_amount from recurring_occurrences o join recurring_commitments c on c.id=o.commitment_id
        where o.status='real' and o.actual_at > now() - interval '45 days' and o.estimated_amount > 0 and abs(o.actual_amount - o.estimated_amount) / o.estimated_amount * 100 > c.tolerance_pct
          and ($1::uuid[] is null or c.company_id = any($1::uuid[])) order by o.actual_at desc limit 3`, [scope]);
    for (const d of dev) out.push({ level: 'atencao', title: `${d.name} fora do estimado`, detail: `Veio ${brl(d.actual_amount)}; o estimado era ${brl(d.estimated_amount)}.`, link: '/recorrentes' });

    const dup = await db.all(`select t1.description, t1.amount from titles t1 join titles t2 on t2.org_id=t1.org_id and t2.id > t1.id and t2.kind='pagar'
        and t2.counterparty_id = t1.counterparty_id and t2.amount = t1.amount and abs(t2.due_date - t1.due_date) <= 3 and t2.status in ('aberto','parcial') and t2.group_id is distinct from t1.group_id
        where t1.kind='pagar' and t1.status in ('aberto','parcial') and t1.counterparty_id is not null and ${sc.replace(/t\./g, 't1.')} limit 3`, [scope]);
    for (const d of dup) out.push({ level: 'risco', title: 'Possível conta lançada duas vezes', detail: `"${d.description}" de ${brl(d.amount)} aparece duplicada com o mesmo fornecedor e vencimento próximo.`, link: '/pagar' });

    const top = await db.one(`with r as (select t.counterparty_id, sum(s.amount) as v from settlements s join titles t on t.id=s.title_id
          where s.reversed_at is null and t.kind='receber' and s.paid_at > $2::date - 90 and ${sc} group by 1)
        select (select name from counterparties where id=(select counterparty_id from r order by v desc limit 1)) as name, max(v) as top, sum(v) as total from r`, [scope, day]);
    if (top?.total > 0 && top.name && top.top / top.total > 0.5) out.push({ level: 'atencao', title: 'Receita concentrada em um cliente', detail: `${top.name} representa ${Math.round((top.top / top.total) * 100)}% do recebido nos últimos 90 dias.`, link: '/relatorios/inadimplencia' });

    const exp3 = (await db.one(`select coalesce(sum(s.amount+s.interest+s.fine-s.discount),0)/3 as v from settlements s join titles t on t.id=s.title_id
        where s.reversed_at is null and t.kind='pagar' and s.paid_at > $2::date - 90 and ${sc}`, [scope, day])).v;
    if (Number(exp3) > 0 && Number(cash) > Number(exp3) * 4) out.push({ level: 'oportunidade', title: 'Dinheiro parado no caixa', detail: `O saldo (${brl(cash)}) cobre mais de 4 meses de gastos (${brl(exp3)}/mês). Avalie aplicar a sobra com liquidez.`, link: '/' });

    const oldLines = (await db.one("select count(*)::int as n from statement_lines where status='pendente' and date < $1::date - 15", [day])).n;
    if (oldLines) out.push({ level: 'atencao', title: `${oldLines} lançamento(s) do extrato sem conciliar há mais de 15 dias`, detail: 'Conciliar mostra o que realmente saiu e entrou e evita pagar duas vezes.', link: '/conciliacao' });
    return out.slice(0, 12);
  });
}
// referências usadas só para manter as funções de data importadas juntas
export const _helpers = { addInterval, fromCents };
