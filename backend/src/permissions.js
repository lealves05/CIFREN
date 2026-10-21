// Catálogo de permissões (recurso.ação), perfis de sistema e dados iniciais de uma organização nova.
export const CATALOG = [
  { group: 'Financeiro', items: [
    { code: 'financeiro.painel.visualizar', label: 'Ver o painel (saldos e previsões)', risk: 'baixo' },
    { code: 'financeiro.titulos.visualizar', label: 'Ver contas a pagar e a receber', risk: 'baixo' },
    { code: 'financeiro.titulos.criar', label: 'Lançar contas a pagar e a receber', risk: 'medio' },
    { code: 'financeiro.titulos.editar', label: 'Editar lançamentos', risk: 'medio' },
    { code: 'financeiro.titulos.baixar', label: 'Dar baixa (pagamento/recebimento) e estornar', risk: 'alto' },
    { code: 'financeiro.titulos.cancelar', label: 'Cancelar lançamentos', risk: 'alto' },
  ] },
  { group: 'Aprovações', items: [
    { code: 'aprovacoes.aprovar', label: 'Aprovar ou reprovar contas, compras e reembolsos', risk: 'alto' },
    { code: 'aprovacoes.configurar', label: 'Definir as alçadas de aprovação', risk: 'alto' },
  ] },
  { group: 'Conciliação', items: [
    { code: 'conciliacao.importar', label: 'Importar extratos bancários (OFX/CSV)', risk: 'medio' },
    { code: 'conciliacao.conciliar', label: 'Conciliar extrato com os lançamentos', risk: 'alto' },
  ] },
  { group: 'Previsão e recorrências', items: [
    { code: 'previsao.visualizar', label: 'Ver previsão, compromissos recorrentes e fluxo de caixa', risk: 'baixo' },
    { code: 'recorrencias.gerenciar', label: 'Cadastrar e alterar compromissos recorrentes', risk: 'medio' },
  ] },
  { group: 'Cadastros', items: [
    { code: 'cadastros.visualizar', label: 'Ver fornecedores, clientes, categorias e centros de custo', risk: 'baixo' },
    { code: 'cadastros.gerenciar', label: 'Cadastrar e alterar fornecedores, clientes, categorias e centros de custo', risk: 'medio' },
    { code: 'cadastros.dados_sensiveis', label: 'Ver CPF/CNPJ, e-mail e telefone completos (sem ela, aparecem mascarados)', risk: 'medio' },
    { code: 'contas.gerenciar', label: 'Cadastrar e alterar contas bancárias e caixas', risk: 'alto' },
  ] },
  { group: 'Relatórios', items: [
    { code: 'relatorios.visualizar', label: 'Ver e exportar relatórios', risk: 'medio' },
    { code: 'relatorios.dre', label: 'Ver o DRE e os resultados', risk: 'medio' },
    { code: 'exportacao.contabil', label: 'Exportar os lançamentos para o contador', risk: 'medio' },
  ] },
  { group: 'Compras', items: [
    { code: 'compras.solicitar', label: 'Pedir compras', risk: 'baixo' },
    { code: 'compras.aprovar', label: 'Ver todas as compras da empresa', risk: 'medio' },
    { code: 'compras.gerenciar', label: 'Fazer o pedido ao fornecedor, receber e faturar', risk: 'alto' },
  ] },
  { group: 'Despesas e reembolsos', items: [
    { code: 'despesas.solicitar', label: 'Prestar contas e pedir reembolso', risk: 'baixo' },
    { code: 'despesas.aprovar', label: 'Ver todas as despesas da empresa', risk: 'medio' },
    { code: 'despesas.pagar', label: 'Pagar reembolsos aprovados', risk: 'alto' },
  ] },
  { group: 'Documentos', items: [
    { code: 'documentos.visualizar', label: 'Ver notas, boletos e comprovantes', risk: 'baixo' },
    { code: 'documentos.enviar', label: 'Enviar notas, boletos e comprovantes', risk: 'baixo' },
    { code: 'documentos.gerenciar', label: 'Lançar contas a partir de documentos e descartar', risk: 'medio' },
  ] },
  { group: 'Inteligência artificial', items: [
    { code: 'ia.usar', label: 'Usar o assistente financeiro e os agentes de IA', risk: 'medio' },
    { code: 'ia.configurar', label: 'Configurar a IA (chave, modelo e limite)', risk: 'alto' },
  ] },
  { group: 'Integrações', items: [
    { code: 'integracoes.gerenciar', label: 'Criar e revogar chaves de integração com os sistemas LORLER', risk: 'alto' },
  ] },
  { group: 'Administração', items: [
    { code: 'empresas.gerenciar', label: 'Cadastrar e alterar empresas (CNPJs)', risk: 'alto' },
    { code: 'usuarios.gerenciar', label: 'Convidar usuários e definir o perfil deles', risk: 'alto' },
    { code: 'perfis.gerenciar', label: 'Criar e alterar perfis de acesso', risk: 'alto' },
    { code: 'auditoria.visualizar', label: 'Ver o histórico de ações (auditoria)', risk: 'medio' },
    { code: 'configuracoes.gerenciar', label: 'Alterar configurações da organização', risk: 'alto' },
    { code: 'notificacoes.configurar', label: 'Configurar o e-mail de envio das notificações', risk: 'alto' },
    { code: 'seguranca.configurar', label: 'Exigir verificação em duas etapas de todos', risk: 'alto' },
  ] },
];
export const ALL = CATALOG.flatMap((g) => g.items.map((i) => i.code));
export const isKnown = (code) => ALL.includes(code);

const V = ['financeiro.painel.visualizar', 'financeiro.titulos.visualizar', 'cadastros.visualizar'];
const SOLICITAR = ['compras.solicitar', 'despesas.solicitar', 'documentos.enviar'];
export const SYSTEM_ROLES = [
  { key: 'dono', name: 'Dono', permissions: ALL },
  { key: 'administrador', name: 'Administrador', permissions: ALL.filter((c) => !['perfis.gerenciar', 'notificacoes.configurar', 'seguranca.configurar'].includes(c)) },
  { key: 'gestor', name: 'Gestor', permissions: [...V, 'previsao.visualizar', 'relatorios.visualizar', 'relatorios.dre', 'aprovacoes.aprovar', 'compras.aprovar',
    'despesas.aprovar', 'documentos.visualizar', 'ia.usar', 'auditoria.visualizar', ...SOLICITAR] },
  { key: 'financeiro', name: 'Financeiro', permissions: [...V, 'financeiro.titulos.criar', 'financeiro.titulos.editar', 'financeiro.titulos.baixar', 'financeiro.titulos.cancelar',
    'cadastros.gerenciar', 'cadastros.dados_sensiveis', 'relatorios.visualizar', 'relatorios.dre', 'conciliacao.importar', 'conciliacao.conciliar',
    'previsao.visualizar', 'recorrencias.gerenciar', 'compras.aprovar', 'compras.gerenciar', 'despesas.aprovar', 'despesas.pagar',
    'documentos.visualizar', 'documentos.enviar', 'documentos.gerenciar', 'ia.usar', ...SOLICITAR] },
  { key: 'aprovador', name: 'Aprovador', permissions: [...V, 'aprovacoes.aprovar', 'compras.aprovar', 'despesas.aprovar', 'documentos.visualizar'] },
  { key: 'lancamentos', name: 'Lançamentos', permissions: ['financeiro.titulos.visualizar', 'financeiro.titulos.criar', 'cadastros.visualizar', 'documentos.visualizar', ...SOLICITAR] },
  { key: 'colaborador', name: 'Colaborador', permissions: ['cadastros.visualizar', ...SOLICITAR] },
  { key: 'contador', name: 'Contador', permissions: [...V, 'relatorios.visualizar', 'relatorios.dre', 'exportacao.contabil', 'documentos.visualizar', 'previsao.visualizar', 'cadastros.dados_sensiveis'] },
  { key: 'auditor', name: 'Auditor (somente leitura)', permissions: [...V, 'relatorios.visualizar', 'relatorios.dre', 'auditoria.visualizar', 'documentos.visualizar', 'previsao.visualizar'] },
];

/**
 * Versões do catálogo: ao subir, organizações antigas ganham os perfis novos e, nos perfis de sistema que já existiam,
 * só as permissões NOVAS daquela versão (o que o cliente tirou de um perfil continua tirado).
 */
export const PERM_VERSION = 2;
const NEW_IN = { 2: ALL.filter((c) => !['financeiro.painel.visualizar', 'financeiro.titulos.visualizar', 'financeiro.titulos.criar', 'financeiro.titulos.editar',
  'financeiro.titulos.baixar', 'financeiro.titulos.cancelar', 'cadastros.visualizar', 'cadastros.gerenciar', 'contas.gerenciar', 'relatorios.visualizar', 'empresas.gerenciar',
  'usuarios.gerenciar', 'perfis.gerenciar', 'auditoria.visualizar', 'configuracoes.gerenciar'].includes(c)) };

// grupo do DRE de cada categoria padrão (pelo nome do grupo-mãe)
export const DRE_BY_PARENT = {
  'Vendas': 'receita_bruta', 'Outras receitas': 'outras_receitas', 'Fornecedores': 'custos', 'Impostos e taxas': 'deducoes',
  'Ocupação': 'despesas_operacionais', 'Consumo': 'despesas_operacionais', 'Pessoal': 'despesas_operacionais', 'Serviços': 'despesas_operacionais',
  'Financeiras': 'despesas_financeiras',
};
export const DRE_BY_NAME = { 'Taxas bancárias': 'despesas_financeiras', 'Outros impostos': 'despesas_operacionais', 'Rendimentos': 'outras_receitas' };

export const DEFAULT_CATEGORIES = {
  receita: [
    ['Vendas', ['Vendas de produtos', 'Prestação de serviços']],
    ['Outras receitas', ['Rendimentos', 'Reembolsos']],
  ],
  despesa: [
    ['Ocupação', ['Aluguel', 'Condomínio', 'IPTU']],
    ['Consumo', ['Energia elétrica', 'Água', 'Internet e telefone', 'Gás']],
    ['Pessoal', ['Salários', 'Pró-labore', 'Encargos', 'Benefícios']],
    ['Fornecedores', ['Compras de mercadorias', 'Matéria-prima e insumos']],
    ['Impostos e taxas', ['Simples Nacional (DAS)', 'Outros impostos', 'Taxas bancárias']],
    ['Serviços', ['Contador', 'Sistemas e assinaturas', 'Manutenção', 'Marketing']],
    ['Financeiras', ['Juros e multas', 'Empréstimos e financiamentos', 'Tarifas de maquininha']],
  ],
};

async function upsertRoles(db, onlyNewPermsOf = null) {
  let ownerRole = null;
  for (const r of SYSTEM_ROLES) {
    const cur = await db.one('select id, permissions from roles where org_id=$1 and key=$2', [db.orgId, r.key]);
    if (!cur) {
      const row = await db.one('insert into roles (org_id, key, name, system, permissions) values ($1,$2,$3,true,$4) returning id', [db.orgId, r.key, r.name, r.permissions]);
      if (r.key === 'dono') ownerRole = row.id;
      continue;
    }
    if (r.key === 'dono') { ownerRole = cur.id; await db.query('update roles set permissions=$2 where id=$1', [cur.id, ALL]); continue; }
    if (onlyNewPermsOf) {
      const add = r.permissions.filter((p) => onlyNewPermsOf.includes(p) && !cur.permissions.includes(p));
      if (add.length) await db.query('update roles set permissions = permissions || $2::text[] where id=$1', [cur.id, add]);
    }
  }
  return ownerRole;
}

/** Cria perfis e categorias padrão de uma organização (dentro de orgTx). Devolve o id do perfil Dono. */
export async function seedOrganization(db) {
  const ownerRole = await upsertRoles(db);
  if (!(await db.one('select 1 from categories limit 1'))) {
    for (const [type, groups] of Object.entries(DEFAULT_CATEGORIES)) {
      for (const [parent, children] of groups) {
        const p = await db.one('insert into categories (org_id, name, type, dre_group) values ($1,$2,$3,$4) returning id', [db.orgId, parent, type, DRE_BY_PARENT[parent] || null]);
        for (const c of children) await db.query('insert into categories (org_id, name, type, parent_id, dre_group) values ($1,$2,$3,$4,$5)', [db.orgId, c, type, p.id, DRE_BY_NAME[c] || DRE_BY_PARENT[parent] || null]);
      }
    }
  }
  await db.query('update organizations set perm_version=$2 where id=$1', [db.orgId, PERM_VERSION]);
  return ownerRole;
}

/** Ao subir: leva as organizações antigas para a versão atual do catálogo (perfis novos + permissões novas). */
export async function upgradeOrganizations(orgTx, all) {
  const orgs = await all('select id, perm_version from organizations where perm_version < $1', [PERM_VERSION]);
  for (const o of orgs) {
    await orgTx(o.id, async (db) => {
      const add = [];
      for (let v = o.perm_version + 1; v <= PERM_VERSION; v++) add.push(...(NEW_IN[v] || []));
      await upsertRoles(db, add);
      // DRE: grupos das categorias padrão que ainda não têm (nunca troca o que o cliente escolheu)
      for (const [name, g] of Object.entries(DRE_BY_NAME)) await db.query('update categories set dre_group=$2 where name=$1 and parent_id is not null and dre_group is null', [name, g]);
      for (const [parent, g] of Object.entries(DRE_BY_PARENT)) {
        await db.query('update categories set dre_group=$2 where name=$1 and parent_id is null and dre_group is null', [parent, g]);
        await db.query('update categories c set dre_group=$2 from categories p where c.parent_id=p.id and p.name=$1 and c.dre_group is null', [parent, g]);
      }
      await db.query('update organizations set perm_version=$2 where id=$1', [o.id, PERM_VERSION]);
    });
  }
  return orgs.length;
}
