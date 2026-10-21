import {
  LayoutDashboard, ArrowUpFromLine, ArrowDownToLine, FolderOpen, Building2, Users, ShieldCheck, UserRound,
  Wallet, ClipboardCheck, Landmark, Repeat, ShoppingCart, Receipt, FileText, BarChart3, LineChart, Table2,
  Target, AlarmClock, Download, Sparkles, Settings, Plug, Bot, Bell, Lock, Scale, Map as MapIcon, ShoppingBag, HandCoins,
} from 'lucide-react';
import { P, APPROVER_PERMS } from './permissions';

/**
 * Menu em grupos. Cada item: rota, rótulo, ícone, permissões (qualquer uma libera; null = todos)
 * e módulo do plano (me.modules; chave ausente = liberado).
 */
export const NAV_GROUPS = [
  { key: 'inicio', items: [{ to: '/', label: 'Início', short: 'Início', icon: LayoutDashboard, perms: [P.dashboard], end: true, module: 'financeiro' }] },
  {
    key: 'financeiro', label: 'Financeiro', icon: Wallet,
    items: [
      { to: '/pagar', label: 'Contas a pagar', short: 'Pagar', icon: ArrowUpFromLine, perms: [P.titlesView], module: 'financeiro' },
      { to: '/receber', label: 'Contas a receber', short: 'Receber', icon: ArrowDownToLine, perms: [P.titlesView], module: 'financeiro' },
      { to: '/aprovacoes', label: 'Aprovações', short: 'Aprovações', icon: ClipboardCheck, perms: APPROVER_PERMS, badge: 'approvals', module: 'financeiro' },
      { to: '/conciliacao', label: 'Conciliação', short: 'Conciliação', icon: Landmark, perms: [P.reconImport, P.reconMatch], module: 'conciliacao_bancaria' },
      { to: '/associados', label: 'Associados e mensalidades', short: 'Associados', icon: HandCoins, perms: [P.membersView, P.membersManage], module: 'associados' },
      { to: '/recorrentes', label: 'Recorrentes e previsão', short: 'Recorrentes', icon: Repeat, perms: [P.recurringManage, P.forecastView], module: 'recorrencias' },
    ],
  },
  {
    key: 'compras', label: 'Compras e despesas', icon: ShoppingBag,
    items: [
      { to: '/compras', label: 'Compras', short: 'Compras', icon: ShoppingCart, perms: [P.purchaseRequest, P.purchaseApprove, P.purchaseManage], module: 'compras' },
      { to: '/despesas', label: 'Despesas e reembolsos', short: 'Despesas', icon: Receipt, perms: [P.expenseRequest, P.expenseApprove, P.expensePay], module: 'despesas' },
    ],
  },
  { key: 'documentos', items: [{ to: '/documentos', label: 'Documentos', short: 'Documentos', icon: FileText, perms: [P.docsView, P.docsUpload, P.docsManage], module: 'documentos_ia' }] },
  {
    key: 'relatorios', label: 'Relatórios', icon: BarChart3,
    items: [
      { to: '/relatorios/fluxo', label: 'Fluxo de caixa', short: 'Fluxo', icon: LineChart, perms: [P.reportsView, P.forecastView] , module: 'relatorios' },
      { to: '/relatorios/dre', label: 'DRE e resultados', short: 'DRE', icon: Table2, perms: [P.dre], module: 'relatorios' },
      { to: '/relatorios/centros', label: 'Centros de custo', short: 'Centros', icon: Target, perms: [P.reportsView] , module: 'relatorios' },
      { to: '/relatorios/inadimplencia', label: 'Inadimplência', short: 'Atrasos', icon: AlarmClock, perms: [P.reportsView] , module: 'relatorios' },
      { to: '/relatorios/exportar', label: 'Exportar', short: 'Exportar', icon: Download, perms: [P.reportsView, P.exportAccounting] , module: 'relatorios' },
    ],
  },
  { key: 'ia', items: [{ to: '/assistente', label: 'Assistente IA', short: 'Assistente', icon: Sparkles, perms: [P.aiUse, P.dashboard] }] },
  { key: 'cadastros', items: [{ to: '/cadastros', label: 'Cadastros', short: 'Cadastros', icon: FolderOpen, perms: [P.registryView, P.registryManage, P.accountsManage] }] },
  {
    key: 'config', label: 'Configurações', icon: Settings,
    items: [
      { to: '/empresas', label: 'Empresas', short: 'Empresas', icon: Building2, perms: [P.companiesManage] },
      { to: '/usuarios', label: 'Usuários e perfis', short: 'Usuários', icon: Users, perms: [P.usersManage, P.rolesManage] },
      { to: '/configuracoes/alcadas', label: 'Alçadas de aprovação', short: 'Alçadas', icon: Scale, perms: [P.approvalRules] },
      { to: '/configuracoes/integracoes', label: 'Integrações LORLER', short: 'Integrações', icon: Plug, perms: [P.integrations], module: 'integracoes_lorler' },
      { to: '/configuracoes/ia', label: 'Inteligência artificial', short: 'IA', icon: Bot, perms: [P.aiConfig], module: 'agentes_ia' },
      { to: '/configuracoes/notificacoes', label: 'Notificações e e-mail', short: 'Notificações', icon: Bell, perms: null },
      { to: '/configuracoes/seguranca', label: 'Segurança', short: 'Segurança', icon: Lock, perms: [P.security] },
      { to: '/auditoria', label: 'Auditoria', short: 'Auditoria', icon: ShieldCheck, perms: [P.auditView] },
    ],
  },
  { key: 'conta', items: [{ to: '/conta', label: 'Minha conta', short: 'Conta', icon: UserRound, perms: null }] },
];

export const OVERVIEW = { to: '/visao-geral', label: 'Visão geral do CIFREN', short: 'Visão geral', icon: MapIcon, perms: null };

export const NAV = NAV_GROUPS.flatMap((g) => g.items);

const allowed = (can, moduleOn) => (n) => (!n.perms || can(...n.perms)) && (!n.module || !moduleOn || moduleOn(n.module));

export const visibleNav = (can, moduleOn) => NAV.filter(allowed(can, moduleOn));

/** Grupos com só os itens liberados (grupos vazios somem). */
export const visibleGroups = (can, moduleOn) => NAV_GROUPS
  .map((g) => ({ ...g, items: g.items.filter(allowed(can, moduleOn)) }))
  .filter((g) => g.items.length);

/** O item libera esta rota? (usado pelo mapa da visão geral) */
export const canOpen = (to, can, moduleOn) => {
  const n = NAV.find((x) => x.to === to);
  return n ? allowed(can, moduleOn)(n) : true;
};

/** Primeira tela que o usuário pode abrir (para quem não vê o Início). */
export const firstAllowed = (can, moduleOn) => visibleNav(can, moduleOn).find((n) => n.to !== '/')?.to || '/conta';
