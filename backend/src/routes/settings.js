// Agentes de IA (configuração, Agente Financeiro, Insights), notificações (sino + e-mail) e segurança da organização.
import { Router } from 'express';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import { orgTx, q } from '../db.js';
import { HttpError, parse, uuidParam, today, addInterval } from '../util.js';
import { need } from '../auth.js';
import { audit } from '../audit.js';
import { seal, unseal } from '../secrets.js';
import { AI_MODELS, aiSettings, usedThisMonth, saveAiSettings, askClaude, firstJson, wrapData } from '../lib/ai.js';
import { insightsFor } from '../lib/insights.js';
import { BALANCE_SQL } from './cadastros.js';
import { PAID } from './titles.js';

const actor = (req) => ({ id: req.user.id, name: req.user.name });

// ================= IA =================
export const ai = Router();
ai.get('/settings', need('ia.configurar'), async (req, res) => {
  res.json(await orgTx(req.orgId, async (db) => {
    const s = await aiSettings(db);
    return { enabled: s.enabled, model: s.model, models: AI_MODELS, key_set: !!s.key_sealed, monthly_limit: s.monthly_limit, used_this_month: await usedThisMonth(db), provider: 'Anthropic (Claude)' };
  }));
});
ai.put('/settings', need('ia.configurar'), async (req, res) => {
  const d = parse(z.object({ enabled: z.boolean().optional(), model: z.enum(AI_MODELS.map((m) => m.id)).optional(),
    api_key: z.string().trim().max(300).refine((v) => v === '' || /^sk-ant-[\w-]{20,}$/.test(v), 'chave da Anthropic inválida (começa com sk-ant-)').optional(),
    monthly_limit: z.coerce.number().int().min(0).max(100000).optional() }), req.body);
  await orgTx(req.orgId, async (db) => {
    const cur = await aiSettings(db);
    if (d.enabled && !cur.key_sealed && !d.api_key) throw new HttpError(400, 'Informe a chave da Anthropic para ligar a IA.');
    await saveAiSettings(db, d);
    await audit(db, { actor: actor(req), req, action: 'ia.configurada', entity: 'ai', summary: `IA ${d.enabled === false ? 'desligada' : d.enabled ? 'ligada' : 'ajustada'}${d.api_key !== undefined ? ' (chave trocada)' : ''}${d.model ? `, modelo ${d.model}` : ''}` });
  });
  res.json({ ok: true });
});

/** Junta os números que o Agente Financeiro pode usar (só leitura, já filtrados pelo escopo de empresas do usuário). */
async function financialContext(db, scope) {
  const day = today(); const until = addInterval(day, 'mensal', 1); const sc = '($1::uuid[] is null or t.company_id = any($1::uuid[]))';
  const accounts = await db.all(`select a.name, round(${BALANCE_SQL},2) as saldo from bank_accounts a where a.active and ($1::uuid[] is null or a.company_id = any($1::uuid[])) order by a.name`, [scope]);
  const open = await db.all(`select t.kind, t.description, cp.name as contraparte, t.due_date as vencimento, round(t.amount - ${PAID},2) as em_aberto, t.estimated as estimado, t.approval_status as aprovacao
      from titles t left join counterparties cp on cp.id=t.counterparty_id where t.status in ('aberto','parcial') and t.due_date <= $2 and ${sc} order by t.due_date limit 120`, [scope, until]);
  const overdue = await db.all(`select t.kind, count(*)::int as n, round(sum(t.amount - ${PAID}),2) as total from titles t where t.status in ('aberto','parcial') and t.due_date < $2 and ${sc} group by t.kind`, [scope, day]);
  const months = await db.all(`select to_char(date_trunc('month', s.paid_at),'YYYY-MM') as mes, t.kind, coalesce(c.name,'Sem categoria') as categoria, round(sum(s.amount),2) as total
      from settlements s join titles t on t.id=s.title_id left join categories c on c.id=t.category_id
      where s.reversed_at is null and s.paid_at >= (date_trunc('month', $2::date) - interval '3 months') and ${sc} group by 1,2,3 order by 1, total desc limit 150`, [scope, day]);
  return { hoje: day, contas_bancarias: accounts, contas_em_aberto_ate: until, contas_em_aberto: open, vencidas: overdue, realizado_ultimos_meses_por_categoria: months };
}
const SOURCES = (c) => [`Saldo das ${c.contas_bancarias.length} conta(s) ativa(s)`, `Contas em aberto até ${c.contas_em_aberto_ate.split('-').reverse().join('/')}`, 'Contas vencidas', 'Pagamentos e recebimentos dos últimos 3 meses por categoria'];
ai.post('/ask', need('ia.usar'), async (req, res) => {
  const d = parse(z.object({ question: z.string().trim().min(3, 'escreva a pergunta').max(600) }), req.body);
  const out = await orgTx(req.orgId, async (db) => {
    const ctx = await financialContext(db, req.companyScope);
    const answer = await askClaude(db, req.user.id, 'financeiro', { maxTokens: 900,
      system: 'Você é o Agente Financeiro do CIFREN. Responda à pergunta do usuário usando SOMENTE os números dos dados. Seja direto, use R$ no formato brasileiro e diga a conta que fez. Se os dados não bastarem, diga o que falta. Não dê recomendação de investimento.',
      content: `${wrapData(ctx)}\n\nPergunta do usuário: ${d.question}` });
    await audit(db, { actor: actor(req), req, action: 'ia.pergunta', entity: 'ai', summary: d.question.slice(0, 120) });
    return { answer, sources: SOURCES(ctx), period: { from: addInterval(ctx.hoje, 'mensal', -3), to: ctx.contas_em_aberto_ate } };
  });
  res.json(out);
});
ai.post('/insights', need('ia.usar'), async (req, res) => {
  const base = await insightsFor(req.orgId, req.companyScope);
  const out = await orgTx(req.orgId, async (db) => {
    const ctx = await financialContext(db, req.companyScope);
    const text = await askClaude(db, req.user.id, 'insights', { maxTokens: 1200,
      system: 'Você é o Agente de Insights do CIFREN. A partir dos dados (alertas calculados + números), escreva até 6 pontos curtos para o dono do negócio. Devolva SÓ JSON: {"items":[{"level":"risco|atencao|oportunidade","title":"até 80 letras","detail":"até 240 letras"}]}. Use apenas números presentes nos dados.',
      content: wrapData({ alertas: base, numeros: ctx }) });
    const j = firstJson(text);
    const items = Array.isArray(j?.items) ? j.items.slice(0, 6).filter((x) => x && typeof x.title === 'string').map((x) => ({
      level: ['risco', 'atencao', 'oportunidade'].includes(x.level) ? x.level : 'atencao', title: String(x.title).slice(0, 120), detail: String(x.detail || '').slice(0, 400), link: null, ai: true })) : [];
    return { items: items.length ? items : base, ai: items.length > 0 };
  });
  res.json(out);
});
export const insights = Router();
insights.get('/', async (req, res) => res.json({ items: await insightsFor(req.orgId, req.companyScope) }));

// ================= NOTIFICAÇÕES =================
export const notifications = Router();
notifications.get('/', async (req, res) => {
  const unreadOnly = req.query.unread === '1';
  res.json(await orgTx(req.orgId, async (db) => ({
    items: await db.all(`select id, kind, title, body, link, created_at, read_at from notifications where user_id=$1 and ($2::boolean is false or read_at is null) order by created_at desc limit 100`, [req.user.id, unreadOnly]),
    unread: (await db.one('select count(*)::int as n from notifications where user_id=$1 and read_at is null', [req.user.id])).n,
  })));
});
notifications.post('/read-all', async (req, res) => {
  await orgTx(req.orgId, (db) => db.query('update notifications set read_at=now() where user_id=$1 and read_at is null', [req.user.id]));
  res.json({ ok: true });
});
notifications.post('/:id/read', async (req, res) => {
  const id = uuidParam(req.params.id);
  await orgTx(req.orgId, (db) => db.query('update notifications set read_at=coalesce(read_at, now()) where id=$1 and user_id=$2', [id, req.user.id]));
  res.json({ ok: true });
});
notifications.get('/preferences', async (req, res) => {
  const r = await orgTx(req.orgId, (db) => db.one('select email_daily from user_prefs where user_id=$1', [req.user.id]));
  res.json({ email_daily: !!r?.email_daily, email_configured: !!(await smtpConfig(req.orgId)) });
});
notifications.put('/preferences', async (req, res) => {
  const d = parse(z.object({ email_daily: z.boolean() }), req.body);
  await orgTx(req.orgId, (db) => db.query(`insert into user_prefs (org_id, user_id, email_daily) values ($1,$2,$3) on conflict (org_id, user_id) do update set email_daily=excluded.email_daily`, [req.orgId, req.user.id, d.email_daily]));
  res.json({ ok: true });
});

// e-mail (SMTP) da organização — guardado cifrado em _secrets, uma chave por organização
const smtpKey = (orgId) => `smtp:${orgId}`;
export async function smtpConfig(orgId) {
  const r = (await q('select value from _secrets where key=$1', [smtpKey(orgId)])).rows[0];
  if (!r) return null;
  try { return unseal(r.value, 'smtp'); } catch { return null; }
}
export async function sendMail(orgId, { to, subject, text }) {
  const c = await smtpConfig(orgId);
  if (!c) throw new HttpError(409, 'O e-mail ainda não foi configurado.', { code: 'EMAIL_NOT_CONFIGURED' });
  const t = nodemailer.createTransport({ host: c.host, port: c.port, secure: !!c.secure, auth: c.user ? { user: c.user, pass: c.password } : undefined, connectionTimeout: 15000, greetingTimeout: 10000 });
  await t.sendMail({ from: c.from, to, subject, text });
}
notifications.get('/email-settings', need('notificacoes.configurar'), async (req, res) => {
  const c = await smtpConfig(req.orgId);
  res.json(c ? { host: c.host, port: c.port, user: c.user, from: c.from, secure: !!c.secure, password_set: !!c.password, configured: true } : { configured: false });
});
notifications.put('/email-settings', need('notificacoes.configurar'), async (req, res) => {
  const d = parse(z.object({ host: z.string().trim().min(3).max(200).regex(/^[\w.-]+$/, 'servidor inválido'), port: z.coerce.number().int().min(1).max(65535),
    user: z.string().trim().max(200).optional().default(''), password: z.string().max(300).optional(), from: z.string().trim().min(5).max(200).regex(/@/, 'remetente inválido'), secure: z.boolean().default(true) }), req.body);
  const cur = await smtpConfig(req.orgId);
  const v = { ...d, password: d.password === undefined ? cur?.password || '' : d.password };
  await q('insert into _secrets (key, value) values ($1,$2) on conflict (key) do update set value=excluded.value', [smtpKey(req.orgId), seal(v, 'smtp')]);
  await orgTx(req.orgId, (db) => audit(db, { actor: actor(req), req, action: 'email.configurado', entity: 'notifications', summary: `E-mail ${d.host}:${d.port}` }));
  res.json({ ok: true });
});
notifications.post('/email-test', need('notificacoes.configurar'), async (req, res) => {
  try { await sendMail(req.orgId, { to: req.user.email, subject: 'CIFREN — teste de e-mail', text: 'Se você recebeu esta mensagem, o e-mail do CIFREN está funcionando.' }); }
  catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(502, `O servidor de e-mail recusou: ${String(e.message || '').slice(0, 160)}`); }
  res.json({ ok: true, to: req.user.email });
});

// ================= SEGURANÇA =================
export const security = Router();
security.get('/', need('seguranca.configurar'), async (req, res) => {
  const r = await orgTx(req.orgId, (db) => db.one(`select o.require_mfa, (select count(*)::int from memberships m join users u on u.id=m.user_id where m.org_id=o.id and m.active and not u.mfa_enabled) as without_mfa
      from organizations o where o.id=$1`, [req.orgId]));
  res.json({ require_mfa: r.require_mfa, users_without_mfa: r.without_mfa });
});
security.put('/', need('seguranca.configurar'), async (req, res) => {
  const d = parse(z.object({ require_mfa: z.boolean() }), req.body);
  if (d.require_mfa && !req.user.mfa_enabled) throw new HttpError(409, 'Ligue a verificação em duas etapas na sua conta antes de exigir de todos.');
  await orgTx(req.orgId, async (db) => {
    await db.query('update organizations set require_mfa=$2 where id=$1', [req.orgId, d.require_mfa]);
    await audit(db, { actor: actor(req), req, action: 'seguranca.mfa', entity: 'organization', entityId: req.orgId, summary: `Verificação em 2 etapas ${d.require_mfa ? 'obrigatória' : 'opcional'}` });
  });
  res.json({ ok: true });
});
