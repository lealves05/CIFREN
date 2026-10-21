// Associados e mensalidades: cadastro, geração mensal, atraso, avisos (e-mail por SMTP falso, WhatsApp por API falsa), link do WhatsApp,
// pagamento, relatório (JSON/CSV/XLSX), encerrar, excluir e isolamento entre organizações.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { boot, client, signup, PASS } from './helpers.js';

let env; let A; let B; let smtp; let wa; const mails = []; const waMsgs = []; const ctx = {};
const d = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const month = (k) => { const t = new Date(); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + k, 1)).toISOString().slice(0, 7); };

before(async () => {
  smtp = net.createServer((s) => {
    let data = false; let buf = '';
    s.write('220 teste ESMTP\r\n');
    s.on('data', (c) => {
      buf += c.toString();
      if (data) { if (buf.includes('\r\n.\r\n')) { mails.push(buf); buf = ''; data = false; s.write('250 OK\r\n'); } return; }
      let i; while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (/^EHLO|^HELO/i.test(line)) s.write('250-teste\r\n250 OK\r\n');
        else if (/^DATA/i.test(line)) { data = true; s.write('354 vai\r\n'); }
        else if (/^QUIT/i.test(line)) { s.write('221 tchau\r\n'); s.end(); }
        else s.write('250 OK\r\n');
      }
    });
  }).listen(0, '127.0.0.1');
  wa = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { waMsgs.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(b) }); res.setHeader('content-type', 'application/json'); res.end('{"messages":[{"id":"wamid.1"}]}'); }); }).listen(0, '127.0.0.1');
  await Promise.all([new Promise((ok) => smtp.once('listening', ok)), new Promise((ok) => wa.once('listening', ok))]);
  process.env.WHATSAPP_API_URL = `http://127.0.0.1:${wa.address().port}/v21.0`;
  env = await boot(); A = await signup(env.base, 'as1'); B = await signup(env.base, 'as2');
  const me = (await A.get('/api/auth/me')).data; ctx.company = me.companies[0].id;
  ctx.acc = (await A.post('/api/accounts', { company_id: ctx.company, name: 'Banco', type: 'banco', opening_balance: 0, opening_date: '2025-01-01' })).data.id;
});
after(async () => { await env.close(); smtp.close(); wa.close(); });

test('cadastro do associado gera as mensalidades (atrasadas e a do mês) como contas a receber', async () => {
  assert.ok((await A.get('/api/auth/me')).data.permissions.includes('associados.gerenciar'));
  const bad = await A.post('/api/members', { company_id: ctx.company, name: 'X', monthly_fee: 50, start_month: month(0), whatsapp: '123' });
  assert.equal(bad.status, 400);
  const r = await A.post('/api/members', { company_id: ctx.company, name: 'João da Silva', email: 'joao@exemplo.com', whatsapp: '(19) 99876-5432', monthly_fee: 120,
    due_day: 5, start_month: month(-2) });
  assert.equal(r.status, 201, JSON.stringify(r.data)); ctx.joao = r.data.id;
  assert.equal(r.data.whatsapp, '5519998765432'); assert.ok(r.data.generated >= 3);
  const det = (await A.get(`/api/members/${ctx.joao}`)).data;
  assert.ok(det.fees.filter((f) => f.overdue).length >= 2);
  const rec = (await A.get('/api/titles?kind=receber&status=todos')).data.items.filter((t) => t.source === 'mensalidade');
  assert.equal(rec.length, det.fees.length);
  assert.equal(rec[0].category.name, 'Mensalidades');
  // gerar de novo não duplica
  assert.equal((await A.post(`/api/members/${ctx.joao}/generate`, {})).data.generated, 0);
  ctx.maria = (await A.post('/api/members', { company_id: ctx.company, name: 'Maria Souza', monthly_fee: 80, due_day: 31, start_month: month(0), notify_whatsapp: false })).data.id;
  const list = (await A.get('/api/members')).data;
  assert.equal(list.items.length, 2); assert.ok(list.totals.overdue_members >= 1); assert.equal(list.totals.monthly_expected, 200);
  assert.equal(list.items.find((m) => m.id === ctx.joao).overdue.count >= 2, true);
  assert.equal((await A.get('/api/members?situacao=atraso')).data.items.length, 1);
});

test('relatório de atrasados: JSON, CSV e XLSX', async () => {
  const r = (await A.get('/api/members/overdue')).data;
  assert.equal(r.items.length, 1); assert.equal(r.items[0].member.name, 'João da Silva'); assert.ok(r.items[0].days > 0); assert.equal(r.items[0].has_contact, true);
  const csv = await fetch(`${env.base}/api/members/overdue.csv`, { headers: { cookie: A.cookie } });
  assert.equal(csv.status, 200); assert.match(await csv.text(), /João da Silva/);
  const x = await fetch(`${env.base}/api/members/overdue.xlsx`, { headers: { cookie: A.cookie } });
  assert.equal(Buffer.from(await x.arrayBuffer()).subarray(0, 2).toString(), 'PK');
});

test('cobrança manual: link do WhatsApp sempre; e-mail e WhatsApp oficial só configurados', async () => {
  const l = await A.post(`/api/members/${ctx.joao}/whatsapp-link`, {});
  assert.equal(l.status, 200); assert.match(l.data.url, /^https:\/\/wa\.me\/5519998765432\?text=/); assert.match(l.data.text, /João/); assert.match(l.data.text, /mensalidades/);
  assert.equal((await A.post(`/api/members/${ctx.joao}/remind`, { channel: 'email' })).data.code, 'EMAIL_NOT_CONFIGURED');
  assert.equal((await A.post(`/api/members/${ctx.joao}/remind`, { channel: 'whatsapp' })).data.code, 'WHATSAPP_NOT_CONFIGURED');
  assert.equal((await A.post(`/api/members/${ctx.maria}/whatsapp-link`, {})).status, 409, 'sem WhatsApp cadastrado');
  // configura e-mail e WhatsApp oficial
  assert.equal((await A.put('/api/notifications/email-settings', { host: '127.0.0.1', port: smtp.address().port, user: '', from: 'cobranca@exemplo.com', secure: false })).status, 200);
  const cfg = await A.put('/api/members/settings', { wa_enabled: true, wa_phone_number_id: '123456789', wa_token: 'EAAteste', wa_template: 'cobranca_mensalidade', pix_key: 'pix@exemplo.com' });
  assert.equal(cfg.status, 200, JSON.stringify(cfg.data));
  const s = (await A.get('/api/members/settings')).data;
  assert.equal(s.wa_ready, true); assert.equal(s.wa_token_set, true); assert.ok(!JSON.stringify(s).includes('EAAteste'));
  assert.equal((await A.put('/api/members/settings', { wa_template: 'Nome Inválido' })).status, 400);
  assert.equal((await A.post(`/api/members/${ctx.joao}/remind`, { channel: 'email' })).status, 200);
  assert.ok(mails.at(-1).includes('joao@exemplo.com') && /pix@exemplo\.com/.test(mails.at(-1)));
  assert.equal((await A.post(`/api/members/${ctx.joao}/remind`, { channel: 'whatsapp' })).status, 200);
  const m = waMsgs.at(-1);
  assert.equal(m.url, '/v21.0/123456789/messages'); assert.equal(m.auth, 'Bearer EAAteste'); assert.equal(m.body.to, '5519998765432');
  assert.equal(m.body.template.name, 'cobranca_mensalidade'); assert.equal(m.body.template.components[0].parameters[0].text, 'João');
  const det = (await A.get(`/api/members/${ctx.joao}`)).data;
  assert.ok(det.reminders.length >= 3);
});

test('rotina: avisos automáticos de atraso uma vez por etapa, e relatório semanal por e-mail', async () => {
  const { tick } = await import('../src/lib/scheduler.js');
  const { orgTx } = await import('../src/db.js');
  const { runMembers, weeklyReport } = await import('../src/lib/members.js');
  const org = (await A.get('/api/auth/me')).data.org.id;
  const m0 = mails.length; const w0 = waMsgs.length;
  await orgTx(org, (db) => runMembers(db, { hour: 10 }));
  assert.equal(mails.length, m0 + 1, 'um e-mail de atraso'); assert.equal(waMsgs.length, w0 + 1, 'um WhatsApp de atraso');
  await orgTx(org, (db) => runMembers(db, { hour: 10 }));
  assert.equal(mails.length, m0 + 1, 'não repete a mesma etapa'); assert.equal(waMsgs.length, w0 + 1);
  await orgTx(org, (db) => runMembers(db, { hour: 23 }));
  assert.equal(mails.length, m0 + 1, 'fora do horário não envia');
  const sent = await orgTx(org, (db) => weeklyReport(db, { force: true, orgName: 'Teste' }));
  assert.equal(sent, 1); assert.match(mails.at(-1), /mensalidades em atraso/i);
  assert.equal((await A.post('/api/members/overdue/send-report', {})).status, 200);
  await tick();
});

test('pagamento da mensalidade tira o associado do atraso', async () => {
  const det = (await A.get(`/api/members/${ctx.joao}`)).data;
  for (const f of det.fees.filter((x) => x.overdue)) {
    const r = await A.post(`/api/members/fees/${f.id}/pay`, { account_id: ctx.acc, paid_at: d(0) });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.status, 'pago');
  }
  assert.equal((await A.get('/api/members/overdue')).data.items.length, 0);
  const l = (await A.get('/api/members')).data.items.find((m) => m.id === ctx.joao);
  assert.equal(l.overdue.count, 0); assert.ok(l.last_payment);
});

test('alterar valor (aplicando nas em aberto), encerrar, excluir cadastro errado e isolamento', async () => {
  const u = await A.put(`/api/members/${ctx.maria}`, { monthly_fee: 95, apply_to_open: true, whatsapp: '19 98888-7777' });
  assert.equal(u.status, 200, JSON.stringify(u.data));
  const fees = (await A.get(`/api/members/${ctx.maria}`)).data.fees;
  // novo valor só a partir do próximo mês: o mês atual continua 80
  assert.ok(fees.filter((f) => f.month <= month(0)).every((f) => f.amount === 80));
  assert.ok(fees.filter((f) => f.month > month(0)).every((f) => f.amount === 95));
  assert.ok(fees.every((f) => /-(28|29|30|31)$/.test(f.due_date)), 'dia 31 vira o último dia do mês');
  assert.equal((await A.del(`/api/members/${ctx.joao}`)).status, 409, 'já tem pagamento: encerrar em vez de excluir');
  const enc = await A.post(`/api/members/${ctx.joao}/status`, { status: 'encerrado' });
  assert.equal(enc.status, 200); assert.equal(enc.data.status, 'encerrado');
  assert.equal((await A.del(`/api/members/${ctx.maria}`)).status, 200);
  assert.equal((await A.get('/api/members?status=todos')).data.items.length, 1);
  assert.equal((await B.get(`/api/members/${ctx.joao}`)).status, 404);
  assert.equal((await B.get('/api/members')).data.items.length, 0);
  // perfil sem permissão
  const inv = await A.post('/api/users', { name: 'Col', email: 'col@as.com', role_key: 'colaborador' });
  const U = client(env.base);
  await U.post('/api/auth/login', { email: 'col@as.com', password: inv.data.temporary_password });
  await U.put('/api/auth/password', { current_password: inv.data.temporary_password, new_password: PASS });
  assert.equal((await U.get('/api/members')).status, 403);
});

test('tabela de valores: um valor para todos, novo valor só a partir do próximo mês, histórico e correção', async () => {
  const C = await signup(env.base, 'as3');
  const company = (await C.get('/api/auth/me')).data.companies[0].id;
  // sem tabela e sem valor especial: pede o valor primeiro
  const r0 = await C.post('/api/members', { company_id: company, name: 'Ana', start_month: month(-1), due_day: 10 });
  assert.equal(r0.status, 409); assert.equal(r0.data.code, 'FEE_NOT_SET');
  const f1 = await C.post('/api/members/fees', { amount: 100, effective_month: month(-1) });
  assert.equal(f1.status, 201, JSON.stringify(f1.data)); assert.equal(f1.data.current, 100);
  const ana = (await C.post('/api/members', { company_id: company, name: 'Ana', start_month: month(-1), due_day: 1 })).data;
  const bia = (await C.post('/api/members', { company_id: company, name: 'Bia', start_month: month(-1), due_day: 1, monthly_fee: 70 })).data;
  assert.equal(ana.monthly_fee, 100); assert.equal(ana.custom_fee, null); assert.equal(bia.monthly_fee, 70);
  // novo valor não pode valer para o mês atual nem para trás
  assert.equal((await C.post('/api/members/fees', { amount: 130, effective_month: month(0) })).status, 400);
  const f2 = await C.post('/api/members/fees', { amount: 130 });
  assert.equal(f2.status, 201); assert.equal(f2.data.items[0].effective_month, month(1)); assert.equal(f2.data.items[0].future, true);
  assert.equal(f2.data.items[1].until_month, month(1)); assert.equal(f2.data.current, 100);
  // gera o próximo mês "na mão" (a rotina gera 15 dias antes) e confere: meses anteriores mantêm 100; o próximo vem com 130; o especial não muda
  const { orgTx } = await import('../src/db.js'); const { generateFor } = await import('../src/lib/members.js');
  const org = (await C.get('/api/auth/me')).data.org.id;
  await orgTx(org, async (db) => {
    const m = await db.one('select * from members where id=$1', [ana.id]);
    await db.query(`insert into titles (org_id, company_id, kind, description, competence_date, due_date, amount, source, external_id, member_id)
      values ($1,$2,'receber','Mensalidade teste',$3,$3,100,'mensalidade',$4,$5) on conflict (org_id, source, external_id) where external_id is not null do nothing`, [org, m.company_id, `${month(1)}-01`, `m:${m.id}:${month(1)}`, m.id]);
    await generateFor(db, m);
  });
  const { recalcOpen } = await import('../src/lib/members.js');
  await orgTx(org, (db) => recalcOpen(db, `${month(1)}-01`));
  let fees = (await C.get(`/api/members/${ana.id}`)).data.fees;
  const byMonth = Object.fromEntries(fees.map((f) => [f.month, f.amount]));
  assert.equal(byMonth[month(-1)], 100); assert.equal(byMonth[month(0)], 100); assert.equal(byMonth[month(1)], 130);
  assert.ok((await C.get(`/api/members/${bia.id}`)).data.fees.every((f) => f.amount === 70));
  // correção do valor lançado: 130 → 125, recalcula a mensalidade em aberto
  const fix = await C.put(`/api/members/fees/${f2.data.items[0].id}`, { amount: 125 });
  assert.equal(fix.status, 200); assert.equal(fix.data.recalculated, 1);
  fees = (await C.get(`/api/members/${ana.id}`)).data.fees;
  assert.equal(fees.find((f) => f.month === month(1)).amount, 125);
  // excluir o valor futuro: volta para 100
  assert.equal((await C.del(`/api/members/fees/${f2.data.items[0].id}`)).status, 200);
  assert.equal((await C.get(`/api/members/${ana.id}`)).data.fees.find((f) => f.month === month(1)).amount, 100);
  assert.equal((await C.del(`/api/members/fees/${f1.data.items[0].id}`)).status, 409, 'o único valor não sai');
  // tirar o valor especial: a Bia passa a seguir a tabela a partir do próximo mês
  const u = await C.put(`/api/members/${bia.id}`, { monthly_fee: null });
  assert.equal(u.status, 200, JSON.stringify(u.data)); assert.equal(u.data.custom_fee, null); assert.equal(u.data.monthly_fee, 100);
  assert.equal((await C.get('/api/members/fees')).data.items.length, 1);
});
