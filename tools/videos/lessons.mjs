// Roteiro das vídeo-aulas do CIFREN. Cada passo: act (o que acontece na tela) e say (falas = legendas, curtas: até ~2 linhas).
// Cada aula tem cartão de abertura + passos com selo "Passo X de N" + cartão final (record.mjs). Dados 100% fictícios.
export const MODULES = [
  { key: 'inicio', label: 'Primeiros passos' },
  { key: 'financeiro', label: 'Contas a pagar e a receber' },
  { key: 'banco', label: 'Bancos e conciliação' },
  { key: 'associados', label: 'Associados e mensalidades' },
  { key: 'compras', label: 'Compras e despesas' },
  { key: 'relatorios', label: 'Relatórios' },
  { key: 'config', label: 'Configurações e suporte' },
];

const LOGO = '<span class="l"><img src="/favicon.svg" alt="" /></span>';
export const slide = (tag, title, body) => `<div class="k">${LOGO}CIFREN · TREINAMENTO</div><div class="n">${tag}</div><h1 style="font-size:52px">${title}</h1>${body}<div class="m">Dados fictícios de exemplo</div>`;
export const slist = (items, size) => `<ul class="b ${size || (items.length <= 3 ? 'lg' : items.length >= 5 ? 'sm' : 'md')}">${items.map((t, i) => `<li data-i="${i + 1}">${t}</li>`).join('')}</ul>`;
export const para = (t) => `<p class="s">${t}</p>`;
/** Escolhe no select a primeira opção cujo texto bate com a expressão. */
export const pick = async (sel, re) => { const opts = await sel.locator('option').allTextContents(); const t = opts.find((o) => re.test(o)); if (t) await sel.selectOption({ label: t.trim() }).catch(() => {}); };
export const btn = (h, name) => h.page.getByRole('button', { name, exact: true }).locator('visible=true').first();


const ymd = (d) => d.toISOString().slice(0, 10);
export const inDays = (n) => ymd(new Date(Date.now() + n * 86400000));
const listOf = (x) => (Array.isArray(x) ? x : x?.items || []);

/** Dados de exemplo comuns: conta no banco, fornecedores, clientes e algumas contas a pagar e a receber (vencidas, a vencer e pagas). */
export async function seedBasics(api, h, { titles = true } = {}) {
  const company = h.companyId;
  const bank = await api('POST', '/accounts', { company_id: company, name: 'Banco Exemplo', type: 'banco', bank_name: 'Banco Exemplo S.A.', agency: '0001', number: '12345-6', opening_balance: 18500, opening_date: inDays(-60) });
  const cp = {};
  for (const [name, kind] of [['Energia Exemplo S.A.', 'fornecedor'], ['Papelaria Modelo Ltda', 'fornecedor'], ['Contabilidade Exemplo', 'fornecedor'], ['Escola Exemplo', 'cliente'], ['Clube Exemplo', 'cliente']]) {
    cp[name] = await api('POST', '/counterparties', { kind, name });
  }
  const cats = await api('GET', '/categories');
  const cat = (re, type) => { const l = listOf(cats).filter((c) => !type || c.type === type); return (l.find((c) => re.test(c.name)) || l[0])?.id || null; };
  const out = { bank, cp, cat };
  if (!titles) return out;
  const mk = (kind, description, amount, days, who, catRe) => api('POST', '/titles', { kind, company_id: company, description, amount, due_date: inDays(days), counterparty_id: cp[who]?.id || null, category_id: cat(catRe || /./, kind === 'pagar' ? 'despesa' : 'receita') });
  await mk('pagar', 'Conta de energia de outubro', 890.4, -3, 'Energia Exemplo S.A.', /Energia/);
  await mk('pagar', 'Material de escritório', 312.9, 4, 'Papelaria Modelo Ltda', /Matéria-prima|Compras de merc/i);
  await mk('pagar', 'Honorários da contabilidade', 1200, 9, 'Contabilidade Exemplo', /Contador/);
  await mk('receber', 'Aluguel do salão - novembro', 2500, -2, 'Escola Exemplo', /Prestação de serv/);
  await mk('receber', 'Patrocínio do evento', 4000, 12, 'Clube Exemplo', /Outras receitas|Reembolsos|Rendimentos/);
  const paid = await mk('pagar', 'Internet de outubro', 199.9, -12, 'Energia Exemplo S.A.', /Internet/);
  const pid = paid?.ids?.[0];
  if (pid) await api('POST', `/titles/${pid}/settle`, { account_id: bank.id, paid_at: inDays(-12), amount: 199.9, method: 'pix' });
  return out;
}

const TOUR = ['/', '/pagar', '/receber', '/aprovacoes', '/conciliacao', '/associados', '/recorrentes', '/compras', '/despesas', '/documentos',
  '/relatorios/fluxo', '/relatorios/dre', '/relatorios/inadimplencia', '/cadastros', '/empresas', '/usuarios', '/configuracoes/alcadas', '/configuracoes/assinatura', '/assistente', '/suporte'];

export const LESSONS = [
  // ───────────────────────── 1. Conhecendo o CIFREN
  {
    n: 1, file: '01-conhecendo-o-cifren', mod: 'inicio', title: 'Conhecendo o CIFREN', routes: ['/'], start: '/',
    desc: 'O painel do dinheiro de hoje, o menu, o seletor de empresas, o botão Enviar documento e onde pedir ajuda.',
    learn: ['O que o painel mostra', 'Como o menu está organizado', 'Empresas, documentos, avisos e ajuda'],
    setup: async (api, h) => { await seedBasics(api, h); return {}; },
    steps: [
      { tag: 'Para que serve', act: (h) => h.card(slide('CIFREN', 'O dinheiro da sua organização, em ordem', slist(['Contas a pagar e a receber, sem esquecer vencimento.', 'Banco conferido com o extrato.', 'Relatórios prontos: fluxo de caixa e DRE.']))),
        say: ['O CIFREN organiza o dinheiro da sua empresa ou associação: o que pagar, o que receber, o saldo no banco e os relatórios.'] },
      { tag: 'O painel', act: async (h) => { await h.card(null); await h.spot(h.page.locator('main').getByText('Saldo em caixa', { exact: false }).first().locator('xpath=ancestor::*[contains(@class,"grid")][1]')); },
        say: ['Na tela inicial, os números do dia: o saldo em caixa, o que está a pagar e a receber, e o que já venceu.'] },
      { act: async (h) => { await h.unspot(); const t = h.page.getByText('Próximos vencimentos', { exact: false }).first(); await h.center(t); await h.spot(t.locator('xpath=ancestor::*[contains(@class,"card")][1]')); },
        say: ['Logo abaixo, os próximos vencimentos. Clique numa conta para ver os detalhes ou dar baixa.'] },
      { tag: 'O menu', act: async (h) => { await h.unspot(); await h.top(); await h.spot(h.page.locator('nav').first()); },
        say: ['O menu fica à esquerda, em grupos: Financeiro, Compras e despesas, Documentos, Relatórios e Configurações.'] },
      { tag: 'Empresas', act: async (h) => { await h.unspot(); await h.spot(h.page.getByLabel('Filtrar por empresa')); },
        say: ['Tem mais de um CNPJ? No topo, escolha a empresa. Todas as empresas mostra o grupo inteiro.'] },
      { tag: 'Documentos e avisos', act: async (h) => { await h.unspot(); await h.spot(btn(h, 'Enviar documento')); },
        say: ['Enviar documento: mande a foto de um boleto ou de uma nota, e o CIFREN lança a conta para você conferir.', 'No sino, os avisos: contas vencendo e pedidos esperando aprovação.'] },
      { tag: 'Ajuda', act: (h) => h.card(slide('Ajuda', 'Sempre por perto', slist(['<b>Visão geral do CIFREN</b>: o mapa de tudo o que o sistema faz.', '<b>Suporte e treinamento</b>: as vídeo-aulas e o assistente.', 'No menu da sua conta: <b>Falar com o assistente</b>.']))),
        say: ['Ficou com dúvida? Em Suporte e treinamento estão as vídeo-aulas e o assistente, que responde na hora.'] },
    ],
  },
  // ───────────────────────── 2. Cadastros
  {
    n: 2, file: '02-contas-bancarias-e-cadastros', mod: 'inicio', title: 'Contas bancárias, fornecedores e categorias', routes: ['/cadastros'], start: '/',
    desc: 'Cadastrar a conta do banco com o saldo inicial, os fornecedores e clientes, e entender as categorias e os centros de custo.',
    learn: ['Cadastrar a conta bancária e o saldo inicial', 'Cadastrar fornecedores e clientes', 'Categorias e centros de custo'],
    steps: [
      { tag: 'Para que serve', act: (h) => h.card(slide('Cadastros', 'Arrume a casa uma vez só', slist(['<b>Contas bancárias</b>: de onde sai e onde entra o dinheiro.', '<b>Fornecedores e clientes</b>: quem você paga e quem te paga.', '<b>Categorias</b>: para que o dinheiro foi, no DRE.']))),
        say: ['Antes de lançar contas, cadastre a conta do banco. Os fornecedores e clientes também podem ser cadastrados na hora de lançar.'] },
      { tag: 'Conta bancária', act: async (h) => { await h.card(null); await h.go('/cadastros?aba=contas'); await h.spot(btn(h, 'Nova conta')); await h.click(btn(h, 'Nova conta'), { wait: 900 }); await h.spot(h.dlg()); },
        say: ['No menu, abra Cadastros e a aba Contas bancárias. O Caixa já vem pronto. Clique em Nova conta.'] },
      { act: async (h) => { await h.type(h.page.getByLabel('Nome da conta'), 'Banco Exemplo', { delay: 40 }); await h.type(h.page.getByLabel('Banco', { exact: true }), 'Banco Exemplo S.A.', { delay: 25 }); await h.type(h.page.getByLabel('Agência'), '0001'); await h.type(h.page.getByLabel('Número da conta'), '12345-6'); await h.type(h.page.getByLabel('Saldo inicial'), '1850000', { delay: 40 }); await h.type(h.page.getByLabel('Data do saldo inicial'), '01/11/2026'); await h.spot(h.page.getByLabel('Saldo inicial')); },
        say: ['Dê um nome, informe o banco, a agência e o número. Em Saldo inicial, o saldo do extrato no dia escolhido: é dele que o CIFREN parte.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: 'Salvar' }), { wait: 1200 }); await h.spot(h.page.locator('main').getByText('Banco Exemplo', { exact: true }).first()); },
        say: ['Clique em Salvar. A conta aparece na lista, com o saldo.'] },
      { tag: 'Fornecedores e clientes', act: async (h) => { await h.unspot(); await h.click(h.page.getByRole('tab', { name: 'Fornecedores e clientes' }), { wait: 900 }); await h.click(h.page.locator('main').getByRole('button', { name: /Cadastrar|Novo/ }).first(), { wait: 900 }); await h.type(h.dlg().getByLabel('Nome'), 'Energia Exemplo S.A.', { delay: 40 }); await h.spot(h.dlg()); },
        say: ['Na aba Fornecedores e clientes, clique em Cadastrar. Informe o nome, o tipo e, se quiser, o CNPJ, o telefone e o e-mail.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: 'Salvar' }), { wait: 1200 }); await h.sleep(800); await h.spot(h.page.locator('main').getByText('Energia Exemplo', { exact: false }).first()); },
        say: ['Salvar. Pronto: na hora de lançar uma conta, é só escolher o fornecedor.'] },
      { tag: 'Categorias', act: async (h) => { await h.unspot(); await h.click(h.page.getByRole('tab', { name: 'Categorias' }), { wait: 1200 }); await h.spot(h.page.locator('main .card').first()); },
        say: ['Em Categorias, a lista de receitas e despesas já vem pronta, ligada às linhas do DRE. Você pode criar subcategorias.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.page.getByRole('tab', { name: 'Centros de custo' }), { wait: 1000 }); await h.spot(h.page.locator('main .card').first()); },
        say: ['Centros de custo separam os gastos por área, projeto ou evento. Eles também aparecem nos relatórios.'] },
    ],
  },
  // ───────────────────────── 3. Contas a pagar
  {
    n: 3, file: '03-contas-a-pagar', mod: 'financeiro', title: 'Contas a pagar: lançar, parcelar e dar baixa', routes: ['/pagar'], start: '/',
    desc: 'Lançar uma conta a pagar com fornecedor e categoria, dividir em parcelas, filtrar o que vence e registrar o pagamento.',
    learn: ['Lançar uma conta e parcelar', 'Filtrar vencidas e a vencer', 'Dar baixa: registrar o pagamento'],
    setup: async (api, h) => { await seedBasics(api, h); return {}; },
    steps: [
      { tag: 'Lançar', act: async (h) => { await h.go('/pagar'); await h.spot(btn(h, 'Novo')); await h.click(btn(h, 'Novo'), { wait: 1000 }); await h.spot(h.dlg()); },
        say: ['No menu, abra Contas a pagar. Aqui fica tudo o que a sua empresa precisa pagar. Clique em Novo.'] },
      { act: async (h) => { const d = h.dlg(); await h.type(d.getByLabel('Descrição'), 'Manutenção do ar-condicionado', { delay: 35 }); await h.type(d.getByLabel('Valor total'), '180000', { delay: 50 }); await h.type(d.getByLabel('Vencimento'), h.state.due || '20/11/2026'); await h.spot(d.getByLabel('Valor total')); },
        say: ['Escreva a descrição, o valor e o vencimento.'] },
      { act: async (h) => { const d = h.dlg(); const f = d.getByPlaceholder(/Buscar fornecedor/); await h.type(f, 'Pape', { delay: 70 }); await h.sleep(800); await h.click(d.getByRole('option').first(), { wait: 500 }); await pick(d.getByLabel('Categoria'), /Manuten/); await h.spot(d.getByLabel('Categoria')); },
        say: ['Escolha o fornecedor, digitando o nome. Se ele ainda não existe, dá para cadastrar ali mesmo. Depois, a categoria.'] },
      { tag: 'Parcelar', act: async (h) => { const d = h.dlg(); const n = d.getByLabel('Número de parcelas'); await h.center(n); await n.fill('3'); await h.sleep(600); await h.type(d.getByLabel('Valor de cada parcela'), '60000', { delay: 50 }); await h.center(n); await h.spot(n.locator('xpath=ancestor::*[contains(@class,"grid") or contains(@class,"card")][1]')); },
        say: ['Vai pagar em vezes? Em Número de parcelas, coloque três. O valor passa a ser o de cada parcela: aqui, seiscentos reais. O CIFREN mostra o total e cria uma conta para cada mês.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: 'Lançar' }), { wait: 1500 }); await h.spot(h.page.locator('main table, main ul').first()); },
        say: ['Clique em Lançar. As parcelas aparecem na lista, cada uma com o seu vencimento.'] },
      { tag: 'Filtrar', act: async (h) => { await h.unspot(); await h.top(); await h.click(h.page.getByRole('tab', { name: 'Vencidos' }).or(h.page.getByRole('button', { name: 'Vencidos', exact: true })).first(), { wait: 1200 }); await h.spot(h.page.locator('main table, main ul').first()); },
        say: ['Use as abas para filtrar: abertos, vencidos, pagos. Aqui, os vencidos: o que já passou do dia e ainda não foi pago.'] },
      { tag: 'Dar baixa', act: async (h) => { await h.unspot(); const row = h.page.locator('main tr').filter({ hasText: 'Conta de energia de outubro' }).first(); await h.click(row.getByRole('button', { name: /Dar baixa/ }), { wait: 1200 }); await pick(h.dlg().getByLabel(/Pago com a conta/), /Banco Exemplo/); await h.spot(h.dlg()); },
        say: ['Pagou? Abra a conta e clique em dar baixa. Confira a data, o valor, a conta de onde saiu o dinheiro e a forma de pagamento.'] },
      { act: async (h) => { await h.unspot(); await pick(h.dlg().getByLabel('Forma de pagamento'), /Pix/); await h.click(h.dlg().getByRole('button', { name: 'Confirmar baixa' }), { wait: 1500 }); await h.esc(); await h.spot(h.page.locator('main table').first()); },
        say: ['Se teve juros, multa ou desconto, informe nos campos. Confirme: a conta sai dos vencidos e o saldo do banco é atualizado.'] },
      { tag: 'Lembre', act: (h) => h.card(slide('Lembre', 'Conta lançada, conta paga', slist(['Novo: descrição, valor, vencimento, fornecedor e categoria.', 'Parcelas: uma conta por mês, cada uma com o valor da parcela.', 'Pagou: dar baixa, com a conta do banco e a forma.']))),
        say: ['Lembre: lance com o fornecedor e a categoria, parcele quando precisar, e dê baixa no dia em que pagar.'] },
    ],
  },
  // ───────────────────────── 4. Contas a receber
  {
    n: 4, file: '04-contas-a-receber', mod: 'financeiro', title: 'Contas a receber: lançar e receber', routes: ['/receber'], start: '/',
    desc: 'Lançar o que seus clientes vão pagar, acompanhar quem está em dia e registrar o recebimento.',
    learn: ['Lançar uma conta a receber', 'Acompanhar vencidas e a vencer', 'Registrar o recebimento'],
    setup: async (api, h) => { await seedBasics(api, h); return {}; },
    steps: [
      { tag: 'Lançar', act: async (h) => { await h.go('/receber'); await h.click(btn(h, 'Novo'), { wait: 1000 }); const d = h.dlg(); await h.type(d.getByLabel('Descrição'), 'Inscrições do curso de férias', { delay: 35 }); await h.type(d.getByLabel('Valor total'), '320000', { delay: 50 }); await h.type(d.getByLabel('Vencimento'), '25/11/2026'); await h.spot(d); },
        say: ['Em Contas a receber, clique em Novo. Descrição, valor e vencimento, do mesmo jeito que nas contas a pagar.'] },
      { act: async (h) => { const d = h.dlg(); await h.type(d.getByPlaceholder(/Buscar cliente/), 'Escola', { delay: 70 }); await h.sleep(800); await h.click(d.getByRole('option').first(), { wait: 500 }); await pick(d.getByLabel('Categoria'), /Prestação de serv/); await h.unspot(); await h.click(d.getByRole('button', { name: 'Lançar' }), { wait: 1500 }); await h.spot(h.page.locator('main table, main ul').first()); },
        say: ['Escolha o cliente e a categoria, e clique em Lançar. A conta entra na lista e na previsão do fluxo de caixa.'] },
      { tag: 'Receber', act: async (h) => { await h.unspot(); const row = h.page.locator('main tr').filter({ hasText: 'Aluguel do salão' }).first(); await h.click(row.getByRole('button', { name: /Dar baixa|Receber/ }), { wait: 1200 }); await pick(h.dlg().getByLabel(/com a conta|na conta|Conta/), /Banco Exemplo/); await h.spot(h.dlg()); },
        say: ['O cliente pagou? Abra a conta e registre o recebimento: a data, o valor e a conta onde o dinheiro entrou.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: /Confirmar/ }).last(), { wait: 1500 }); await h.esc(); await h.spot(h.page.locator('main table').first()); },
        say: ['Confirme. O dinheiro entra no saldo e a conta sai da lista de abertas. Quem atrasa aparece no relatório de inadimplência.'] },
    ],
  },
  // ensaio de exploração (não vira vídeo): uma captura de cada tela
  { n: 99, file: '99-tour', mod: 'inicio', title: 'Tour', routes: [], desc: 'Exploração', learn: ['a', 'b', 'c'],
    steps: TOUR.map((r) => ({ act: async (h) => { await h.go(r); await h.sleep(600); }, say: [r] })) },
];
