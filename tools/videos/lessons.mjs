import fs from 'node:fs';
import path from 'node:path';
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
/** Abre a compra (cartão da lista) se o botão de ação ainda não estiver na tela. */
export const openPurchase = async (h, action) => { const b = h.page.getByRole('button', { name: action }).locator('visible=true'); if (!(await b.count())) await h.click(h.page.locator('main').getByText('Cadeiras para o salão').first(), { wait: 1200 }); return b.first(); };
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

/** Extrato OFX FICTÍCIO (Banco Exemplo) com as mesmas contas de seedBasics: energia paga, aluguel recebido e uma tarifa sem lançamento. */
export function sampleOfx() {
  const d = (n) => inDays(n).replace(/-/g, '');
  const tx = (type, n, amt, memo, id) => `<STMTTRN><TRNTYPE>${type}<DTPOSTED>${d(n)}120000<TRNAMT>${amt}<FITID>${id}<MEMO>${memo}</STMTTRN>`;
  const body = `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nENCODING:USASCII\nCHARSET:1252\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL<BANKACCTFROM><BANKID>999<ACCTID>123456<ACCTTYPE>CHECKING</BANKACCTFROM><BANKTRANLIST><DTSTART>${d(-15)}<DTEND>${d(0)}`
    + tx('DEBIT', -3, '-890.40', 'PAG CONTA ENERGIA EXEMPLO', 'EX001') + tx('CREDIT', -2, '2500.00', 'PIX RECEBIDO ESCOLA EXEMPLO', 'EX002')
    + tx('DEBIT', -1, '-12.90', 'TARIFA PACOTE DE SERVICOS', 'EX003') + '</BANKTRANLIST><LEDGERBAL><BALAMT>20097.70<DTASOF>' + d(0) + '</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n';
  const dir = path.resolve('out', 'amostras'); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'extrato-banco-exemplo.ofx'); fs.writeFileSync(f, body); return f;
}

/** Linha digitável de boleto bancário FICTÍCIA (banco 999, campo livre de exemplo) com dígitos verificadores válidos. */
export function sampleBoleto(amount, dueISO) {
  const mod10 = (n) => { let sum = 0; let w = 2; for (let i = n.length - 1; i >= 0; i--) { let p = Number(n[i]) * w; if (p > 9) p = Math.floor(p / 10) + (p % 10); sum += p; w = w === 2 ? 1 : 2; } return (10 - (sum % 10)) % 10; };
  const mod11 = (n) => { let sum = 0; let w = 2; for (let i = n.length - 1; i >= 0; i--) { sum += Number(n[i]) * w; w = w === 9 ? 2 : w + 1; } const r = 11 - (sum % 11); return r === 0 || r === 10 || r === 11 ? 1 : r; };
  const factor = String(1000 + Math.round((Date.parse(`${dueISO}T00:00:00Z`) - Date.UTC(2025, 1, 22)) / 86400000)).padStart(4, '0');
  const value = String(Math.round(amount * 100)).padStart(10, '0');
  const free = '1234567890123456789012345';
  const head = '9999';
  const dv = mod11(head + factor + value + free);
  const f1 = head + free.slice(0, 5); const f2 = free.slice(5, 15); const f3 = free.slice(15, 25);
  return `${f1.slice(0, 5)}.${f1.slice(5)}${mod10(f1)} ${f2.slice(0, 5)}.${f2.slice(5)}${mod10(f2)} ${f3.slice(0, 5)}.${f3.slice(5)}${mod10(f3)} ${dv} ${factor}${value}`;
}

const TOUR = ['/', '/pagar', '/receber', '/aprovacoes', '/conciliacao', '/associados', '/recorrentes', '/compras', '/despesas', '/documentos',
  '/relatorios/fluxo', '/relatorios/dre', '/relatorios/inadimplencia', '/cadastros', '/empresas', '/usuarios', '/configuracoes/alcadas', '/configuracoes/assinatura', '/assistente', '/suporte'];

export const LESSONS = [
  // ───────────────────────── 5. Alçadas e aprovações
  {
    n: 5, file: '05-alcadas-e-aprovacoes', mod: 'financeiro', title: 'Alçadas e aprovações: quem autoriza o pagamento', routes: ['/aprovacoes', '/configuracoes/alcadas'], start: '/',
    desc: 'Definir a partir de que valor uma conta, compra ou reembolso precisa de aprovação, e aprovar ou reprovar o que está esperando.',
    learn: ['Criar uma alçada de aprovação', 'O que acontece com a conta acima do valor', 'Aprovar ou reprovar, com o motivo'],
    setup: async (api, h) => {
      await seedBasics(api, h, { titles: false });
      await api('POST', '/approval-rules', { entity: 'title', min_amount: 2000, active: true });
      const u = await api('POST', '/users', { name: 'Bruno Lima', email: `bruno${Date.now()}@treinamento.cifren.app`, role_key: 'lancamentos' });
      await api('POST', '/titles', { kind: 'pagar', company_id: h.companyId, description: 'Reforma do telhado da sede', amount: 3500, due_date: inDays(8) });
      if (u?.id) await h.sql("update approvals set requested_by = $1, requested_by_name = 'Bruno Lima' where org_id = $2", [u.id, h.orgId]);
      return {};
    },
    steps: [
      { tag: 'Para que serve', act: (h) => h.card(slide('Alçadas', 'Ninguém paga sozinho o que é grande', slist(['Acima do valor da alçada, a conta espera um “ok”.', 'Quem lançou não pode aprovar o próprio pedido.', 'Só depois de aprovada a conta pode ser paga.']))),
        say: ['A alçada define a partir de quanto uma conta, uma compra ou um reembolso precisa ser aprovado por outra pessoa.'] },
      { tag: 'Criar a alçada', act: async (h) => { await h.card(null); await h.go('/configuracoes/alcadas'); await h.spot(h.page.locator('main .card').filter({ hasText: /2\.000/ }).first()); },
        say: ['Em Configurações, Alçadas de aprovação. Aqui, contas a pagar a partir de dois mil reais precisam de aprovação.'] },
      { act: async (h) => { await h.unspot(); await h.click(btn(h, 'Nova alçada'), { wait: 900 }); await h.spot(h.dlg()); },
        say: ['Em Nova alçada, escolha o que precisa de aprovação, a empresa e o valor a partir do qual vale a regra.'] },
      { act: async (h) => { await h.unspot(); await h.esc(); await h.go('/pagar'); await h.spot(h.page.locator('main tr').filter({ hasText: 'Reforma do telhado' }).first()); },
        say: ['O Bruno lançou a reforma do telhado, de três mil e quinhentos reais. Ela fica aguardando aprovação e ainda não pode ser paga.'] },
      { tag: 'Aprovar', act: async (h) => { await h.unspot(); await h.go('/aprovacoes'); await h.spot(h.page.locator('main .card').filter({ hasText: 'Reforma do telhado' }).last()); },
        say: ['Em Aprovações, você vê o que está esperando: o valor, quem pediu e quando.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.page.getByRole('button', { name: 'Aprovar' }).locator('visible=true').first(), { wait: 900 }); const ok = h.dlg().getByRole('button', { name: 'Aprovar' }); if (await ok.count()) await h.click(ok, { wait: 1500 }); await h.spot(h.page.locator('main').first()); },
        say: ['Clique em Aprovar. A conta é liberada para pagamento. Para Reprovar, o CIFREN pede o motivo, e quem pediu recebe o aviso.'] },
      { tag: 'Lembre', act: (h) => h.card(slide('Lembre', 'Controle sem burocracia', slist(['Alçada: a partir de quanto precisa de aprovação.', 'Quem pede não aprova.', 'Aprovar libera; reprovar pede o motivo.']))),
        say: ['Lembre: a alçada protege os gastos maiores. Quem pede não aprova, e tudo fica registrado na auditoria.'] },
    ],
  },
  // ───────────────────────── 6. Conciliação bancária
  {
    n: 6, file: '06-conciliacao-bancaria', mod: 'banco', title: 'Conciliação bancária: conferir o extrato', routes: ['/conciliacao'], start: '/',
    desc: 'Importar o extrato do banco (OFX ou CSV), conciliar automaticamente o que bate, conferir o resto e lançar a tarifa que faltava.',
    learn: ['Baixar o extrato no banco e importar', 'Conciliar automaticamente e conferir', 'Lançar o que faltava, como a tarifa'],
    setup: async (api, h) => { await seedBasics(api, h); return { ofx: sampleOfx() }; },
    steps: [
      { tag: 'Para que serve', act: (h) => h.card(slide('Conciliação', 'O banco e o CIFREN dizendo a mesma coisa', slist(['Baixe o extrato no site ou app do banco: <b>OFX</b> (melhor) ou CSV.', 'O CIFREN liga cada linha à conta lançada.', 'O que sobra você confere ou lança.']) + para('O extrato desta aula é de exemplo.'))),
        say: ['Conciliar é conferir o extrato do banco com o que foi lançado. Baixe o extrato no banco, em OFX ou CSV.'] },
      { tag: 'Importar', act: async (h) => { await h.card(null); await h.go('/conciliacao'); await pick(h.page.getByLabel('Conta bancária'), /Banco Exemplo/); await h.sleep(600); await h.spot(btn(h, 'Importar extrato')); },
        say: ['Em Conciliação, escolha a conta bancária e clique em Importar extrato.'] },
      { act: async (h, st) => { await h.page.evaluate(() => window.__av.click()); await h.page.getByLabel('Arquivo do extrato (OFX ou CSV)').setInputFiles(st.ofx); await h.settle(1800); await h.unspot(); await h.spot(h.page.locator('main .card').filter({ hasText: 'ENERGIA' }).first()); },
        say: ['Escolha o arquivo do extrato. As linhas aparecem com a sugestão de qual conta lançada corresponde a cada uma.'] },
      { tag: 'Conciliar', act: async (h) => { await h.unspot(); await h.click(btn(h, 'Conciliar automaticamente'), { wait: 1800 }); await h.spot(h.page.locator('main .card').last()); },
        say: ['Clique em Conciliar automaticamente. Ele liga só o que tem o valor exato e certeza alta: a energia e o aluguel.'] },
      { tag: 'Lançar o que faltava', act: async (h) => { await h.unspot(); const row = h.page.locator('main').getByText(/TARIFA/).first(); await h.center(row); await h.click(h.page.getByRole('button', { name: /Criar lançamento/ }).locator('visible=true').first(), { wait: 900 }); await h.spot(h.dlg()); },
        say: ['A tarifa do banco não estava lançada. Clique em Criar lançamento: a conta nasce já paga, com a data e o valor do extrato.'] },
      { act: async (h) => { const d = h.dlg(); await pick(d.getByLabel(/Categoria/), /Taxas bancárias/); await h.click(d.getByRole('button', { name: /Criar|Salvar|Lançar/ }).last(), { wait: 1500 }); await h.click(h.page.getByRole('tab', { name: /Conciliadas/ }).or(h.page.getByRole('button', { name: /^Conciliadas/ })).first(), { wait: 1200 }); await h.spot(h.page.locator('main .card').last()); },
        say: ['Escolha a categoria, Taxas bancárias, e confirme. Na aba Conciliadas, tudo o que já bate com o banco.'] },
      { tag: 'Lembre', act: (h) => h.card(slide('Lembre', 'Uma vez por semana, cinco minutos', slist(['Baixe o extrato em OFX e importe.', 'Conciliar automaticamente faz o grosso.', 'O que sobrar: conciliar, ignorar ou criar lançamento.']))),
        say: ['Lembre: importe o extrato toda semana. Assim o saldo do CIFREN é o mesmo do banco.'] },
    ],
  },
  // ───────────────────────── 7. Associados e mensalidades
  {
    n: 7, file: '07-associados-e-mensalidades', mod: 'associados', title: 'Associados e mensalidades', routes: ['/associados'], start: '/',
    desc: 'Definir o valor da mensalidade, cadastrar associados, ver quem está em atraso e ligar os avisos de cobrança por e-mail e WhatsApp.',
    learn: ['O valor da mensalidade', 'Cadastrar o associado', 'Quem está em atraso e os avisos'],
    setup: async (api, h) => {
      await seedBasics(api, h, { titles: false });
      await api('POST', '/members/fees', { amount: 80, effective_month: inDays(-95).slice(0, 7) });
      for (const [name, wa, m] of [['Ana Ribeiro', '(19) 99000-1111', -3], ['Carlos Mendes', '(19) 99000-2222', -2], ['Juliana Prado', '(19) 99000-3333', 0]]) {
        await api('POST', '/members', { company_id: h.companyId, name, whatsapp: wa, due_day: 10, start_month: inDays(m * 30).slice(0, 7) });
      }
      return {};
    },
    steps: [
      { tag: 'Para que serve', act: (h) => h.card(slide('Associados', 'Mensalidade em dia, sem planilha', slist(['O CIFREN lança a mensalidade de cada associado todo mês.', 'Quem pagou sai do atraso na hora.', 'Avisos automáticos por e-mail e WhatsApp.']))),
        say: ['Em Associados e mensalidades, o CIFREN lança a mensalidade de cada associado todo mês e mostra quem está em atraso.'] },
      { tag: 'O valor', act: async (h) => { await h.card(null); await h.go('/associados'); await h.click(h.page.getByRole('tab', { name: /Valores da mensalidade/ }).first(), { wait: 1000 }); await h.spot(h.page.locator('main .card').last()); },
        say: ['Primeiro, o valor. Em Valores da mensalidade, informe o valor e a partir de quando vale. Um aumento nunca muda os meses que já passaram.'] },
      { tag: 'Cadastrar', act: async (h) => { await h.unspot(); await h.go('/associados'); await h.click(btn(h, 'Novo associado'), { wait: 900 }); const d = h.dlg(); await h.type(d.getByLabel('Nome'), 'Roberto Alves', { delay: 40 }); await h.type(d.getByLabel(/WhatsApp/).first(), '19990004444', { delay: 40 }); await h.spot(d); },
        say: ['Clique em Novo associado. Nome, WhatsApp, e-mail, o dia do vencimento e a partir de quando cobrar.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: /Salvar|Cadastrar/ }).last(), { wait: 1500 }); await h.spot(h.page.locator('main table, main ul').first()); },
        say: ['Salvar. As mensalidades dele entram em Contas a receber, uma por mês, no dia escolhido.'] },
      { tag: 'Em atraso', act: async (h) => { await h.unspot(); await h.top(); await h.click(h.page.getByRole('tab', { name: /Em atraso/ }).or(h.page.getByRole('button', { name: /Em atraso/ })).first(), { wait: 1200 }); await h.spot(h.page.locator('main .card').last()); },
        say: ['Na aba Em atraso, quem deve e há quanto tempo. Quando o associado paga, você recebe em Contas a receber e ele sai daqui.'] },
      { tag: 'Avisos', act: async (h) => { await h.unspot(); await h.click(h.page.getByRole('tab', { name: /Avisos de cobrança/ }).or(h.page.getByRole('button', { name: /Avisos de cobrança/ })).first(), { wait: 1200 }); await h.top(); await h.spot(h.page.locator('main .card').nth(1)); },
        say: ['Em Avisos de cobrança, ligue o lembrete antes do vencimento e o aviso de atraso, por e-mail ou pelo WhatsApp da associação.'] },
    ],
  },
  // ───────────────────────── 8. Recorrentes e previsão
  {
    n: 8, file: '08-recorrentes-e-previsao', mod: 'financeiro', title: 'Recorrentes e previsão: as contas de todo mês', routes: ['/recorrentes'], start: '/',
    desc: 'Cadastrar as contas que se repetem (aluguel, energia, salários), deixar o CIFREN prever o valor e criar a conta antes do vencimento.',
    learn: ['Cadastrar um compromisso recorrente', 'Valor fixo ou pela média dos meses', 'Estimado × real e a previsão do caixa'],
    setup: async (api, h) => { await seedBasics(api, h, { titles: false }); return {}; },
    steps: [
      { tag: 'Para que serve', act: (h) => h.card(slide('Recorrentes', 'O que vem todo mês, sem esquecer', slist(['Aluguel, energia, internet, salários.', 'O CIFREN cria a conta dias antes do vencimento.', 'E avisa quando a conta veio maior que o normal.']))),
        say: ['Algumas contas chegam todo mês. Em Recorrentes, o CIFREN cria a conta alguns dias antes e prevê o valor.'] },
      { tag: 'Cadastrar', act: async (h) => { await h.card(null); await h.go('/recorrentes'); await h.click(h.page.getByRole('button', { name: /Novo compromisso|Cadastrar o primeiro/ }).first(), { wait: 1000 }); await h.spot(h.dlg()); },
        say: ['Clique em Novo compromisso. Escolha um modelo pronto, como a conta de energia, ou comece do zero.'] },
      { act: async (h) => { const d = h.dlg(); const m = d.getByRole('button', { name: /^Aluguel/ }).first(); if (await m.count()) await h.click(m, { wait: 900 }); await h.spot(h.dlg()); },
        say: ['Aqui, o modelo Aluguel. O nome e a categoria já vêm prontos. Escolha o fornecedor, se quiser, e o dia do vencimento.'] },
      { act: async (h) => { const d = h.dlg(); await d.getByLabel('Dia do vencimento').fill('5'); const v = d.getByRole('textbox', { name: /Valor fixo/ }); await h.type(v, '280000', { delay: 50 }); await h.spot(d.getByText('Como estimar o valor').locator('..')); },
        say: ['Em Como estimar o valor: valor fixo, para o aluguel, que é sempre igual. Para a energia, que muda todo mês, use a média dos últimos meses.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: /Salvar|Criar|Cadastrar/ }).last(), { wait: 1500 }); await h.spot(h.page.locator('main .card').last()); },
        say: ['Salvar. O aluguel entra todo mês na previsão. Nas contas que variam, informe o valor real quando chegar: o CIFREN compara com o estimado.'] },
      { tag: 'A previsão', act: async (h) => { await h.unspot(); await h.go('/relatorios/fluxo'); await h.spot(h.page.locator('main .card').nth(1)); },
        say: ['As recorrentes entram na previsão do Fluxo de caixa: você vê antes se vai faltar dinheiro em algum mês.'] },
    ],
  },
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
  // ───────────────────────── 9. Compras
  {
    n: 9, file: '09-compras', mod: 'compras', title: 'Compras: da solicitação à conta a pagar', routes: ['/compras'], start: '/',
    desc: 'Pedir uma compra, aprovar, fazer o pedido ao fornecedor, receber e faturar: a conta a pagar nasce pronta.',
    learn: ['Solicitar uma compra', 'Pedido ao fornecedor e recebimento', 'Faturar: a conta a pagar nasce sozinha'],
    setup: async (api, h) => { await seedBasics(api, h, { titles: false }); return {}; },
    steps: [
      { tag: 'Para que serve', act: (h) => h.card(slide('Compras', 'Cada compra com dono e histórico', slist(['Alguém pede o que precisa.', 'Quem pode aprova, e o pedido vai ao fornecedor.', 'Recebeu e faturou: a conta a pagar nasce pronta.']))),
        say: ['Em Compras, cada compra segue as etapas: solicitação, aprovação, pedido, recebimento e conta a pagar.'] },
      { tag: 'Solicitar', act: async (h) => { await h.card(null); await h.go('/compras'); await h.click(h.page.getByRole('button', { name: /Nova solicitação|Solicitar compra/ }).first(), { wait: 1000 }); await h.spot(h.dlg()); },
        say: ['Clique em Nova solicitação. Diga o que precisa, a quantidade, o preço estimado e para quando.'] },
      { act: async (h) => { const d = h.dlg(); await h.type(d.getByLabel('O que precisa').first(), 'Cadeiras para o salão', { delay: 40 }); await h.type(d.getByLabel('Item 1').first(), 'Cadeira plástica branca', { delay: 35 }); await d.getByLabel('Qtd.').first().fill('20'); await h.type(d.getByLabel(/Preço unit/).first(), '4500', { delay: 50 }); await h.spot(d.getByText('Total estimado').locator('xpath=ancestor::*[contains(@class,"rounded") or contains(@class,"border")][1]')); },
        say: ['Aqui, vinte cadeiras, a quarenta e cinco reais cada. O total estimado aparece embaixo.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: 'Enviar solicitação' }), { wait: 1500 }); await h.spot(h.page.locator('main .card').filter({ hasText: 'Cadeiras para o salão' }).last()); },
        say: ['Clique em Enviar solicitação. Sem alçada, ela já sai aprovada. Com alçada, vai antes para Aprovações.'] },
      { tag: 'Pedido', act: async (h) => { await h.unspot(); await h.click(await openPurchase(h, /Fazer pedido/), { wait: 1000 }); const d = h.dlg(); const f = d.getByPlaceholder(/Buscar fornecedor/); if (await f.count()) { await h.type(f, 'Pape', { delay: 70 }); await h.sleep(800); await h.click(d.getByRole('option').first(), { wait: 500 }); } await h.spot(d); },
        say: ['Fazer pedido: escolha o fornecedor, confira o valor do pedido e a previsão de entrega.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: 'Registrar pedido' }), { wait: 1500 }); await h.click(await openPurchase(h, /Marcar recebida/), { wait: 1500 }); await h.click(h.page.getByRole('button', { name: 'Confirmar recebimento' }), { wait: 1500 }); await h.spot(h.page.locator('main .card').filter({ hasText: 'Cadeiras para o salão' }).last()); },
        say: ['Registre o pedido. Quando as cadeiras chegarem, clique em Marcar recebida.'] },
      { tag: 'Faturar', act: async (h) => { await h.unspot(); await h.click(await openPurchase(h, /^Faturar/), { wait: 1000 }); const d = h.page.getByRole('dialog').filter({ hasText: 'Faturar compra' }).last(); await h.type(d.getByLabel('Valor da nota'), '90000', { delay: 50 }); await d.getByLabel('Parcelas').fill('2').catch(() => {}); await h.spot(d); },
        say: ['Chegou a nota? Clique em Faturar: o valor da nota, o vencimento e as parcelas. Dá para anexar a nota aqui.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.page.getByRole('button', { name: 'Criar conta a pagar' }), { wait: 1500 }); await h.go('/pagar'); await h.spot(h.page.locator('main table').first()); },
        say: ['Criar conta a pagar: as parcelas aparecem em Contas a pagar, ligadas à compra, prontas para pagar no vencimento.'] },
    ],
  },
  // ───────────────────────── 10. Despesas e reembolsos
  {
    n: 10, file: '10-despesas-e-reembolsos', mod: 'compras', title: 'Despesas e reembolsos', routes: ['/despesas'], start: '/',
    desc: 'Lançar o que você pagou do próprio bolso com a foto do comprovante, mandar para aprovação e receber o reembolso.',
    learn: ['Lançar a despesa com o comprovante', 'Enviar para aprovação', 'Pagar o reembolso'],
    setup: async (api, h) => { await seedBasics(api, h, { titles: false }); return {}; },
    steps: [
      { tag: 'Para que serve', act: (h) => h.card(slide('Reembolsos', 'Pagou do bolso? O CIFREN devolve', slist(['Lance o gasto e anexe a foto do comprovante.', 'Alguém aprova.', 'O financeiro paga o reembolso e tudo fica registrado.']))),
        say: ['Pagou alguma coisa da empresa com o próprio dinheiro? Lance em Despesas e reembolsos.'] },
      { tag: 'Lançar', act: async (h) => { await h.card(null); await h.go('/despesas'); await h.click(h.page.getByRole('button', { name: /Nova despesa|Lançar despesa/ }).first(), { wait: 1000 }); await h.spot(h.dlg()); },
        say: ['Clique em Nova despesa. Junte os gastos: a data, o valor, o que foi, e a foto de cada comprovante.'] },
      { act: async (h) => { const d = h.dlg(); await h.type(d.getByPlaceholder(/Nome do associado/), 'Marina Souza', { delay: 40 }); await h.page.keyboard.press('Escape').catch(() => {}); await h.type(d.getByLabel('Gasto 1'), 'Táxi até o banco', { delay: 40 }); await h.type(d.getByLabel('Valor').first(), '4850', { delay: 50 }); await pick(d.getByLabel('Categoria').first(), /Outros impostos|Taxas|Serviços|Manuten/); await h.spot(d); },
        say: ['Informe quem pagou, a data, o que foi, o valor e a categoria. Em Anexar comprovante, a foto do recibo. Dá para salvar como rascunho.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: 'Enviar para aprovação' }), { wait: 1500 }); await h.spot(h.page.locator('main .card').last()); },
        say: ['Clique em Enviar para aprovação. A despesa segue as alçadas, do mesmo jeito que as contas e as compras.'] },
      { tag: 'Reembolsar', act: (h) => h.card(slide('Reembolso', 'Aprovou, pagou', slist(['Na aba <b>Para pagar</b>, o financeiro vê o que foi aprovado.', '<b>Pagar reembolso</b>: escolha a conta e a data.', 'O gasto entra na categoria certa, no DRE.']))),
        say: ['Depois de aprovada, a despesa aparece em Para pagar. O financeiro clica em Pagar reembolso, escolhe a conta e a data, e pronto.'] },
    ],
  },
  // ───────────────────────── 11. Documentos
  {
    n: 11, file: '11-documentos-e-boletos', mod: 'compras', title: 'Documentos: lançar a conta pelo boleto', routes: ['/documentos'], start: '/',
    desc: 'Enviar a foto da nota ou do boleto, ou colar a linha digitável, e lançar a conta a pagar sem digitar o valor e o vencimento.',
    learn: ['Enviar a foto ou colar o código', 'Conferir o que foi lido', 'Lançar a conta a pagar'],
    setup: async (api, h) => { await seedBasics(api, h, { titles: false }); return { line: sampleBoleto(742.35, inDays(14)) }; },
    steps: [
      { tag: 'Para que serve', act: (h) => h.card(slide('Documentos', 'Boleto na mão, conta lançada', slist(['Foto ou PDF da nota, do boleto ou do comprovante.', 'Ou cole a linha digitável, o Pix copia e cola ou o link da nota.', 'O CIFREN lê e você só confere.']) + para('O boleto desta aula é de exemplo.'))),
        say: ['Em Documentos, você envia a nota ou o boleto, e o CIFREN lê o valor, o vencimento e o fornecedor.'] },
      { tag: 'Colar o código', act: async (h, st) => { await h.card(null); await h.go('/documentos'); const t = h.page.getByPlaceholder(/Linha digitável do boleto/); await h.type(t, st.line, { delay: 12 }); await h.spot(t.locator('xpath=ancestor::*[contains(@class,"card")][1]')); },
        say: ['Arraste o arquivo, tire uma foto pelo celular, ou cole a linha digitável do boleto. Aqui, colei a linha.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.page.getByRole('button', { name: /Ler código/ }).first(), { wait: 2500 }); await h.spot(h.page.getByText('Dados lidos', { exact: true }).locator('xpath=ancestor::*[contains(@class,"card")][1]')); },
        say: ['Clique em Ler código. O valor e o vencimento vêm do próprio boleto, sem erro de digitação.'] },
      { tag: 'Lançar', act: async (h) => { await h.unspot(); await h.click(h.page.getByRole('button', { name: 'Lançar contas' }), { wait: 1000 }); const d = h.dlg(); await pick(d.getByLabel('Categoria').first(), /Água/); await h.spot(d); },
        say: ['Clique em Lançar contas. O valor e o vencimento já vêm do boleto. Escreva a descrição, escolha o fornecedor e a categoria.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: /^Lançar/ }).last(), { wait: 1500 }); const c = h.page.getByText('Contas ligadas', { exact: true }); await h.center(c); await h.spot(c.locator('xpath=ancestor::*[contains(@class,"card")][1]')); },
        say: ['Lance. A conta a pagar fica ligada ao documento: quem abrir a conta acha o boleto, e vice-versa.'] },
    ],
  },
  // ───────────────────────── 12. Relatórios
  {
    n: 12, file: '12-relatorios-fluxo-dre-inadimplencia', mod: 'relatorios', title: 'Relatórios: fluxo de caixa, DRE e inadimplência', routes: ['/relatorios'], start: '/',
    desc: 'O realizado e o previsto mês a mês no fluxo de caixa, o resultado no DRE, quem está atrasado e a exportação para a contabilidade.',
    learn: ['Fluxo de caixa: realizado e previsto', 'DRE: quanto sobrou', 'Inadimplência e exportar para o contador'],
    setup: async (api, h) => { await seedBasics(api, h); return {}; },
    steps: [
      { tag: 'Fluxo de caixa', act: async (h) => { await h.go('/relatorios/fluxo'); await h.spot(h.page.locator('main .card').nth(1)); },
        say: ['No Fluxo de caixa, o que entrou e saiu em cada mês, e o previsto pelas contas em aberto e pelas recorrentes.'] },
      { act: async (h) => { await h.unspot(); const t = h.page.locator('main table').first(); await h.center(t); await h.spot(t); },
        say: ['Na tabela, o saldo de cada mês. Um saldo previsto negativo é o aviso para se programar antes.'] },
      { tag: 'DRE', act: async (h) => { await h.unspot(); await h.go('/relatorios/dre'); await h.spot(h.page.locator('main table').first()); },
        say: ['O DRE mostra o resultado: receitas, menos custos e despesas. Escolha o ano e se quer por competência ou por caixa.'] },
      { tag: 'Inadimplência', act: async (h) => { await h.unspot(); await h.go('/relatorios/inadimplencia'); await h.spot(h.page.locator('main .card').nth(1)); },
        say: ['Em Inadimplência, quem deve e há quanto tempo, separado por faixas de atraso.'] },
      { tag: 'Exportar', act: async (h) => { await h.unspot(); await h.go('/relatorios/exportar'); await h.spot(h.page.locator('main .card').first()); },
        say: ['Em Exportar, baixe os lançamentos em planilha para o contador. Todos os relatórios também têm Baixar planilha.'] },
    ],
  },
  // ───────────────────────── 13. Usuários e perfis
  {
    n: 13, file: '13-usuarios-e-perfis', mod: 'config', title: 'Usuários e perfis: quem pode o quê', routes: ['/usuarios'], start: '/',
    desc: 'Convidar a equipe, escolher o perfil de cada pessoa e ver o que cada perfil pode fazer.',
    learn: ['Convidar um usuário', 'Escolher o perfil', 'O que cada perfil pode fazer'],
    steps: [
      { tag: 'Para que serve', act: (h) => h.card(slide('Usuários e perfis', 'Cada um vê o que precisa', slist(['<b>Dono</b> e <b>Administrador</b>: tudo.', '<b>Financeiro</b>, <b>Lançamentos</b>, <b>Aprovador</b>, <b>Contador</b>…', 'E a quais empresas cada pessoa tem acesso.']))),
        say: ['Cada pessoa da equipe tem o próprio login e um perfil, que define o que ela pode ver e fazer.'] },
      { tag: 'Convidar', act: async (h) => { await h.card(null); await h.go('/usuarios'); await h.click(btn(h, 'Convidar usuário'), { wait: 1000 }); const d = h.dlg(); await h.type(d.getByLabel('Nome').first(), 'Bruno Lima', { delay: 40 }); await h.type(d.getByLabel('E-mail').first(), 'bruno@associacao-exemplo.org.br', { delay: 25 }); await h.spot(d); },
        say: ['Em Usuários e perfis, clique em Convidar usuário. Informe o nome e o e-mail.'] },
      { act: async (h) => { const d = h.dlg(); const p = d.getByLabel(/Perfil/).first(); if (await p.count()) await pick(p, /Lançamentos/); await h.spot(p); },
        say: ['Escolha o perfil. Lançamentos, por exemplo, lança contas, mas não aprova nem dá baixa.'] },
      { act: async (h) => { await h.unspot(); await h.click(h.dlg().getByRole('button', { name: 'Criar acesso' }), { wait: 1500 }); await h.spot(h.page.getByRole('dialog').last().or(h.page.locator('main .card').last()).first()); },
        say: ['Clique em Criar acesso. O CIFREN mostra a senha provisória: passe para a pessoa por um canal seguro. No primeiro acesso, ela troca a senha.'] },
      { tag: 'Perfis', act: async (h) => { await h.unspot(); await h.esc(); await h.click(h.page.getByRole('tab', { name: 'Perfis' }), { wait: 1200 }); await h.spot(h.page.locator('main .card').last()); },
        say: ['Na aba Perfis, veja o que cada perfil pode fazer. Também dá para criar um perfil do seu jeito.'] },
    ],
  },
  // ───────────────────────── 14. Suporte e assistente
  {
    n: 14, file: '14-suporte-e-assistente', mod: 'config', title: 'Suporte: vídeo-aulas e o assistente', routes: ['/suporte'], start: '/',
    desc: 'Assistir às aulas no ritmo certo, buscar um assunto e tirar dúvidas com o Assistente LORLER, que responde na hora.',
    learn: ['Assistir e buscar as aulas', 'Falar com o assistente', 'O que nunca enviar no chat'],
    steps: [
      { tag: 'As aulas', act: async (h) => { await h.go('/suporte'); const v = h.page.locator('main video').first(); await h.center(v); await h.spot(v); },
        say: ['No menu, clique em Suporte. As vídeo-aulas ficam aqui, com legenda na imagem e o texto da aula embaixo.'] },
      { act: async (h) => { await h.unspot(); const b = h.page.getByLabel('Buscar aula'); await h.center(b); await h.type(b, 'extrato', { delay: 70 }); await h.sleep(600); await h.spot(b.locator('xpath=ancestor::aside[1]')); },
        say: ['Na busca, digite um assunto ou uma frase da aula. Abaixo do vídeo, escolha a velocidade.'] },
      { tag: 'O assistente', act: async (h) => { await h.unspot(); await h.top(); const b = h.page.getByRole('button', { name: /Falar com/ }).locator('visible=true').first(); await h.spot(b); await h.click(b, { wait: 1800 }); await h.spot(h.page.getByRole('dialog', { name: 'Chat com o assistente' })); },
        say: ['Toque em Falar com o assistente. Ele é da Central de Atendimento LORLER e responde na hora.'] },
      { act: async (h) => { await h.type(h.page.locator('#assistant-msg').last(), 'Como confiro o extrato do banco?', { delay: 45 }); await h.click(h.page.getByRole('button', { name: 'Enviar', exact: true }).last(), { wait: 600 }); const r = h.page.getByText('Conciliar automaticamente', { exact: false }).last(); await r.waitFor({ timeout: 45000 }).catch(() => {}); await h.sleep(800); await h.spot(r.locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]')); },
        say: ['Escreva do seu jeito. Ele responde com o passo a passo e indica a aula. Se precisar, chama a equipe de suporte.'] },
      { tag: 'Cuidado', act: async (h) => { await h.unspot(); await h.card(slide('No chat', 'Nunca mande dados sensíveis', slist(['Não envie <b>senhas</b>, códigos nem números de <b>cartão</b>.', 'Ajustes na sua conta só com a sua autorização.', 'O <b>Assistente IA</b> do menu é outro: responde sobre os seus números.']))); },
        say: ['No chat, nunca envie senhas, códigos nem cartões. E o Assistente IA do menu é outro: ele responde sobre os números da sua organização.'] },
    ],
  },
  // ensaio de exploração (não vira vídeo): uma captura de cada tela
  { n: 99, file: '99-tour', mod: 'inicio', title: 'Tour', routes: [], desc: 'Exploração', learn: ['a', 'b', 'c'],
    steps: TOUR.map((r) => ({ act: async (h) => { await h.go(r); await h.sleep(600); }, say: [r] })) },
];
