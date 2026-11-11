// Vídeo-aulas narradas do CIFREN — gerado por tools/videos/gen-training.mjs (não edite à mão; ajuste lessons.mjs).
// Arquivos em /public/treinamento/<file>.mp4 (narração + legenda na imagem), -capa.jpg, .jpg e .vtt (transcrição).
// `routes`: telas em que a aula é sugerida como ajuda; `text`: falas (busca e transcrição) 
export const MODULES = [
  {
    "key": "inicio",
    "label": "Primeiros passos"
  },
  {
    "key": "financeiro",
    "label": "Contas a pagar e a receber"
  },
  {
    "key": "banco",
    "label": "Bancos e conciliação"
  },
  {
    "key": "associados",
    "label": "Associados e mensalidades"
  },
  {
    "key": "compras",
    "label": "Compras e despesas"
  },
  {
    "key": "relatorios",
    "label": "Relatórios"
  },
  {
    "key": "config",
    "label": "Configurações e suporte"
  }
];

export const LESSONS = [
  {
    "n": 1,
    "file": "01-conhecendo-o-cifren",
    "mod": "inicio",
    "s": 84,
    "title": "Conhecendo o CIFREN",
    "routes": [
      "/"
    ],
    "desc": "O painel do dinheiro de hoje, o menu, o seletor de empresas, o botão Enviar documento e onde pedir ajuda.",
    "learn": [
      "O que o painel mostra",
      "Como o menu está organizado",
      "Empresas, documentos, avisos e ajuda"
    ],
    "text": "O CIFREN organiza o dinheiro da sua empresa ou associação: o que pagar, o que receber, o saldo no banco e os relatórios. Na tela inicial, os números do dia: o saldo em caixa, o que está a pagar e a receber, e o que já venceu. Logo abaixo, os próximos vencimentos. Clique numa conta para ver os detalhes ou dar baixa. O menu fica à esquerda, em grupos: Financeiro, Compras e despesas, Documentos, Relatórios e Configurações. Tem mais de um CNPJ? No topo, escolha a empresa. Todas as empresas mostra o grupo inteiro. Enviar documento: mande a foto de um boleto ou de uma nota, e o CIFREN lança a conta para você conferir. No sino, os avisos: contas vencendo e pedidos esperando aprovação. Ficou com dúvida? Em Suporte e treinamento estão as vídeo-aulas e o assistente, que responde na hora."
  },
  {
    "n": 2,
    "file": "02-contas-bancarias-e-cadastros",
    "mod": "inicio",
    "s": 122,
    "title": "Contas bancárias, fornecedores e categorias",
    "routes": [
      "/cadastros"
    ],
    "desc": "Cadastrar a conta do banco com o saldo inicial, os fornecedores e clientes, e entender as categorias e os centros de custo.",
    "learn": [
      "Cadastrar a conta bancária e o saldo inicial",
      "Cadastrar fornecedores e clientes",
      "Categorias e centros de custo"
    ],
    "text": "Antes de lançar contas, cadastre a conta do banco. Os fornecedores e clientes também podem ser cadastrados na hora de lançar. No menu, abra Cadastros e a aba Contas bancárias. O Caixa já vem pronto. Clique em Nova conta. Dê um nome, informe o banco, a agência e o número. Em Saldo inicial, o saldo do extrato no dia escolhido: é dele que o CIFREN parte. Clique em Salvar. A conta aparece na lista, com o saldo. Na aba Fornecedores e clientes, clique em Cadastrar. Informe o nome, o tipo e, se quiser, o CNPJ, o telefone e o e-mail. Salvar. Pronto: na hora de lançar uma conta, é só escolher o fornecedor. Em Categorias, a lista de receitas e despesas já vem pronta, ligada às linhas do DRE. Você pode criar subcategorias. Centros de custo separam os gastos por área, projeto ou evento. Eles também aparecem nos relatórios."
  },
  {
    "n": 3,
    "file": "03-contas-a-pagar",
    "mod": "financeiro",
    "s": 128,
    "title": "Contas a pagar: lançar, parcelar e dar baixa",
    "routes": [
      "/pagar"
    ],
    "desc": "Lançar uma conta a pagar com fornecedor e categoria, dividir em parcelas, filtrar o que vence e registrar o pagamento.",
    "learn": [
      "Lançar uma conta e parcelar",
      "Filtrar vencidas e a vencer",
      "Dar baixa: registrar o pagamento"
    ],
    "text": "No menu, abra Contas a pagar. Aqui fica tudo o que a sua empresa precisa pagar. Clique em Novo. Escreva a descrição, o valor e o vencimento. Escolha o fornecedor, digitando o nome. Se ele ainda não existe, dá para cadastrar ali mesmo. Depois, a categoria. Vai pagar em vezes? Em Número de parcelas, coloque três. O valor passa a ser o de cada parcela: aqui, seiscentos reais. O CIFREN mostra o total e cria uma conta para cada mês. Clique em Lançar. As parcelas aparecem na lista, cada uma com o seu vencimento. Use as abas para filtrar: abertos, vencidos, pagos. Aqui, os vencidos: o que já passou do dia e ainda não foi pago. Pagou? Abra a conta e clique em dar baixa. Confira a data, o valor, a conta de onde saiu o dinheiro e a forma de pagamento. Se teve juros, multa ou desconto, informe nos campos. Confirme: a conta sai dos vencidos e o saldo do banco é atualizado. Lembre: lance com o fornecedor e a categoria, parcele quando precisar, e dê baixa no dia em que pagar."
  },
  {
    "n": 4,
    "file": "04-contas-a-receber",
    "mod": "financeiro",
    "s": 77,
    "title": "Contas a receber: lançar e receber",
    "routes": [
      "/receber"
    ],
    "desc": "Lançar o que seus clientes vão pagar, acompanhar quem está em dia e registrar o recebimento.",
    "learn": [
      "Lançar uma conta a receber",
      "Acompanhar vencidas e a vencer",
      "Registrar o recebimento"
    ],
    "text": "Em Contas a receber, clique em Novo. Descrição, valor e vencimento, do mesmo jeito que nas contas a pagar. Escolha o cliente e a categoria, e clique em Lançar. A conta entra na lista e na previsão do fluxo de caixa. O cliente pagou? Abra a conta e registre o recebimento: a data, o valor e a conta onde o dinheiro entrou. Confirme. O dinheiro entra no saldo e a conta sai da lista de abertas. Quem atrasa aparece no relatório de inadimplência."
  },
  {
    "n": 5,
    "file": "05-alcadas-e-aprovacoes",
    "mod": "financeiro",
    "s": 92,
    "title": "Alçadas e aprovações: quem autoriza o pagamento",
    "routes": [
      "/aprovacoes",
      "/configuracoes/alcadas"
    ],
    "desc": "Definir a partir de que valor uma conta, compra ou reembolso precisa de aprovação, e aprovar ou reprovar o que está esperando.",
    "learn": [
      "Criar uma alçada de aprovação",
      "O que acontece com a conta acima do valor",
      "Aprovar ou reprovar, com o motivo"
    ],
    "text": "A alçada define a partir de quanto uma conta, uma compra ou um reembolso precisa ser aprovado por outra pessoa. Em Configurações, Alçadas de aprovação. Aqui, contas a pagar a partir de dois mil reais precisam de aprovação. Em Nova alçada, escolha o que precisa de aprovação, a empresa e o valor a partir do qual vale a regra. O Bruno lançou a reforma do telhado, de três mil e quinhentos reais. Ela fica aguardando aprovação e ainda não pode ser paga. Em Aprovações, você vê o que está esperando: o valor, quem pediu e quando. Clique em Aprovar. A conta é liberada para pagamento. Para Reprovar, o CIFREN pede o motivo, e quem pediu recebe o aviso. Lembre: a alçada protege os gastos maiores. Quem pede não aprova, e tudo fica registrado na auditoria."
  },
  {
    "n": 6,
    "file": "06-conciliacao-bancaria",
    "mod": "banco",
    "s": 97,
    "title": "Conciliação bancária: conferir o extrato",
    "routes": [
      "/conciliacao"
    ],
    "desc": "Importar o extrato do banco (OFX ou CSV), conciliar automaticamente o que bate, conferir o resto e lançar a tarifa que faltava.",
    "learn": [
      "Baixar o extrato no banco e importar",
      "Conciliar automaticamente e conferir",
      "Lançar o que faltava, como a tarifa"
    ],
    "text": "Conciliar é conferir o extrato do banco com o que foi lançado. Baixe o extrato no banco, em OFX ou CSV. Em Conciliação, escolha a conta bancária e clique em Importar extrato. Escolha o arquivo do extrato. As linhas aparecem com a sugestão de qual conta lançada corresponde a cada uma. Clique em Conciliar automaticamente. Ele liga só o que tem o valor exato e certeza alta: a energia e o aluguel. A tarifa do banco não estava lançada. Clique em Criar lançamento: a conta nasce já paga, com a data e o valor do extrato. Escolha a categoria, Taxas bancárias, e confirme. Na aba Conciliadas, tudo o que já bate com o banco. Lembre: importe o extrato toda semana. Assim o saldo do CIFREN é o mesmo do banco."
  },
  {
    "n": 7,
    "file": "07-associados-e-mensalidades",
    "mod": "associados",
    "s": 95,
    "title": "Associados e mensalidades",
    "routes": [
      "/associados"
    ],
    "desc": "Definir o valor da mensalidade, cadastrar associados, ver quem está em atraso e ligar os avisos de cobrança por e-mail e WhatsApp.",
    "learn": [
      "O valor da mensalidade",
      "Cadastrar o associado",
      "Quem está em atraso e os avisos"
    ],
    "text": "Em Associados e mensalidades, o CIFREN lança a mensalidade de cada associado todo mês e mostra quem está em atraso. Primeiro, o valor. Em Valores da mensalidade, informe o valor e a partir de quando vale. Um aumento nunca muda os meses que já passaram. Clique em Novo associado. Nome, WhatsApp, e-mail, o dia do vencimento e a partir de quando cobrar. Salvar. As mensalidades dele entram em Contas a receber, uma por mês, no dia escolhido. Na aba Em atraso, quem deve e há quanto tempo. Quando o associado paga, você recebe em Contas a receber e ele sai daqui. Em Avisos de cobrança, ligue o lembrete antes do vencimento e o aviso de atraso, por e-mail ou pelo WhatsApp da associação."
  },
  {
    "n": 8,
    "file": "08-recorrentes-e-previsao",
    "mod": "financeiro",
    "s": 92,
    "title": "Recorrentes e previsão: as contas de todo mês",
    "routes": [
      "/recorrentes"
    ],
    "desc": "Cadastrar as contas que se repetem (aluguel, energia, salários), deixar o CIFREN prever o valor e criar a conta antes do vencimento.",
    "learn": [
      "Cadastrar um compromisso recorrente",
      "Valor fixo ou pela média dos meses",
      "Estimado × real e a previsão do caixa"
    ],
    "text": "Algumas contas chegam todo mês. Em Recorrentes, o CIFREN cria a conta alguns dias antes e prevê o valor. Clique em Novo compromisso. Escolha um modelo pronto, como a conta de energia, ou comece do zero. Aqui, o modelo Aluguel. O nome e a categoria já vêm prontos. Escolha o fornecedor, se quiser, e o dia do vencimento. Em Como estimar o valor: valor fixo, para o aluguel, que é sempre igual. Para a energia, que muda todo mês, use a média dos últimos meses. Salvar. O aluguel entra todo mês na previsão. Nas contas que variam, informe o valor real quando chegar: o CIFREN compara com o estimado. As recorrentes entram na previsão do Fluxo de caixa: você vê antes se vai faltar dinheiro em algum mês."
  },
  {
    "n": 9,
    "file": "09-compras",
    "mod": "compras",
    "s": 122,
    "title": "Compras: da solicitação à conta a pagar",
    "routes": [
      "/compras"
    ],
    "desc": "Pedir uma compra, aprovar, fazer o pedido ao fornecedor, receber e faturar: a conta a pagar nasce pronta.",
    "learn": [
      "Solicitar uma compra",
      "Pedido ao fornecedor e recebimento",
      "Faturar: a conta a pagar nasce sozinha"
    ],
    "text": "Em Compras, cada compra segue as etapas: solicitação, aprovação, pedido, recebimento e conta a pagar. Clique em Nova solicitação. Diga o que precisa, a quantidade, o preço estimado e para quando. Aqui, vinte cadeiras, a quarenta e cinco reais cada. O total estimado aparece embaixo. Clique em Enviar solicitação. Sem alçada, ela já sai aprovada. Com alçada, vai antes para Aprovações. Fazer pedido: escolha o fornecedor, confira o valor do pedido e a previsão de entrega. Registre o pedido. Quando as cadeiras chegarem, clique em Marcar recebida. Chegou a nota? Clique em Faturar: o valor da nota, o vencimento e as parcelas. Dá para anexar a nota aqui. Criar conta a pagar: as parcelas aparecem em Contas a pagar, ligadas à compra, prontas para pagar no vencimento."
  },
  {
    "n": 10,
    "file": "10-despesas-e-reembolsos",
    "mod": "compras",
    "s": 72,
    "title": "Despesas e reembolsos",
    "routes": [
      "/despesas"
    ],
    "desc": "Lançar o que você pagou do próprio bolso com a foto do comprovante, mandar para aprovação e receber o reembolso.",
    "learn": [
      "Lançar a despesa com o comprovante",
      "Enviar para aprovação",
      "Pagar o reembolso"
    ],
    "text": "Pagou alguma coisa da empresa com o próprio dinheiro? Lance em Despesas e reembolsos. Clique em Nova despesa. Junte os gastos: a data, o valor, o que foi, e a foto de cada comprovante. Informe quem pagou, a data, o que foi, o valor e a categoria. Em Anexar comprovante, a foto do recibo. Dá para salvar como rascunho. Clique em Enviar para aprovação. A despesa segue as alçadas, do mesmo jeito que as contas e as compras. Depois de aprovada, a despesa aparece em Para pagar. O financeiro clica em Pagar reembolso, escolhe a conta e a data, e pronto."
  },
  {
    "n": 11,
    "file": "11-documentos-e-boletos",
    "mod": "compras",
    "s": 77,
    "title": "Documentos: lançar a conta pelo boleto",
    "routes": [
      "/documentos"
    ],
    "desc": "Enviar a foto da nota ou do boleto, ou colar a linha digitável, e lançar a conta a pagar sem digitar o valor e o vencimento.",
    "learn": [
      "Enviar a foto ou colar o código",
      "Conferir o que foi lido",
      "Lançar a conta a pagar"
    ],
    "text": "Em Documentos, você envia a nota ou o boleto, e o CIFREN lê o valor, o vencimento e o fornecedor. Arraste o arquivo, tire uma foto pelo celular, ou cole a linha digitável do boleto. Aqui, colei a linha. Clique em Ler código. O valor e o vencimento vêm do próprio boleto, sem erro de digitação. Clique em Lançar contas. O valor e o vencimento já vêm do boleto. Escreva a descrição, escolha o fornecedor e a categoria. Lance. A conta a pagar fica ligada ao documento: quem abrir a conta acha o boleto, e vice-versa."
  },
  {
    "n": 12,
    "file": "12-relatorios-fluxo-dre-inadimplencia",
    "mod": "relatorios",
    "s": 75,
    "title": "Relatórios: fluxo de caixa, DRE e inadimplência",
    "routes": [
      "/relatorios"
    ],
    "desc": "O realizado e o previsto mês a mês no fluxo de caixa, o resultado no DRE, quem está atrasado e a exportação para a contabilidade.",
    "learn": [
      "Fluxo de caixa: realizado e previsto",
      "DRE: quanto sobrou",
      "Inadimplência e exportar para o contador"
    ],
    "text": "No Fluxo de caixa, o que entrou e saiu em cada mês, e o previsto pelas contas em aberto e pelas recorrentes. Na tabela, o saldo de cada mês. Um saldo previsto negativo é o aviso para se programar antes. O DRE mostra o resultado: receitas, menos custos e despesas. Escolha o ano e se quer por competência ou por caixa. Em Inadimplência, quem deve e há quanto tempo, separado por faixas de atraso. Em Exportar, baixe os lançamentos em planilha para o contador. Todos os relatórios também têm Baixar planilha."
  },
  {
    "n": 13,
    "file": "13-usuarios-e-perfis",
    "mod": "config",
    "s": 70,
    "title": "Usuários e perfis: quem pode o quê",
    "routes": [
      "/usuarios"
    ],
    "desc": "Convidar a equipe, escolher o perfil de cada pessoa e ver o que cada perfil pode fazer.",
    "learn": [
      "Convidar um usuário",
      "Escolher o perfil",
      "O que cada perfil pode fazer"
    ],
    "text": "Cada pessoa da equipe tem o próprio login e um perfil, que define o que ela pode ver e fazer. Em Usuários e perfis, clique em Convidar usuário. Informe o nome e o e-mail. Escolha o perfil. Lançamentos, por exemplo, lança contas, mas não aprova nem dá baixa. Clique em Criar acesso. O CIFREN mostra a senha provisória: passe para a pessoa por um canal seguro. No primeiro acesso, ela troca a senha. Na aba Perfis, veja o que cada perfil pode fazer. Também dá para criar um perfil do seu jeito."
  },
  {
    "n": 14,
    "file": "14-suporte-e-assistente",
    "mod": "config",
    "s": 79,
    "title": "Suporte: vídeo-aulas e o assistente",
    "routes": [
      "/suporte"
    ],
    "desc": "Assistir às aulas no ritmo certo, buscar um assunto e tirar dúvidas com o Assistente LORLER, que responde na hora.",
    "learn": [
      "Assistir e buscar as aulas",
      "Falar com o assistente",
      "O que nunca enviar no chat"
    ],
    "text": "No menu, clique em Suporte. As vídeo-aulas ficam aqui, com legenda na imagem e o texto da aula embaixo. Na busca, digite um assunto ou uma frase da aula. Abaixo do vídeo, escolha a velocidade. Toque em Falar com o assistente. Ele é da Central de Atendimento LORLER e responde na hora. Escreva do seu jeito. Ele responde com o passo a passo e indica a aula. Se precisar, chama a equipe de suporte. No chat, nunca envie senhas, códigos nem cartões. E o Assistente IA do menu é outro: ele responde sobre os números da sua organização."
  }
];

export const TOTAL_SECONDS = 1282;

export const videoUrl = (l) => `/treinamento/${l.file}.mp4`;
export const posterUrl = (l) => `/treinamento/${l.file}-capa.jpg`;
export const thumbUrl = (l) => `/treinamento/${l.file}.jpg`;
export const captionsUrl = (l) => `/treinamento/${l.file}.vtt`;
export const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
