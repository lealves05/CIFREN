// Rotinas em segundo plano (no próprio processo, a cada 10 min): recorrências, avisos de vencimento e resumo diário por e-mail.
// Cada organização roda numa transação própria (RLS) e um erro numa não para as outras.
import { q, orgTx } from '../db.js';
import { today } from '../util.js';
import { runRecurring } from './recurring.js';
import { notifyPerm } from './notify.js';
import { smtpConfig, sendMail } from '../routes/settings.js';
import { runMembers, weeklyReport } from './members.js';

const PAID = `coalesce((select sum(s.amount) from settlements s where s.title_id=t.id and s.reversed_at is null), 0)`;
const brl = (n) => `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const br = (d) => String(d).split('-').reverse().join('/');

async function dueAlerts(db) {
  const day = today(); const soon = new Date(Date.parse(`${day}T12:00:00Z`) + 3 * 86400000).toISOString().slice(0, 10);
  const rows = await db.all(`select t.id, t.kind, t.description, t.due_date, t.company_id, round(t.amount - ${PAID},2) as open from titles t
      where t.status in ('aberto','parcial') and t.member_id is null and t.due_date <= $2 and t.due_date >= $1::date - 1 and coalesce(t.approval_status,'aprovado') <> 'reprovado' limit 500`, [day, soon]);
  for (const t of rows) {
    const late = t.due_date < day;
    await notifyPerm(db, 'financeiro.titulos.baixar', { companyId: t.company_id, kind: late ? 'vencido' : 'vencimento',
      title: late ? `${t.kind === 'pagar' ? 'Conta a pagar' : 'Conta a receber'} venceu` : `${t.kind === 'pagar' ? 'Pagar' : 'Receber'} até ${br(t.due_date)}`,
      body: `${t.description}: ${brl(t.open)}`, link: `/${t.kind}?id=${t.id}`, dedupe: `${late ? 'venceu' : 'vence'}:${t.id}` });
  }
}

async function digest(orgId) {
  if (!(await smtpConfig(orgId))) return;
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date()));
  if (hour < 7) return; // resumo a partir das 7h
  const users = await orgTx(orgId, (db) => db.all(`select p.user_id, u.email, u.name from user_prefs p join users u on u.id=p.user_id join memberships m on m.user_id=u.id and m.org_id=p.org_id and m.active
      where p.email_daily and u.active and (p.last_digest_at is null or p.last_digest_at < date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')`));
  for (const u of users) {
    const items = await orgTx(orgId, async (db) => {
      const n = await db.all("select title, body from notifications where user_id=$1 and read_at is null and created_at > now() - interval '1 day' order by created_at desc limit 30", [u.user_id]);
      await db.query('update user_prefs set last_digest_at=now() where user_id=$1', [u.user_id]);
      return n;
    });
    if (!items.length) continue;
    const text = `Olá, ${u.name}.\n\nResumo do CIFREN de hoje:\n\n${items.map((i) => `• ${i.title}${i.body ? ` — ${i.body}` : ''}`).join('\n')}\n\nAbra o CIFREN para ver os detalhes.\n(Para não receber mais, desligue em Minha conta › Notificações.)`;
    await sendMail(orgId, { to: u.email, subject: `CIFREN — ${items.length} aviso(s) de hoje`, text }).catch((e) => console.warn('[resumo] e-mail falhou:', e.message));
  }
}

export async function tick() {
  const orgs = (await q('select id, name from organizations')).rows;
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(now)) % 24;
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(now));
  for (const o of orgs) {
    try {
      await orgTx(o.id, async (db) => { await runRecurring(db); await dueAlerts(db); });
      // associados: gera as mensalidades e manda os avisos (envio que falha fica registrado como falha e não derruba os outros)
      await orgTx(o.id, (db) => runMembers(db, { hour }));
      await orgTx(o.id, (db) => weeklyReport(db, { hour, weekday, orgName: o.name })).catch((e) => console.warn('[relatorio associados]', e.message));
      await digest(o.id);
    } catch (e) { console.error(`[rotina] organização ${o.id}:`, e.message); }
  }
}
let timer = null;
export function startScheduler(everyMs = 10 * 60 * 1000) {
  if (timer || process.env.CIFREN_SCHEDULER === '0') return;
  const run = () => tick().catch((e) => console.error('[rotina]', e.message));
  setTimeout(run, 20000).unref();
  timer = setInterval(run, everyMs); timer.unref();
}
