// SIMULAÇÃO DE ATAQUE (hard) ao CIFREN — foco nas superfícies novas: finanças pessoais (isolamento/RLS, injeção de
// objeto entre espaços, papéis), visão por usuário (escalonamento de privilégio) e importação de extrato, além de
// CSRF/sessão. Roda com papel SEM superusuário (a RLS vale como na VPS). Cada bloco imprime quantos ataques foram barrados.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, client, signup, PASS } from './helpers.js';

let env; let A; let B; let C;
let evidence = [];
const blocked = (cond, msg) => { assert.ok(cond, `FALHA DE SEGURANÇA: ${msg}`); evidence.push(msg); };

before(async () => {
  env = await boot();
  A = await signup(env.base, 'atkA');
  B = await signup(env.base, 'atkB');
  C = await signup(env.base, 'atkC');
});
after(() => { env.close(); console.log(`\n[ATAQUE] ${evidence.length} ataques barrados com sucesso.`); });

// cria e loga um usuário dentro da organização de A, com um perfil
async function makeOrgUser(email, role_key, overrides = {}) {
  const inv = await A.post('/api/users', { name: email, email, role_key, ...overrides });
  if (inv.status !== 201) throw new Error(`convite ${email}: ${inv.status} ${JSON.stringify(inv.data)}`);
  const U = client(env.base);
  await U.post('/api/auth/login', { email, password: inv.data.temporary_password });
  await U.put('/api/auth/password', { current_password: inv.data.temporary_password, new_password: PASS });
  return { U, inv };
}

// ---------------------------------------------------------------- A) finanças pessoais: isolamento
test('ATAQUE: não-membro não lê nem escreve no espaço de outra pessoa (IDOR/RLS)', async () => {
  const sp = (await A.post('/api/personal/spaces', { name: 'Cofre', first_account: 'Conta' })).data;
  const acc = (await A.get(`/api/personal/spaces/${sp.id}/accounts`)).data.items[0];
  const cat = (await A.get(`/api/personal/spaces/${sp.id}/categories`)).data.items.find((c) => c.type === 'despesa');
  await A.post(`/api/personal/spaces/${sp.id}/transactions`, { account_id: acc.id, type: 'receita', amount: 7777, date: '2026-11-01', description: 'TOPSECRET' });
  const goal = (await A.post(`/api/personal/spaces/${sp.id}/goals`, { name: 'G', target: 100 })).data;

  const reads = [`/api/personal/spaces/${sp.id}`, `/api/personal/spaces/${sp.id}/accounts`, `/api/personal/spaces/${sp.id}/transactions`,
    `/api/personal/spaces/${sp.id}/summary`, `/api/personal/spaces/${sp.id}/goals`, `/api/personal/spaces/${sp.id}/budgets`,
    `/api/personal/spaces/${sp.id}/categories`, `/api/personal/spaces/${sp.id}/recurring`];
  for (const p of reads) {
    const r = await B.get(p);
    blocked([403, 404].includes(r.status) && !JSON.stringify(r.data || '').includes('TOPSECRET'), `leitura de ${p} por não-membro barrada (${r.status})`);
  }
  const writes = [
    ['POST', `/api/personal/spaces/${sp.id}/transactions`, { account_id: acc.id, type: 'despesa', amount: 1, date: '2026-11-01' }],
    ['POST', `/api/personal/spaces/${sp.id}/accounts`, { name: 'X' }],
    ['POST', `/api/personal/spaces/${sp.id}/goals/${goal.id}/contribute`, { amount: 1 }],
    ['PUT', `/api/personal/spaces/${sp.id}/budgets`, { category_id: cat.id, amount: 10 }],
    ['POST', `/api/personal/spaces/${sp.id}/invites`, { email: 'x@y.com' }],
    ['DELETE', `/api/personal/spaces/${sp.id}`, null],
    ['PUT', `/api/personal/spaces/${sp.id}`, { name: 'hack' }],
  ];
  for (const [m, p, b] of writes) {
    const r = m === 'DELETE' ? await B.del(p) : m === 'PUT' ? await B.put(p, b) : await B.post(p, b);
    blocked([403, 404].includes(r.status), `${m} ${p} por não-membro barrado (${r.status})`);
  }
  // o espaço não aparece na lista de B
  blocked(!(await B.get('/api/personal/spaces')).data.items.find((s) => s.id === sp.id), 'espaço alheio não aparece na lista');
});

test('ATAQUE: injeção de objeto entre espaços (usar conta/categoria de OUTRO espaço)', async () => {
  const mine = (await A.post('/api/personal/spaces', { name: 'Meu', first_account: 'Conta' })).data;
  const other = (await B.post('/api/personal/spaces', { name: 'Dele', first_account: 'Conta' })).data;
  const myAcc = (await A.get(`/api/personal/spaces/${mine.id}/accounts`)).data.items[0];
  const otherAcc = (await B.get(`/api/personal/spaces/${other.id}/accounts`)).data.items[0];
  const otherCat = (await B.get(`/api/personal/spaces/${other.id}/categories`)).data.items[0];

  // lançar no MEU espaço referenciando conta/categoria do espaço do B
  blocked((await A.post(`/api/personal/spaces/${mine.id}/transactions`, { account_id: otherAcc.id, type: 'despesa', amount: 10, date: '2026-11-01' })).status >= 400, 'conta de outro espaço recusada no lançamento');
  blocked((await A.post(`/api/personal/spaces/${mine.id}/transactions`, { account_id: myAcc.id, type: 'transferencia', transfer_account_id: otherAcc.id, amount: 10, date: '2026-11-01' })).status >= 400, 'transferência para conta de outro espaço recusada');
  blocked((await A.post(`/api/personal/spaces/${mine.id}/transactions`, { account_id: myAcc.id, type: 'despesa', amount: 10, date: '2026-11-01', category_id: otherCat.id })).status >= 400, 'categoria de outro espaço recusada');
  blocked((await A.put(`/api/personal/spaces/${mine.id}/budgets`, { category_id: otherCat.id, amount: 5 })).status >= 400, 'orçamento com categoria de outro espaço recusado');
  // importar no meu espaço commitando para a conta do outro espaço
  blocked((await A.post(`/api/personal/spaces/${mine.id}/import/commit`, { account_id: otherAcc.id, lines: [{ date: '2026-11-01', amount: 10, type: 'despesa', line_hash: 'h1' }] })).status >= 400, 'commit de extrato na conta de outro espaço recusado');
});

test('ATAQUE: papéis do espaço (visualizador e editor não passam dos seus limites)', async () => {
  const sp = (await A.post('/api/personal/spaces', { name: 'Compart', first_account: 'Conta' })).data;
  const acc = (await A.get(`/api/personal/spaces/${sp.id}/accounts`)).data.items[0];
  const bId = (await B.get('/api/auth/me')).data.user.id;
  const cId = (await C.get('/api/auth/me')).data.user.id;
  await A.post(`/api/personal/spaces/${sp.id}/invites`, { email: 'donoatkb@exemplo.com', role: 'visualizador' });
  await B.post(`/api/personal/invites/${sp.id}/accept`);
  await A.post(`/api/personal/spaces/${sp.id}/invites`, { email: 'donoatkc@exemplo.com', role: 'editor' });
  await C.post(`/api/personal/invites/${sp.id}/accept`);

  // visualizador (B) não escreve
  for (const [m, p, b] of [['POST', `/api/personal/spaces/${sp.id}/transactions`, { account_id: acc.id, type: 'despesa', amount: 1, date: '2026-11-01' }],
    ['POST', `/api/personal/spaces/${sp.id}/accounts`, { name: 'Y' }]]) {
    blocked((await B.post(p, b)).status === 403, `visualizador barrado em ${m} ${p}`);
  }
  // editor (C) não gerencia membros nem apaga o espaço
  blocked((await C.post(`/api/personal/spaces/${sp.id}/invites`, { email: 'z@z.com' })).status === 403, 'editor não convida');
  blocked((await C.put(`/api/personal/spaces/${sp.id}/members/${bId}`, { role: 'dono' })).status === 403, 'editor não muda papéis');
  blocked((await C.del(`/api/personal/spaces/${sp.id}/members/${bId}`)).status === 403, 'editor não remove membros');
  blocked((await C.del(`/api/personal/spaces/${sp.id}`)).status === 403, 'editor não apaga o espaço');
  // editor não se auto-promove
  blocked((await C.put(`/api/personal/spaces/${sp.id}/members/${cId}`, { role: 'dono' })).status === 403, 'editor não se promove a dono');
  // dono não pode ficar sem dono
  blocked((await A.del(`/api/personal/spaces/${sp.id}/members/${(await A.get('/api/auth/me')).data.user.id}`)).status === 409, 'único dono não sai sem substituto');
});

test('ATAQUE: convites — aceitar/decidir o que não é seu', async () => {
  const sp = (await A.post('/api/personal/spaces', { name: 'Conv', first_account: 'Conta' })).data;
  await A.post(`/api/personal/spaces/${sp.id}/invites`, { email: 'donoatkb@exemplo.com', role: 'editor' }); // convite para B
  // C tenta aceitar o convite que é de B
  blocked([403, 404].includes((await C.post(`/api/personal/invites/${sp.id}/accept`)).status), 'C não aceita convite endereçado a B');
  blocked(!(await C.get('/api/personal/spaces')).data.items.find((s) => s.id === sp.id), 'C não entrou no espaço alheio');
  // B (membro depois de aceitar) não cancela convites nem remove o dono
  await B.post(`/api/personal/invites/${sp.id}/accept`);
  blocked((await B.del(`/api/personal/spaces/${sp.id}/members/${(await A.get('/api/auth/me')).data.user.id}`)).status === 403, 'editor não remove o dono');
});

// ---------------------------------------------------------------- B) visão por usuário: escalonamento
test('ATAQUE: visão por usuário — escalonamento de privilégio barrado', async () => {
  // um administrador SEM seguranca.configurar não consegue liberar essa permissão a ninguém
  const { U: admin } = await makeOrgUser('adm.atk@exemplo.com', 'administrador');
  const alvo = await admin.post('/api/users', { name: 'Xavier Atk', email: 'x.atk@exemplo.com', role_key: 'colaborador', perm_add: ['seguranca.configurar'] });
  blocked(alvo.status === 403, 'administrador não concede permissão que o próprio perfil não tem (perm_add)');

  // perfil sem usuarios.gerenciar nem abre a rota
  const { U: colab } = await makeOrgUser('colab.atk@exemplo.com', 'colaborador');
  blocked((await colab.get('/api/users')).status === 403, 'quem não gerencia usuários não lista usuários');
  blocked((await colab.put(`/api/users/${(await admin.get('/api/auth/me')).data.user.id}`, { role_key: 'dono' })).status === 403, 'colaborador não edita usuários');

  // perm_add com código inexistente é recusado
  blocked((await A.post('/api/users', { name: 'Yan Atk', email: 'y.atk@exemplo.com', role_key: 'colaborador', perm_add: ['tudo.liberado'] })).status === 400, 'permissão inexistente recusada');

  // não editar quem tem MAIS poder que você: o admin tem quase tudo; o financeiro não edita o admin
  const { U: fin } = await makeOrgUser('fin.atk@exemplo.com', 'financeiro', { perm_add: ['usuarios.gerenciar'] });
  const admId = (await admin.get('/api/auth/me')).data.user.id;
  blocked((await fin.put(`/api/users/${admId}`, { perm_remove: ['empresas.gerenciar'] })).status === 403, 'não edita usuário com mais poder que o seu');
});

// ---------------------------------------------------------------- C) núcleo: CSRF e sessão
test('ATAQUE: CSRF e sessão nas rotas pessoais', async () => {
  const sp = (await A.post('/api/personal/spaces', { name: 'Csrf', first_account: 'Conta' })).data;
  const acc = (await A.get(`/api/personal/spaces/${sp.id}/accounts`)).data.items[0];
  // escrita sem o cabeçalho X-CIFREN é barrada (proteção CSRF)
  const noCsrf = await A.post(`/api/personal/spaces/${sp.id}/transactions`, { account_id: acc.id, type: 'despesa', amount: 1, date: '2026-11-01' }, { 'x-cifren': '' });
  blocked(noCsrf.status === 403, 'escrita sem X-CIFREN barrada (CSRF)');
  // sem sessão: 401
  const anon = client(env.base);
  blocked((await anon.get('/api/personal/spaces')).status === 401, 'rota pessoal sem sessão barrada');
  blocked((await anon.post('/api/personal/spaces', { name: 'z' })).status === 401, 'criar espaço sem sessão barrado');
});

test('ATAQUE: injeção em filtros e limites da importação', async () => {
  const sp = (await A.post('/api/personal/spaces', { name: 'Inj', first_account: 'Conta' })).data;
  // filtros maliciosos não quebram nem vazam (consulta parametrizada)
  const r = await A.get(`/api/personal/spaces/${sp.id}/transactions?q=${encodeURIComponent("%' or '1'='1")}&from=not-a-date`);
  blocked(r.status === 200 && Array.isArray(r.data.items), 'filtro com aspas/curinga é tratado como texto, sem erro');
  // import: lote gigante é recusado pelo schema (máx. 2000)
  const big = Array.from({ length: 2001 }, (_, i) => ({ date: '2026-11-01', amount: 1, type: 'despesa', line_hash: `h${i}` }));
  const acc = (await A.get(`/api/personal/spaces/${sp.id}/accounts`)).data.items[0];
  blocked((await A.post(`/api/personal/spaces/${sp.id}/import/commit`, { account_id: acc.id, lines: big })).status === 400, 'lote de importação acima do limite recusado');
  // valores inválidos no lançamento
  blocked((await A.post(`/api/personal/spaces/${sp.id}/transactions`, { account_id: acc.id, type: 'despesa', amount: -5, date: '2026-11-01' })).status === 400, 'valor negativo recusado');
  blocked((await A.post(`/api/personal/spaces/${sp.id}/transactions`, { account_id: acc.id, type: 'despesa', amount: 0, date: '2026-11-01' })).status === 400, 'valor zero recusado');
});

// ---------------------------------------------------------------- D) camada de banco (a defesa que vale na VPS)
test('ATAQUE (banco): a RLS isola os dados pessoais mesmo fora da API', async () => {
  const sp = (await A.post('/api/personal/spaces', { name: 'RLS', first_account: 'Conta' })).data;
  const acc = (await A.get(`/api/personal/spaces/${sp.id}/accounts`)).data.items[0];
  await A.post(`/api/personal/spaces/${sp.id}/transactions`, { account_id: acc.id, type: 'receita', amount: 4242, date: '2026-11-01', description: 'DADO_RLS' });
  const bId = (await B.get('/api/auth/me')).data.user.id;
  const aId = (await A.get('/api/auth/me')).data.user.id;

  const cl = await env.pool.connect();
  try {
    // como um invasor que conseguiu rodar SQL com o papel da aplicação (não superusuário), mas se passando por B (não-membro)
    await cl.query('begin');
    await cl.query("select set_config('app.user_id', $1, true)", [bId]);
    const leak = await cl.query('select * from personal_transactions where space_id=$1', [sp.id]);
    blocked(leak.rows.length === 0, 'RLS: não-membro não lê lançamentos de outro espaço nem com SQL direto');
    const spaceLeak = await cl.query('select * from personal_spaces where id=$1', [sp.id]);
    blocked(spaceLeak.rows.length === 0, 'RLS: não-membro não lê o espaço alheio por SQL direto');
    let insBlocked = false;
    try { await cl.query("insert into personal_transactions (space_id, account_id, type, amount_cents, date) values ($1,$2,'despesa',100,'2026-11-01')", [sp.id, acc.id]); }
    catch { insBlocked = true; }
    blocked(insBlocked, 'RLS: não-membro não grava no espaço alheio por SQL direto');
    await cl.query('rollback');

    // o dono (A) enxerga normalmente
    await cl.query('begin');
    await cl.query("select set_config('app.user_id', $1, true)", [aId]);
    const own = await cl.query('select description from personal_transactions where space_id=$1', [sp.id]);
    blocked(own.rows.some((r) => r.description === 'DADO_RLS'), 'o próprio dono enxerga os seus dados (controle positivo)');
    // auditoria pessoal é somente inclusão: UPDATE/DELETE são barrados
    const au = await cl.query('select id from personal_audit where space_id=$1 limit 1', [sp.id]);
    let auditLocked = false;
    if (au.rows[0]) { try { await cl.query('update personal_audit set summary=$2 where id=$1', [au.rows[0].id, 'adulterado']); } catch { auditLocked = true; } }
    blocked(auditLocked, 'auditoria pessoal não pode ser alterada (somente inclusão)');
    await cl.query('rollback');
  } finally { cl.release(); }
});

test('ATAQUE: campos forjados no corpo são ignorados (mass assignment)', async () => {
  const sp = (await A.post('/api/personal/spaces', { name: 'Mass', first_account: 'Conta' })).data;
  const acc = (await A.get(`/api/personal/spaces/${sp.id}/accounts`)).data.items[0];
  const other = (await B.post('/api/personal/spaces', { name: 'Outro', first_account: 'Conta' })).data;
  const aId = (await A.get('/api/auth/me')).data.user.id;
  // tenta forjar created_by (outro usuário), space_id (outro espaço) e import_hash
  const r = await A.post(`/api/personal/spaces/${sp.id}/transactions`, { account_id: acc.id, type: 'despesa', amount: 9, date: '2026-11-01',
    created_by: (await B.get('/api/auth/me')).data.user.id, space_id: other.id, import_hash: 'forjado', id: '00000000-0000-0000-0000-000000000000' });
  blocked(r.status === 201, 'o lançamento é criado ignorando os campos forjados');
  const cl = await env.pool.connect();
  try {
    await cl.query('begin'); await cl.query("select set_config('app.user_id',$1,true)", [aId]);
    const row = (await cl.query('select space_id, created_by, import_hash from personal_transactions where id=$1', [r.data.id])).rows[0];
    blocked(row.space_id === sp.id, 'space_id vem da URL, não do corpo');
    blocked(row.created_by === aId, 'created_by é o usuário da sessão, não o forjado');
    blocked(row.import_hash === null, 'import_hash não é aceito do corpo em lançamento manual');
    await cl.query('rollback');
  } finally { cl.release(); }
});
