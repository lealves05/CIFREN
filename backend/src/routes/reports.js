// Relatórios (fluxo de caixa, DRE, centros de custo, inadimplência) e exportações (CSV/XLSX; lançamentos para o contador).
import { Router } from 'express';
import ExcelJS from 'exceljs';
import { orgTx } from '../db.js';
import { HttpError, isUuid, today } from '../util.js';
import { need, assertCompany } from '../auth.js';
import { audit } from '../audit.js';
import { cashflow, dre, costCenters, aging } from '../lib/reports.js';
import { PAID } from './titles.js';

const ym = (v, def) => (/^\d{4}-\d{2}$/.test(String(v || '')) ? v : def);
const ymd = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
function scopeOf(req) {
  const companyId = isUuid(req.query.company_id) ? req.query.company_id : null;
  if (companyId) assertCompany(req, companyId);
  return companyId ? [companyId] : req.companyScope;
}
const yearDefault = () => today().slice(0, 4);

export const reports = Router();
reports.get('/cashflow', need('previsao.visualizar', 'relatorios.visualizar'), async (req, res) => {
  const y = yearDefault();
  res.json(await orgTx(req.orgId, (db) => cashflow(db, { from: ym(req.query.from, `${y}-01`), to: ym(req.query.to, `${y}-12`), scope: scopeOf(req) })));
});
reports.get('/dre', need('relatorios.dre'), async (req, res) => {
  const year = Number(req.query.year) || Number(yearDefault());
  res.json(await orgTx(req.orgId, (db) => dre(db, { year, basis: req.query.basis === 'caixa' ? 'caixa' : 'competencia', scope: scopeOf(req) })));
});
reports.get('/cost-centers', need('relatorios.visualizar'), async (req, res) => {
  const y = yearDefault();
  res.json(await orgTx(req.orgId, (db) => costCenters(db, { from: ym(req.query.from, `${y}-01`), to: ym(req.query.to, `${y}-12`), scope: scopeOf(req) })));
});
reports.get('/aging', need('relatorios.visualizar', 'financeiro.titulos.visualizar'), async (req, res) => {
  res.json(await orgTx(req.orgId, (db) => aging(db, { kind: req.query.kind === 'pagar' ? 'pagar' : 'receber', scope: scopeOf(req) })));
});

// ---------------- exportações ----------------
export const exportRoutes = Router();
const csvCell = (v) => { const s = v == null ? '' : String(v); const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
const num = (n) => (n == null ? '' : Number(n).toFixed(2).replace('.', ','));
function sendCsv(res, name, header, rows) {
  const body = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` }).send(body);
}
async function sendXlsx(res, name, sheets) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'CIFREN';
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    ws.addRow(s.header).font = { bold: true };
    for (const r of s.rows) ws.addRow(r.map((v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v)));
    ws.columns.forEach((c, i) => { c.width = Math.min(60, Math.max(10, ...[s.header[i], ...s.rows.map((r) => r[i])].map((v) => String(v ?? '').length + 2))); if (s.money?.includes(i)) c.numFmt = '#,##0.00'; });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const note of s.notes || []) ws.addRow([]).getCell(1).value = note;
  }
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${name}"` });
  res.send(Buffer.from(await wb.xlsx.writeBuffer()));
}
const audited = (req, what) => orgTx(req.orgId, (db) => audit(db, { actor: { id: req.user.id, name: req.user.name }, req, action: 'exportacao', entity: 'report', summary: `Exportou ${what}` }));

async function titleRows(req) {
  const scope = scopeOf(req); const p = [scope]; const w = ['($1::uuid[] is null or t.company_id = any($1::uuid[]))'];
  if (['pagar', 'receber'].includes(req.query.kind)) { p.push(req.query.kind); w.push(`t.kind=$${p.length}`); }
  if (ymd(req.query.from)) { p.push(req.query.from); w.push(`t.due_date >= $${p.length}`); }
  if (ymd(req.query.to)) { p.push(req.query.to); w.push(`t.due_date <= $${p.length}`); }
  if (['aberto', 'parcial', 'pago', 'cancelado'].includes(req.query.status)) { p.push(req.query.status); w.push(`t.status=$${p.length}`); }
  return orgTx(req.orgId, (db) => db.all(`select t.kind, co.name as company, t.description, cp.name as counterparty, c.name as category, cc.name as cost_center, t.document_number,
      t.issue_date, t.competence_date, t.due_date, t.amount, ${PAID} as paid, t.status, t.approval_status
    from titles t join companies co on co.id=t.company_id left join counterparties cp on cp.id=t.counterparty_id left join categories c on c.id=t.category_id
    left join cost_centers cc on cc.id=t.cost_center_id where ${w.join(' and ')} order by t.due_date, t.id limit 50000`, p));
}
const TH = ['Tipo', 'Empresa', 'Descrição', 'Fornecedor/cliente', 'Categoria', 'Centro de custo', 'Documento', 'Emissão', 'Competência', 'Vencimento', 'Valor', 'Pago', 'Situação', 'Aprovação'];
const tRow = (r) => [r.kind === 'pagar' ? 'A pagar' : 'A receber', r.company, r.description, r.counterparty, r.category, r.cost_center, r.document_number, r.issue_date, r.competence_date, r.due_date];

exportRoutes.get('/titles.csv', need('relatorios.visualizar'), async (req, res) => {
  const rows = await titleRows(req); await audited(req, 'contas (CSV)');
  sendCsv(res, 'cifren-contas.csv', TH, rows.map((r) => [...tRow(r), num(r.amount), num(r.paid), r.status, r.approval_status || '']));
});
exportRoutes.get('/titles.xlsx', need('relatorios.visualizar'), async (req, res) => {
  const rows = await titleRows(req); await audited(req, 'contas (XLSX)');
  await sendXlsx(res, 'cifren-contas.xlsx', [{ name: 'Contas', header: TH, money: [10, 11], rows: rows.map((r) => [...tRow(r), Number(r.amount), Number(r.paid), r.status, r.approval_status || '']) }]);
});
exportRoutes.get('/dre.xlsx', need('relatorios.dre'), async (req, res) => {
  const year = Number(req.query.year) || Number(yearDefault()); const basis = req.query.basis === 'caixa' ? 'caixa' : 'competencia';
  const r = await orgTx(req.orgId, (db) => dre(db, { year, basis, scope: scopeOf(req) })); await audited(req, `DRE ${year} (${basis})`);
  await sendXlsx(res, `cifren-dre-${year}.xlsx`, [{ name: `DRE ${year}`, header: ['Linha', ...r.months, 'Total'], money: Array.from({ length: 13 }, (_, i) => i + 1),
    rows: r.rows.map((x) => [x.type === 'category' ? `   ${x.label}` : x.label, ...x.values, x.total]), notes: r.premises }]);
});
exportRoutes.get('/cashflow.xlsx', need('previsao.visualizar', 'relatorios.visualizar'), async (req, res) => {
  const y = yearDefault();
  const r = await orgTx(req.orgId, (db) => cashflow(db, { from: ym(req.query.from, `${y}-01`), to: ym(req.query.to, `${y}-12`), scope: scopeOf(req) })); await audited(req, 'fluxo de caixa');
  await sendXlsx(res, 'cifren-fluxo-de-caixa.xlsx', [{ name: 'Fluxo de caixa', header: ['Mês', 'Entradas realizadas', 'Saídas realizadas', 'Entradas previstas', 'Saídas previstas', 'Saldo realizado', 'Saldo previsto'],
    money: [1, 2, 3, 4, 5, 6], rows: r.months.map((m) => [m.month, m.realized_in, m.realized_out, m.forecast_in, m.forecast_out, m.realized_balance, m.forecast_balance]), notes: [`Saldo de abertura: ${r.opening_balance.toFixed(2)}`, ...r.notes] }]);
});
/** Lançamentos para o contador (layout genérico de importação: data; débito; crédito; valor; histórico; documento). NÃO é SPED. */
exportRoutes.get('/contabil.csv', need('exportacao.contabil'), async (req, res) => {
  const from = ymd(req.query.from) || `${today().slice(0, 7)}-01`; const to = ymd(req.query.to) || today();
  if (to < from) throw new HttpError(400, 'Período inválido.');
  const scope = scopeOf(req);
  const rows = await orgTx(req.orgId, (db) => db.all(`select s.paid_at, t.kind, s.amount, s.interest, s.fine, s.discount, a.name as account, coalesce(pc.name || ' › ', '') || coalesce(c.name, 'Sem categoria') as category,
      t.description, cp.name as counterparty, t.document_number, co.name as company
    from settlements s join titles t on t.id=s.title_id join bank_accounts a on a.id=s.account_id join companies co on co.id=t.company_id
    left join categories c on c.id=t.category_id left join categories pc on pc.id=c.parent_id left join counterparties cp on cp.id=t.counterparty_id
    where s.reversed_at is null and s.paid_at between $2 and $3 and ($1::uuid[] is null or t.company_id = any($1::uuid[])) order by s.paid_at, s.created_at`, [scope, from, to]));
  const out = [];
  for (const r of rows) {
    const hist = `${r.description}${r.counterparty ? ` — ${r.counterparty}` : ''}`;
    const cash = Number(r.amount) + Number(r.interest) + Number(r.fine) - Number(r.discount);
    if (r.kind === 'pagar') out.push([r.paid_at, r.category, `Banco/Caixa: ${r.account}`, num(r.amount), hist, r.document_number, r.company]);
    else out.push([r.paid_at, `Banco/Caixa: ${r.account}`, r.category, num(r.amount), hist, r.document_number, r.company]);
    const jm = Number(r.interest) + Number(r.fine);
    if (jm) out.push(r.kind === 'pagar' ? [r.paid_at, 'Juros e multas pagos', `Banco/Caixa: ${r.account}`, num(jm), `Juros/multa — ${hist}`, r.document_number, r.company] : [r.paid_at, `Banco/Caixa: ${r.account}`, 'Juros e multas recebidos', num(jm), `Juros/multa — ${hist}`, r.document_number, r.company]);
    if (Number(r.discount)) out.push(r.kind === 'pagar' ? [r.paid_at, `Banco/Caixa: ${r.account}`, 'Descontos obtidos', num(r.discount), `Desconto — ${hist}`, r.document_number, r.company] : [r.paid_at, 'Descontos concedidos', `Banco/Caixa: ${r.account}`, num(r.discount), `Desconto — ${hist}`, r.document_number, r.company]);
    void cash;
  }
  await audited(req, `lançamentos para o contador ${from} a ${to}`);
  sendCsv(res, `cifren-contabil-${from}-a-${to}.csv`, ['Data', 'Conta débito', 'Conta crédito', 'Valor', 'Histórico', 'Documento', 'Empresa'], out);
});
