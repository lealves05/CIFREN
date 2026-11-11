// Gerado por tools/videos/gen-training.mjs (não edite à mão). Aula sugerida para a tela atual (link "Aula" do topo).
const HELP = [[1,"Conhecendo o CIFREN",["/"]],[2,"Contas bancárias, fornecedores e categorias",["/cadastros"]],[3,"Contas a pagar: lançar, parcelar e dar baixa",["/pagar"]],[4,"Contas a receber: lançar e receber",["/receber"]],[5,"Alçadas e aprovações: quem autoriza o pagamento",["/aprovacoes","/configuracoes/alcadas"]],[6,"Conciliação bancária: conferir o extrato",["/conciliacao"]],[7,"Associados e mensalidades",["/associados"]],[8,"Recorrentes e previsão: as contas de todo mês",["/recorrentes"]],[9,"Compras: da solicitação à conta a pagar",["/compras"]],[10,"Despesas e reembolsos",["/despesas"]],[11,"Documentos: lançar a conta pelo boleto",["/documentos"]],[12,"Relatórios: fluxo de caixa, DRE e inadimplência",["/relatorios"]],[13,"Usuários e perfis: quem pode o quê",["/usuarios"]],[14,"Suporte: vídeo-aulas e o assistente",["/suporte"]]];

/** Aula mais específica para a tela atual (maior prefixo de rota): { n, title } ou null. */
export function lessonFor(pathname) {
  let best = null; let len = -1;
  for (const [n, title, routes] of HELP) {
    for (const r of routes) {
      const hit = r === '/' ? pathname === '/' : pathname === r || pathname.startsWith(`${r}/`);
      if (hit && r.length > len) { best = { n, title }; len = r.length; }
    }
  }
  return best;
}
