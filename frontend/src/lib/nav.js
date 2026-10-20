import { LayoutDashboard, ArrowUpFromLine, ArrowDownToLine, FolderOpen, Building2, Users, ShieldCheck, UserRound } from 'lucide-react';
import { P } from './permissions';

/** Itens do menu e a(s) permissão(ões) que liberam cada um. */
export const NAV = [
  { to: '/', label: 'Início', short: 'Início', icon: LayoutDashboard, perms: [P.dashboard], end: true },
  { to: '/pagar', label: 'Contas a pagar', short: 'Pagar', icon: ArrowUpFromLine, perms: [P.titlesView] },
  { to: '/receber', label: 'Contas a receber', short: 'Receber', icon: ArrowDownToLine, perms: [P.titlesView] },
  { to: '/cadastros', label: 'Cadastros', short: 'Cadastros', icon: FolderOpen, perms: [P.registryView, P.registryManage, P.accountsManage] },
  { to: '/empresas', label: 'Empresas', short: 'Empresas', icon: Building2, perms: [P.companiesManage] },
  { to: '/usuarios', label: 'Usuários e perfis', short: 'Usuários', icon: Users, perms: [P.usersManage, P.rolesManage] },
  { to: '/auditoria', label: 'Auditoria', short: 'Auditoria', icon: ShieldCheck, perms: [P.auditView] },
  { to: '/conta', label: 'Minha conta', short: 'Conta', icon: UserRound, perms: null },
];

export const visibleNav = (can) => NAV.filter((n) => !n.perms || can(...n.perms));

/** Primeira tela que o usuário pode abrir (para quem não vê o Início). */
export const firstAllowed = (can) => visibleNav(can).find((n) => n.to !== '/')?.to || '/conta';
