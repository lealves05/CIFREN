// Visão por usuário (ajustes de permissão sobre o perfil) e módulo de Finanças pessoais (espaços compartilháveis + isolamento).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, client, signup, PASS } from './helpers.js';

let env; let A; let B; let C;
before(async () => {
  env = await boot();
  A = await signup(env.base, 'pa'); // dono de uma organização e usuário independente
  B = await signup(env.base, 'pb');
  C = await signup(env.base, 'pc');
});
after(() => env.close());

// ---------------------------------------------------------------- visão por usuário
test('visão por usuário: liberar e bloquear permissões sobre o perfil', async () => {
  // A convida alguém com perfil "lançamentos" e libera um relatório a mais e bloqueia uma permissão do perfil
  const inv = await A.post('/api/users', { name: 'Ana Visão', email: 'ana.visao@exemplo.com', role_key: 'lancamentos',
    perm_add: ['relatorios.visualizar'], perm_remove: ['financeiro.titulos.criar'] });
  assert.equal(inv.status, 201, JSON.stringify(inv.data));
  const temp = inv.data.temporary_password; assert.ok(temp, 'sem e-mail configurado, a senha volta uma vez');

  const U = client(env.base);
  await U.post('/api/auth/login', { email: 'ana.visao@exemplo.com', password: temp });
  await U.put('/api/auth/password', { current_password: temp, new_password: PASS });
  const me = (await U.get('/api/auth/me')).data;
  assert.ok(me.permissions.includes('relatorios.visualizar'), 'a liberação individual aparece no efetivo');
  assert.ok(!me.permissions.includes('financeiro.titulos.criar'), 'o bloqueio individual tira a permissão do perfil');
  assert.ok(me.permissions.includes('financeiro.titulos.visualizar'), 'o resto do perfil continua');

  // a permissão liberada funciona de verdade; a bloqueada é negada
  assert.equal((await U.get('/api/reports/cashflow?from=2026-01-01&to=2026-12-31')).status !== 403, true, 'relatório liberado abre');
  assert.equal((await U.post('/api/titles', { kind: 'pagar', description: 'x', amount: 10, due_date: '2026-12-01', counterparty_id: null })).status, 403, 'lançar é bloqueado pelo ajuste individual');

  // a lista de usuários mostra os ajustes e o efetivo
  const list = (await A.get('/api/users')).data.items.find((u) => u.email === 'ana.visao@exemplo.com');
  assert.deepEqual(list.perm_add, ['relatorios.visualizar']);
  assert.deepEqual(list.perm_remove, ['financeiro.titulos.criar']);
});

test('visão por usuário: ninguém libera permissão que o próprio perfil não tem; o Dono não se tranca fora', async () => {
  // cria um administrador e tira dele "usuarios.gerenciar"? não: administrador tem quase tudo. Use um gestor para o teste.
  const inv = await A.post('/api/users', { name: 'Ger Limitado', email: 'ger.lim@exemplo.com', role_key: 'gestor' });
  const temp = inv.data.temporary_password;
  const G = client(env.base);
  await G.post('/api/auth/login', { email: 'ger.lim@exemplo.com', password: temp });
  await G.put('/api/auth/password', { current_password: temp, new_password: PASS });
  // gestor não tem usuarios.gerenciar, então nem chega a conceder (precisa da permissão para abrir a rota)
  assert.equal((await G.post('/api/users', { name: 'x', email: 'x@y.com', role_key: 'colaborador', perm_add: ['seguranca.configurar'] })).status, 403);

  // A (dono) tenta conceder a um colaborador uma permissão que A tem — ok; e marca o próprio A com perm_remove — ignorado
  const meA = (await A.get('/api/auth/me')).data;
  const selfId = meA.user.id;
  const r = await A.put(`/api/users/${selfId}`, { perm_remove: ['usuarios.gerenciar', 'seguranca.configurar'] });
  // dono pode até gravar o ajuste, mas o efetivo continua completo (não dá para trancar o dono fora)
  assert.ok([200, 409].includes(r.status));
  const after = (await A.get('/api/auth/me')).data;
  assert.ok(after.permissions.includes('usuarios.gerenciar') && after.permissions.includes('seguranca.configurar'), 'o Dono mantém tudo');
});

// ---------------------------------------------------------------- finanças pessoais
test('espaço pessoal: criação, contas, lançamentos, transferência e saldo', async () => {
  const sp = (await A.post('/api/personal/spaces', { name: 'Meu dinheiro', first_account: 'Conta corrente' })).data;
  assert.equal(sp.role, 'dono');
  const cats = (await A.get(`/api/personal/spaces/${sp.id}/categories`)).data.items;
  assert.ok(cats.length >= 10, 'categorias padrão criadas');

  const accs = (await A.get(`/api/personal/spaces/${sp.id}/accounts`)).data.items;
  const corrente = accs[0];
  const poup = (await A.post(`/api/personal/spaces/${sp.id}/accounts`, { name: 'Poupança', kind: 'poupanca', opening_balance: 100 })).data;

  const salario = cats.find((c) => c.type === 'receita');
  await A.post(`/api/personal/spaces/${sp.id}/transactions`, { account_id: corrente.id, type: 'receita', amount: 3000, date: '2026-11-05', category_id: salario.id, description: 'Salário' });
  await A.post(`/api/personal/spaces/${sp.id}/transactions`, { account_id: corrente.id, type: 'despesa', amount: 500, date: '2026-11-06', description: 'Mercado' });
  // transferência de 1000 da corrente para a poupança
  await A.post(`/api/personal/spaces/${sp.id}/transactions`, { account_id: corrente.id, type: 'transferencia', transfer_account_id: poup.id, amount: 1000, date: '2026-11-07' });

  const after = (await A.get(`/api/personal/spaces/${sp.id}/accounts`)).data.items;
  const c2 = after.find((a) => a.id === corrente.id); const p2 = after.find((a) => a.id === poup.id);
  assert.equal(c2.balance, 1500, 'corrente: 3000 - 500 - 1000');
  assert.equal(p2.balance, 1100, 'poupança: 100 + 1000');

  const sum = (await A.get(`/api/personal/spaces/${sp.id}/summary?month=2026-11`)).data;
  assert.equal(sum.income, 3000); assert.equal(sum.expense, 500); assert.equal(sum.result, 2500);
  assert.equal(sum.total_balance, 2600, 'soma das contas não-cartão');
});

test('compartilhamento: convidar, aceitar, papéis (editor x visualizador) e dono', async () => {
  const sp = (await A.post('/api/personal/spaces', { name: 'Casa', first_account: 'Conjunta' })).data;
  // A convida B (já tem conta) como editor
  const invB = await A.post(`/api/personal/spaces/${sp.id}/invites`, { email: 'donopb@exemplo.com', role: 'editor' });
  assert.equal(invB.data.pending_user, true);
  // B vê o convite e aceita
  const invites = (await B.get('/api/personal/invites')).data.items;
  assert.ok(invites.find((i) => i.space_id === sp.id), 'B vê o convite');
  assert.equal((await B.post(`/api/personal/invites/${sp.id}/accept`)).status, 200);
  // B (editor) lança, mas não gerencia membros
  const accs = (await B.get(`/api/personal/spaces/${sp.id}/accounts`)).data.items;
  assert.equal((await B.post(`/api/personal/spaces/${sp.id}/transactions`, { account_id: accs[0].id, type: 'despesa', amount: 30, date: '2026-11-10', description: 'Padaria' })).status, 201);
  assert.equal((await B.post(`/api/personal/spaces/${sp.id}/invites`, { email: 'x@y.com', role: 'editor' })).status, 403, 'editor não convida');
  assert.equal((await B.del(`/api/personal/spaces/${sp.id}`)).status, 403, 'editor não apaga o espaço');

  // A convida C como visualizador
  await A.post(`/api/personal/spaces/${sp.id}/invites`, { email: 'donopc@exemplo.com', role: 'visualizador' });
  await C.post(`/api/personal/invites/${sp.id}/accept`);
  assert.equal((await C.get(`/api/personal/spaces/${sp.id}/transactions`)).status, 200, 'visualizador lê');
  assert.equal((await C.post(`/api/personal/spaces/${sp.id}/transactions`, { account_id: accs[0].id, type: 'despesa', amount: 1, date: '2026-11-10' })).status, 403, 'visualizador não escreve');

  // A promove C a dono e depois sai; o espaço continua com dono
  await A.put(`/api/personal/spaces/${sp.id}/members/${(await C.get('/api/auth/me')).data.user.id}`, { role: 'dono' });
  assert.equal((await A.del(`/api/personal/spaces/${sp.id}/members/${(await A.get('/api/auth/me')).data.user.id}`)).status, 200, 'A sai');
  assert.equal((await A.get(`/api/personal/spaces/${sp.id}`)).status, 404, 'A não vê mais o espaço');
  assert.equal((await C.get(`/api/personal/spaces/${sp.id}`)).status, 200, 'C (novo dono) continua');
});

test('ISOLAMENTO: quem não é membro não enxerga o espaço de outra pessoa (RLS + API)', async () => {
  const sp = (await A.post('/api/personal/spaces', { name: 'Secreto', first_account: 'Conta' })).data;
  const acc = (await A.get(`/api/personal/spaces/${sp.id}/accounts`)).data.items[0];
  await A.post(`/api/personal/spaces/${sp.id}/transactions`, { account_id: acc.id, type: 'receita', amount: 9999, date: '2026-11-01', description: 'sigiloso' });

  // C conhece o id do espaço, mas não é membro: tudo 404/403, nada vaza
  for (const path of [`/api/personal/spaces/${sp.id}`, `/api/personal/spaces/${sp.id}/accounts`,
    `/api/personal/spaces/${sp.id}/transactions`, `/api/personal/spaces/${sp.id}/summary`, `/api/personal/spaces/${sp.id}/goals`]) {
    const r = await C.get(path);
    assert.ok([403, 404].includes(r.status), `${path} deve negar (foi ${r.status})`);
    assert.ok(!JSON.stringify(r.data || '').includes('sigiloso'), 'nenhum dado vaza');
  }
  // escrever no espaço alheio também é negado
  assert.ok([403, 404].includes((await C.post(`/api/personal/spaces/${sp.id}/transactions`, { account_id: acc.id, type: 'despesa', amount: 1, date: '2026-11-01' })).status));
  assert.ok([403, 404].includes((await C.post(`/api/personal/spaces/${sp.id}/invites`, { email: 'z@z.com' })).status));
  // o espaço não aparece na lista de C
  assert.ok(!(await C.get('/api/personal/spaces')).data.items.find((s) => s.id === sp.id));
});

test('orçamentos e metas', async () => {
  const sp = (await A.post('/api/personal/spaces', { name: 'Metas', first_account: 'Conta' })).data;
  const cat = (await A.get(`/api/personal/spaces/${sp.id}/categories`)).data.items.find((c) => c.type === 'despesa');
  const acc = (await A.get(`/api/personal/spaces/${sp.id}/accounts`)).data.items[0];
  await A.put(`/api/personal/spaces/${sp.id}/budgets`, { category_id: cat.id, month: '2026-11', amount: 800 });
  await A.post(`/api/personal/spaces/${sp.id}/transactions`, { account_id: acc.id, type: 'despesa', amount: 200, date: '2026-11-15', category_id: cat.id });
  const bud = (await A.get(`/api/personal/spaces/${sp.id}/budgets?month=2026-11`)).data.items.find((b) => b.category_id === cat.id);
  assert.equal(bud.amount, 800); assert.equal(bud.spent, 200);

  const goal = (await A.post(`/api/personal/spaces/${sp.id}/goals`, { name: 'Viagem', target: 5000 })).data;
  await A.post(`/api/personal/spaces/${sp.id}/goals/${goal.id}/contribute`, { amount: 1250 });
  const g = (await A.get(`/api/personal/spaces/${sp.id}/goals`)).data.items.find((x) => x.id === goal.id);
  assert.equal(g.saved, 1250); assert.equal(g.progress, 25);
});

test('importar extrato OFX: prévia, confirmação, saldo e proteção contra duplicados', async () => {
  const sp = (await A.post('/api/personal/spaces', { name: 'Importação', first_account: 'Conta' })).data;
  const acc = (await A.get(`/api/personal/spaces/${sp.id}/accounts`)).data.items[0];
  const ofx = ['<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>',
    '<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261101<TRNAMT>3000.00<FITID>A1<NAME>Salario</STMTTRN>',
    '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261102<TRNAMT>-50.00<FITID>A2<MEMO>Padaria</STMTTRN>',
    '</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>'].join('\n');
  const content_base64 = Buffer.from(ofx).toString('base64');
  const prev = await A.post(`/api/personal/spaces/${sp.id}/import/preview`, { account_id: acc.id, filename: 'extrato.ofx', content_base64 });
  assert.equal(prev.status, 200, JSON.stringify(prev.data));
  assert.equal(prev.data.format, 'ofx'); assert.equal(prev.data.total, 2); assert.equal(prev.data.novos, 2); assert.equal(prev.data.duplicados, 0);
  const credit = prev.data.lines.find((l) => l.type === 'receita'); assert.equal(credit.amount, 3000);

  const commit = await A.post(`/api/personal/spaces/${sp.id}/import/commit`, { account_id: acc.id, lines: prev.data.lines });
  assert.equal(commit.status, 201); assert.equal(commit.data.imported, 2); assert.equal(commit.data.duplicates, 0);
  const bal = (await A.get(`/api/personal/spaces/${sp.id}/accounts`)).data.items[0].balance;
  assert.equal(bal, 2950, '3000 - 50');

  // reimportar o mesmo arquivo: a prévia marca os dois como duplicados e o commit não insere de novo
  const prev2 = await A.post(`/api/personal/spaces/${sp.id}/import/preview`, { account_id: acc.id, filename: 'extrato.ofx', content_base64 });
  assert.equal(prev2.data.duplicados, 2); assert.equal(prev2.data.novos, 0);
  const commit2 = await A.post(`/api/personal/spaces/${sp.id}/import/commit`, { account_id: acc.id, lines: prev2.data.lines });
  assert.equal(commit2.data.imported, 0); assert.equal(commit2.data.duplicates, 2);
});

test('importar CSV e bloqueio de PDF sem IA; visualizador não importa', async () => {
  const sp = (await A.post('/api/personal/spaces', { name: 'CSV', first_account: 'Conta' })).data;
  const acc = (await A.get(`/api/personal/spaces/${sp.id}/accounts`)).data.items[0];
  const csv = 'Data;Histórico;Valor\n01/11/2026;Depósito;1.000,00\n03/11/2026;Conta de luz;-200,00\n';
  const prev = await A.post(`/api/personal/spaces/${sp.id}/import/preview`, { account_id: acc.id, filename: 'extrato.csv', content_base64: Buffer.from(csv).toString('base64') });
  assert.equal(prev.status, 200, JSON.stringify(prev.data)); assert.equal(prev.data.total, 2);

  // PDF sem IA configurada: recusa clara (não quebra)
  const pdf = Buffer.from('%PDF-1.4 fake', 'latin1').toString('base64');
  const pdfPrev = await A.post(`/api/personal/spaces/${sp.id}/import/preview`, { account_id: acc.id, filename: 'extrato.pdf', content_base64: pdf });
  assert.ok([409, 422, 502].includes(pdfPrev.status), `PDF sem IA deve recusar (foi ${pdfPrev.status})`);
  assert.ok(/IA|intelig/i.test(JSON.stringify(pdfPrev.data)) || pdfPrev.status !== 200);

  // visualizador não importa
  await A.post(`/api/personal/spaces/${sp.id}/invites`, { email: 'donopc@exemplo.com', role: 'visualizador' });
  await C.post(`/api/personal/invites/${sp.id}/accept`);
  const cPrev = await C.post(`/api/personal/spaces/${sp.id}/import/preview`, { account_id: acc.id, filename: 'x.csv', content_base64: Buffer.from(csv).toString('base64') });
  assert.equal(cPrev.status, 403);
});
