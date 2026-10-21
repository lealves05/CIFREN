// Integração da Fase B: perfis novos, aprovações, conciliação, recorrências, relatórios, exportações, documentos,
// compras, reembolsos, IA (com Anthropic falsa), notificações, integrações LORLER, segurança e isolamento (RLS).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { boot, client, signup, PASS } from './helpers.js';
import { crc16 } from '../src/parsers.js';

let env; let A; let B; let fakeAi; const ctx = {}; const aiCalls = [];
const d = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const b64 = (s) => Buffer.from(s).toString('base64');

before(async () => {
  // Anthropic falsa: devolve JSON conforme o agente
  fakeAi = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
      const j = JSON.parse(body); aiCalls.push(j);
      const sys = j.system || '';
      let text = 'Seu caixa hoje é R$ 1.000,00.';
      if (sys.includes('Agente de Documentos')) text = 'Aqui está: {"doc_type":"recibo","supplier_name":"Papelaria Lápis","total":"89,90","issue_date":"2026-10-01","due_dates":[],"confidence":0.9}';
      if (sys.includes('Agente de Conciliação')) text = '{"category_name":"Taxas bancárias","counterparty_name":"Banco X","confidence":0.8,"reason":"tarifa"}';
      if (sys.includes('Agente de Insights')) text = '{"items":[{"level":"atencao","title":"Contas a pagar concentradas","detail":"Teste"}]}';
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 5 } }));
    });
  }).listen(0, '127.0.0.1');
  await new Promise((ok) => fakeAi.once('listening', ok));
  process.env.ANTHROPIC_URL = `http://127.0.0.1:${fakeAi.address().port}/v1/messages`;
  env = await boot(); A = await signup(env.base, 'fa'); B = await signup(env.base, 'fb');
  const me = (await A.get('/api/auth/me')).data; ctx.company = me.companies[0].id; ctx.me = me;
  const cats = (await A.get('/api/categories')).data.items;
  ctx.cats = cats; ctx.catAluguel = cats.find((c) => c.name === 'Aluguel').id; ctx.catEnergia = cats.find((c) => c.name === 'Energia elétrica')?.id || ctx.catAluguel;
  ctx.catVendas = cats.find((c) => c.name === 'Vendas de produtos').id;
  ctx.acc = (await A.post('/api/accounts', { company_id: ctx.company, name: 'Banco X', type: 'banco', opening_balance: 5000, opening_date: '2026-01-01' })).data.id;
  ctx.forn = (await A.post('/api/counterparties', { kind: 'fornecedor', name: 'CPFL', document: '33.050.196/0001-88', email: 'contas@cpfl.com', phone: '(19) 99876-5432' })).data.id;
});
after(async () => { await env.close(); fakeAi.close(); });

async function invite(role, email) {
  const r = await A.post('/api/users', { name: `Pessoa ${role}`, email, role_key: role });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const U = client(env.base);
  assert.equal((await U.post('/api/auth/login', { email, password: r.data.temporary_password })).status, 200);
  assert.equal((await U.put('/api/auth/password', { current_password: r.data.temporary_password, new_password: PASS })).status, 200);
  return U;
}

test('perfis novos e permissões da Fase B; categorias com grupo da DRE', async () => {
  for (const p of ['aprovacoes.aprovar', 'conciliacao.importar', 'compras.solicitar', 'ia.configurar', 'integracoes.gerenciar', 'seguranca.configurar']) assert.ok(ctx.me.permissions.includes(p), p);
  const roles = (await A.get('/api/roles')).data;
  const keys = (roles.items || roles.roles || []).map((r) => r.key);
  for (const k of ['administrador', 'gestor', 'financeiro', 'aprovador', 'colaborador', 'contador']) assert.ok(keys.includes(k), k);
  assert.equal(ctx.cats.find((c) => c.name === 'Vendas de produtos').dre_group, 'receita_bruta');
  assert.equal(ctx.cats.find((c) => c.name === 'Aluguel').dre_group, 'despesas_operacionais');
  const r = await A.put(`/api/categories/${ctx.catAluguel}`, { dre_group: 'custos' });
  assert.equal(r.status, 200); assert.equal(r.data.dre_group, 'custos');
  assert.equal((await A.put(`/api/categories/${ctx.catAluguel}`, { dre_group: 'lucro_bruto' })).status, 400, 'subtotal não é grupo');
  await A.put(`/api/categories/${ctx.catAluguel}`, { dre_group: 'despesas_operacionais' });
});

test('dados sensíveis mascarados para quem não tem a permissão', async () => {
  const U = await invite('auditor', 'auditor@exemplo.com');
  const cp = (await U.get('/api/counterparties')).data.items.find((x) => x.id === ctx.forn);
  assert.equal(cp.masked, true); assert.ok(cp.document.includes('*')); assert.ok(!cp.email.startsWith('contas')); assert.ok(cp.phone.endsWith('5432'));
  const full = (await A.get('/api/counterparties')).data.items.find((x) => x.id === ctx.forn);
  assert.equal(full.document, '33.050.196/0001-88');
});

test('aprovações: alçada, quem pede não aprova, baixa só depois de aprovado, aviso ao aprovador', async () => {
  assert.equal((await A.post('/api/approval-rules', { entity: 'title', min_amount: 500 })).status, 201);
  const t = await A.post('/api/titles', { kind: 'pagar', company_id: ctx.company, description: 'Reforma', due_date: d(5), amount: 800, counterparty_id: ctx.forn, category_id: ctx.catAluguel });
  assert.equal(t.status, 201); ctx.reforma = t.data.ids[0];
  assert.equal((await A.get(`/api/titles/${ctx.reforma}`)).data.approval_status, 'pendente');
  const s = await A.post(`/api/titles/${ctx.reforma}/settle`, { account_id: ctx.acc, paid_at: d(0), amount: 800 });
  assert.equal(s.status, 409); assert.equal(s.data.code, 'APPROVAL_REQUIRED');
  const pend = (await A.get('/api/approvals?status=pendente')).data.items;
  assert.equal(pend.length, 1); assert.equal(pend[0].can_decide, false);
  assert.equal((await A.post(`/api/approvals/${pend[0].id}/approve`, {})).status, 403);
  const Ap = await invite('aprovador', 'aprova@exemplo.com'); ctx.Ap = Ap;
  const notes = (await Ap.get('/api/notifications?unread=1')).data;
  assert.ok(notes.unread >= 0);
  const mine = (await Ap.get('/api/approvals?status=pendente')).data.items;
  assert.equal(mine[0].can_decide, true);
  assert.equal((await Ap.post(`/api/approvals/${mine[0].id}/reject`, {})).status, 400, 'reprovar exige motivo');
  assert.equal((await Ap.post(`/api/approvals/${mine[0].id}/approve`, { note: 'ok' })).status, 200);
  assert.equal((await A.get(`/api/titles/${ctx.reforma}`)).data.approval_status, 'aprovado');
  assert.equal((await A.post(`/api/titles/${ctx.reforma}/settle`, { account_id: ctx.acc, paid_at: d(0), amount: 800 })).status, 200);
  const dash = (await A.get('/api/dashboard')).data;
  assert.equal(dash.pending_approvals, 0); assert.ok(Array.isArray(dash.insights));
  // quem pediu é avisado da decisão
  const n2 = (await A.get('/api/notifications')).data.items;
  assert.ok(n2.some((n) => n.title === 'Pedido aprovado'));
  // novo pedido: o aprovador (já cadastrado) recebe o aviso no sino
  await A.post('/api/titles', { kind: 'pagar', company_id: ctx.company, description: 'Compra grande', due_date: d(9), amount: 900 });
  assert.ok((await Ap.get('/api/notifications?unread=1')).data.items.some((n) => n.title === 'Aprovação pendente'));
});

test('conciliação: importa OFX, sugere, concilia, desfaz, recusa arquivo repetido', async () => {
  const t = await A.post('/api/titles', { kind: 'pagar', company_id: ctx.company, description: 'Energia loja', due_date: d(-2), amount: 312.45, counterparty_id: ctx.forn, category_id: ctx.catEnergia });
  ctx.energia = t.data.ids[0];
  const ofx = `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${d(-1).replace(/-/g, '')}120000<TRNAMT>-312.45<FITID>A1<MEMO>PIX CPFL</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${d(-1).replace(/-/g, '')}120000<TRNAMT>-12.90<FITID>A2<MEMO>TARIFA PACOTE</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>${d(-1).replace(/-/g, '')}120000<TRNAMT>1500.00<FITID>A3<MEMO>TED CLIENTE</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const imp = await A.post('/api/reconciliation/imports', { account_id: ctx.acc, filename: 'extrato.ofx', content_base64: b64(ofx) });
  assert.equal(imp.status, 201, JSON.stringify(imp.data)); assert.equal(imp.data.lines, 3);
  const again = await A.post('/api/reconciliation/imports', { account_id: ctx.acc, filename: 'extrato.ofx', content_base64: b64(ofx) });
  assert.equal(again.status, 409);
  const lines = (await A.get(`/api/reconciliation/lines?account_id=${ctx.acc}&status=pendente`)).data.items;
  assert.equal(lines.length, 3);
  const l1 = lines.find((l) => l.amount === -312.45);
  assert.equal(l1.suggestions[0].title_id, ctx.energia);
  const m = await A.post(`/api/reconciliation/lines/${l1.id}/match`, { title_id: ctx.energia });
  assert.equal(m.status, 200, JSON.stringify(m.data));
  assert.equal((await A.get(`/api/titles/${ctx.energia}`)).data.status, 'pago');
  assert.equal((await A.post(`/api/reconciliation/lines/${l1.id}/undo`, {})).status, 200);
  assert.equal((await A.get(`/api/titles/${ctx.energia}`)).data.status, 'aberto');
  const auto = await A.post('/api/reconciliation/auto', { account_id: ctx.acc });
  assert.equal(auto.status, 200); assert.ok(auto.data.matched >= 1);
  const tarifa = lines.find((l) => l.amount === -12.9);
  const tax = ctx.cats.find((c) => c.name === 'Taxas bancárias');
  const cr = await A.post(`/api/reconciliation/lines/${tarifa.id}/create`, { description: 'Tarifa bancária', category_id: tax?.id });
  assert.equal(cr.status, 200, JSON.stringify(cr.data));
  // IA desligada
  const ai = await A.post(`/api/reconciliation/lines/${lines.find((l) => l.amount === 1500).id}/ai-suggest`, {});
  assert.equal(ai.status, 409); assert.equal(ai.data.code, 'AI_NOT_CONFIGURED');
});

test('recorrências: previsão, valor real e diferença', async () => {
  const r = await A.post('/api/recurring', { kind: 'pagar', name: 'Energia — loja', company_id: ctx.company, counterparty_id: ctx.forn, category_id: ctx.catEnergia,
    frequency: 'mensal', due_day: 10, start_date: d(-60), method: 'fixo', estimated_amount: 300, tolerance_pct: 10, lead_days: 10 });
  assert.equal(r.status, 201, JSON.stringify(r.data)); ctx.rec = r.data.id;
  const list = (await A.get('/api/recurring')).data.items;
  assert.equal(list.length, 1); assert.ok(list[0].next_due);
  const occ = (await A.get(`/api/recurring/${ctx.rec}/occurrences`)).data.items;
  assert.ok(occ.length >= 12);
  const o = occ.find((x) => x.status !== 'real');
  const act = await A.post(`/api/recurring/occurrences/${o.id}/actual`, { amount: 360 });
  assert.equal(act.status, 200, JSON.stringify(act.data));
  const o2 = (await A.get(`/api/recurring/${ctx.rec}/occurrences`)).data.items.find((x) => x.id === o.id);
  assert.equal(o2.actual_amount, 360); assert.equal(o2.diff_pct, 20);
  assert.ok((await A.get('/api/recurring/templates')).data.length >= 5);
  assert.equal((await A.get(`/api/recurring/report?year=${d(0).slice(0, 4)}`)).status, 200);
});

test('relatórios: fluxo de caixa, DRE, centros de custo, aging', async () => {
  const y = d(0).slice(0, 4);
  const cf = (await A.get(`/api/reports/cashflow?from=${y}-01&to=${y}-12`)).data;
  assert.equal(cf.months.length, 12); assert.equal(cf.opening_balance, 5000);
  const dre = (await A.get(`/api/reports/dre?year=${y}&basis=caixa`)).data;
  const keys = dre.rows.map((r) => r.key);
  for (const k of ['receita_bruta', 'receita_liquida', 'lucro_bruto', 'resultado_operacional', 'resultado_liquido']) assert.ok(keys.includes(k), k);
  assert.ok(dre.premises.length);
  const op = dre.rows.find((r) => r.key === 'despesas_operacionais');
  assert.ok(op.total < 0 || op.total > 0);
  assert.equal((await A.get('/api/reports/cost-centers')).status, 200);
  const ag = (await A.get('/api/reports/aging?kind=pagar')).data;
  assert.equal(ag.buckets.length, 5);
});

test('exportações: CSV com BOM e proteção contra fórmula, XLSX, contábil só com permissão', async () => {
  await A.post('/api/titles', { kind: 'receber', company_id: ctx.company, description: '=HYPERLINK("x")', due_date: d(3), amount: 10, category_id: ctx.catVendas });
  const r = await fetch(`${env.base}/api/export/titles.csv`, { headers: { cookie: A.cookie } });
  assert.equal(r.status, 200);
  const buf = Buffer.from(await r.arrayBuffer());
  assert.equal(buf.subarray(0, 3).toString('hex'), 'efbbbf');
  assert.ok(buf.toString().includes("'=HYPERLINK"));
  const x = await fetch(`${env.base}/api/export/dre.xlsx`, { headers: { cookie: A.cookie } });
  assert.equal(x.status, 200); assert.match(x.headers.get('content-type'), /spreadsheetml/);
  assert.equal(Buffer.from(await x.arrayBuffer()).subarray(0, 2).toString(), 'PK');
  const c = await fetch(`${env.base}/api/export/contabil.csv?from=${d(-30)}&to=${d(0)}`, { headers: { cookie: A.cookie } });
  assert.equal(c.status, 200); assert.match(await c.text(), /Conta débito/);
  const ap = await fetch(`${env.base}/api/export/contabil.csv`, { headers: { cookie: ctx.Ap.cookie } });
  assert.equal(ap.status, 403);
});

const NFE = (key, total = '1500.00') => `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe${key}" versao="4.00"><ide><nNF>1234</nNF><serie>1</serie><dhEmi>2026-10-01T10:00:00-03:00</dhEmi></ide>
<emit><CNPJ>12345678000190</CNPJ><xNome>Distribuidora Alfa</xNome></emit><dest><CNPJ>11222333000144</CNPJ><xNome>Empresa fa</xNome></dest>
<det nItem="1"><prod><xProd>Parafuso</xProd><qCom>100</qCom><uCom>UN</uCom><vUnCom>15.00</vUnCom><vProd>1500.00</vProd></prod></det>
<total><ICMSTot><vProd>1500.00</vProd><vNF>${total}</vNF></ICMSTot></total>
<cobr><dup><nDup>001</nDup><dVenc>${d(20)}</dVenc><vDup>750.00</vDup></dup><dup><nDup>002</nDup><dVenc>${d(50)}</dVenc><vDup>750.00</vDup></dup></cobr></infNFe></NFe></nfeProc>`;
// linha digitável de boleto bancário válida (gerada com os mesmos dígitos verificadores dos bancos)
function boletoLine(amountCents, factor) {
  const mod10 = (n) => { let s = 0; let w = 2; for (let i = n.length - 1; i >= 0; i--) { let p = Number(n[i]) * w; if (p > 9) p = Math.floor(p / 10) + (p % 10); s += p; w = w === 2 ? 1 : 2; } return (10 - (s % 10)) % 10; };
  const mod11 = (n) => { let s = 0; let w = 2; for (let i = n.length - 1; i >= 0; i--) { s += Number(n[i]) * w; w = w === 9 ? 2 : w + 1; } const r = 11 - (s % 11); return r === 0 || r === 10 || r === 11 ? 1 : r; };
  const free = '1234567890123456789012345';
  const noDv = `3419${String(factor).padStart(4, '0')}${String(amountCents).padStart(10, '0')}${free}`;
  const dv = mod11(noDv); const bar = noDv.slice(0, 4) + dv + noDv.slice(4);
  const f1 = bar.slice(0, 4) + bar.slice(19, 24); const f2 = bar.slice(24, 34); const f3 = bar.slice(34, 44);
  return `${f1}${mod10(f1)}${f2}${mod10(f2)}${f3}${mod10(f3)}${dv}${bar.slice(5, 19)}`;
}

test('documentos: NF-e XML vira contas por duplicata, repetida é recusada; boleto e Pix por código; foto lida pela IA', async () => {
  const key = '35261012345678000190550010000012341000012345';
  const up = await A.post('/api/documents', { company_id: ctx.company, filename: 'nota.xml', mime: 'text/xml', content_base64: b64(NFE(key)) });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  assert.equal(up.data.kind, 'nfe'); assert.equal(up.data.status, 'processado'); assert.equal(up.data.extracted.due_dates.length, 2);
  assert.equal(up.data.extracted.supplier_name, 'Distribuidora Alfa');
  const ct = await A.post(`/api/documents/${up.data.id}/create-titles`, { kind: 'pagar', category_id: ctx.catAluguel });
  assert.equal(ct.status, 201, JSON.stringify(ct.data)); assert.equal(ct.data.ids.length, 2);
  const tt = (await A.get(`/api/titles/${ct.data.ids[0]}`)).data;
  assert.equal(tt.source, 'documento'); assert.equal(tt.documents[0].id, up.data.id);
  assert.equal(tt.approval_status, 'pendente', 'R$ 1.500 passa da alçada de R$ 500');
  const again = await A.post(`/api/documents/${up.data.id}/create-titles`, { kind: 'pagar' });
  assert.equal(again.status, 409); assert.equal(again.data.code, 'DUPLICATE');
  const up2 = await A.post('/api/documents', { company_id: ctx.company, filename: 'nota-de-novo.xml', mime: 'text/xml', content_base64: b64(NFE(key)) });
  assert.equal(up2.status, 201); assert.equal(up2.data.duplicate_of, up.data.id);
  assert.equal((await A.post(`/api/documents/${up2.data.id}/create-titles`, { kind: 'pagar' })).data.code, 'DUPLICATE');
  // XML com DOCTYPE é recusado (XXE)
  assert.equal((await A.post('/api/documents', { company_id: ctx.company, filename: 'x.xml', content_base64: b64('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><nfeProc>&a;</nfeProc>') })).status, 400);
  // formato não aceito
  assert.equal((await A.post('/api/documents', { company_id: ctx.company, filename: 'x.exe', content_base64: b64('MZ\x90\x00binario') })).status, 415);
  // boleto
  const line = boletoLine(25990, 1000 + Math.round((Date.parse(d(10)) - Date.UTC(2025, 1, 22)) / 86400000));
  const bo = await A.post('/api/documents/code', { company_id: ctx.company, text: line });
  assert.equal(bo.status, 201, JSON.stringify(bo.data)); assert.equal(bo.data.kind, 'boleto'); assert.equal(bo.data.extracted.total, 259.9);
  assert.equal(bo.data.extracted.due_date, d(10)); assert.equal(bo.data.extracted.bank, '341');
  assert.equal((await A.post('/api/documents/code', { company_id: ctx.company, text: line.slice(0, -1) + ((Number(line.at(-1)) + 1) % 10) })).status, 400);
  // Pix
  let pix = '00020126360014br.gov.bcb.pix0114+5519999990000520400005303986540599.905802BR5913Loja Exemplo 6008Campinas62070503***6304';
  pix += crc16(pix);
  const px = await A.post('/api/documents/code', { company_id: ctx.company, text: pix });
  assert.equal(px.status, 201, JSON.stringify(px.data)); assert.equal(px.data.extracted.total, 99.9); assert.equal(px.data.extracted.pix_key, '+5519999990000');
  // foto: sem IA fica "recebido"; com IA (falsa) é extraída
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
  const ph = await A.post('/api/documents', { company_id: ctx.company, filename: 'recibo.png', mime: 'image/png', content_base64: png.toString('base64') });
  assert.equal(ph.status, 201); assert.equal(ph.data.status, 'recebido'); ctx.photo = ph.data.id;
  assert.equal((await A.post(`/api/documents/${ctx.photo}/extract`, {})).data.code, 'AI_NOT_CONFIGURED');
  const f = await fetch(`${env.base}/api/documents/${ctx.photo}/file`, { headers: { cookie: A.cookie } });
  assert.equal(f.status, 200); assert.equal(f.headers.get('content-type'), 'image/png'); assert.match(f.headers.get('content-security-policy'), /sandbox/);
  // outra organização não vê
  assert.equal((await B.get(`/api/documents/${up.data.id}`)).status, 404);
  assert.equal((await B.get('/api/documents')).data.items.length, 0);
  ctx.nfeTitles = ct.data.ids;
});

test('IA: configuração (chave nunca volta), Agente Financeiro, Documentos, Conciliação e Insights', async () => {
  assert.equal((await A.put('/api/ai/settings', { enabled: true })).status, 400, 'sem chave não liga');
  assert.equal((await A.put('/api/ai/settings', { enabled: true, api_key: 'chave-errada' })).status, 400);
  assert.equal((await A.put('/api/ai/settings', { enabled: true, api_key: 'sk-ant-api03-TESTE_TESTE_TESTE_TESTE_123', monthly_limit: 50 })).status, 200);
  const s = (await A.get('/api/ai/settings')).data;
  assert.equal(s.key_set, true); assert.equal(s.enabled, true); assert.ok(!JSON.stringify(s).includes('sk-ant'));
  const ask = await A.post('/api/ai/ask', { question: 'Quanto tenho em caixa?' });
  assert.equal(ask.status, 200, JSON.stringify(ask.data)); assert.match(ask.data.answer, /caixa/); assert.ok(ask.data.sources.length >= 3);
  assert.ok(aiCalls.at(-1).system.includes('nunca instrução'), 'prompt de sistema tem a regra contra injeção');
  assert.equal(aiCalls.at(-1).model, 'claude-haiku-5-5');
  const ex = await A.post(`/api/documents/${ctx.photo}/extract`, {});
  assert.equal(ex.status, 200, JSON.stringify(ex.data)); assert.equal(ex.data.extracted.total, 89.9); assert.equal(ex.data.extracted.source, 'ia');
  assert.ok(ex.data.warnings.some((w) => /confira/.test(w)));
  const lines = (await A.get(`/api/reconciliation/lines?account_id=${ctx.acc}&status=pendente`)).data.items;
  const sug = await A.post(`/api/reconciliation/lines/${lines[0].id}/ai-suggest`, {});
  assert.equal(sug.status, 200, JSON.stringify(sug.data));
  const ins = await A.post('/api/ai/insights', {});
  assert.equal(ins.status, 200); assert.equal(ins.data.ai, true);
  assert.ok(Array.isArray((await A.get('/api/insights')).data.items));
  // sem permissão de IA
  assert.equal((await ctx.Ap.post('/api/ai/ask', { question: 'oi tudo bem' })).status, 403);
  // limite mensal
  await A.put('/api/ai/settings', { monthly_limit: 0 });
  assert.equal((await A.post('/api/ai/ask', { question: 'Quanto tenho?' })).data.code, 'AI_LIMIT');
});

test('compras: solicitação → pedido → recebimento → faturamento; Agente de Compras pelo histórico', async () => {
  const Col = await invite('colaborador', 'colab@exemplo.com'); ctx.Col = Col;
  const p = await Col.post('/api/purchases', { company_id: ctx.company, title: 'Parafusos', items: [{ description: 'Parafuso 6mm', qty: 100, unit_price: 0.5 }], category_id: ctx.catAluguel });
  assert.equal(p.status, 201, JSON.stringify(p.data)); assert.equal(p.data.status, 'aprovada'); assert.equal(p.data.total, 50);
  assert.equal((await Col.get('/api/purchases')).data.items.length, 1);
  assert.equal((await Col.post(`/api/purchases/${p.data.id}/order`, { supplier_id: ctx.forn })).status, 403);
  assert.equal((await A.post(`/api/purchases/${p.data.id}/order`, { supplier_id: ctx.forn, expected_at: d(5) })).data.status, 'pedido');
  assert.equal((await A.post(`/api/purchases/${p.data.id}/receive`, {})).data.status, 'recebida');
  const inv = await A.post(`/api/purchases/${p.data.id}/invoice`, { due_date: d(30), installments: 2 });
  assert.equal(inv.status, 200, JSON.stringify(inv.data)); assert.equal(inv.data.status, 'faturada'); assert.equal(inv.data.title_ids.length, 2);
  // alçada de compras: acima de 1000 vai para aprovação
  await A.post('/api/approval-rules', { entity: 'purchase', min_amount: 1000 });
  const big = await Col.post('/api/purchases', { company_id: ctx.company, title: 'Notebook', items: [{ description: 'Notebook', qty: 1, unit_price: 4500 }] });
  assert.equal(big.data.status, 'solicitada');
  assert.equal((await A.post(`/api/purchases/${big.data.id}/order`, { supplier_id: ctx.forn })).status, 409);
  const sug = await A.get(`/api/purchases/${big.data.id}/supplier-suggestions`);
  assert.equal(sug.status, 200);
  const sug2 = (await A.get(`/api/purchases/${p.data.id}/supplier-suggestions`)).data.items;
  assert.equal(sug2[0].supplier.id, ctx.forn);
});

test('despesas e reembolsos: rascunho → envio → aprovação por outra pessoa → pagamento', async () => {
  const Col = ctx.Col;
  const e = await Col.post('/api/expenses', { company_id: ctx.company, title: 'Viagem cliente', items: [{ date: d(-3), description: 'Uber', amount: 45.5 }, { date: d(-3), description: 'Almoço', amount: 60 }] });
  assert.equal(e.status, 201, JSON.stringify(e.data)); assert.equal(e.data.total, 105.5); assert.equal(e.data.status, 'rascunho');
  assert.equal((await A.get('/api/expenses')).data.items.length, 0, 'rascunho é só do dono dele');
  assert.equal((await Col.post(`/api/expenses/${e.data.id}/submit`, {})).data.status, 'enviada');
  assert.equal((await Col.post(`/api/expenses/${e.data.id}/pay`, { account_id: ctx.acc, paid_at: d(0) })).status, 403);
  const ap = (await ctx.Ap.get('/api/approvals?status=pendente&entity=expense')).data.items[0];
  assert.ok(ap);
  assert.equal((await ctx.Ap.post(`/api/approvals/${ap.id}/approve`, {})).status, 200);
  const pay = await A.post(`/api/expenses/${e.data.id}/pay`, { account_id: ctx.acc, paid_at: d(0) });
  assert.equal(pay.status, 200, JSON.stringify(pay.data)); assert.equal(pay.data.status, 'paga');
  const t = (await A.get(`/api/titles/${pay.data.title_id}`)).data;
  assert.equal(t.status, 'pago'); assert.equal(t.source, 'reembolso');
  const n = (await Col.get('/api/notifications')).data.items;
  assert.ok(n.some((x) => x.title === 'Reembolso pago'));
  assert.equal((await Col.post('/api/notifications/read-all', {})).status, 200);
  assert.equal((await Col.get('/api/notifications?unread=1')).data.unread, 0);
});

test('integrações LORLER: chave mostrada uma vez, movimentos idempotentes, indicadores, revogação', async () => {
  const k = await A.post('/api/integrations', { system: 'torven', name: 'Oficina' });
  assert.equal(k.status, 201); assert.match(k.data.key, /^ck_torven_/);
  const list = (await A.get('/api/integrations')).data;
  assert.ok(!JSON.stringify(list).includes(k.data.key)); assert.match(list.endpoint, /\/api\/integrations\/lorler\/v1$/);
  const H = { authorization: `Bearer ${k.data.key}`, 'content-type': 'application/json' };
  const body = { items: [{ external_id: 'OS-100', kind: 'receber', description: 'OS 100 — troca de óleo', amount: 250, due_date: d(7), counterparty: { name: 'Maria Cliente' }, category_name: 'Vendas de produtos' },
    { external_id: 'OS-101', kind: 'receber', description: 'OS 101', amount: 90, due_date: d(0), paid: { paid_at: d(0) } }] };
  const post = (b, h = H) => fetch(`${env.base}/api/integrations/lorler/v1/movements`, { method: 'POST', headers: h, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, data: await r.json() }));
  let r = await post(body);
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.created, 2);
  r = await post(body);
  assert.equal(r.data.created, 0); assert.equal(r.data.unchanged, 2);
  r = await post({ items: [{ ...body.items[0], amount: 280 }] });
  assert.equal(r.data.updated, 1);
  const titles = (await A.get('/api/titles?kind=receber&status=todos')).data.items.filter((t) => t.source === 'torven');
  assert.equal(titles.length, 2); assert.ok(titles.some((t) => t.status === 'pago'));
  const ind = await fetch(`${env.base}/api/integrations/lorler/v1/indicators`, { headers: H }).then((x) => x.json());
  assert.equal(typeof ind.cash_balance, 'number'); assert.ok(ind.receivable.total >= 280);
  assert.equal((await post(body, { 'content-type': 'application/json' })).status, 401);
  // a chave de uma organização nunca grava em outra
  const kb = (await B.post('/api/integrations', { system: 'orbi', name: 'x' })).data.key;
  await post({ items: [{ external_id: 'X1', kind: 'pagar', description: 'B', amount: 1, due_date: d(1) }] }, { authorization: `Bearer ${kb}`, 'content-type': 'application/json' });
  assert.equal((await A.get('/api/titles?kind=pagar&status=todos')).data.items.filter((t) => t.description === 'B').length, 0);
  assert.equal((await A.del(`/api/integrations/${k.data.id}`)).status, 200);
  assert.equal((await post(body)).status, 401);
});

test('segurança: exigir 2 etapas bloqueia quem não ligou (403 MFA_SETUP_REQUIRED)', async () => {
  const r = await B.put('/api/security', { require_mfa: true });
  assert.equal(r.status, 409, 'o próprio dono precisa ter 2 etapas antes');
  const { pool } = env;
  const org = (await B.get('/api/auth/me')).data;
  await pool.query('update organizations set require_mfa=true where id=$1', [org.org.id]);
  const blocked = await B.get('/api/titles');
  assert.equal(blocked.status, 403); assert.equal(blocked.data.code, 'MFA_SETUP_REQUIRED');
  assert.equal((await B.get('/api/auth/me')).status, 200, 'a conta continua acessível para ligar as 2 etapas');
  await pool.query('update organizations set require_mfa=false where id=$1', [org.org.id]);
  assert.equal((await B.get('/api/titles')).status, 200);
});

test('rotina em segundo plano: recorrências e avisos de vencimento sem erro', async () => {
  const { tick } = await import('../src/lib/scheduler.js');
  await tick();
  const n = (await A.get('/api/notifications')).data.items;
  assert.ok(n.some((x) => x.kind === 'vencimento' || x.kind === 'vencido'));
});

test('auditoria continua íntegra depois de tudo', async () => {
  const r = await A.get('/api/audit/verify');
  if (r.status !== 404) assert.equal(r.data.ok, true, JSON.stringify(r.data));
});
