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
  { group: 'Cadastros', items: [
    { code: 'cadastros.visualizar', label: 'Ver fornecedores, clientes, categorias e centros de custo', risk: 'baixo' },
    { code: 'cadastros.gerenciar', label: 'Cadastrar e alterar fornecedores, clientes, categorias e centros de custo', risk: 'medio' },
    { code: 'contas.gerenciar', label: 'Cadastrar e alterar contas bancárias e caixas', risk: 'alto' },
  ] },
  { group: 'Relatórios', items: [
    { code: 'relatorios.visualizar', label: 'Ver e exportar relatórios', risk: 'medio' },
  ] },
  { group: 'Administração', items: [
    { code: 'empresas.gerenciar', label: 'Cadastrar e alterar empresas (CNPJs)', risk: 'alto' },
    { code: 'usuarios.gerenciar', label: 'Convidar usuários e definir o perfil deles', risk: 'alto' },
    { code: 'perfis.gerenciar', label: 'Criar e alterar perfis de acesso', risk: 'alto' },
    { code: 'auditoria.visualizar', label: 'Ver o histórico de ações (auditoria)', risk: 'medio' },
    { code: 'configuracoes.gerenciar', label: 'Alterar configurações da organização', risk: 'alto' },
  ] },
];
export const ALL = CATALOG.flatMap((g) => g.items.map((i) => i.code));
export const isKnown = (code) => ALL.includes(code);

const V = ['financeiro.painel.visualizar', 'financeiro.titulos.visualizar', 'cadastros.visualizar'];
export const SYSTEM_ROLES = [
  { key: 'dono', name: 'Dono', permissions: ALL },
  { key: 'administrador', name: 'Administrador', permissions: ALL.filter((c) => c !== 'perfis.gerenciar') },
  { key: 'financeiro', name: 'Financeiro', permissions: [...V, 'financeiro.titulos.criar', 'financeiro.titulos.editar', 'financeiro.titulos.baixar', 'financeiro.titulos.cancelar', 'cadastros.gerenciar', 'relatorios.visualizar'] },
  { key: 'lancamentos', name: 'Lançamentos', permissions: ['financeiro.titulos.visualizar', 'financeiro.titulos.criar', 'cadastros.visualizar'] },
  { key: 'contador', name: 'Contador', permissions: [...V, 'relatorios.visualizar'] },
  { key: 'auditor', name: 'Auditor (somente leitura)', permissions: [...V, 'relatorios.visualizar', 'auditoria.visualizar'] },
];

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

/** Cria perfis e categorias padrão de uma organização (dentro de orgTx). Devolve o id do perfil Dono. */
export async function seedOrganization(db) {
  let ownerRole = null;
  for (const r of SYSTEM_ROLES) {
    const row = await db.one(`insert into roles (org_id, key, name, system, permissions) values ($1,$2,$3,true,$4)
                              on conflict (org_id, key) do update set name = excluded.name returning id`, [db.orgId, r.key, r.name, r.permissions]);
    if (r.key === 'dono') ownerRole = row.id;
  }
  if (!(await db.one('select 1 from categories limit 1'))) {
    for (const [type, groups] of Object.entries(DEFAULT_CATEGORIES)) {
      for (const [parent, children] of groups) {
        const p = await db.one('insert into categories (org_id, name, type) values ($1,$2,$3) returning id', [db.orgId, parent, type]);
        for (const c of children) await db.query('insert into categories (org_id, name, type, parent_id) values ($1,$2,$3,$4)', [db.orgId, c, type, p.id]);
      }
    }
  }
  return ownerRole;
}
