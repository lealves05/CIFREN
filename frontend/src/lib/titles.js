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
export const canSettle = (t) => isOpen(t) && Number(t.open_amount) > 0;
export const canCancel = (t) => t && t.status === 'aberto' && !Number(t.paid_amount);

/** Rótulo e tom do selo de situação. */
export function statusInfo(t, kind) {
  if (!t) return { label: '', tone: 'neutral' };
  if (t.status === 'pago') return { label: kind === 'receber' ? 'Recebido' : 'Pago', tone: 'positive' };
  if (t.status === 'cancelado') return { label: 'Cancelado', tone: 'neutral' };
  if (t.overdue) return { label: t.status === 'parcial' ? 'Vencido · pago em parte' : 'Vencido', tone: 'danger' };
  if (t.status === 'parcial') return { label: kind === 'receber' ? 'Recebido em parte' : STATUS_LABEL.parcial, tone: 'warn' };
  return { label: STATUS_LABEL.aberto, tone: 'brand' };
}
