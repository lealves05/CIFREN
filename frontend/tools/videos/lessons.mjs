// Roteiro das vídeo-aulas do CIFREN. Cada passo: act (o que acontece na tela) e say (falas = legendas, até ~2 linhas cada).
// Cada aula tem cartão de abertura + passos com selo "Passo X de N" (passos com `tag`) + cartão final (record.mjs).
// Dados 100% fictícios: cada aula cria uma organização nova no banco de gravação e a preenche pela API (setup).

export const MODULES = [
  { key: 'inicio', label: 'Primeiros passos' },
  { key: 'financeiro', label: 'Contas a pagar e a receber' },
  { key: 'banco', label: 'Bancos e conciliação' },
  { key: 'controle', label: 'Aprovações, compras e despesas' },
  { key: 'documentos', label: 'Documentos e inteligência artificial' },
  { key: 'associados', label: 'Associados e mensalidades' },
  { key: 'relatorios', label: 'Relatórios e contador' },
  { key: 'lorler', label: 'Integrações LORLER' },
  { key: 'config', label: 'Equipe e segurança' },
];

// ---- cartões explicativos (mesmo visual do cartão de abertura) ----
const LOGO = '<span class="l"><img src="/favicon.svg" alt="" /></span>';
export const slide = (tag, title, body) => `<div class="k">${LOGO}CIFREN · TREINAMENTO</div><div class="n">${tag}</div><h1 style="font-size:50px">${title}</h1>${body}<div class="m">Dados fictícios de exemplo</div>`;
const slist = (items, size) => `<ul class="b ${size || (items.length <= 3 ? 'lg' : items.length >= 5 ? 'sm' : 'md')}">${items.map((t, i) => `<li data-i="${i + 1}">${t}</li>`).join('')}</ul>`;
const flowc = (items) => `<div class="flow w">${items.map((t, i) => `${i ? '<span class="ar">→</span>' : ''}<div>${t}</div>`).join('')}</div>`;
const para = (t) => `<p class="s">${t}</p>`;
const alert = (title, items) => `<div class="warn"><div class="nh">${title}</div><ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul></div>`;

// ---- atalhos de tela ----
const btn = (h, name) => h.page.getByRole('button', { name, exact: true }).locator('visible=true').first();
const tab = (h, name) => h.page.getByRole('tab', { name, exact: true });
const row = (h, text) => h.page.locator('tr', { hasText: text }).locator('visible=true').first();
const dl = (h, re) => h.dlg().getByLabel(re).first();
/** Escolhe a opção cujo texto contém `text` (as opções podem trazer o tipo, o saldo etc.). */
const pick = async (sel, text) => { const o = sel.locator('option', { hasText: text }).first(); const v = await o.getAttribute('value').catch(() => null); if (v != null) await sel.selectOption(v); };
/** CNPJ válido a partir de 12 números (dados fictícios, mas com dígitos verificadores certos). */
export const cnpj = (b12) => {
  const n = b12.split('').map(Number);
  const dv = (arr) => { const w = arr.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const r = arr.reduce((a, x, i) => a + x * w[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
  n.push(dv(n)); n.push(dv(n)); const s = n.join('');
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
};

// ---- datas (relativas ao dia da gravação) ----
const pad = (n) => String(n).padStart(2, '0');
export const d = (n = 0) => { const x = new Date(Date.now() + n * 86400000); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const month = (n = 0) => { const x = new Date(); x.setDate(1); x.setMonth(x.getMonth() + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`; };

// ---- dados fictícios ----
/** Base comum: conta no banco, fornecedores, clientes e alguns lançamentos (pagos e em aberto). */
export async function base(api, h, { titles = true } = {}) {
  const co = h.companyId;
  const cats = (await api('GET', '/categories')).items || [];
  const cat = (name) => cats.find((c) => c.name === name)?.id || null;
  const accs = (await api('GET', '/accounts')).items || [];
  const caixa = accs[0]?.id;
  const banco = (await api('POST', '/accounts', { company_id: co, name: 'Banco Exemplo', type: 'banco', opening_balance: 18000, opening_date: d(-90) })).id;
  const cp = async (kind, name, document, extra = {}) => (await api('POST', '/counterparties', { kind, name, document, ...extra })).id;
  const f = {
    imob: await cp('fornecedor', 'Imobiliária Central', cnpj('112223330001')),
    energia: await cp('fornecedor', 'Energia Paulista S.A.', cnpj('223334440001')),
    papel: await cp('fornecedor', 'Papelaria Lápis de Cor Ltda', cnpj('123456780001')),
    net: await cp('fornecedor', 'Internet Rápida Telecom', cnpj('334445550001')),
    padaria: await cp('cliente', 'Padaria Pão Quente', cnpj('445556660001'), { email: 'financeiro@paoquente.exemplo' }),
    mercado: await cp('cliente', 'Mercado Bom Preço', cnpj('556667770001')),
    escola: await cp('cliente', 'Escola Saber Mais', cnpj('667778880001')),
  };
  const st = { co, cats, cat, caixa, banco, f, t: {} };
  if (!titles) return st;
  const t = async (key, kind, description, amount, due, category, counterparty, extra = {}) => {
    const r = await api('POST', '/titles', { company_id: co, kind, description, amount, due_date: due, category_id: cat(category), counterparty_id: counterparty, ...extra });
    st.t[key] = r.ids?.[0]; return r.ids;
  };
  await t('aluguelPago', 'pagar', 'Aluguel da loja (setembro)', 3500, d(-21), 'Aluguel', f.imob);
  await t('energiaPaga', 'pagar', 'Conta de energia (setembro)', 612.4, d(-14), 'Energia elétrica', f.energia);
  await t('aluguel', 'pagar', 'Aluguel da loja (outubro)', 3500, d(9), 'Aluguel', f.imob);
  await t('energia', 'pagar', 'Conta de energia (outubro)', 640.15, d(4), 'Energia elétrica', f.energia);
  await t('net', 'pagar', 'Internet da loja', 189.9, d(-3), 'Internet e telefone', f.net);
  await t('papel', 'pagar', 'Material de escritório', 389.9, d(15), 'Material de escritório', f.papel);
  await t('padaria', 'receber', 'Venda de produtos — Padaria Pão Quente', 950, d(-6), 'Vendas de produtos', f.padaria);
  await t('mercado', 'receber', 'Venda de produtos — Mercado Bom Preço', 2400, d(6), 'Vendas de produtos', f.mercado);
  await t('escola', 'receber', 'Serviço de manutenção — Escola Saber Mais', 1800, d(12), 'Prestação de serviços', f.escola);
  await t('mercadoPago', 'receber', 'Venda de produtos — Mercado Bom Preço (setembro)', 2150, d(-18), 'Vendas de produtos', f.mercado);
  const pay = (id, amount, when) => api('POST', `/titles/${id}/settle`, { account_id: banco, paid_at: when, amount, method: 'pix' });
  await pay(st.t.aluguelPago, 3500, d(-21));
  await pay(st.t.energiaPaga, 612.4, d(-14));
  await pay(st.t.mercadoPago, 2150, d(-17));
  return st;
}


/** Outra pessoa da equipe (convidada pela API) com a própria sessão: para mostrar pedidos que outra pessoa aprova. */
export async function asUser(api, h, { name, email, role }) {
  const inv = await api('POST', '/users', { name, email, role_key: role });
  const call = async (cookie, method, p, body) => fetch(`${h.apiBase}/api${p}`, { method, headers: { 'content-type': 'application/json', 'x-cifren': '1', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const lr = await call(null, 'POST', '/auth/login', { email, password: inv.temporary_password });
  const cookie = (lr.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  await call(cookie, 'PUT', '/auth/password', { current_password: inv.temporary_password, new_password: 'Treinamento-2026!' });
  return async (method, p, body) => { const r = await call(cookie, method, p, body); const t = await r.text(); if (r.status >= 400) console.warn(`  [api ${name} ${method} ${p}] ${r.status} ${t.slice(0, 200)}`); try { return JSON.parse(t); } catch { return t; } };
}

export const LESSONS = [
  // ───────────────────────── Primeiros passos
  {
    n: 1, file: '01-conhecendo-o-cifren', mod: 'inicio', title: 'Conhecendo o CIFREN', routes: ['/', '/visao-geral'], start: '/',
    desc: 'A tela inicial, o menu, o mapa do sistema e onde encontrar a aula de cada tela.',
    learn: ['O que mostram os quadros do Início', 'Onde fica cada área do menu', 'Como abrir a aula da tela em que você está'],
    setup: async (api, h) => base(api, h),
    steps: [
      { tag: 'Para que serve', act: (h) => h.card(slide('Gestão financeira', 'O dinheiro da empresa num lugar só', flowc(['Contas a pagar<b>boletos, aluguel, fornecedores</b>', 'Contas a receber<b>clientes e mensalidades</b>', 'Banco<b>o extrato confere tudo</b>', 'Relatórios<b>caixa, resultado e contador</b>']))),
        say: ['O CIFREN é o sistema de gestão financeira da LORLER. Ele junta num lugar só o que a empresa tem para pagar, o que tem para receber e o que está no banco.', 'Nesta aula, você conhece a tela inicial e aprende a se localizar no sistema.'] },
      { tag: 'O Início', act: async (h) => { await h.card(null); await h.spot(h.page.getByRole('heading', { name: /Olá, Marina/ })); },
        say: ['Depois de entrar, você chega ao Início. É um resumo do seu dinheiro hoje.'] },
      { act: async (h) => { await h.spot(h.page.getByText('Saldo em caixa').locator('..').locator('..')); },
        say: ['O primeiro quadro mostra o saldo em caixa: a soma do que está nas contas bancárias e no caixa da loja.'] },
      { act: async (h) => { await h.spot(h.page.getByText('A pagar vencido').locator('..').locator('..')); },
        say: ['Ao lado, o que está vencido: contas a pagar atrasadas e clientes que ainda não pagaram. Clique no quadro para ver a lista.'] },
      { act: async (h) => { await h.spot(h.page.getByText('Pagar em 7 dias').locator('..').locator('..').locator('..')); },
        say: ['E aqui, o que vence nos próximos sete dias, para pagar e para receber.'] },
      { tag: 'Próximos vencimentos', act: async (h) => { await h.unspot(); await h.spot(h.page.getByText('Próximos vencimentos').locator('..').locator('..')); },
        say: ['Mais abaixo ficam os próximos vencimentos, do mais perto para o mais longe. Assim você nunca perde uma data.'] },
      { tag: 'O menu', act: async (h) => { await h.unspot(); await h.spot(h.page.getByRole('navigation', { name: 'Menu principal' }).or(h.page.locator('aside nav')).first()); },
        say: ['À esquerda fica o menu. Ele é dividido em grupos: Financeiro, Compras e despesas, Documentos, Relatórios e Configurações.', 'Você só vê as áreas que o seu perfil permite usar.'] },
      { act: async (h) => { await h.unspot(); await h.spot(h.page.getByRole('link', { name: 'Contas a pagar', exact: true }).first()); },
        say: ['No dia a dia, as telas mais usadas são Contas a pagar e Contas a receber.'] },
      { tag: 'Mapa do sistema', act: async (h) => { await h.click(h.page.getByRole('link', { name: 'Visão geral do CIFREN' }), { wait: 1200 }); await h.spot(h.page.getByRole('heading', { name: 'Visão geral do CIFREN' })); },
        say: ['No pé do menu, Visão geral do CIFREN abre um mapa de tudo o que o sistema faz.'] },
      { act: async (h) => { await h.unspot(); await h.scroll(380, 1100); await h.spot(h.page.getByText(/^Módulos$/i).first()); },
        say: ['O mapa mostra de onde vêm os dados, os módulos, os agentes de inteligência artificial e o que sai do sistema, como os relatórios para o contador.'] },
      { tag: 'A aula de cada tela', act: async (h) => { await h.unspot(); await h.go('/pagar'); await h.spot(h.page.getByRole('link', { name: /aula desta tela|vídeo-aulas/ })); },
        say: ['Em qualquer tela, o botão Aula, no topo, abre a vídeo-aula daquela tela.'] },
      { act: async (h) => { await h.click(h.page.getByRole('link', { name: /aula desta tela|vídeo-aulas/ }), { wait: 1400 }); await h.spot(h.page.getByRole('heading', { name: 'Suporte e treinamento' })); },
        say: ['Todas as aulas ficam em Suporte e treinamento. Dá para buscar pelo que é falado, escolher a velocidade e ler o texto da aula.'] },
      { tag: 'Enviar documento', act: async (h) => { await h.unspot(); await h.go('/'); await h.spot(btn(h, 'Enviar documento')); },
        say: ['Por fim, o botão Enviar documento, no topo, recebe a foto de um boleto, nota ou comprovante. O CIFREN lê os dados para você. Isso tem uma aula própria.'] },
    ],
  },
  {
    n: 2, file: '02-cadastros-contas-categorias-fornecedores', mod: 'inicio', title: 'Cadastros: contas, categorias e fornecedores', routes: ['/cadastros'], start: '/cadastros',
    desc: 'Cadastrar a conta do banco com o saldo de hoje, entender as categorias e cadastrar fornecedores e clientes.',
    learn: ['Cadastrar a conta do banco com o saldo inicial', 'Usar e criar categorias e subcategorias', 'Cadastrar fornecedores e clientes'],
    setup: async (api, h) => base(api, h, { titles: false }),
    steps: [
      { tag: 'Para que serve', act: (h) => h.card(slide('Antes de lançar', 'Três cadastros que organizam tudo', slist(['<b>Contas bancárias:</b> onde o dinheiro entra e sai.', '<b>Categorias:</b> do que é cada gasto e cada receita.', '<b>Fornecedores e clientes:</b> com quem você paga e recebe.']))),
        say: ['Antes de lançar as contas, vale fazer três cadastros. Eles organizam tudo o que vem depois.', 'As contas bancárias, as categorias e os fornecedores e clientes.'] },
      { tag: 'Contas bancárias', act: async (h) => { await h.card(null); await h.click(tab(h, 'Contas bancárias'), { wait: 900 }); await h.spot(h.page.getByText('Banco Exemplo').first()); },
        say: ['No menu, abra Cadastros e a aba Contas bancárias. O CIFREN já cria o Caixa, para o dinheiro da loja. Aqui também está a conta do Banco Exemplo.'] },
      { act: async (h) => { await h.unspot(); await h.click(btn(h, 'Nova conta'), { wait: 900 }); await h.spot(h.dlg()); },
        say: ['Para cadastrar outra conta, clique em Nova conta.'] },
      { act: async (h) => { await h.unspot(); await h.type(dl(h, /^Nome/), 'Banco Cooperativo', { delay: 50 }); await h.spot(dl(h, /^Nome/)); },
        say: ['Dê um nome fácil de reconhecer, como o nome do banco.'] },
      { act: async (h) => { await h.unspot(); const sb = h.dlg().getByLabel(/Saldo/).first(); await h.type(sb, '250000', { delay: 70 }); await h.spot(sb); },
        say: ['Informe o saldo de hoje, como está no extrato. A partir daqui, o CIFREN calcula o saldo sozinho, a cada pagamento e recebimento.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: /Salvar|Cadastrar/ }).last(), { wait: 1200 }); await h.spot(h.page.getByText('Banco Cooperativo').first()); },
        say: ['Salve. A conta aparece na lista e já pode ser usada.'] },
      { tag: 'Categorias', act: async (h) => { await h.unspot(); await h.click(tab(h, 'Categorias'), { wait: 1000 }); await h.spot(h.page.getByText('Ocupação', { exact: true }).first()); },
        say: ['Agora a aba Categorias. O CIFREN já vem com uma lista pronta, separada em despesas e receitas.', 'Cada categoria principal tem subcategorias. Em Ocupação, por exemplo, estão Aluguel, Condomínio e IPTU.'] },
      { act: async (h) => { await h.unspot(); await h.spot(h.page.getByRole('button', { name: 'Nova subcategoria em Ocupação' })); },
        say: ['Falta alguma? Clique no mais, ao lado da categoria principal, para criar uma subcategoria.'] },
      { act: async (h) => { await h.click(h.page.getByRole('button', { name: 'Nova subcategoria em Ocupação' }), { wait: 900 }); await h.type(dl(h, /^Nome/), 'Segurança e alarme', { delay: 50 }); await h.spot(dl(h, /^Nome/)); },
        say: ['Digite o nome. Neste exemplo, Segurança e alarme.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: /Salvar|Cadastrar|Criar/ }).last(), { wait: 1200 }); await h.spot(h.page.getByText('Segurança e alarme').first()); },
        say: ['Salve. A nova subcategoria entra embaixo de Ocupação, e já aparece nos lançamentos e nos relatórios.'] },
      { tag: 'Fornecedores e clientes', act: async (h) => { await h.unspot(); await h.click(tab(h, 'Fornecedores e clientes'), { wait: 1000 }); await h.spot(h.page.getByText('Imobiliária Central').first()); },
        say: ['Por último, a aba Fornecedores e clientes. Quem você paga e quem paga você fica aqui.'] },
      { act: async (h) => { await h.unspot(); await h.click(btn(h, 'Novo'), { wait: 900 }); await h.spot(h.dlg().getByLabel('Tipo').first()); },
        say: ['Clique em Novo. Escolha o tipo: fornecedor, cliente, ou os dois.'] },
      { act: async (h) => { await h.unspot(); const dlg = h.dlg(); await h.type(dlg.getByLabel('CPF ou CNPJ'), cnpj('778889990001').replace(/\D/g, ''), { delay: 45 }); await h.type(dlg.getByLabel(/^Nome/), 'Limpeza Brilho Total', { delay: 45 }); await h.spot(dlg.getByLabel(/^Nome/)); },
        say: ['Digite o CPF ou CNPJ e o nome. O CIFREN confere se o número é válido.'] },
      { act: async (h) => { await h.unspot(); const dlg = h.dlg(); await h.type(dlg.getByLabel('E-mail'), 'contato@brilhototal.exemplo', { delay: 30 }); await h.type(dlg.getByLabel('Telefone'), '19988776655', { delay: 45 }); await h.spot(dlg.getByLabel('Telefone')); },
        say: ['E-mail e telefone são opcionais, mas ajudam na hora de cobrar ou tirar uma dúvida.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: 'Salvar', exact: true }), { wait: 1200 }); await h.spot(h.page.getByText('Limpeza Brilho Total').first()); },
        say: ['Salve. Pronto: o fornecedor já pode ser escolhido nas contas a pagar.', 'E não precisa cadastrar tudo antes: dá para criar um fornecedor novo na hora de lançar a conta.'] },
    ],
  },

  // ───────────────────────── Contas a pagar e a receber
  {
    n: 3, file: '03-lancar-conta-a-pagar', mod: 'financeiro', title: 'Lançar uma conta a pagar, à vista ou parcelada', routes: ['/pagar'], start: '/pagar',
    desc: 'Lançar uma conta a pagar com fornecedor e categoria, parcelar em várias vezes e encontrar a conta com os filtros.',
    learn: ['Lançar uma conta com vencimento, fornecedor e categoria', 'Parcelar: valor total ou valor de cada parcela', 'Achar contas pela busca, categoria e período'],
    setup: async (api, h) => base(api, h),
    steps: [
      { tag: 'A lista', act: async (h) => { await h.spot(h.page.getByRole('heading', { name: 'Contas a pagar' })); },
        say: ['Em Contas a pagar fica tudo o que a empresa precisa pagar. A aba Abertos mostra o que ainda não foi pago, do vencimento mais perto para o mais longe.'] },
      { act: async (h) => { await h.unspot(); await h.spot(row(h, 'Internet da loja')); },
        say: ['A conta vencida aparece em destaque, para não passar.'] },
      { tag: 'Nova conta', act: async (h) => { await h.unspot(); await h.click(btn(h, 'Novo'), { wait: 900 }); await h.spot(h.dlg().getByRole('heading').first()); },
        say: ['Para lançar uma conta, clique em Novo. Os campos com asterisco são obrigatórios. O resto ajuda a organizar os relatórios.'] },
      { act: async (h) => { await h.unspot(); await h.type(dl(h, /^Descrição/), 'Manutenção do ar-condicionado', { delay: 40 }); await h.type(dl(h, /^Valor total/), '48000', { delay: 90 }); await h.fill(dl(h, /^Vencimento/), d(8)); await h.spot(dl(h, /^Valor total/)); },
        say: ['Escreva a descrição, o valor e o vencimento. O valor é digitado só com números: quatro, oito, zero, zero, zero vira quatrocentos e oitenta reais.'] },
      { tag: 'Fornecedor', act: async (h) => { await h.unspot(); const c = h.dlg().getByRole('combobox').first(); await h.type(c, 'Frio', { delay: 90 }); await h.sleep(700); await h.spot(h.dlg().getByRole('button', { name: /Cadastrar novo fornecedor/ })); },
        say: ['No campo Fornecedor, comece a digitar o nome. Se ele ainda não existe, clique em Cadastrar novo fornecedor, ali mesmo.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: /Cadastrar novo fornecedor/ }), { wait: 500 }); const nm = h.dlg().getByRole('textbox', { name: 'Nome', exact: true }); await h.type(nm, 'Friomax Climatização', { delay: 40 }); await h.click(h.dlg().getByRole('button', { name: /^Cadastrar$|^Salvar$/ }).first(), { wait: 900 }); await h.spot(h.dlg().getByText('Friomax Climatização').first()); },
        say: ['Digite o nome e confirme. O fornecedor é cadastrado e já fica escolhido.'] },
      { tag: 'Categoria', act: async (h) => { await h.unspot(); const s = dl(h, /^Categoria/); await h.spot(s); await s.selectOption({ label: 'Manutenção' }).catch(async () => { const o = await s.locator('option').allTextContents(); h.warn('categoria: ' + o.slice(0, 40).join('|')); }); await h.sleep(500); },
        say: ['Escolha a categoria. Ela diz do que é o gasto e alimenta os relatórios, como a DRE.'] },
      { act: async (h) => { await h.unspot(); await h.type(dl(h, /^Nº do documento/), 'NF 1520', { delay: 60 }); await h.spot(dl(h, /^Nº do documento/)); },
        say: ['Se quiser, anote o número da nota ou do boleto. Ajuda a achar a conta depois.'] },
      { tag: 'Parcelar', act: async (h) => { await h.unspot(); const n = dl(h, /^Número de parcelas/); await h.center(n); await h.fill(n, '3'); await h.sleep(500); await h.spot(h.dlg().locator('fieldset')); },
        say: ['A conta é parcelada? Em Número de parcelas, digite quantas vezes. Aqui, três.'] },
      { act: async (h) => { await h.unspot(); await h.spot(dl(h, /^Valor de cada parcela/)); },
        say: ['Repare que o campo de valor muda para Valor de cada parcela. Com uma parcela só, ele é o Valor total.', 'O CIFREN mostra o total e as datas de cada parcela, uma por mês.'] },
      { act: async (h) => { await h.unspot(); await h.spot(dl(h, /^Repetir/)); },
        say: ['Se as parcelas forem quinzenais, semanais ou anuais, mude em Repetir.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: 'Lançar', exact: true }), { wait: 1500 }); await h.spot(row(h, 'Manutenção do ar-condicionado (1/3)')); },
        say: ['Clique em Lançar. As três parcelas entram na lista, cada uma com o seu vencimento.'] },
      { tag: 'Achar uma conta', act: async (h) => { await h.unspot(); await h.top(); await h.type(h.page.getByLabel('Buscar').first(), 'aluguel', { delay: 80 }); await h.sleep(900); await h.spot(row(h, 'Aluguel da loja')); },
        say: ['Para achar uma conta, use a busca: descrição, fornecedor ou número do documento.'] },
      { act: async (h) => { await h.unspot(); await h.page.getByLabel('Buscar').first().fill(''); await h.sleep(500); const s = h.page.getByLabel('Categoria').first(); await h.spot(s); await s.selectOption({ label: 'Consumo (todas)' }).catch(() => h.warn('sem Consumo (todas)')); await h.sleep(1000); },
        say: ['Ou filtre por categoria. Ao escolher uma categoria principal, as subcategorias dela vêm juntas.', 'Aqui, Consumo traz energia, água e internet. O total no pé da lista soma só o que está filtrado.'] },
      { act: async (h) => { await h.unspot(); await h.fill(h.page.getByLabel('Vencimento de').first(), d(0)); await h.fill(h.page.getByLabel('até', { exact: true }).first(), d(30)); await h.sleep(900); await h.spot(h.page.getByRole('button', { name: 'Limpar' })); },
        say: ['E escolha o período de vencimento. Para voltar a ver tudo, clique em Limpar.'] },
    ],
  },
  {
    n: 4, file: '04-dar-baixa-pagar-e-receber', mod: 'financeiro', title: 'Dar baixa: registrar pagamentos e recebimentos', routes: ['/receber'], start: '/pagar',
    desc: 'Registrar que uma conta foi paga ou recebida, com juros, desconto ou valor parcial, e corrigir uma baixa feita errada.',
    learn: ['Dar baixa numa conta a pagar', 'Receber de um cliente, inclusive uma parte do valor', 'Estornar uma baixa feita errada'],
    setup: async (api, h) => base(api, h),
    steps: [
      { tag: 'Lançar e dar baixa', act: (h) => h.card(slide('Lançar não é pagar', 'A baixa é o que mexe no saldo', flowc(['Lançar<b>a conta vai vencer</b>', 'Pagar no banco<b>Pix, boleto, dinheiro…</b>', 'Dar baixa<b>o saldo da conta muda</b>']) + para('Só a baixa mexe no saldo e no fluxo de caixa realizado.'))),
        say: ['Lançar uma conta é registrar que ela vai vencer. Depois que você paga no banco, é preciso dar baixa no CIFREN.', 'A baixa registra de qual conta o dinheiro saiu, e é ela que mexe no saldo.'] },
      { tag: 'Pagar', act: async (h) => { await h.card(null); await h.spot(row(h, 'Internet da loja')); },
        say: ['Em Contas a pagar, ache a conta. Aqui, a internet da loja, que está vencida.'] },
      { act: async (h) => { await h.unspot(); await h.click(row(h, 'Internet da loja').getByRole('button', { name: /Dar baixa/ }), { wait: 900 }); await h.spot(h.dlg().getByRole('heading').first()); },
        say: ['Clique em Dar baixa. A janela mostra a conta, o vencimento e o valor em aberto.'] },
      { act: async (h) => { await h.unspot(); const s = dl(h, /Pago com a conta/); await h.spot(s); await pick(s, 'Banco Exemplo'); await h.sleep(400); },
        say: ['Escolha a conta de onde o dinheiro saiu. A data e o valor já vêm preenchidos.'] },
      { act: async (h) => { await h.unspot(); const s = dl(h, /Forma de pagamento/); await h.spot(s); await s.selectOption({ label: 'Pix' }).catch(() => {}); await h.sleep(400); },
        say: ['Diga a forma de pagamento.'] },
      { tag: 'Juros e desconto', act: async (h) => { await h.unspot(); const j = h.dlg().getByText(/Juros|multa|desconto/i).first(); await h.spot(j); await j.click().catch(() => {}); await h.sleep(500); },
        say: ['Pagou com atraso? Informe os juros e a multa. Teve desconto? Informe também. O CIFREN separa esses valores nos relatórios.'] },
      { act: async (h) => { await h.unspot(); const m = h.dlg().getByLabel('Multa', { exact: true }); if (await m.count()) { await h.type(m, '380', { delay: 90 }); await h.spot(m); } },
        say: ['Neste exemplo, três reais e oitenta de multa.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: 'Confirmar baixa' }), { wait: 1500 }); await h.click(tab(h, 'Pagos'), { wait: 1000 }); await h.spot(row(h, 'Internet da loja')); },
        say: ['Confirme. A conta sai dos abertos e vai para a aba Pagos.'] },
      { tag: 'Receber', act: async (h) => { await h.unspot(); await h.go('/receber'); await h.spot(row(h, 'Padaria Pão Quente')); },
        say: ['Em Contas a receber é igual. A Padaria Pão Quente deve novecentos e cinquenta reais, e pagou só uma parte.'] },
      { act: async (h) => { await h.unspot(); await h.click(row(h, 'Padaria Pão Quente').getByRole('button', { name: /Dar baixa/ }), { wait: 900 }); const s = dl(h, /Recebido na conta/); await pick(s, 'Banco Exemplo'); const v = dl(h, /^Valor/); await h.type(v, '50000', { delay: 90 }); await h.spot(v); },
        say: ['Clique em Dar baixa, escolha a conta onde o dinheiro entrou e digite o valor que chegou: quinhentos reais.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: 'Confirmar baixa' }), { wait: 1500 }); await h.spot(row(h, 'Padaria Pão Quente')); },
        say: ['Confirme. A conta continua nos abertos, como paga em parte, e mostra quanto ainda falta receber.'] },
      { tag: 'Corrigir uma baixa', act: async (h) => { await h.unspot(); await h.click(row(h, 'Padaria Pão Quente').getByRole('button', { name: /^Mais ações/ }).first(), { wait: 600 }); await h.click(h.page.getByRole('menuitem', { name: 'Ver detalhes' }), { wait: 1000 }); await h.scroll(300); await h.spot(h.dlg().getByRole('button', { name: /Estornar/ }).first()); },
        say: ['Deu baixa errado? Abra os detalhes da conta. Na lista de baixas, clique em Estornar.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: /Estornar/ }).first(), { wait: 800 }); const m = h.page.getByLabel(/Motivo do estorno/).last(); await h.type(m, 'Valor digitado errado', { delay: 40 }); await h.spot(m); },
        say: ['Escreva o motivo. O estorno desfaz a baixa e devolve o valor à conta, mas tudo fica registrado na auditoria.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.page.getByRole('button', { name: 'Estornar', exact: true }).locator('visible=true').last(), { wait: 1400 }); await h.spot(h.page.getByText(/Estornada em/).first()); await h.sleep(1500); await h.esc(); await h.card(slide('Resumo', 'Do lançamento à baixa', slist(['Pagou ou recebeu? Dê baixa, escolhendo a conta.', 'Juros, multa e desconto ficam separados.', 'Recebeu só uma parte? A conta fica paga em parte.', 'Errou? Estorne a baixa, com o motivo.']))); },
        say: ['Resumindo: pagou ou recebeu, dê baixa e escolha a conta. Recebeu só uma parte, a conta fica paga em parte. E se errar, estorne com o motivo.'] },
    ],
  },
  {
    n: 5, file: '05-corrigir-lancamento-parcelado', mod: 'financeiro', title: 'Corrigir ou excluir uma conta parcelada inteira', routes: [], start: '/pagar',
    desc: 'Abrir o lançamento original de uma conta parcelada para mudar valor, datas ou fornecedor em todas as parcelas de uma vez, ou excluir tudo.',
    learn: ['Abrir o lançamento original pelas parcelas', 'Mudar valor e vencimentos de todas as parcelas em aberto', 'Excluir um lançamento feito errado'],
    setup: async (api, h) => {
      const st = await base(api, h);
      const r = await api('POST', '/titles', { company_id: st.co, kind: 'pagar', description: 'Financiamento da máquina de café', amount: 850, due_date: d(-25), installments: 10, category_id: st.cat('Empréstimos e financiamentos'), counterparty_id: st.f.papel });
      await api('POST', `/titles/${r.ids[0]}/settle`, { account_id: st.banco, paid_at: d(-25), amount: 850, method: 'boleto' });
      await api('POST', '/titles', { company_id: st.co, kind: 'pagar', description: 'Seguro da loja', amount: 210, due_date: d(10), installments: 4, category_id: st.cat('Outros impostos') });
      return st;
    },
    steps: [
      { tag: 'O problema', act: (h) => h.card(slide('Lançou errado?', 'Uma parcela ou todas', slist(['<b>Editar só esta parcela:</b> muda uma parcela.', '<b>Lançamento original:</b> muda todas as parcelas em aberto de uma vez.', 'Parcela já paga não muda: ela fica protegida.']))),
        say: ['Uma conta parcelada vira várias parcelas na lista. Às vezes, o valor ou o dia de vencimento foi lançado errado em todas elas.', 'Em vez de corrigir uma por uma, use o lançamento original.'] },
      { tag: 'Abrir o original', act: async (h) => { await h.card(null); await h.type(h.page.getByLabel('Buscar').first(), 'financiamento', { delay: 70 }); await h.sleep(900); await h.spot(row(h, 'Financiamento da máquina de café (2/10)')); },
        say: ['Ache uma das parcelas. Aqui, o financiamento da máquina de café, em dez vezes, com a primeira já paga.'] },
      { act: async (h) => { await h.unspot(); await h.click(row(h, 'Financiamento da máquina de café (2/10)').getByRole('button', { name: /^Mais ações/ }), { wait: 600 }); await h.spot(h.page.getByRole('menuitem', { name: /Lançamento original/ })); },
        say: ['Clique nos três pontinhos da parcela. Editar só esta parcela muda uma. Lançamento original abre todas.'] },
      { act: async (h) => { await h.click(h.page.getByRole('menuitem', { name: /Lançamento original/ }), { wait: 1200 }); await h.spot(h.dlg().getByRole('heading', { name: 'Lançamento original' })); },
        say: ['Abre o lançamento original, com o total, quanto já foi pago e a lista das parcelas.'] },
      { act: async (h) => { await h.unspot(); await h.scroll(420); await h.spot(h.dlg().locator('[aria-label="Tem pagamento: não muda"]').first().locator('..').locator('..')); },
        say: ['A parcela que já foi paga aparece com um cadeado. Ela não muda, para não bagunçar o que já saiu do banco.'] },
      { tag: 'Corrigir todas', act: async (h) => { await h.unspot(); const v = dl(h, /^Valor de cada parcela/); await h.center(v); await h.type(v, '87000', { delay: 90 }); await h.spot(v); },
        say: ['O valor certo era oitocentos e setenta reais. Mude em Valor de cada parcela.'] },
      { act: async (h) => { await h.unspot(); const v = dl(h, /^Vencimento da 1ª parcela em aberto/); await h.fill(v, d(8)); await h.spot(v); },
        say: ['E, se o dia do vencimento estava errado, mude a data da primeira parcela em aberto. As outras acompanham, uma por mês.'] },
      { act: async (h) => { await h.unspot(); await h.spot(dl(h, /^Quantidade de parcelas/)); },
        say: ['Dá até para mudar a quantidade de parcelas: o CIFREN cria ou cancela as que sobrarem.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: 'Salvar em todas as parcelas' }), { wait: 1500 }); await h.spot(row(h, 'Financiamento da máquina de café (2/10)')); },
        say: ['Clique em Salvar em todas as parcelas. Pronto: as parcelas em aberto ficaram com o valor e as datas novas.'] },
      { tag: 'Excluir tudo', act: async (h) => { await h.unspot(); await h.page.getByLabel('Buscar').first().fill('seguro'); await h.sleep(900); await h.click(row(h, 'Seguro da loja (1/4)').getByRole('button', { name: /^Mais ações/ }), { wait: 600 }); await h.click(h.page.getByRole('menuitem', { name: /Lançamento original/ }), { wait: 1200 }); await h.spot(h.dlg().getByRole('button', { name: /Excluir lançamento/ })); },
        say: ['E se a conta inteira foi lançada por engano? Aqui, um seguro em quatro vezes que nem era desta empresa.', 'No lançamento original, clique em Excluir lançamento.'] },
      { act: async (h) => { await h.click(h.dlg().getByRole('button', { name: /Excluir lançamento/ }), { wait: 900 }); const m = h.page.getByLabel(/Motivo/).last(); if (await m.count()) await h.type(m, 'Lançado na empresa errada', { delay: 40 }); await h.spot(h.page.getByRole('button', { name: /^Excluir|Confirmar|Cancelar todas/ }).locator('visible=true').last()); },
        say: ['O CIFREN pede a confirmação. As parcelas são canceladas, e o registro fica na auditoria, com quem fez e quando.'] },
      { act: async (h) => { await h.click(h.page.getByRole('button', { name: /^Excluir|Confirmar|Cancelar todas/ }).locator('visible=true').last(), { wait: 1500 }); await h.unspot(); await h.card(slide('Resumo', 'Parcelas sem retrabalho', slist(['Três pontinhos › Lançamento original.', 'Mude valor, datas, quantidade ou fornecedor de uma vez.', 'Parcela paga fica protegida.', 'Lançou errado? Exclua o lançamento inteiro.']))); },
        say: ['Resumindo: pelos três pontinhos, abra o lançamento original. Corrija tudo de uma vez, ou exclua o lançamento inteiro. As parcelas pagas ficam protegidas.'] },
    ],
  },
  {
    n: 6, file: '06-recorrentes-e-previsao', mod: 'financeiro', title: 'Contas que se repetem todo mês e a previsão', routes: ['/recorrentes'], start: '/recorrentes',
    desc: 'Cadastrar aluguel, energia e outras contas mensais para o CIFREN criar a conta sozinho, prever o valor e avisar quando a conta não chegou.',
    learn: ['Cadastrar um compromisso a partir de um modelo pronto', 'Informar o valor real quando a conta chega', 'Ver a previsão do ano e o ponto de equilíbrio'],
    setup: async (api, h) => {
      const st = await base(api, h);
      await api('POST', '/recurring', { kind: 'pagar', name: 'Conta de energia — loja', company_id: st.co, counterparty_id: st.f.energia, category_id: st.cat('Energia elétrica'),
        frequency: 'mensal', due_day: 25, start_date: d(-120), method: 'media', estimated_amount: 620, average_n: 3, tolerance_pct: 10, lead_days: 10 });
      await api('POST', '/recurring', { kind: 'pagar', name: 'Internet da loja', company_id: st.co, counterparty_id: st.f.net, category_id: st.cat('Internet e telefone'),
        frequency: 'mensal', due_day: 18, start_date: d(-90), method: 'fixo', estimated_amount: 189.9, tolerance_pct: 5, lead_days: 7 });
      return st;
    },
    steps: [
      { tag: 'Para que serve', act: (h) => h.card(slide('Compromissos', 'O que se repete, o CIFREN prevê', flowc(['Você cadastra uma vez<b>aluguel, energia, salário…</b>', 'Dias antes do vencimento<b>a conta é criada sozinha</b>', 'A conta chega<b>você informa o valor real</b>']) + para('Se a conta não chegar ou vier muito diferente, o CIFREN avisa.'))),
        say: ['Aluguel, energia, internet, salário: muitas contas se repetem todo mês.', 'Cadastre uma vez como compromisso. O CIFREN cria a conta alguns dias antes do vencimento, prevê o valor e avisa se ela não chegar.'] },
      { tag: 'Novo compromisso', act: async (h) => { await h.card(null); await h.click(btn(h, 'Novo compromisso'), { wait: 900 }); await h.spot(h.dlg()); },
        say: ['Em Recorrentes e previsão, clique em Novo compromisso. Há modelos prontos para as contas mais comuns.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: /^Aluguel/ }), { wait: 900 }); await h.spot(dl(h, /^Nome/)); },
        say: ['Escolha Aluguel. O formulário já vem com o tipo, a frequência mensal e o valor fixo.'] },
      { act: async (h) => { await h.unspot(); const n = dl(h, /^Nome/); await h.type(n, 'Aluguel da loja', { delay: 45 }); const c = h.dlg().getByRole('combobox').first(); await h.type(c, 'Imobi', { delay: 80 }); await h.sleep(800); await h.page.getByRole('option', { name: /Imobiliária Central/ }).first().dispatchEvent('mousedown').catch(() => {}); await h.sleep(500); await h.spot(h.dlg().getByText('Imobiliária Central').first()); },
        say: ['Dê um nome e escolha o fornecedor, a imobiliária.'] },
      { act: async (h) => { await h.unspot(); const dd = dl(h, /^Dia do vencimento/); await h.fill(dd, '10'); const v = dl(h, /^Valor fixo/); await h.center(v); await h.type(v, '350000', { delay: 80 }); await h.spot(v); },
        say: ['Informe o dia do vencimento, dez, e o valor fixo de três mil e quinhentos reais.'] },
      { act: async (h) => { await h.unspot(); const ld = dl(h, /quantos dias antes/); await h.center(ld); await h.spot(ld); },
        say: ['Aqui você diz quantos dias antes o CIFREN cria a conta. Ela nasce como valor estimado, aguardando a conta.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: 'Salvar', exact: true }), { wait: 1500 }); await h.spot(h.page.getByText('Aluguel da loja').first()); },
        say: ['Salve. O compromisso entra na lista, com o próximo vencimento e o valor previsto.'] },
      { tag: 'Valor que muda', act: async (h) => { await h.unspot(); await h.spot(h.page.getByText('Conta de energia — loja').first()); },
        say: ['A energia muda todo mês. Por isso ela foi cadastrada com a média dos últimos meses.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.page.getByText('Conta de energia — loja').first(), { wait: 1200 }); await h.spot(h.dlg().getByRole('button', { name: 'Informar valor real' }).first()); },
        say: ['Clique no compromisso para ver as ocorrências: o valor estimado e o real de cada mês.', 'Quando a conta chegar, clique em Informar valor real.'] },
      { act: async (h) => { await h.click(h.dlg().getByRole('button', { name: 'Informar valor real' }).first(), { wait: 900 }); const v = h.page.getByLabel(/Valor que veio na conta/).last(); await h.type(v, '71290', { delay: 90 }); await h.spot(v); },
        say: ['Digite o valor que veio na conta. Aqui, setecentos e doze reais e noventa.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.page.getByRole('button', { name: 'Salvar', exact: true }).locator('visible=true').last(), { wait: 1500 }); await h.spot(h.dlg().getByText(/Erro médio da estimativa/).first().locator('..')); },
        say: ['O valor real vai para a conta a pagar. Se ele passar muito da estimativa, o CIFREN avisa. E a média dos próximos meses fica mais certeira.'] },
      { tag: 'Relatório do ano', act: async (h) => { await h.unspot(); await h.esc(); await h.click(tab(h, 'Relatório do ano'), { wait: 1500 }); await h.spot(h.page.getByRole('main').locator('table, .card').first()); },
        say: ['Na aba Relatório do ano, você vê mês a mês quanto os compromissos vão custar.'] },
      { act: async (h) => { await h.unspot(); const be = h.page.getByText('Ponto de equilíbrio').first(); if (await be.count()) await h.spot(be.locator('..')); },
        say: ['E o ponto de equilíbrio: quanto a empresa precisa faturar no mês para cobrir as contas fixas.'] },
    ],
  },

  // ───────────────────────── Bancos e conciliação
  {
    n: 7, file: '07-conciliacao-bancaria', mod: 'banco', title: 'Conciliação: conferir o extrato do banco', routes: ['/conciliacao'], start: '/conciliacao',
    desc: 'Importar o extrato do banco (OFX), ligar cada linha à conta certa, conciliar automaticamente e lançar o que faltava.',
    learn: ['Importar o extrato do banco', 'Conciliar cada linha com a conta certa', 'Criar lançamento para o que não estava no CIFREN'],
    setup: async (api, h) => {
      const st = await base(api, h);
      const dd = (n) => d(n).replace(/-/g, '');
      const ofx = `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${dd(-2)}120000<TRNAMT>-189.90<FITID>T1<MEMO>PIX INTERNET RAPIDA TELECOM</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${dd(-2)}120000<TRNAMT>-29.90<FITID>T2<MEMO>TARIFA PACOTE DE SERVICOS</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>${dd(-1)}120000<TRNAMT>950.00<FITID>T3<MEMO>PIX RECEBIDO PADARIA PAO QUENTE</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${dd(-1)}120000<TRNAMT>-45.00<FITID>T4<MEMO>COMPRA CARTAO POSTO</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
      const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
      const file = path.join(os.tmpdir(), 'extrato-banco-exemplo.ofx'); fs.writeFileSync(file, ofx);
      return { ...st, ofx: file };
    },
    steps: [
      { tag: 'Para que serve', act: (h) => h.card(slide('Conciliação', 'O extrato confere o CIFREN', flowc(['Extrato do banco<b>arquivo OFX ou CSV</b>', 'Cada linha<b>ligada a uma conta</b>', 'Sobrou linha?<b>é algo que faltava lançar</b>']) + para('Assim o saldo do CIFREN fica igual ao do banco.'))),
        say: ['Conciliar é conferir o extrato do banco com o que está no CIFREN. Cada linha do extrato é ligada a uma conta a pagar ou a receber.', 'O que sobrar é algo que faltava lançar. Assim, o saldo do CIFREN fica igual ao do banco.'] },
      { tag: 'Importar', act: async (h) => { await h.card(null); const s = h.page.getByLabel('Conta bancária').first(); await h.spot(s); await pick(s, 'Banco Exemplo'); await h.sleep(800); },
        say: ['Primeiro, no site ou no aplicativo do banco, baixe o extrato no formato OFX. Depois, em Conciliação, escolha a conta bancária.'] },
      { act: async (h, st) => { await h.unspot(); await h.spot(btn(h, 'Importar extrato')); const inp = h.page.locator('input[type=file]').first(); await inp.setInputFiles(st.ofx); await h.sleep(2200); },
        say: ['Clique em Importar extrato e escolha o arquivo. O CIFREN lê as linhas e não importa o mesmo extrato duas vezes.'] },
      { tag: 'Conciliar', act: async (h) => { await h.unspot(); await h.spot(h.page.getByText('PIX INTERNET RAPIDA TELECOM').first().locator('xpath=ancestor::li[1] | ancestor::tr[1]').first()); },
        say: ['Cada linha aparece com uma sugestão. O pagamento da internet já foi reconhecido: mesmo valor, data perto, a conta a pagar da internet.'] },
      { act: async (h) => { await h.unspot(); const l = h.page.getByText('PIX INTERNET RAPIDA TELECOM').first().locator('xpath=ancestor::li[1] | ancestor::tr[1]').first(); await h.click(l.getByRole('button', { name: /Conciliar/ }).first(), { wait: 1500 }); await h.spot(tab(h, 'Conciliadas')); },
        say: ['Clique em Conciliar. A linha sai das pendentes, e a conta a pagar recebe a baixa sozinha, com a data do banco.'] },
      { tag: 'Automático', act: async (h) => { await h.unspot(); await h.click(btn(h, 'Conciliar automaticamente'), { wait: 2000 }); await h.spot(h.page.getByRole('main')); },
        say: ['Muitas linhas? Clique em Conciliar automaticamente. O CIFREN liga as linhas em que tem certeza, como o Pix da Padaria Pão Quente.'] },
      { tag: 'O que faltava', act: async (h) => { await h.unspot(); await h.spot(h.page.getByText('TARIFA PACOTE DE SERVICOS').first().locator('xpath=ancestor::li[1] | ancestor::tr[1]').first()); },
        say: ['Sobrou a tarifa do banco. Ela não estava lançada no CIFREN.'] },
      { act: async (h) => { await h.unspot(); const l = h.page.getByText('TARIFA PACOTE DE SERVICOS').first().locator('xpath=ancestor::li[1] | ancestor::tr[1]').first(); await h.click(l.getByRole('button', { name: /Criar lançamento/ }).first(), { wait: 1000 }); await h.spot(h.dlg()); },
        say: ['Clique em Criar lançamento. O CIFREN já preenche o valor e a data do banco.'] },
      { act: async (h) => { await h.unspot(); const de = dl(h, /^Descrição/); await h.type(de, 'Tarifa bancária', { delay: 45 }); const c = dl(h, /^Categoria/); await h.spot(c); await pick(c, 'Taxas bancárias'); await h.sleep(500); },
        say: ['Dê uma descrição e escolha a categoria: taxas bancárias.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: 'Criar e conciliar' }), { wait: 1500 }); await h.spot(h.page.getByText('COMPRA CARTAO POSTO').first().locator('xpath=ancestor::li[1] | ancestor::tr[1]').first()); },
        say: ['Clique em Criar e conciliar. A conta é criada já paga, e a linha fica conciliada.', 'Se uma linha não tem nada a ver com a empresa, use Ignorar. E se conciliou errado, na aba Conciliadas há o botão Desfazer.'] },
    ],
  },

  // ───────────────────────── Aprovações, compras e despesas
  {
    n: 8, file: '08-aprovacoes-e-alcadas', mod: 'controle', title: 'Aprovações e alçadas: quem libera cada pagamento', routes: ['/aprovacoes', '/configuracoes/alcadas'], start: '/configuracoes/alcadas',
    desc: 'Definir a partir de qual valor uma conta precisa de aprovação e aprovar ou reprovar os pedidos da equipe.',
    learn: ['Criar uma alçada de aprovação', 'Ver o pedido que chegou para aprovar', 'Aprovar ou reprovar, com o motivo'],
    setup: async (api, h) => {
      const st = await base(api, h);
      st.paulo = await asUser(api, h, { name: 'Paulo Lima', email: `paulo${Date.now()}@treinamento.cifren.app`, role: 'financeiro' });
      return st;
    },
    steps: [
      { tag: 'Para que serve', act: (h) => h.card(slide('Controle', 'Conta grande passa por aprovação', flowc(['Alguém da equipe lança<b>uma conta acima da alçada</b>', 'O aprovador é avisado<b>no sino e por e-mail</b>', 'Aprovou?<b>só então pode ser paga</b>']) + para('Quem pede não aprova o próprio pedido.'))),
        say: ['Na equipe, nem todo mundo deve pagar qualquer valor sem conferência.', 'Com uma alçada, a conta acima de um valor só pode ser paga depois de aprovada. E quem pede nunca aprova o próprio pedido.'] },
      { tag: 'Criar a alçada', act: async (h) => { await h.card(null); await h.click(btn(h, 'Nova alçada'), { wait: 900 }); await h.spot(h.dlg()); },
        say: ['Em Configurações, Alçadas de aprovação, clique em Nova alçada.'] },
      { act: async (h) => { await h.unspot(); const s = dl(h, /O que precisa de aprovação/); await h.spot(s); await h.sleep(400); },
        say: ['Escolha o que precisa de aprovação. Aqui, contas a pagar e a receber.'] },
      { act: async (h) => { await h.unspot(); const v = dl(h, /A partir de/); await h.type(v, '100000', { delay: 90 }); await h.spot(v); },
        say: ['Digite o valor: a partir de mil reais, a conta precisa de aprovação.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: 'Salvar', exact: true }), { wait: 1400 }); await h.spot(h.page.getByRole('main').locator('li, tr, .card').filter({ hasText: /1\.000/ }).first()); },
        say: ['Salve. A regra fica ligada na hora. Você pode ter regras diferentes para compras e despesas.'] },
      { tag: 'Chegou um pedido', act: async (h, st) => { await h.unspot(); await st.paulo('POST', '/titles', { company_id: st.co, kind: 'pagar', description: 'Compra de freezer para a loja', amount: 4800, due_date: d(12), category_id: st.cat('Compras de mercadorias'), counterparty_id: st.f.papel }); await h.go('/aprovacoes'); await h.spot(h.page.getByText('Compra de freezer para a loja').first()); },
        say: ['O Paulo, do financeiro, lançou a compra de um freezer de quatro mil e oitocentos reais. Como passou da alçada, o pedido veio para Aprovações.', 'Você também recebe o aviso no sino, no topo da tela.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.page.getByRole('button', { name: /Ver detalhes/ }).first(), { wait: 1100 }); await h.spot(h.dlg()); },
        say: ['Clique em Ver detalhes para conferir quem pediu, o valor, o fornecedor e o vencimento.'] },
      { tag: 'Aprovar', act: async (h) => { await h.unspot(); await h.esc(); await h.spot(h.page.getByRole('button', { name: /Aprovar/ }).first()); },
        say: ['Tudo certo? Clique em Aprovar. Se não concordar, Reprovar, e escreva o motivo: o Paulo é avisado.'] },
      { act: async (h) => { await h.click(h.page.getByRole('button', { name: /Aprovar/ }).first(), { wait: 900 }); const c = h.page.getByRole('button', { name: /^Aprovar$|Confirmar/ }).locator('visible=true').last(); if (await c.count()) await h.click(c, { wait: 1200 }); await h.click(tab(h, 'Aprovadas'), { wait: 1100 }); await h.spot(h.page.getByText('Compra de freezer para a loja').first()); },
        say: ['Aprovado. O pedido vai para a aba Aprovadas, e a conta já pode receber a baixa em Contas a pagar.', 'Enquanto não é aprovada, a conta aparece como aguardando aprovação, e o botão de baixa fica travado.'] },
    ],
  },
];
