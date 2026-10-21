// Associados e mensalidades — cadastro, mensalidades, cobrança (e-mail, WhatsApp oficial ou link do WhatsApp) e relatório de atrasados.
import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { orgTx } from '../db.js';
import { HttpError, parse, notFound, uuidParam, isUuid, today, likeEsc, round2 } from '../util.js';
import { need, can, assertCompany, companyAllowed } from '../auth.js';
import { audit } from '../audit.js';
import { settleTitle } from './titles.js';
import { smtpConfig } from './settings.js';
import { maskEmail, maskPhone, maskDoc } from './cadastros.js';
import {
  PAID_T, normPhone, fmtPhone, feeCategory, generateFor, memberSettings, saveMemberSettings, waReady, sendReminder, openFeesOf, messageVars, render, waLink,
  overdueReport, weeklyReport, testWhatsApp, DEFAULT_SETTINGS, dueOf, feeTable, tableFeeAt, recalcOpen, nextMonth,
} from '../lib/members.js';

export const members = Router();
const actor = (req) => ({ id: req.user.id, name: req.user.name });
const optText = (max) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const monthStr = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, 'mês inválido (AAAA-MM)').transform((v) => `${v.slice(0, 7)}-01`);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data inválida');
const brl = (n) => `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const memberSchema = z.object({
  company_id: z.string().refine(isUuid, 'empresa inválida'),
  name: z.string().trim().min(2, 'informe o nome').max(160),
  document: optText(20),
  email: optText(200).refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'e-mail inválido'),
  whatsapp: optText(30).refine((v) => !v || normPhone(v), 'WhatsApp inválido (use DDD + número)'),
  // valor especial só deste associado (vazio = segue a tabela de valores da mensalidade)
  monthly_fee: z.preprocess((v) => (v === '' || v === null ? null : v), z.coerce.number().positive('valor inválido').max(1e9).transform(round2).nullable()).optional(),
  due_day: z.coerce.number().int().min(1).max(31).default(10),
  start_month: monthStr,
  category_id: z.string().refine(isUuid).optional().nullable(),
  notify_email: z.boolean().default(true), notify_whatsapp: z.boolean().default(true),
  charge_fees: z.boolean().default(true),
  notes: optText(1000),
});

const sensitive = (req) => can(req, 'cadastros.dados_sensiveis') || can(req, 'associados.gerenciar');
function shape(req, m, extra = {}, table = null) {
  const full = sensitive(req);
  return { id: m.id, number: Number(m.number), company: m.company || { id: m.company_id }, name: m.name,
    document: full ? m.document : m.document && maskDoc(m.document), email: full ? m.email : m.email && maskEmail(m.email),
    whatsapp: full ? m.whatsapp : m.whatsapp && maskPhone(m.whatsapp), whatsapp_display: full ? fmtPhone(m.whatsapp) : m.whatsapp && maskPhone(m.whatsapp),
    custom_fee: m.monthly_fee != null ? Number(m.monthly_fee) : null,
    monthly_fee: m.monthly_fee != null ? Number(m.monthly_fee) : table ? tableFeeAt(table, `${today().slice(0, 7)}-01`) : null, due_day: m.due_day, start_month: String(m.start_month).slice(0, 7), end_month: m.end_month ? String(m.end_month).slice(0, 7) : null,
    status: m.status, category: m.category || (m.category_id ? { id: m.category_id } : null), notify_email: m.notify_email, notify_whatsapp: m.notify_whatsapp, notes: m.notes,
    source: m.source || null, charge_fees: m.charge_fees !== false, created_at: m.created_at, masked: !full, ...extra };
}
async function loadMember(db, req, id, lock = false) {
  const m = await db.one(`select * from members where id=$1 ${lock ? 'for update' : ''}`, [uuidParam(id)]);
  if (!m || !companyAllowed(req, m.company_id)) throw notFound('Associado não encontrado.');
  return m;
}

// ---------------- lista ----------------
members.get('/', need('associados.visualizar', 'associados.gerenciar'), async (req, res) => {
  const day = today();
  const p = [req.companyScope, day]; const w = ['($1::uuid[] is null or m.company_id = any($1::uuid[]))'];
  if (['ativo', 'suspenso', 'encerrado'].includes(req.query.status)) { p.push(req.query.status); w.push(`m.status=$${p.length}`); }
  else if (req.query.status !== 'todos') w.push("m.status <> 'encerrado'");
  if (req.query.q) { p.push(`%${likeEsc(String(req.query.q).slice(0, 80))}%`); w.push(`(m.name ilike $${p.length} or m.email ilike $${p.length} or m.whatsapp like $${p.length})`); }
  if (req.query.situacao === 'atraso') w.push(`exists(select 1 from titles t where t.member_id=m.id and t.source='mensalidade' and t.status in ('aberto','parcial') and t.due_date < $2)`);
  if (req.query.situacao === 'em_dia') w.push(`not exists(select 1 from titles t where t.member_id=m.id and t.source='mensalidade' and t.status in ('aberto','parcial') and t.due_date < $2)`);
  const items = await orgTx(req.orgId, async (db) => {
    const table = await feeTable(db);
    const rows = await db.all(`select m.*, json_build_object('id', co.id, 'name', co.name) as company,
        case when c.id is null then null else json_build_object('id', c.id, 'name', c.name) end as category,
        (select json_build_object('count', count(*), 'amount', coalesce(round(sum(t.amount - ${PAID_T}),2),0), 'oldest_due', min(t.due_date))
           from titles t where t.member_id=m.id and t.source='mensalidade' and t.status in ('aberto','parcial') and t.due_date < $2) as overdue,
        (select json_build_object('id', t.id, 'due_date', t.due_date, 'amount', round(t.amount - ${PAID_T},2)) from titles t
           where t.member_id=m.id and t.source='mensalidade' and t.status in ('aberto','parcial') and t.due_date >= $2 order by t.due_date limit 1) as next_fee,
        (select max(s.paid_at) from settlements s join titles t on t.id=s.title_id where t.member_id=m.id and s.reversed_at is null) as last_payment
      from members m join companies co on co.id=m.company_id left join categories c on c.id=m.category_id
      where ${w.join(' and ')} order by lower(m.name) limit 2000`, p);
    return rows.map((m) => shape(req, m, { overdue: { count: Number(m.overdue.count), amount: Number(m.overdue.amount), oldest_due: m.overdue.oldest_due,
      days: m.overdue.oldest_due ? Math.round((Date.parse(day) - Date.parse(m.overdue.oldest_due)) / 86400000) : 0 }, next_fee: m.next_fee, last_payment: m.last_payment }, table));
  });
  const totals = { members: items.length, active: items.filter((x) => x.status === 'ativo').length, overdue_members: items.filter((x) => x.overdue.count > 0).length,
    overdue_amount: round2(items.reduce((a, x) => a + x.overdue.amount, 0)), monthly_expected: round2(items.filter((x) => x.status === 'ativo').reduce((a, x) => a + (x.monthly_fee || 0), 0)) };
  res.json({ items, totals });
});

// ---------------- configurações de cobrança ----------------
members.get('/settings', need('associados.visualizar', 'associados.configurar'), async (req, res) => {
  const out = await orgTx(req.orgId, async (db) => {
    const s = await memberSettings(db);
    const { wa_token_sealed, report_last_at: _r, org_id: _o, updated_at: _u, ...rest } = s;
    return { ...rest, wa_token_set: !!wa_token_sealed, wa_ready: waReady(s), email_ready: !!(await smtpConfig(req.orgId)),
      placeholders: ['{nome}', '{valor}', '{descricao}', '{vencimento}', '{meses}', '{empresa}', '{pix}'],
      wa_template_text: 'Olá, {{1}}! Consta em aberto {{2}}, no total de {{3}}. Se já pagou, desconsidere esta mensagem.',
      wa_template_before_text: 'Olá, {{1}}! Lembrete: sua mensalidade de {{2}} vence em {{3}}.' };
  });
  res.json(out);
});
members.put('/settings', need('associados.configurar'), async (req, res) => {
  const d = parse(z.object({
    remind_before_days: z.coerce.number().int().min(0).max(15).optional(),
    remind_after_days: z.array(z.coerce.number().int().min(1).max(365)).max(8).optional().transform((v) => v && [...new Set(v)].sort((a, b) => a - b)),
    email_subject: z.string().trim().min(3).max(150).optional(), message: z.string().trim().min(10).max(900).optional(), before_message: z.string().trim().min(10).max(900).optional(),
    pix_key: optText(120), send_hour_from: z.coerce.number().int().min(0).max(23).optional(), send_hour_to: z.coerce.number().int().min(1).max(24).optional(),
    wa_enabled: z.boolean().optional(), wa_phone_number_id: z.string().trim().regex(/^\d{5,30}$/, 'ID do número inválido (só números)').optional().nullable().or(z.literal('')),
    wa_token: z.string().trim().max(600).optional(), wa_template: z.string().trim().regex(/^[a-z0-9_]{1,512}$/, 'nome do modelo: letras minúsculas, números e _').optional().nullable().or(z.literal('')),
    wa_template_before: z.string().trim().regex(/^[a-z0-9_]{1,512}$/, 'nome do modelo: letras minúsculas, números e _').optional().nullable().or(z.literal('')),
    wa_lang: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/).optional(),
    report_weekly: z.boolean().optional(), report_weekday: z.coerce.number().int().min(0).max(6).optional(),
  }), req.body);
  if (d.send_hour_from !== undefined && d.send_hour_to !== undefined && d.send_hour_to <= d.send_hour_from) throw new HttpError(400, 'O horário final precisa ser depois do inicial.');
  const clean = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v === '' ? null : v]));
  if ('pix_key' in req.body === false) delete clean.pix_key;
  await orgTx(req.orgId, async (db) => {
    await saveMemberSettings(db, clean);
    const s = await memberSettings(db);
    if (s.wa_enabled && !waReady(s)) throw new HttpError(400, 'Para ligar o WhatsApp oficial informe o ID do número, o token e o nome do modelo aprovado.');
    await audit(db, { actor: actor(req), req, action: 'associados.config', entity: 'member_settings', summary: `Avisos de cobrança ajustados${'wa_token' in d ? ' (token do WhatsApp trocado)' : ''}` });
  });
  res.json({ ok: true });
});
members.post('/settings/test-whatsapp', need('associados.configurar'), async (req, res) => {
  const d = parse(z.object({ to: z.string().refine((v) => normPhone(v), 'número inválido') }), req.body);
  await orgTx(req.orgId, async (db) => {
    const s = await memberSettings(db);
    if (!waReady(s)) throw new HttpError(409, 'Configure e ligue o WhatsApp oficial antes do teste.');
    try { await testWhatsApp(s, normPhone(d.to)); } catch (e) { throw new HttpError(502, e.message); }
  });
  res.json({ ok: true });
});

// ---------------- relatório de atrasados ----------------
members.get('/overdue', need('associados.visualizar'), async (req, res) => {
  res.json(await orgTx(req.orgId, async (db) => {
    const r = await overdueReport(db, req.companyScope);
    if (!sensitive(req)) r.items.forEach((x) => { x.member.email = x.member.email && maskEmail(x.member.email); x.member.whatsapp = x.member.whatsapp && maskPhone(x.member.whatsapp); });
    return r;
  }));
});
async function overdueRows(req) {
  const r = await orgTx(req.orgId, (db) => overdueReport(db, req.companyScope));
  await orgTx(req.orgId, (db) => audit(db, { actor: actor(req), req, action: 'exportacao', entity: 'report', summary: 'Exportou mensalidades em atraso' }));
  return r.items.map((x) => [x.member.number, x.member.name, x.member.company, sensitive(req) ? x.member.email : maskEmail(x.member.email || ''), sensitive(req) ? fmtPhone(x.member.whatsapp) : maskPhone(x.member.whatsapp || ''),
    x.count, x.months.join(', '), x.oldest_due, x.days, x.amount, x.last_reminder ? `${x.last_reminder.channel} ${String(x.last_reminder.at).slice(0, 10)} (${x.last_reminder.status})` : '']);
}
const OH = ['Nº', 'Associado', 'Empresa', 'E-mail', 'WhatsApp', 'Mensalidades', 'Meses', 'Mais antiga', 'Dias de atraso', 'Valor em atraso', 'Último aviso'];
members.get('/overdue.csv', need('associados.visualizar'), async (req, res) => {
  const rows = await overdueRows(req);
  const cell = (v) => { const s = v == null ? '' : typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(2).replace('.', ',') : String(v); const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="mensalidades-em-atraso-${today()}.csv"` })
    .send('﻿' + [OH, ...rows].map((r) => r.map(cell).join(';')).join('\r\n'));
});
members.get('/overdue.xlsx', need('associados.visualizar'), async (req, res) => {
  const rows = await overdueRows(req);
  const wb = new ExcelJS.Workbook(); wb.creator = 'CIFREN'; const ws = wb.addWorksheet('Em atraso');
  ws.addRow(OH).font = { bold: true };
  rows.forEach((r) => ws.addRow(r.map((v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v))));
  ws.columns.forEach((c, i) => { c.width = [6, 30, 22, 28, 18, 12, 30, 12, 12, 14, 26][i]; });
  ws.getColumn(10).numFmt = '#,##0.00'; ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.addRow([]); ws.addRow(['', 'Total', '', '', '', rows.reduce((a, r) => a + r[5], 0), '', '', '', round2(rows.reduce((a, r) => a + r[9], 0))]).font = { bold: true };
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="mensalidades-em-atraso-${today()}.xlsx"` });
  res.send(Buffer.from(await wb.xlsx.writeBuffer()));
});
members.post('/overdue/send-report', need('associados.visualizar'), async (req, res) => {
  if (!(await smtpConfig(req.orgId))) throw new HttpError(409, 'Configure o e-mail em Configurações › Notificações para receber o relatório.', { code: 'EMAIL_NOT_CONFIGURED' });
  try { await orgTx(req.orgId, (db) => weeklyReport(db, { force: true, onlyUser: req.user.id, orgName: req.org.name })); }
  catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(502, `O servidor de e-mail recusou: ${String(e.message || '').slice(0, 160)}`); }
  res.json({ ok: true, to: req.user.email });
});

// ---------------- tabela de valores da mensalidade ----------------
const feeOut = (table) => {
  const cur = `${today().slice(0, 7)}-01`;
  const items = table.map((f, i) => ({ id: f.id, effective_month: String(f.effective_month).slice(0, 7), amount: Number(f.amount), notes: f.notes,
    until_month: table[i + 1] ? String(table[i + 1].effective_month).slice(0, 7) : null, created_by_name: f.created_by_name, created_at: f.created_at, updated_at: f.updated_at,
    current: String(f.effective_month).slice(0, 10) <= cur && (!table[i + 1] || String(table[i + 1].effective_month).slice(0, 10) > cur),
    future: String(f.effective_month).slice(0, 10) > cur }));
  const current = tableFeeAt(table, cur);
  return { items: items.reverse(), current, next_month: nextMonth().slice(0, 7) };
};
members.get('/fees', need('associados.visualizar', 'associados.gerenciar'), async (req, res) => {
  res.json(await orgTx(req.orgId, async (db) => feeOut(await feeTable(db))));
});
const feeSchema = z.object({ amount: z.coerce.number().positive('informe o valor').max(1e9).transform(round2), effective_month: monthStr.optional(), notes: optText(200) });
/** Novo valor: vale a partir do próximo mês (ou de um mês futuro escolhido); os meses anteriores não mudam. O 1º valor pode valer desde qualquer mês. */
members.post('/fees', need('associados.gerenciar'), async (req, res) => {
  const d = parse(feeSchema, req.body);
  const out = await orgTx(req.orgId, async (db) => {
    const table = await feeTable(db);
    const next = nextMonth();
    const month = d.effective_month || (table.length ? next : `${today().slice(0, 7)}-01`);
    if (table.length && month < next) throw new HttpError(400, `O novo valor vale a partir do próximo mês (${next.slice(5, 7)}/${next.slice(0, 4)}). Para corrigir um valor já lançado, edite-o na lista.`);
    if (table.some((f) => String(f.effective_month).slice(0, 10) === month)) throw new HttpError(409, 'Já existe um valor para esse mês. Edite-o na lista.');
    await db.query('insert into member_fees (org_id, effective_month, amount, notes, created_by, created_by_name) values ($1,$2,$3,$4,$5,$6)', [req.orgId, month, d.amount, d.notes, req.user.id, req.user.name]);
    const n = await recalcOpen(db, month);
    // primeiro valor: gera as mensalidades de quem estava esperando a tabela
    let generated = 0;
    if (!table.length) for (const m of await db.all("select * from members where status='ativo'")) generated += await generateFor(db, m, req.user.id);
    await audit(db, { actor: actor(req), req, action: 'mensalidade.valor', entity: 'member_fees', summary: `Mensalidade ${brl(d.amount)} a partir de ${month.slice(5, 7)}/${month.slice(0, 4)}${n ? ` (${n} mensalidade(s) em aberto ajustada(s))` : ''}` });
    return { ...feeOut(await feeTable(db)), recalculated: n, generated };
  });
  res.status(201).json(out);
});
/** Corrigir um valor já lançado (valor, mês ou observação): recalcula as mensalidades em aberto e sem pagamento desde o mês afetado. */
members.put('/fees/:fid', need('associados.gerenciar'), async (req, res) => {
  const d = parse(feeSchema.partial(), req.body);
  const out = await orgTx(req.orgId, async (db) => {
    const f = await db.one('select * from member_fees where id=$1 for update', [uuidParam(req.params.fid)]);
    if (!f) throw notFound('Valor não encontrado.');
    const month = d.effective_month || String(f.effective_month).slice(0, 10);
    if (month !== String(f.effective_month).slice(0, 10) && await db.one('select 1 from member_fees where effective_month=$1 and id<>$2', [month, f.id])) throw new HttpError(409, 'Já existe um valor para esse mês.');
    await db.query('update member_fees set amount=coalesce($2,amount), effective_month=$3, notes=case when $4::boolean then $5 else notes end, updated_at=now() where id=$1',
      [f.id, d.amount ?? null, month, 'notes' in (req.body || {}), d.notes ?? null]);
    const from = [month, String(f.effective_month).slice(0, 10)].sort()[0];
    const n = await recalcOpen(db, from);
    await audit(db, { actor: actor(req), req, action: 'mensalidade.valor_corrigido', entity: 'member_fees', entityId: f.id,
      summary: `Valor de ${String(f.effective_month).slice(0, 7)}: ${brl(f.amount)} → ${brl(d.amount ?? f.amount)} a partir de ${month.slice(0, 7)}${n ? ` (${n} em aberto ajustada(s))` : ''}` });
    return { ...feeOut(await feeTable(db)), recalculated: n };
  });
  res.json(out);
});
members.delete('/fees/:fid', need('associados.gerenciar'), async (req, res) => {
  const out = await orgTx(req.orgId, async (db) => {
    const f = await db.one('select * from member_fees where id=$1 for update', [uuidParam(req.params.fid)]);
    if (!f) throw notFound('Valor não encontrado.');
    if ((await db.one('select count(*)::int as n from member_fees')).n === 1) throw new HttpError(409, 'Este é o único valor da tabela. Edite em vez de excluir.');
    await db.query('delete from member_fees where id=$1', [f.id]);
    const n = await recalcOpen(db, String(f.effective_month).slice(0, 10));
    await audit(db, { actor: actor(req), req, action: 'mensalidade.valor_excluido', entity: 'member_fees', entityId: f.id, summary: `Excluído o valor ${brl(f.amount)} de ${String(f.effective_month).slice(0, 7)}` });
    return { ...feeOut(await feeTable(db)), recalculated: n };
  });
  res.json(out);
});

// ---------------- cadastro ----------------
members.post('/', need('associados.gerenciar'), async (req, res) => {
  const d = parse(memberSchema, req.body);
  assertCompany(req, d.company_id);
  const out = await orgTx(req.orgId, async (db) => {
    if (!(await db.one('select 1 from companies where id=$1 and active', [d.company_id]))) throw new HttpError(400, 'Empresa inválida.');
    if (d.category_id) { const c = await db.one('select type from categories where id=$1', [d.category_id]); if (!c || c.type !== 'receita') throw new HttpError(400, 'Use uma categoria de receita.'); }
    const table = await feeTable(db);
    if (d.charge_fees !== false && d.monthly_fee == null && !table.length) throw new HttpError(409, 'Cadastre primeiro o valor da mensalidade (aba "Valores da mensalidade"). Ele vale para todos os associados.', { code: 'FEE_NOT_SET' });
    const cat = d.category_id || await feeCategory(db);
    const cp = await db.one("insert into counterparties (org_id, kind, name, document, email, phone, notes) values ($1,'cliente',$2,$3,$4,$5,'Associado (mensalidades)') returning id",
      [req.orgId, d.name, d.document, d.email, d.whatsapp ? fmtPhone(normPhone(d.whatsapp)) : null]);
    const m = await db.one(`insert into members (org_id, company_id, counterparty_id, name, document, email, whatsapp, monthly_fee, due_day, start_month, category_id, notify_email, notify_whatsapp, notes, created_by, charge_fees)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning *`,
    [req.orgId, d.company_id, cp.id, d.name, d.document, d.email, d.whatsapp ? normPhone(d.whatsapp) : null, d.monthly_fee ?? null, d.due_day, d.start_month, cat, d.notify_email, d.notify_whatsapp, d.notes, req.user.id, d.charge_fees !== false]);
    const n = await generateFor(db, m, req.user.id);
    await audit(db, { actor: actor(req), req, action: 'associado.criado', entity: 'member', entityId: m.id, summary: `${d.name}: mensalidade ${d.monthly_fee != null ? `especial ${brl(d.monthly_fee)}` : 'da tabela'} todo dia ${d.due_day} (${n} mensalidade(s) gerada(s))` });
    return shape(req, m, { generated: n }, table);
  });
  res.status(201).json(out);
});

members.get('/:id', need('associados.visualizar', 'associados.gerenciar'), async (req, res) => {
  const out = await orgTx(req.orgId, async (db) => {
    const m = await loadMember(db, req, req.params.id);
    const co = await db.one('select id, name from companies where id=$1', [m.company_id]);
    const cat = m.category_id ? await db.one('select id, name from categories where id=$1', [m.category_id]) : null;
    const fees = await db.all(`select t.id, t.description, t.competence_date, t.due_date, t.amount, t.status, round(${PAID_T},2) as paid,
        (select max(s.paid_at) from settlements s where s.title_id=t.id and s.reversed_at is null) as paid_at
      from titles t where t.member_id=$1 and t.source='mensalidade' order by t.due_date desc limit 120`, [m.id]);
    const day = today();
    const reminders = await db.all('select id, title_id, channel, kind, step, status, error, sent_by_name, sent_at from member_reminders where member_id=$1 order by sent_at desc limit 60', [m.id]);
    const table = await feeTable(db);
    const { accountOf } = await import('../lib/rusten.js');
    const account = m.source ? await accountOf(db, m.id) : null;
    return shape(req, { ...m, company: co, category: cat }, {
      account,
      fees: fees.map((t) => ({ id: t.id, month: String(t.competence_date || t.due_date).slice(0, 7), due_date: t.due_date, amount: Number(t.amount), paid: Number(t.paid), paid_at: t.paid_at,
        status: t.status, overdue: ['aberto', 'parcial'].includes(t.status) && t.due_date < day, open: round2(Number(t.amount) - Number(t.paid)) })),
      reminders,
    }, table);
  });
  res.json(out);
});

members.put('/:id', need('associados.gerenciar'), async (req, res) => {
  const body = req.body || {};
  const d = parse(memberSchema.partial().extend({ apply_to_open: z.boolean().optional() }), body);
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k) && d[k] !== undefined;
  const out = await orgTx(req.orgId, async (db) => {
    const m = await loadMember(db, req, req.params.id, true);
    if (has('company_id')) { assertCompany(req, d.company_id); }
    if (has('category_id') && d.category_id) { const c = await db.one('select type from categories where id=$1', [d.category_id]); if (!c || c.type !== 'receita') throw new HttpError(400, 'Use uma categoria de receita.'); }
    if (has('whatsapp')) d.whatsapp = d.whatsapp ? normPhone(d.whatsapp) : null;
    const keys = ['company_id', 'name', 'document', 'email', 'whatsapp', 'monthly_fee', 'due_day', 'start_month', 'category_id', 'notify_email', 'notify_whatsapp', 'charge_fees', 'notes'].filter(has);
    if (!keys.length) throw new HttpError(400, 'Nada para alterar.');
    const r = await db.one(`update members set ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')}, updated_at=now() where id=$1 returning *`, [m.id, ...keys.map((k) => d[k])]);
    if (['name', 'document', 'email', 'whatsapp'].some(has) && r.counterparty_id) {
      await db.query('update counterparties set name=$2, document=$3, email=$4, phone=$5 where id=$1', [r.counterparty_id, r.name, r.document, r.email, r.whatsapp ? fmtPhone(r.whatsapp) : null]);
    }
    // valor especial mudou (ou voltou para a tabela): vale a partir do próximo mês; os meses anteriores não mudam
    let changed = 0;
    if (has('monthly_fee') && (m.monthly_fee == null ? null : Number(m.monthly_fee)) !== d.monthly_fee) changed += await recalcOpen(db, nextMonth(), m.id);
    // dia do vencimento e nome: nas mensalidades em aberto e sem pagamento (se pedido)
    if (d.apply_to_open && (has('due_day') || has('name'))) {
      const open = await db.all(`select t.id, t.competence_date from titles t where t.member_id=$1 and t.source='mensalidade' and t.status='aberto'
          and not exists(select 1 from settlements s where s.title_id=t.id and s.reversed_at is null)`, [m.id]);
      for (const t of open) {
        const month = String(t.competence_date).slice(0, 10);
        await db.query('update titles set due_date=$2, description=$3, updated_at=now(), version=version+1 where id=$1',
          [t.id, dueOf(month, r.due_day), `Mensalidade ${month.slice(5, 7)}/${month.slice(0, 4)} — ${r.name}`.slice(0, 200)]);
      }
      changed += open.length;
    }
    if (has('start_month') || has('due_day') || has('charge_fees')) await generateFor(db, r, req.user.id);
    await audit(db, { actor: actor(req), req, action: 'associado.alterado', entity: 'member', entityId: m.id, summary: `${r.name}${changed ? ` (${changed} mensalidade(s) em aberto ajustada(s))` : ''}`,
      data: { antes: Object.fromEntries(keys.map((k) => [k, m[k]])), depois: Object.fromEntries(keys.map((k) => [k, d[k]])) } });
    return shape(req, r, { open_updated: changed }, await feeTable(db));
  });
  res.json(out);
});

members.post('/:id/status', need('associados.gerenciar'), async (req, res) => {
  const d = parse(z.object({ status: z.enum(['ativo', 'suspenso', 'encerrado']), end_month: monthStr.optional(), cancel_future: z.boolean().default(true) }), req.body);
  const out = await orgTx(req.orgId, async (db) => {
    const m = await loadMember(db, req, req.params.id, true);
    const end = d.status === 'encerrado' ? (d.end_month || `${today().slice(0, 7)}-01`) : null;
    const r = await db.one('update members set status=$2, end_month=$3, updated_at=now() where id=$1 returning *', [m.id, d.status, end]);
    let cancelled = 0;
    if (d.status === 'encerrado' && d.cancel_future) {
      const x = await db.query(`update titles t set status='cancelado', cancel_reason='Associado encerrado', cancelled_at=now(), updated_at=now(), version=version+1
          where t.member_id=$1 and t.source='mensalidade' and t.status='aberto' and t.competence_date > $2 and not exists(select 1 from settlements s where s.title_id=t.id and s.reversed_at is null)`, [m.id, end]);
      cancelled = x.rowCount;
    }
    if (d.status === 'ativo') await generateFor(db, r, req.user.id);
    await audit(db, { actor: actor(req), req, action: `associado.${d.status}`, entity: 'member', entityId: m.id, summary: `${m.name}: ${d.status}${cancelled ? ` (${cancelled} mensalidade(s) futura(s) cancelada(s))` : ''}` });
    return shape(req, r, { cancelled });
  });
  res.json(out);
});

/** Excluir associado cadastrado por engano: só se nenhuma mensalidade foi paga. */
members.delete('/:id', need('associados.gerenciar'), async (req, res) => {
  await orgTx(req.orgId, async (db) => {
    const m = await loadMember(db, req, req.params.id, true);
    if (await db.one('select 1 from settlements s join titles t on t.id=s.title_id where t.member_id=$1 and s.reversed_at is null limit 1', [m.id])) {
      throw new HttpError(409, 'Este associado já tem mensalidade paga. Use "Encerrar" para manter o histórico.');
    }
    await db.query("update titles set status='cancelado', cancel_reason='Associado excluído (cadastro errado)', cancelled_at=now(), member_id=null, updated_at=now(), version=version+1 where member_id=$1", [m.id]);
    await db.query('delete from member_reminders where member_id=$1', [m.id]);
    await db.query('delete from members where id=$1', [m.id]);
    await audit(db, { actor: actor(req), req, action: 'associado.excluido', entity: 'member', entityId: m.id, summary: `${m.name} excluído (cadastro errado)` });
  });
  res.json({ ok: true });
});

members.post('/:id/generate', need('associados.gerenciar'), async (req, res) => {
  const n = await orgTx(req.orgId, async (db) => generateFor(db, await loadMember(db, req, req.params.id), req.user.id));
  res.json({ generated: n });
});

// pagamento de uma mensalidade (baixa da conta a receber)
members.post('/fees/:titleId/pay', need('financeiro.titulos.baixar'), async (req, res) => {
  const d = parse(z.object({ account_id: z.string().refine(isUuid, 'escolha a conta'), paid_at: dateStr, amount: z.coerce.number().positive().optional(),
    method: z.enum(['pix', 'boleto', 'dinheiro', 'cartao', 'transferencia', 'outro']).default('pix'), interest: z.coerce.number().min(0).default(0), discount: z.coerce.number().min(0).default(0) }), req.body);
  const out = await orgTx(req.orgId, async (db) => {
    const t = await db.one('select * from titles where id=$1 and member_id is not null for update', [uuidParam(req.params.titleId)]);
    if (!t || !companyAllowed(req, t.company_id)) throw notFound('Mensalidade não encontrada.');
    const paid = Number((await db.one(`select ${PAID_T} as v from titles t where t.id=$1`, [t.id])).v);
    return settleTitle(db, req, t, { account_id: d.account_id, paid_at: d.paid_at, amount: d.amount ?? round2(Number(t.amount) - paid), method: d.method, interest: d.interest, fine: 0, discount: d.discount, notes: 'Mensalidade' });
  });
  res.json(out);
});

// cobrança manual: e-mail ou WhatsApp oficial agora; ou link para abrir o WhatsApp com a mensagem pronta
members.post('/:id/remind', need('associados.gerenciar'), async (req, res) => {
  const d = parse(z.object({ channel: z.enum(['email', 'whatsapp']) }), req.body);
  const out = await orgTx(req.orgId, async (db) => {
    const m = await loadMember(db, req, req.params.id);
    const fees = await openFeesOf(db, m.id, true);
    if (!fees.length) throw new HttpError(409, 'Este associado não tem mensalidade atrasada.');
    const s = await memberSettings(db);
    if (d.channel === 'email' && !(await smtpConfig(req.orgId))) throw new HttpError(409, 'Configure o e-mail em Configurações › Notificações.', { code: 'EMAIL_NOT_CONFIGURED' });
    if (d.channel === 'whatsapp' && !waReady(s)) throw new HttpError(409, 'O WhatsApp oficial não está configurado. Use "Abrir no WhatsApp" ou configure em Associados › Avisos.', { code: 'WHATSAPP_NOT_CONFIGURED' });
    const co = await db.one('select name from companies where id=$1', [m.company_id]);
    const r = await sendReminder(db, { member: m, company: co.name, titles: fees, s, channel: d.channel, kind: 'manual', user: actor(req) });
    if (r.status !== 'enviado') throw new HttpError(r.status === 'sem_contato' ? 409 : 502, r.error);
    await audit(db, { actor: actor(req), req, action: 'associado.cobranca', entity: 'member', entityId: m.id, summary: `Cobrança por ${d.channel === 'email' ? 'e-mail' : 'WhatsApp'} para ${m.name}` });
    return { ok: true };
  });
  res.json(out);
});
members.post('/:id/whatsapp-link', need('associados.gerenciar'), async (req, res) => {
  const out = await orgTx(req.orgId, async (db) => {
    const m = await loadMember(db, req, req.params.id);
    const phone = normPhone(m.whatsapp);
    if (!phone) throw new HttpError(409, 'Cadastre o WhatsApp do associado.');
    const fees = await openFeesOf(db, m.id, true);
    const s = await memberSettings(db);
    const co = await db.one('select name from companies where id=$1', [m.company_id]);
    const next = fees.length ? null : (await openFeesOf(db, m.id, false))[0];
    if (!fees.length && !next) throw new HttpError(409, 'Este associado não tem mensalidade em aberto.');
    const text = render(fees.length ? s.message : s.before_message, messageVars(m, co.name, fees.length ? fees : [next], s));
    await db.query(`insert into member_reminders (org_id, member_id, title_id, channel, kind, step, status, sent_by, sent_by_name) values ($1,$2,$3,'whatsapp_link','manual',0,'enviado',$4,$5)`,
      [req.orgId, m.id, (fees[0] || next).id, req.user.id, req.user.name]);
    return { url: waLink(phone, text), text };
  });
  res.json(out);
});

export { DEFAULT_SETTINGS };
