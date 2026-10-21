// Associados e mensalidades: geração da mensalidade de cada mês (conta a receber), avisos de atraso por e-mail/WhatsApp
// e relatório dos atrasados. Tudo dentro de orgTx (RLS).
import { today, round2, toCents, fromCents } from '../util.js';
import { seal, unseal } from '../secrets.js';
import { sendMail, smtpConfig } from '../routes/settings.js';
import { usersWithPerm, notifyUsers } from './notify.js';

export const PAID_T = `coalesce((select sum(s.amount) from settlements s where s.title_id=t.id and s.reversed_at is null), 0)`;
const brl = (n) => `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const br = (d) => String(d).slice(0, 10).split('-').reverse().join('/');
const mm = (d) => `${String(d).slice(5, 7)}/${String(d).slice(0, 4)}`;
const ym = (d) => String(d).slice(0, 7);
const monthStart = (d) => `${String(d).slice(0, 7)}-01`;
const addMonths = (first, k) => { const [y, m] = first.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + k, 1)); return t.toISOString().slice(0, 10); };
const lastDay = (first) => { const [y, m] = first.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export const dueOf = (first, day) => `${first.slice(0, 8)}${String(Math.min(day, lastDay(first))).padStart(2, '0')}`;
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** WhatsApp no formato internacional só com dígitos (Brasil: acrescenta 55 quando vier com DDD). */
export function normPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length >= 12 && d.length <= 15 ? d : null;
}
export const fmtPhone = (d) => { const m = String(d || '').match(/^55(\d{2})(\d{4,5})(\d{4})$/); return m ? `(${m[1]}) ${m[2]}-${m[3]}` : d ? `+${d}` : ''; };

export const DEFAULT_SETTINGS = {
  remind_before_days: 0, remind_after_days: [1, 7, 15, 30], email_subject: 'Mensalidade em aberto — {empresa}',
  message: 'Olá, {nome}! Consta em aberto {descricao}, no total de {valor}. Se já pagou, desconsidere esta mensagem.{pix} Qualquer dúvida, responda esta mensagem. — {empresa}',
  before_message: 'Olá, {nome}! Lembrete: sua mensalidade de {valor} vence em {vencimento}.{pix} — {empresa}',
  pix_key: null, send_hour_from: 8, send_hour_to: 20, wa_enabled: false, wa_phone_number_id: null, wa_token_sealed: null,
  wa_template: null, wa_template_before: null, wa_lang: 'pt_BR', report_weekly: true, report_weekday: 1, report_last_at: null,
};
export async function memberSettings(db) {
  const r = await db.one('select * from member_settings where org_id=$1', [db.orgId]);
  return { ...DEFAULT_SETTINGS, ...(r || {}) };
}
export async function saveMemberSettings(db, d) {
  const cur = await memberSettings(db);
  const v = { ...cur, ...d };
  if (d.wa_token !== undefined) v.wa_token_sealed = d.wa_token ? seal({ t: d.wa_token }, 'whatsapp') : null;
  await db.query(`insert into member_settings (org_id, remind_before_days, remind_after_days, email_subject, message, before_message, pix_key, send_hour_from, send_hour_to,
      wa_enabled, wa_phone_number_id, wa_token_sealed, wa_template, wa_template_before, wa_lang, report_weekly, report_weekday, updated_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now())
    on conflict (org_id) do update set remind_before_days=excluded.remind_before_days, remind_after_days=excluded.remind_after_days, email_subject=excluded.email_subject,
      message=excluded.message, before_message=excluded.before_message, pix_key=excluded.pix_key, send_hour_from=excluded.send_hour_from, send_hour_to=excluded.send_hour_to,
      wa_enabled=excluded.wa_enabled, wa_phone_number_id=excluded.wa_phone_number_id, wa_token_sealed=excluded.wa_token_sealed, wa_template=excluded.wa_template,
      wa_template_before=excluded.wa_template_before, wa_lang=excluded.wa_lang, report_weekly=excluded.report_weekly, report_weekday=excluded.report_weekday, updated_at=now()`,
  [db.orgId, v.remind_before_days, v.remind_after_days, v.email_subject, v.message, v.before_message, v.pix_key || null, v.send_hour_from, v.send_hour_to,
    v.wa_enabled, v.wa_phone_number_id || null, v.wa_token_sealed, v.wa_template || null, v.wa_template_before || null, v.wa_lang || 'pt_BR', v.report_weekly, v.report_weekday]);
}
export const waReady = (s) => !!(s.wa_enabled && s.wa_phone_number_id && s.wa_token_sealed && s.wa_template);

// ---------------- mensalidades ----------------
/** Categoria "Mensalidades" (cria em Vendas se a organização ainda não tiver). */
export async function feeCategory(db) {
  const c = await db.one("select id from categories where lower(name)='mensalidades' and type='receita' and active order by created_at limit 1");
  if (c) return c.id;
  const parent = await db.one("select id from categories where name='Vendas' and type='receita' and parent_id is null limit 1");
  return (await db.one("insert into categories (org_id, name, type, parent_id, dre_group) values ($1,'Mensalidades','receita',$2,'receita_bruta') returning id", [db.orgId, parent?.id || null])).id;
}
// ---------------- tabela de valores ----------------
/** Tabela de valores (mais antigo primeiro). */
export const feeTable = (db) => db.all('select id, effective_month, amount, notes, created_by_name, created_at, updated_at from member_fees order by effective_month');
/** Valor da tabela que vale num mês (null se ainda não há valor para esse mês). */
export function tableFeeAt(table, month) {
  let v = null;
  for (const f of table) { if (String(f.effective_month).slice(0, 10) <= month) v = Number(f.amount); else break; }
  return v;
}
/** Valor de um associado num mês: o valor especial do cadastro, se houver; senão o da tabela. */
export const feeFor = (m, table, month) => (m.monthly_fee != null ? Number(m.monthly_fee) : tableFeeAt(table, month));
export const nextMonth = () => addMonths(monthStart(today()), 1);
/**
 * Recalcula as mensalidades AINDA EM ABERTO e sem pagamento a partir de um mês (as pagas e as de meses anteriores não mudam).
 * memberId = só de um associado.
 */
export async function recalcOpen(db, fromMonth, memberId = null) {
  const table = await feeTable(db);
  const rows = await db.all(`select t.id, t.amount, t.competence_date, m.monthly_fee from titles t join members m on m.id=t.member_id
      where t.source='mensalidade' and t.status='aberto' and t.competence_date >= $1 and ($2::uuid is null or t.member_id=$2)
        and not exists(select 1 from settlements s where s.title_id=t.id and s.reversed_at is null)`, [fromMonth, memberId]);
  let n = 0;
  for (const t of rows) {
    const v = feeFor(t, table, String(t.competence_date).slice(0, 10));
    if (v && Number(t.amount) !== v) { await db.query('update titles set amount=$2, updated_at=now(), version=version+1 where id=$1', [t.id, v]); n++; }
  }
  return n;
}

/** Gera as mensalidades que faltam de um associado: do mês de início até o mês que vence nos próximos 15 dias (no máximo 24 meses para trás). */
export async function generateFor(db, m, userId = null) {
  if (m.status !== 'ativo') return 0;
  const day = today();
  let first = monthStart(m.start_month);
  const limitBack = addMonths(monthStart(day), -24);
  if (first < limitBack) first = limitBack;
  const horizon = monthStart(addDays(day, 15));
  const table = await feeTable(db);
  let n = 0;
  for (let k = 0; ; k++) {
    const month = addMonths(first, k);
    if (month > horizon) break;
    if (m.end_month && month > monthStart(m.end_month)) break;
    const due = dueOf(month, m.due_day);
    if (month === horizon && due > addDays(day, 15)) break;
    const amount = feeFor(m, table, month);
    if (!amount) continue; // sem valor para esse mês: cadastre na tabela de valores
    const r = await db.query(`insert into titles (org_id, company_id, kind, description, counterparty_id, category_id, competence_date, due_date, amount, source, external_id, member_id, created_by, notes)
        values ($1,$2,'receber',$3,$4,$5,$6,$7,$8,'mensalidade',$9,$10,$11,'Mensalidade gerada automaticamente pelo cadastro do associado.')
        on conflict (org_id, source, external_id) where external_id is not null do nothing`,
    [db.orgId, m.company_id, `Mensalidade ${mm(month)} — ${m.name}`.slice(0, 200), m.counterparty_id, m.category_id, month, due, amount, `m:${m.id}:${ym(month)}`, m.id, userId]);
    n += r.rowCount;
  }
  return n;
}

// ---------------- mensagens ----------------
function describe(titles) {
  if (titles.length === 1) return `a mensalidade de ${mm(titles[0].competence_date || titles[0].due_date)} (venceu em ${br(titles[0].due_date)})`;
  const ms = titles.map((t) => mm(t.competence_date || t.due_date));
  return `${titles.length} mensalidades (${ms.slice(0, -1).join(', ')} e ${ms.at(-1)})`;
}
export function render(tpl, vars) {
  return String(tpl || '').replace(/\{(nome|valor|descricao|vencimento|meses|empresa|pix)\}/g, (_, k) => vars[k] ?? '').replace(/\s{2,}/g, ' ').trim();
}
export function messageVars(member, company, titles, s) {
  const total = fromCents(titles.reduce((a, t) => a + toCents(t.open), 0));
  return { nome: String(member.name).split(' ')[0], valor: brl(total), descricao: describe(titles), vencimento: br(titles[0].due_date), meses: String(titles.length),
    empresa: company, pix: s.pix_key ? ` Chave Pix para pagamento: ${s.pix_key}.` : '' };
}
export function waLink(phone, text) { return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`; }

async function sendWhatsApp(s, to, template, params) {
  const url = `${process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v21.0'}/${encodeURIComponent(s.wa_phone_number_id)}/messages`;
  const token = unseal(s.wa_token_sealed, 'whatsapp').t;
  const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(20000), headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template: { name: template, language: { code: s.wa_lang || 'pt_BR' },
      components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text).slice(0, 1000) })) }] } }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message ? `WhatsApp recusou: ${String(j.error.message).slice(0, 160)}` : `WhatsApp respondeu ${r.status}`);
  return j;
}
export async function testWhatsApp(s, to) { return sendWhatsApp(s, to, s.wa_template, ['Teste', 'uma mensagem de teste do CIFREN', 'R$ 0,00']); }

/** Envia um aviso a um associado por um canal. kind: atraso | antes | manual. Devolve { status, error }. */
export async function sendReminder(db, { member, company, titles, s, channel, kind, step = 0, user = null }) {
  const vars = messageVars(member, company, titles, s);
  const text = render(kind === 'antes' ? s.before_message : s.message, vars);
  let status = 'enviado'; let error = null;
  try {
    if (channel === 'email') {
      if (!member.email) { status = 'sem_contato'; error = 'Sem e-mail cadastrado.'; }
      else await sendMail(db.orgId, { to: member.email, subject: render(s.email_subject, vars), text });
    } else if (channel === 'whatsapp') {
      const phone = normPhone(member.whatsapp);
      if (!phone) { status = 'sem_contato'; error = 'Sem WhatsApp cadastrado.'; }
      else if (!waReady(s) || (kind === 'antes' && !s.wa_template_before)) { status = 'falhou'; error = 'WhatsApp oficial não configurado.'; }
      else if (kind === 'antes') await sendWhatsApp(s, phone, s.wa_template_before, [vars.nome, vars.valor, vars.vencimento]);
      else await sendWhatsApp(s, phone, s.wa_template, [vars.nome, vars.descricao, vars.valor]);
    }
  } catch (e) { status = 'falhou'; error = String(e.message || e).slice(0, 300); }
  for (const t of titles.length ? titles : [null]) {
    await db.query(`insert into member_reminders (org_id, member_id, title_id, channel, kind, step, status, error, sent_by, sent_by_name)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict do nothing`,
    [db.orgId, member.id, t?.id || null, channel, kind, step, status, error, user?.id || null, user?.name || null]);
  }
  return { status, error, text };
}

/** Mensalidades em aberto de um associado (as vencidas primeiro). */
export async function openFeesOf(db, memberId, onlyOverdue = true) {
  return db.all(`select t.id, t.due_date, t.competence_date, t.amount, round(t.amount - ${PAID_T},2) as open from titles t
      where t.member_id=$1 and t.status in ('aberto','parcial') ${onlyOverdue ? 'and t.due_date < $2' : 'and $2::date is not null'} order by t.due_date`, [memberId, today()]);
}

/** Rotina: gera mensalidades e manda os avisos automáticos (dentro do horário configurado). */
export async function runMembers(db, { hour }) {
  const members = await db.all("select * from members where status='ativo'");
  for (const m of members) await generateFor(db, m);
  const s = await memberSettings(db);
  if (hour < s.send_hour_from || hour >= s.send_hour_to) return;
  const day = today();
  const emailOk = !!(await smtpConfig(db.orgId)); const waOk = waReady(s);
  if (!emailOk && !waOk) return;
  const channels = (m) => [emailOk && m.notify_email && m.email && 'email', waOk && m.notify_whatsapp && normPhone(m.whatsapp) && 'whatsapp'].filter(Boolean);
  const steps = [...(s.remind_after_days || [])].map(Number).filter((x) => x > 0).sort((a, b) => a - b);
  const rows = await db.all(`select t.id, t.member_id, t.due_date, t.competence_date, round(t.amount - ${PAID_T},2) as open, m.name, m.email, m.whatsapp, m.notify_email,
        m.notify_whatsapp, co.name as company
      from titles t join members m on m.id=t.member_id join companies co on co.id=t.company_id
      where t.source='mensalidade' and t.status in ('aberto','parcial') and m.status <> 'encerrado' order by t.due_date`);
  const by = new Map();
  for (const r of rows) { if (!by.has(r.member_id)) by.set(r.member_id, []); by.get(r.member_id).push(r); }
  for (const [mid, list] of by) {
    const m = { id: mid, name: list[0].name, email: list[0].email, whatsapp: list[0].whatsapp, notify_email: list[0].notify_email, notify_whatsapp: list[0].notify_whatsapp };
    const overdue = list.filter((t) => t.due_date < day);
    for (const ch of channels(m)) {
      // atraso: só a maior etapa alcançada de cada mensalidade (quem já está 20 dias atrasado não recebe os avisos de 1 e 7 dias de uma vez)
      if (overdue.length && steps.length) {
        let trigger = null;
        for (const t of overdue) {
          const late = Math.round((Date.parse(day) - Date.parse(t.due_date)) / 86400000);
          const step = steps.filter((x) => x <= late).at(-1);
          if (!step) continue;
          const done = await db.one(`select 1 from member_reminders where title_id=$1 and channel=$2 and kind='atraso' and step>=$3
              and (status='enviado' or (status='falhou' and sent_at > now() - interval '1 day')) limit 1`, [t.id, ch, step]);
          if (!done) { trigger = step; break; }
        }
        if (trigger) { await sendReminder(db, { member: m, company: list[0].company, titles: overdue, s, channel: ch, kind: 'atraso', step: trigger }); continue; }
      }
      // lembrete antes do vencimento
      if (s.remind_before_days > 0) {
        const soon = list.filter((t) => t.due_date >= day && t.due_date <= addDays(day, s.remind_before_days));
        for (const t of soon) {
          if (ch === 'whatsapp' && !s.wa_template_before) continue;
          const done = await db.one("select 1 from member_reminders where title_id=$1 and channel=$2 and kind='antes' and (status='enviado' or sent_at > now() - interval '1 day') limit 1", [t.id, ch]);
          if (!done) await sendReminder(db, { member: m, company: t.company, titles: [t], s, channel: ch, kind: 'antes', step: s.remind_before_days });
        }
      }
    }
  }
}

// ---------------- relatório ----------------
export async function overdueReport(db, scope = null) {
  const day = today();
  const rows = await db.all(`select m.id, m.number, m.name, m.email, m.whatsapp, m.status, m.monthly_fee, co.name as company,
        count(t.id)::int as n, round(sum(t.amount - ${PAID_T}),2) as amount, min(t.due_date) as oldest_due,
        array_agg(to_char(coalesce(t.competence_date, t.due_date), 'MM/YYYY') order by t.due_date) as months,
        (select json_build_object('channel', r.channel, 'status', r.status, 'at', r.sent_at) from member_reminders r where r.member_id=m.id order by r.sent_at desc limit 1) as last_reminder
      from members m join titles t on t.member_id=m.id and t.status in ('aberto','parcial') and t.due_date < $1 join companies co on co.id=m.company_id
      where ($2::uuid[] is null or m.company_id = any($2::uuid[]))
      group by m.id, co.name order by min(t.due_date), m.name`, [day, scope]);
  const items = rows.map((r) => ({ member: { id: r.id, number: Number(r.number), name: r.name, email: r.email, whatsapp: r.whatsapp, status: r.status, company: r.company },
    count: r.n, amount: Number(r.amount), oldest_due: r.oldest_due, days: Math.round((Date.parse(day) - Date.parse(r.oldest_due)) / 86400000), months: r.months,
    last_reminder: r.last_reminder, has_contact: !!(r.email || normPhone(r.whatsapp)) }));
  const cur = (await db.one('select amount from member_fees where effective_month <= $1 order by effective_month desc limit 1', [monthStart(day)]))?.amount || 0;
  const tot = await db.one(`select count(*)::int as members, coalesce(sum(case when status='ativo' then coalesce(monthly_fee, $2) else 0 end),0) as monthly
      from members where status <> 'encerrado' and ($1::uuid[] is null or company_id = any($1::uuid[]))`, [scope, cur]);
  return { as_of: day, items, totals: { members_overdue: items.length, fees_overdue: items.reduce((a, x) => a + x.count, 0), amount: round2(items.reduce((a, x) => a + x.amount, 0)),
    active_members: tot.members, monthly_expected: Number(tot.monthly) } };
}
export function reportText(rep, orgName) {
  const lines = rep.items.map((x) => `• ${x.member.name} — ${x.count} mensalidade(s), ${brl(x.amount)}, mais antiga ${br(x.oldest_due)} (${x.days} dias)${x.has_contact ? '' : ' — sem contato cadastrado'}`);
  return `Relatório de mensalidades em atraso — ${orgName} — ${br(rep.as_of)}\n\n${rep.items.length ? `${rep.totals.members_overdue} associado(s) em atraso, total ${brl(rep.totals.amount)}:\n\n${lines.join('\n')}` : 'Nenhum associado em atraso. 🎉'}\n\nVeja os detalhes no CIFREN › Associados › Em atraso.`;
}
/** Relatório semanal por e-mail (e aviso no sino) para quem vê associados. */
export async function weeklyReport(db, { hour, weekday, orgName, force = false, onlyUser = null }) {
  const s = await memberSettings(db);
  if (!force) {
    if (!s.report_weekly || weekday !== s.report_weekday || hour < 8) return false;
    if (s.report_last_at && Date.now() - new Date(s.report_last_at).getTime() < 6 * 86400000) return false;
    if (!(await db.one('select 1 from members limit 1'))) return false;
  }
  const rep = await overdueReport(db);
  const ids = onlyUser ? [onlyUser] : await usersWithPerm(db, 'associados.visualizar');
  if (!onlyUser) await notifyUsers(db, ids, { kind: 'associados', title: rep.items.length ? `${rep.items.length} associado(s) com mensalidade atrasada` : 'Nenhum associado em atraso',
    body: rep.items.length ? `Total em atraso: ${brl(rep.totals.amount)}.` : 'Todas as mensalidades vencidas estão pagas.', link: '/associados?aba=atraso', dedupe: `assoc-rel:${rep.as_of}` });
  let sent = 0;
  if (await smtpConfig(db.orgId)) {
    const users = await db.all('select email from users where id = any($1::uuid[]) and active', [ids]);
    for (const u of users) { await sendMail(db.orgId, { to: u.email, subject: `CIFREN — mensalidades em atraso (${rep.items.length})`, text: reportText(rep, orgName) }); sent++; }
  }
  if (!force) await db.query(`insert into member_settings (org_id, report_last_at) values ($1, now()) on conflict (org_id) do update set report_last_at=now()`, [db.orgId]);
  return sent;
}
