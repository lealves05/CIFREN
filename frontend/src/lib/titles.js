import { STATUS_LABEL } from './format';

export const KIND = {
  pagar: { title: 'Contas a pagar', one: 'conta a pagar', party: 'fornecedor', partyLabel: 'Fornecedor', categoryType: 'despesa', settleVerb: 'Pagamento', newLabel: 'Nova conta a pagar' },
  receber: { title: 'Contas a receber', one: 'conta a receber', party: 'cliente', partyLabel: 'Cliente', categoryType: 'receita', settleVerb: 'Recebimento', newLabel: 'Nova conta a receber' },
};

export const STATUS_TABS = [
  { value: 'abertos', label: 'Abertos' },
  { value: 'vencidos', label: 'Vencidos' },
  { value: 'pagos', label: 'Pagos' },
  { value: 'cancelados', label: 'Cancelados' },
  { value: 'todos', label: 'Todos' },
];

export const isOpen = (t) => t && (t.status === 'aberto' || t.status === 'parcial');
export const blockedByApproval = (t) => t && (t.approval_status === 'pendente' || t.approval_status === 'reprovado');
export const canSettle = (t) => isOpen(t) && Number(t.open_amount) > 0 && !blockedByApproval(t) && !t.member_credit;

export const SOURCE_NAME = { orbi: 'ORBI', torven: 'TORVEN', rusten: 'RUSTEN', apolven: 'APOLVEN', cerebro: 'Cérebro', manual: null, documento: 'Documento', conciliacao: 'Conciliação', compra: 'Compras', reembolso: 'Reembolso', recorrente: 'Recorrente' };

/** Selos extras do título: aprovação, valor estimado (recorrente) e origem. */
export function titleFlags(t) {
  if (!t) return [];
  const out = [];
  if (t.approval_status === 'pendente') out.push({ key: 'ap', label: 'Aguardando aprovação', tone: 'warn' });
  if (t.approval_status === 'reprovado') out.push({ key: 'ap', label: 'Reprovado', tone: 'danger' });
  if (t.estimated) out.push({ key: 'est', label: 'Valor estimado', tone: 'warn', title: 'Valor estimado — aguardando a conta chegar' });
  const src = t.source && t.source !== 'manual' ? (SOURCE_NAME[t.source] !== undefined ? SOURCE_NAME[t.source] : String(t.source).toUpperCase()) : null;
  if (src) out.push({ key: 'src', label: t.source === 'recorrente' ? 'Recorrente' : `Veio do ${src}`, tone: 'neutral' });
  if (t.member_credit) out.push({ key: 'cred', label: 'Crédito do associado', tone: 'brand', title: 'Saldo de crédito do associado no RUSTEN: diminui sozinho quando ele consome' });
  return out;
}
export const canCancel = (t) => t && t.status === 'aberto' && !Number(t.paid_amount) && !t.member_credit;

/** Rótulo e tom do selo de situação. */
export function statusInfo(t, kind) {
  if (!t) return { label: '', tone: 'neutral' };
  if (t.status === 'pago') return { label: kind === 'receber' ? 'Recebido' : 'Pago', tone: 'positive' };
  if (t.status === 'cancelado') return { label: 'Cancelado', tone: 'neutral' };
  if (t.overdue) return { label: t.status === 'parcial' ? 'Vencido · pago em parte' : 'Vencido', tone: 'danger' };
  if (t.status === 'parcial') return { label: kind === 'receber' ? 'Recebido em parte' : STATUS_LABEL.parcial, tone: 'warn' };
  return { label: STATUS_LABEL.aberto, tone: 'brand' };
}
