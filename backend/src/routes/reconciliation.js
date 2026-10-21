// Conciliação bancária: importa extrato (OFX/CSV), sugere o par de cada lançamento (título em aberto ou baixa já feita),
// concilia (dá a baixa pela data e valor do extrato), cria lançamento avulso (tarifa, rendimento), ignora e desfaz.
// Agente de Conciliação: regras explicáveis + sugestão de categoria pela IA (opcional).
import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { orgTx } from '../db.js';
import { HttpError, parse, notFound, uuidParam, isUuid, today, toCents, fromCents, limitParam, encodeCursor, decodeCursor } from '../util.js';
import { need, companyAllowed } from '../auth.js';
import { audit } from '../audit.js';
import { parseOFX, parseCSV } from '../parsers.js';
import { settleTitle, refreshStatus, PAID } from './titles.js';
import { askClaude, firstJson, wrapData } from '../lib/ai.js';
import { feedFromSettlement } from '../lib/rusten.js';

export const reconciliation = Router();
const actor = (req) => ({ id: req.user.id, name: req.user.name });
const MAX_B64 = 7 * 1024 * 1024;

async function loadAccount(db, req, id) {
  if (!isUuid(id)) throw new HttpError(400, 'Conta inválida.');
  const a = await db.one('select * from bank_accounts where id=$1', [id]);
  if (!a || !companyAllowed(req, a.company_id)) throw new HttpError(400, 'Conta inválida.');
  return a;
}

reconciliation.post('/imports', need('conciliacao.importar'), async (req, res) => {
  const d = parse(z.object({ account_id: z.string(), filename: z.string().max(200).optional().nullable(), content_base64: z.string().min(10).max(MAX_B64) }), req.body);
  const buf = Buffer.from(d.content_base64, 'base64');
  let text = buf.toString('utf8'); if (text.includes('�')) text = buf.toString('latin1');
  const isOfx = /<OFX>/i.test(text) || /\.ofx$/i.test(d.filename || '');
  let lines; try { lines = isOfx ? parseOFX(text) : parseCSV(text); } catch (e) { throw new HttpError(400, e.message); }
  const out = await orgTx(req.orgId, async (db) => {
    const acc = await loadAccount(db, req, d.account_id);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    if (await db.one('select 1 from statement_imports where account_id=$1 and sha256=$2', [acc.id, hash])) throw new HttpError(409, 'Este arquivo já foi importado nesta conta.', { code: 'DUPLICATE' });
    const dates = lines.map((l) => l.date).sort();
    const imp = await db.one(`insert into statement_imports (org_id, account_id, filename, format, sha256, period_from, period_to, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [req.orgId, acc.id, d.filename || null, isOfx ? 'ofx' : 'csv', hash, dates[0], dates[dates.length - 1], req.user.id]);
    let n = 0; let dup = 0;
    for (const l of lines) {
      const r = await db.query(`insert into statement_lines (org_id, import_id, account_id, date, description, amount, fitid, line_hash) values ($1,$2,$3,$4,$5,$6,$7,$8)
                                on conflict (org_id, account_id, line_hash) do nothing`, [req.orgId, imp.id, acc.id, l.date, l.description, l.amount, l.fitid, l.line_hash]);
      if (r.rowCount) n++; else dup++;
    }
    await db.query('update statement_imports set lines=$2, duplicates=$3 where id=$1', [imp.id, n, dup]);
    await audit(db, { actor: actor(req), req, action: 'extrato.importado', entity: 'account', entityId: acc.id, summary: `Extrato ${isOfx ? 'OFX' : 'CSV'} em ${acc.name}: ${n} lançamento(s), ${dup} repetido(s)` });
    return { id: imp.id, lines: n, duplicates: dup, period: { from: dates[0], to: dates[dates.length - 1] } };
  });
  res.status(201).json(out);
});

reconciliation.get('/imports', need('conciliacao.importar', 'conciliacao.conciliar'), async (req, res) => {
  const acc = isUuid(req.query.account_id) ? req.query.account_id : null;
  const rows = await orgTx(req.orgId, (db) => db.all(`select i.id, i.filename, i.created_at, i.lines, json_build_object('id', a.id, 'name', a.name) as account, a.company_id,
      (select count(*)::int from statement_lines l where l.import_id=i.id and l.status<>'pendente') as matched,
      (select count(*)::int from statement_lines l where l.import_id=i.id and l.status='pendente') as pending
     from statement_imports i join bank_accounts a on a.id=i.account_id where ($1::uuid is null or i.account_id=$1) order by i.created_at desc limit 100`, [acc]));
  res.json({ items: rows.filter((r) => companyAllowed(req, r.company_id)).map(({ company_id: _c, ...r }) => r) });
});

/** Sugestões (Agente de Conciliação, por regras): título em aberto com o mesmo valor e vencimento próximo; baixa já lançada sem extrato. */
async function suggestionsFor(db, line, acc) {
  const abs = Math.abs(Number(line.amount)); const kind = Number(line.amount) < 0 ? 'pagar' : 'receber';
  const words = String(line.description || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  const titles = await db.all(`select t.id, t.description, t.due_date, t.amount - ${PAID} as open, cp.name as cp from titles t left join counterparties cp on cp.id=t.counterparty_id
      where t.company_id=$1 and t.kind=$2 and t.status in ('aberto','parcial') and coalesce(t.approval_status,'aprovado')='aprovado'
        and abs((t.amount - ${PAID}) - $3) <= greatest(0.01, $3 * 0.05) and t.due_date between $4::date - 20 and $4::date + 20
      order by abs(t.due_date - $4::date) limit 10`, [acc.company_id, kind, abs, line.date]);
  const out = [];
  for (const t of titles) {
    const exact = Math.abs(Number(t.open) - abs) < 0.005;
    const days = Math.abs((Date.parse(t.due_date) - Date.parse(line.date)) / 86400000);
    const text = `${t.description} ${t.cp || ''}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const nameHit = words.some((w) => text.includes(w));
    let score = (exact ? 0.7 : 0.45) + 0.2 * (1 - Math.min(days, 15) / 15) + (nameHit ? 0.1 : 0);
    score = Math.min(0.99, Math.round(score * 100) / 100);
    out.push({ type: 'title', title_id: t.id, description: t.description, counterparty: t.cp, due_date: t.due_date, open_amount: Number(t.open), score,
      reason: [exact ? 'mesmo valor' : 'valor parecido (±5%)', days === 0 ? 'vencimento no mesmo dia' : `vencimento a ${days} dia(s)`, nameHit ? 'nome aparece no extrato' : null].filter(Boolean).join(', ') });
  }
  const sets = await db.all(`select s.id, s.paid_at, (s.amount + s.interest + s.fine - s.discount) as cash, t.description, t.kind from settlements s join titles t on t.id=s.title_id
      where s.account_id=$1 and s.reversed_at is null and t.kind=$2 and abs((s.amount + s.interest + s.fine - s.discount) - $3) < 0.01 and s.paid_at between $4::date - 5 and $4::date + 5
        and not exists (select 1 from statement_lines l where l.settlement_id=s.id) limit 5`, [acc.id, kind, abs, line.date]);
  for (const s of sets) {
    const days = Math.abs((Date.parse(s.paid_at) - Date.parse(line.date)) / 86400000);
    out.push({ type: 'settlement', settlement_id: s.id, description: s.description, paid_at: s.paid_at, amount: Number(s.cash), score: Math.round((0.97 - days * 0.03) * 100) / 100,
      reason: `baixa já lançada com o mesmo valor${days ? ` (${days} dia(s) de diferença)` : ' no mesmo dia'}` });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 4);
}

reconciliation.get('/lines', need('conciliacao.conciliar', 'conciliacao.importar'), async (req, res) => {
  const limit = limitParam(req.query.limit, 50, 200);
  const cur = decodeCursor(req.query.cursor);
  const st = ['pendente', 'conciliada', 'ignorada'].includes(req.query.status) ? req.query.status : req.query.status === 'todas' ? null : 'pendente';
  const out = await orgTx(req.orgId, async (db) => {
    const accId = isUuid(req.query.account_id) ? req.query.account_id : null;
    const p = [accId, st, limit + 1]; let page = '';
    if (cur?.d && isUuid(cur.id)) { p.push(cur.d, cur.id); page = 'and (l.date, l.id) > ($4::date, $5::uuid)'; }
    const rows = await db.all(`select l.*, a.name as account_name, a.company_id from statement_lines l join bank_accounts a on a.id=l.account_id
        where ($1::uuid is null or l.account_id=$1) and ($2::text is null or l.status=$2) ${page} order by l.date, l.id limit $3`, p);
    const vis = rows.filter((r) => companyAllowed(req, r.company_id));
    const items = [];
    for (const l of vis.slice(0, limit)) {
      const t = l.title_id ? await db.one('select id, description from titles where id=$1', [l.title_id]) : null;
      items.push({ id: l.id, account: { id: l.account_id, name: l.account_name }, date: l.date, description: l.description, amount: Number(l.amount), status: l.status,
        settlement_id: l.settlement_id, title: t, note: l.note, suggestions: l.status === 'pendente' ? await suggestionsFor(db, l, { id: l.account_id, company_id: l.company_id }) : [] });
    }
    const last = vis[Math.min(vis.length, limit) - 1];
    return { items, next_cursor: vis.length > limit && last ? encodeCursor({ d: last.date, id: last.id }) : null };
  });
  res.json(out);
});

async function loadLine(db, req, id) {
  const l = await db.one('select l.*, a.company_id from statement_lines l join bank_accounts a on a.id=l.account_id where l.id=$1 for update of l', [uuidParam(id)]);
  if (!l || !companyAllowed(req, l.company_id)) throw notFound('Lançamento do extrato não encontrado.');
  return l;
}

/** Concilia a linha com um título (dá a baixa) — usado na ação manual e na automática. */
async function matchTitle(db, req, l, titleId) {
  const t = await db.one('select * from titles where id=$1 for update', [titleId]);
  if (!t || t.company_id !== l.company_id) throw new HttpError(400, 'Título inválido para esta conta.');
  const kind = Number(l.amount) < 0 ? 'pagar' : 'receber';
  if (t.kind !== kind) throw new HttpError(400, kind === 'pagar' ? 'Saída do extrato só concilia com conta a pagar.' : 'Entrada do extrato só concilia com conta a receber.');
  const paid = (await db.one('select coalesce(sum(amount),0) as v from settlements where title_id=$1 and reversed_at is null', [t.id])).v;
  const open = toCents(t.amount) - toCents(paid); const abs = toCents(Math.abs(Number(l.amount)));
  const amount = fromCents(Math.min(open, abs)); const extra = abs > open ? fromCents(abs - open) : 0;
  const r = await settleTitle(db, req, t, { account_id: l.account_id, paid_at: l.date > today() ? today() : l.date, amount, interest: extra, fine: 0, discount: 0, method: 'transferencia',
    notes: `Conciliado com o extrato: ${l.description || ''}`.slice(0, 500) }, 'conciliacao');
  await db.query("update statement_lines set status='conciliada', settlement_id=$2, created_settlement=true, title_id=$3, decided_by=$4, decided_at=now() where id=$1",
    [l.id, r.settlement_id, t.id, req.user.id]);
  return r;
}

reconciliation.post('/lines/:id/match', need('conciliacao.conciliar'), async (req, res) => {
  const d = parse(z.object({ title_id: z.string().refine(isUuid).optional(), settlement_id: z.string().refine(isUuid).optional() }).refine((x) => x.title_id || x.settlement_id, 'informe o título ou a baixa'), req.body);
  await orgTx(req.orgId, async (db) => {
    const l = await loadLine(db, req, req.params.id);
    if (l.status !== 'pendente') throw new HttpError(409, 'Este lançamento já foi tratado. Desfaça antes, se precisar.');
    if (d.title_id) await matchTitle(db, req, l, d.title_id);
    else {
      const s = await db.one(`select s.id, s.title_id, s.account_id, s.reversed_at, (s.amount+s.interest+s.fine-s.discount) as cash from settlements s where s.id=$1`, [d.settlement_id]);
      if (!s || s.account_id !== l.account_id || s.reversed_at) throw new HttpError(400, 'Baixa inválida para esta conta.');
      if (await db.one('select 1 from statement_lines where settlement_id=$1', [s.id])) throw new HttpError(409, 'Esta baixa já está ligada a outro lançamento do extrato.');
      await db.query("update statement_lines set status='conciliada', settlement_id=$2, created_settlement=false, title_id=$3, decided_by=$4, decided_at=now() where id=$1", [l.id, s.id, s.title_id, req.user.id]);
    }
    await audit(db, { actor: actor(req), req, action: 'conciliacao.conciliada', entity: 'statement_line', entityId: l.id, summary: `Extrato ${l.date} R$ ${Number(l.amount).toFixed(2)} conciliado`, data: d });
  });
  res.json({ ok: true });
});

reconciliation.post('/lines/:id/create', need('conciliacao.conciliar'), async (req, res) => {
  const opt = z.string().refine(isUuid).optional().nullable();
  const d = parse(z.object({ description: z.string().trim().min(1).max(200), category_id: opt, counterparty_id: opt, cost_center_id: opt }), req.body);
  await orgTx(req.orgId, async (db) => {
    const l = await loadLine(db, req, req.params.id);
    if (l.status !== 'pendente') throw new HttpError(409, 'Este lançamento já foi tratado.');
    const kind = Number(l.amount) < 0 ? 'pagar' : 'receber';
    if (d.category_id) { const c = await db.one('select type from categories where id=$1', [d.category_id]); if (!c || c.type !== (kind === 'pagar' ? 'despesa' : 'receita')) throw new HttpError(400, kind === 'pagar' ? 'Use uma categoria de despesa.' : 'Use uma categoria de receita.'); }
    const t = await db.one(`insert into titles (org_id, company_id, kind, description, counterparty_id, category_id, cost_center_id, due_date, competence_date, amount, source, created_by)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,'conciliacao',$10) returning *`,
    [req.orgId, l.company_id, kind, d.description, d.counterparty_id || null, d.category_id || null, d.cost_center_id || null, l.date, Math.abs(Number(l.amount)), req.user.id]);
    await matchTitle(db, req, l, t.id);
    await audit(db, { actor: actor(req), req, action: 'conciliacao.lancamento_criado', entity: 'title', entityId: t.id, summary: `${d.description} — R$ ${Math.abs(Number(l.amount)).toFixed(2)} (pelo extrato)` });
  });
  res.json({ ok: true });
});

reconciliation.post('/lines/:id/ignore', need('conciliacao.conciliar'), async (req, res) => {
  const d = parse(z.object({ reason: z.string().trim().max(200).optional().nullable() }), req.body || {});
  await orgTx(req.orgId, async (db) => {
    const l = await loadLine(db, req, req.params.id);
    if (l.status !== 'pendente') throw new HttpError(409, 'Este lançamento já foi tratado.');
    await db.query("update statement_lines set status='ignorada', note=$2, decided_by=$3, decided_at=now() where id=$1", [l.id, d.reason || null, req.user.id]);
    await audit(db, { actor: actor(req), req, action: 'conciliacao.ignorada', entity: 'statement_line', entityId: l.id, summary: `Extrato ${l.date} R$ ${Number(l.amount).toFixed(2)} ignorado${d.reason ? `: ${d.reason}` : ''}` });
  });
  res.json({ ok: true });
});

reconciliation.post('/lines/:id/undo', need('conciliacao.conciliar'), async (req, res) => {
  await orgTx(req.orgId, async (db) => {
    const l = await loadLine(db, req, req.params.id);
    if (l.status === 'pendente') throw new HttpError(409, 'Nada a desfazer.');
    if (l.status === 'conciliada' && l.created_settlement && l.settlement_id) {
      await db.query("update settlements set reversed_at=now(), reversed_by=$2, reverse_reason='Conciliação desfeita' where id=$1 and reversed_at is null", [l.settlement_id, req.user.id]);
      const t = await db.one('select id, source, status from titles where id=$1', [l.title_id]);
      await refreshStatus(db, t.id);
      if (t.source === 'rusten') await feedFromSettlement(db, l.settlement_id, 'estorno');
      if (t.source === 'conciliacao') await db.query("update titles set status='cancelado', cancel_reason='Conciliação desfeita', cancelled_at=now() where id=$1", [t.id]);
    }
    await db.query("update statement_lines set status='pendente', settlement_id=null, created_settlement=false, title_id=null, note=null, decided_by=$2, decided_at=now() where id=$1", [l.id, req.user.id]);
    await audit(db, { actor: actor(req), req, action: 'conciliacao.desfeita', entity: 'statement_line', entityId: l.id, summary: `Extrato ${l.date} R$ ${Number(l.amount).toFixed(2)} voltou a pendente` });
  });
  res.json({ ok: true });
});

reconciliation.post('/auto', need('conciliacao.conciliar'), async (req, res) => {
  const d = parse(z.object({ account_id: z.string() }), req.body);
  const matched = await orgTx(req.orgId, async (db) => {
    const acc = await loadAccount(db, req, d.account_id);
    const lines = await db.all("select l.*, $2::uuid as company_id from statement_lines l where l.account_id=$1 and l.status='pendente' order by l.date limit 500", [acc.id, acc.company_id]);
    let n = 0; const usedTitles = new Set(); const usedSets = new Set();
    for (const l of lines) {
      const best = (await suggestionsFor(db, l, acc))[0];
      if (!best || best.score < 0.95) continue;
      if (best.type === 'title' && Math.abs(best.open_amount - Math.abs(Number(l.amount))) < 0.005 && !usedTitles.has(best.title_id)) {
        await matchTitle(db, req, l, best.title_id); usedTitles.add(best.title_id); n++;
      } else if (best.type === 'settlement' && !usedSets.has(best.settlement_id)) {
        await db.query("update statement_lines set status='conciliada', settlement_id=$2, created_settlement=false, title_id=(select title_id from settlements where id=$2), decided_by=$3, decided_at=now() where id=$1", [l.id, best.settlement_id, req.user.id]);
        usedSets.add(best.settlement_id); n++;
      }
    }
    await audit(db, { actor: actor(req), req, action: 'conciliacao.automatica', entity: 'account', entityId: acc.id, summary: `Conciliação automática em ${acc.name}: ${n} lançamento(s)` });
    return n;
  });
  res.json({ matched });
});

reconciliation.post('/lines/:id/ai-suggest', need('conciliacao.conciliar'), need('ia.usar'), async (req, res) => {
  const out = await orgTx(req.orgId, async (db) => {
    const l = await loadLine(db, req, req.params.id);
    const kind = Number(l.amount) < 0 ? 'despesa' : 'receita';
    const cats = await db.all('select c.id, c.name, p.name as parent from categories c left join categories p on p.id=c.parent_id where c.active and c.type=$1 order by c.name', [kind]);
    const text = await askClaude(db, req.user.id, 'conciliacao', {
      system: 'Você é o Agente de Conciliação de um sistema financeiro brasileiro. Classifique um lançamento de extrato bancário: escolha UMA categoria da lista e sugira o nome do fornecedor/cliente, se der para saber pelo texto. Responda só JSON: {"category_id": "...", "counterparty_name": "..."|null, "confidence": 0-1, "reason": "..."}.',
      content: wrapData({ lancamento: { data: l.date, descricao: l.description, valor: Number(l.amount), tipo: kind }, categorias: cats.map((c) => ({ id: c.id, nome: c.parent ? `${c.parent} › ${c.name}` : c.name })) }),
      maxTokens: 300,
    });
    const j = firstJson(text) || {};
    const cat = cats.find((c) => c.id === j.category_id) || null;
    return { category_id: cat?.id || null, category_name: cat ? (cat.parent ? `${cat.parent} › ${cat.name}` : cat.name) : null,
      counterparty_name: typeof j.counterparty_name === 'string' ? j.counterparty_name.slice(0, 120) : null,
      confidence: Math.max(0, Math.min(1, Number(j.confidence) || 0)), reason: typeof j.reason === 'string' ? j.reason.slice(0, 300) : null };
  });
  res.json(out);
});
