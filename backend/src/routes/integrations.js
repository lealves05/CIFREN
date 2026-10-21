// Integração com os sistemas LORLER (ORBI, TORVEN, RUSTEN, APOLVEN, Cérebro).
// Chave por sistema (ck_<sistema>_…), guardada só como hash e mostrada uma única vez.
// Recebimento: POST /api/integrations/lorler/v1/movements (idempotente por external_id); leitura de indicadores para o Cérebro.
import { Router } from 'express';
import { z } from 'zod';
import { q, one, orgTx } from '../db.js';
import { HttpError, parse, uuidParam, today, round2, addInterval } from '../util.js';
import { need } from '../auth.js';
import { audit } from '../audit.js';
import { sha256, randomToken } from '../secrets.js';
import { limitByKey } from '../security.js';
import { needsApproval, requestApproval } from '../lib/approvals.js';
import { BALANCE_SQL } from './cadastros.js';
import { PAID, settleTitle } from './titles.js';
import { upsertMember, applyEntry, settingsOf, accountOf, DEFAULTS as RUSTEN_DEFAULTS } from '../lib/rusten.js';

const SYSTEMS = ['orbi', 'torven', 'rusten', 'apolven', 'cerebro'];
const SCOPES = { cerebro: ['indicators:read'], rusten: ['movements:write', 'indicators:read', 'members:write'], default: ['movements:write', 'indicators:read'] };
const SYSTEM_NAMES = { orbi: 'ORBI', torven: 'TORVEN', rusten: 'RUSTEN', apolven: 'APOLVEN', cerebro: 'Cérebro' };
const SYSTEM_URL = (s) => `https://${s}.lorler.com.br`;
/** Código de conexão: endpoint + chave + organização num texto só (o outro sistema só cola ou abre o link). */
const connectCode = ({ key, system, org }) => `LORLER1.${Buffer.from(JSON.stringify({ u: `${publicBase()}/api/integrations/lorler/v1`, k: key, o: org, s: system })).toString('base64url')}`;
const actor = (req) => ({ id: req.user.id, name: req.user.name });
const publicBase = () => (process.env.PUBLIC_URL || 'https://cifren.lorler.com.br').replace(/\/+$/, '');

export const integrations = Router();
integrations.get('/', need('integracoes.gerenciar'), async (req, res) => {
  const items = (await q(`select id, system, name, prefix, scopes, settings, created_at, last_used_at, last_sync_at, revoked_at is null as active from integration_keys
      where org_id=$1 order by revoked_at nulls first, created_at desc`, [req.orgId])).rows;
  const stats = await orgTx(req.orgId, async (db) => ({
    rusten: await db.one(`select (select count(*)::int from members where source='rusten') as members,
        (select count(*)::int from members where source='rusten' and status='ativo') as active_members,
        (select count(*)::int from member_account where source='rusten') as entries,
        (select coalesce(round(sum(t.amount - ${PAID}),2),0) from titles t where t.source='rusten' and t.external_id like 'acc:%' and t.status in ('aberto','parcial')) as fiado_open`),
  }));
  const systems = Object.keys(SYSTEM_NAMES).map((sys) => {
    const k = items.find((x) => x.system === sys && x.active);
    return { system: sys, name: SYSTEM_NAMES[sys], url: SYSTEM_URL(sys), connected: !!k, key_id: k?.id || null, prefix: k?.prefix || null, connected_at: k?.created_at || null,
      last_used_at: k?.last_used_at || null, settings: sys === 'rusten' ? { ...RUSTEN_DEFAULTS, ...(k?.settings || {}) } : (k?.settings || {}),
      features: sys === 'rusten' ? ['Associados (etiqueta Associado no cliente)', 'Fiado e crédito do cliente', 'Pagamentos recebidos no CIFREN voltam ao RUSTEN']
        : sys === 'cerebro' ? ['Indicadores do financeiro (só leitura)'] : ['Contas a pagar e a receber geradas no sistema'],
      stats: sys === 'rusten' ? { members: stats.rusten.members, active_members: stats.rusten.active_members, entries: stats.rusten.entries, fiado_open: Number(stats.rusten.fiado_open) } : null };
  });
  res.json({ systems, items, endpoint: `${publicBase()}/api/integrations/lorler/v1` });
});
/** Conectar um sistema: gera a chave (a anterior do mesmo sistema é revogada) e devolve o código de conexão e o link para abrir o sistema já conectando. */
integrations.post('/connect', need('integracoes.gerenciar'), async (req, res) => {
  const d = parse(z.object({ system: z.enum(SYSTEMS) }), req.body);
  const key = `ck_${d.system}_${randomToken(30)}`;
  const prefix = key.slice(0, `ck_${d.system}_`.length + 4);
  const prev = (await q('update integration_keys set revoked_at=now() where org_id=$1 and system=$2 and revoked_at is null returning settings', [req.orgId, d.system])).rows[0];
  const r = await one(`insert into integration_keys (org_id, system, name, prefix, key_hash, scopes, settings, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [req.orgId, d.system, `Conexão ${SYSTEM_NAMES[d.system]}`, prefix, sha256(key), SCOPES[d.system] || SCOPES.default, prev?.settings || {}, req.user.id]);
  await orgTx(req.orgId, (db) => audit(db, { actor: actor(req), req, action: 'integracao.conectar', entity: 'integration', entityId: r.id, summary: `${SYSTEM_NAMES[d.system]}: novo código de conexão (${prefix}…)${prev ? '; conexão anterior encerrada' : ''}` }));
  const code = connectCode({ key, system: d.system, org: req.org.name });
  res.status(201).json({ id: r.id, prefix, key, code, connect_url: `${SYSTEM_URL(d.system)}/configuracoes/cifren#codigo=${code}` });
});
integrations.put('/:id/settings', need('integracoes.gerenciar'), async (req, res) => {
  const id = uuidParam(req.params.id);
  const d = parse(z.object({ member_fees: z.boolean().optional(), fiado_due_days: z.coerce.number().int().min(0).max(365).optional(),
    account_id: z.string().uuid().nullable().optional(), company_id: z.string().uuid().nullable().optional() }), req.body);
  const k = await one('select settings, system from integration_keys where id=$1 and org_id=$2 and revoked_at is null', [id, req.orgId]);
  if (!k) throw new HttpError(404, 'Conexão não encontrada.');
  await orgTx(req.orgId, async (db) => {
    if (d.account_id && !(await db.one('select 1 from bank_accounts where id=$1 and active', [d.account_id]))) throw new HttpError(400, 'Conta não encontrada.');
    if (d.company_id && !(await db.one('select 1 from companies where id=$1 and active', [d.company_id]))) throw new HttpError(400, 'Empresa inválida.');
    await audit(db, { actor: actor(req), req, action: 'integracao.ajuste', entity: 'integration', entityId: id, summary: `${SYSTEM_NAMES[k.system]}: opções da conexão`, data: d });
  });
  await q('update integration_keys set settings = settings || $2::jsonb where id=$1', [id, JSON.stringify(d)]);
  res.json({ ok: true });
});
// compatível com a Fase B: criar chave avulsa
integrations.post('/', need('integracoes.gerenciar'), async (req, res) => {
  const d = parse(z.object({ system: z.enum(SYSTEMS), name: z.string().trim().min(2).max(80) }), req.body);
  const key = `ck_${d.system}_${randomToken(30)}`;
  const prefix = key.slice(0, `ck_${d.system}_`.length + 4);
  const r = await one(`insert into integration_keys (org_id, system, name, prefix, key_hash, scopes, created_by) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [req.orgId, d.system, d.name, prefix, sha256(key), SCOPES[d.system] || SCOPES.default, req.user.id]);
  await orgTx(req.orgId, (db) => audit(db, { actor: actor(req), req, action: 'integracao.chave_criada', entity: 'integration', entityId: r.id, summary: `${d.system.toUpperCase()}: ${d.name} (${prefix}…)` }));
  res.status(201).json({ id: r.id, key, prefix, code: connectCode({ key, system: d.system, org: req.org.name }) });
});
integrations.delete('/:id', need('integracoes.gerenciar'), async (req, res) => {
  const id = uuidParam(req.params.id);
  const r = await one('update integration_keys set revoked_at=now() where id=$1 and org_id=$2 and revoked_at is null returning system, prefix', [id, req.orgId]);
  if (!r) throw new HttpError(404, 'Chave não encontrada.');
  await orgTx(req.orgId, (db) => audit(db, { actor: actor(req), req, action: 'integracao.chave_revogada', entity: 'integration', entityId: id, summary: `${r.system.toUpperCase()} ${r.prefix}…` }));
  res.json({ ok: true });
});

// ---------------- API de recebimento (sem sessão; Bearer) ----------------
export const lorlerApi = Router();
async function bearer(req, res, scope) {
  const m = String(req.get('authorization') || '').match(/^Bearer\s+(ck_[a-z]+_[\w-]{20,80})$/);
  if (!m) throw new HttpError(401, 'Chave de integração ausente.');
  await limitByKey('integracao', sha256(m[1]).slice(0, 16), 120, 60, res);
  const k = await one('select id, org_id, system, scopes, settings from integration_keys where key_hash=$1 and revoked_at is null', [sha256(m[1])]);
  if (!k) throw new HttpError(401, 'Chave de integração inválida ou revogada.');
  if (!k.scopes.includes(scope)) throw new HttpError(403, 'Esta chave não pode fazer isto.');
  q('update integration_keys set last_used_at=now(), last_sync_at=now() where id=$1', [k.id]).catch(() => {});
  return k;
}
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data AAAA-MM-DD');
const movement = z.object({
  external_id: z.string().trim().min(1).max(120),
  kind: z.enum(['pagar', 'receber']),
  status: z.enum(['aberto', 'cancelado']).default('aberto'),
  company_document: z.string().max(20).optional().nullable(),
  description: z.string().trim().min(1).max(180),
  amount: z.coerce.number().positive().max(1e12),
  due_date: dateStr, competence_date: dateStr.optional().nullable(), document_number: z.string().max(60).optional().nullable(),
  counterparty: z.object({ name: z.string().trim().min(1).max(160), document: z.string().max(20).optional().nullable(), email: z.string().max(160).optional().nullable() }).optional().nullable(),
  category_name: z.string().trim().max(80).optional().nullable(),
  paid: z.object({ paid_at: dateStr, amount: z.coerce.number().positive().max(1e12).optional(), account_name: z.string().max(80).optional().nullable() }).optional().nullable(),
});
lorlerApi.post('/movements', async (req, res) => {
  const k = await bearer(req, res, 'movements:write');
  const b = parse(z.object({ items: z.array(movement).min(1).max(500) }), req.body);
  const src = k.system; const fakeReq = { orgId: k.org_id, user: null, ip: req.ip, get: (h) => req.get(h) };
  const results = [];
  for (const m of b.items) {
    try {
      const r = await orgTx(k.org_id, async (db) => {
        const comps = await db.all("select id, regexp_replace(coalesce(document,''),'\\D','','g') as doc from companies where active");
        const digits = String(m.company_document || '').replace(/\D/g, '');
        const company = digits ? comps.find((c) => c.doc === digits) : comps.length === 1 ? comps[0] : null;
        if (!company) throw new HttpError(400, digits ? 'Empresa (CNPJ) não encontrada no CIFREN.' : 'Informe company_document: há mais de uma empresa.');
        const ex = await db.one('select * from titles where source=$1 and external_id=$2 for update', [src, m.external_id]);
        if (ex) {
          if (m.status === 'cancelado') {
            if (ex.status === 'cancelado') return { external_id: m.external_id, result: 'unchanged', id: ex.id };
            if (await db.one('select 1 from settlements where title_id=$1 and reversed_at is null', [ex.id])) return { external_id: m.external_id, result: 'conflict', id: ex.id, error: 'Já tem baixa no CIFREN; estorne lá.' };
            await db.query("update titles set status='cancelado', cancel_reason=$2, cancelled_at=now(), updated_at=now(), version=version+1 where id=$1", [ex.id, `Cancelado no ${src.toUpperCase()}`]);
            return { external_id: m.external_id, result: 'cancelled', id: ex.id };
          }
          const same = Number(ex.amount) === round2(m.amount) && String(ex.due_date) === m.due_date && ex.description === m.description;
          const hasPay = await db.one('select 1 from settlements where title_id=$1 and reversed_at is null', [ex.id]);
          if (!same && !hasPay && ex.status === 'aberto') {
            await db.query('update titles set amount=$2, due_date=$3, description=$4, updated_at=now(), version=version+1 where id=$1', [ex.id, round2(m.amount), m.due_date, m.description]);
          }
          if (m.paid && !hasPay && ex.status !== 'cancelado') await payIt(db, fakeReq, ex.id, company.id, m);
          return { external_id: m.external_id, result: same || hasPay ? 'unchanged' : 'updated', id: ex.id };
        }
        if (m.status === 'cancelado') return { external_id: m.external_id, result: 'skipped' };
        let cp = null;
        if (m.counterparty) {
          const cd = String(m.counterparty.document || '').replace(/\D/g, '');
          cp = (cd && await db.one("select id from counterparties where regexp_replace(coalesce(document,''),'\\D','','g')=$1 limit 1", [cd]))
            || await db.one('select id from counterparties where lower(name)=lower($1) limit 1', [m.counterparty.name])
            || await db.one('insert into counterparties (org_id, kind, name, document, email, notes) values ($1,$2,$3,$4,$5,$6) returning id',
              [k.org_id, m.kind === 'pagar' ? 'fornecedor' : 'cliente', m.counterparty.name, m.counterparty.document || null, m.counterparty.email || null, `Criado pela integração ${src.toUpperCase()}`]);
        }
        const cat = m.category_name ? await db.one('select id from categories where lower(name)=lower($1) and type=$2 and active limit 1', [m.category_name, m.kind === 'pagar' ? 'despesa' : 'receita']) : null;
        const approval = m.kind === 'pagar' && await needsApproval(db, 'title', company.id, m.amount);
        const t = await db.one(`insert into titles (org_id, company_id, kind, description, counterparty_id, category_id, document_number, competence_date, due_date, amount, source, external_id, approval_status, notes)
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
        [k.org_id, company.id, m.kind, m.description, cp?.id || null, cat?.id || null, m.document_number || null, m.competence_date || m.due_date, m.due_date, round2(m.amount), src, m.external_id,
          approval ? 'pendente' : null, `Importado do ${src.toUpperCase()}`]);
        if (approval) await requestApproval(db, { ...fakeReq, user: { id: null, name: `Integração ${src.toUpperCase()}` } }, { entity: 'title', entityId: t.id, companyId: company.id, amount: m.amount, summary: `${m.description} (${src.toUpperCase()})` });
        if (m.paid && !approval) await payIt(db, fakeReq, t.id, company.id, m);
        await audit(db, { actor: { id: null, name: `Integração ${src.toUpperCase()}` }, req, action: 'integracao.movimento', entity: 'title', entityId: t.id, summary: `${m.description}: R$ ${round2(m.amount).toFixed(2)}` });
        return { external_id: m.external_id, result: 'created', id: t.id };
      });
      results.push(r);
    } catch (e) {
      results.push({ external_id: m.external_id, result: 'error', error: e instanceof HttpError ? e.message : 'Erro ao gravar este item.' });
      if (!(e instanceof HttpError)) console.error('[integracao]', e.message);
    }
  }
  const count = (r) => results.filter((x) => x.result === r).length;
  res.json({ created: count('created'), updated: count('updated'), cancelled: count('cancelled'), unchanged: count('unchanged'), errors: count('error') + count('conflict'), items: results });
});
async function payIt(db, req, titleId, companyId, m) {
  const acc = m.paid.account_name ? await db.one('select id from bank_accounts where company_id=$1 and active and lower(name)=lower($2) limit 1', [companyId, m.paid.account_name]) : null;
  const a = acc || await db.one('select id from bank_accounts where company_id=$1 and active order by created_at limit 1', [companyId]);
  if (!a) return;
  const t = await db.one('select * from titles where id=$1', [titleId]);
  const open = round2(Number(t.amount) - Number((await db.one(`select ${PAID} as v from titles t where t.id=$1`, [titleId])).v));
  if (open <= 0) return;
  await settleTitle(db, req, t, { account_id: a.id, paid_at: m.paid.paid_at > today() ? today() : m.paid.paid_at, amount: Math.min(open, round2(m.paid.amount || open)), method: 'outro', notes: 'Baixa vinda da integração' }, 'integracao');
}
lorlerApi.get('/indicators', async (req, res) => {
  const k = await bearer(req, res, 'indicators:read');
  const day = today(); const in30 = addInterval(day, 'mensal', 1); const m0 = `${day.slice(0, 7)}-01`;
  const out = await orgTx(k.org_id, async (db) => {
    const cash = (await db.one(`select coalesce(sum(round(${BALANCE_SQL},2)),0) as v from bank_accounts a where a.active`)).v;
    const open = await db.all(`select t.kind, round(sum(case when t.due_date < $1 then t.amount - ${PAID} else 0 end),2) as overdue,
        round(sum(case when t.due_date between $1 and $2 then t.amount - ${PAID} else 0 end),2) as next_30d, round(sum(t.amount - ${PAID}),2) as total
      from titles t where t.status in ('aberto','parcial') group by t.kind`, [day, in30]);
    const month = await db.all(`select t.kind, round(sum(s.amount),2) as v from settlements s join titles t on t.id=s.title_id where s.reversed_at is null and s.paid_at >= $1 group by t.kind`, [m0]);
    const g = (arr, kind, f) => Number(arr.find((r) => r.kind === kind)?.[f] || 0);
    return { as_of: new Date().toISOString(), cash_balance: Number(cash),
      receivable: { overdue: g(open, 'receber', 'overdue'), next_30d: g(open, 'receber', 'next_30d'), total: g(open, 'receber', 'total') },
      payable: { overdue: g(open, 'pagar', 'overdue'), next_30d: g(open, 'pagar', 'next_30d'), total: g(open, 'pagar', 'total') },
      month: { received: g(month, 'receber', 'v'), paid: g(month, 'pagar', 'v'), result: round2(g(month, 'receber', 'v') - g(month, 'pagar', 'v')) } };
  });
  res.json(out);
});

// ---------------- RUSTEN: associados, fiado e crédito ----------------
lorlerApi.get('/hello', async (req, res) => {
  const k = await bearer(req, res, 'members:write');
  const o = await one('select name from organizations where id=$1', [k.org_id]);
  res.json({ ok: true, system: k.system, org: o?.name || '', features: ['members', 'account', 'payments'], settings: { member_fees: settingsOf(k).member_fees } });
});
const memberItem = z.object({ external_id: z.coerce.string().trim().min(1).max(80), name: z.string().trim().min(1).max(160),
  cpf: z.string().regex(/^\d{11}$/).nullable().optional(), phone: z.string().max(30).nullable().optional(), email: z.string().max(200).nullable().optional(), active: z.boolean() });
lorlerApi.post('/members', async (req, res) => {
  const k = await bearer(req, res, 'members:write');
  const b = parse(z.object({ items: z.array(memberItem).min(1).max(200) }), req.body);
  const items = [];
  for (const it of b.items) {
    try { items.push({ external_id: it.external_id, ...(await orgTx(k.org_id, (db) => upsertMember(db, k, it))) }); }
    catch (e) { items.push({ external_id: it.external_id, result: 'error', error: { code: 'invalid', message: e instanceof HttpError ? e.message : 'Erro ao gravar.' } }); if (!(e instanceof HttpError)) console.error('[rusten/members]', e.message); }
  }
  res.json({ items });
});
const entryItem = z.object({ external_id: z.coerce.string().trim().min(1).max(80), customer_external_id: z.coerce.string().trim().min(1).max(80),
  kind: z.enum(['credito', 'uso_credito', 'fiado', 'pagamento_fiado', 'estorno', 'ajuste']), amount_cents: z.number().int().refine((v) => v !== 0 && Math.abs(v) <= 1e11, 'valor inválido'),
  reverses_external_id: z.coerce.string().max(80).nullable().optional(), reason: z.string().max(300).nullable().optional(), created_at: z.string().max(40) });
lorlerApi.post('/account', async (req, res) => {
  const k = await bearer(req, res, 'members:write');
  const b = parse(z.object({ items: z.array(entryItem).min(1).max(500) }), req.body);
  const items = [];
  for (const it of b.items) {
    try { items.push({ external_id: it.external_id, ...(await orgTx(k.org_id, (db) => applyEntry(db, k, it))) }); }
    catch (e) { items.push({ external_id: it.external_id, result: 'error', error: { code: 'invalid', message: e instanceof HttpError ? e.message : 'Erro ao gravar.' } }); if (!(e instanceof HttpError)) console.error('[rusten/account]', e.message); }
  }
  res.json({ items });
});
lorlerApi.get('/payments', async (req, res) => {
  const k = await bearer(req, res, 'members:write');
  const after = /^\d{1,18}$/.test(String(req.query.after || '')) ? String(req.query.after) : '0';
  const rows = await orgTx(k.org_id, (db) => db.all(`select id, type, customer_external_id, amount, paid_at, note from integration_feed
      where system=$1 and id > $2::bigint order by id limit 200`, [k.system, after]));
  const items = rows.map((r) => ({ cursor: String(r.id), type: r.type, customer_external_id: r.customer_external_id, amount_cents: Math.round(Number(r.amount) * 100), paid_at: r.paid_at, note: r.note }));
  res.json({ items, next_cursor: items.length ? items.at(-1).cursor : after });
});
export { accountOf };
