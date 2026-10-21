const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const num2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money = (v) => brl.format(Number(v) || 0);
export const moneyCompact = (v) => brlCompact.format(Number(v) || 0);
export const decimal = (v) => num2.format(Number(v) || 0);

/** Arredonda para centavos (evita 0,1 + 0,2). */
export const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** "2026-10-20" → "20/10/2026" sem mexer em fuso horário. */
export function date(d) {
  if (!d) return '—';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(d);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Instante ISO → "20/10/2026 14:32" no horário local. */
export function dateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** "20/10" para eixos de gráfico. */
export function dayMonth(d) {
  const m = String(d || '').match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : '';
}

/** Data de hoje no fuso do navegador, no formato da API (YYYY-MM-DD). */
export function today(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Primeiro e último dia do mês corrente. */
export function monthRange() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return { from: `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`, to: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(last)}` };
}

/** Dias inteiros entre hoje e a data (negativo = já passou). */
export function daysUntil(d) {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - base) / 86400000);
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const STATUS_LABEL = { aberto: 'Em aberto', parcial: 'Pago em parte', pago: 'Pago', cancelado: 'Cancelado' };

export const METHODS = [
  { value: 'pix', label: 'Pix' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao', label: 'Cartão' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'outro', label: 'Outro' },
];
export const methodLabel = (v) => (v === 'credito_rusten' ? 'Crédito do RUSTEN' : METHODS.find((m) => m.value === v)?.label || v || '—');

export const ACCOUNT_TYPES = [
  { value: 'banco', label: 'Conta no banco' },
  { value: 'caixa', label: 'Caixa (dinheiro)' },
  { value: 'cartao', label: 'Cartão' },
  { value: 'aplicacao', label: 'Aplicação' },
];
export const accountTypeLabel = (v) => ACCOUNT_TYPES.find((t) => t.value === v)?.label || v;

export const INTERVALS = [
  { value: 'mensal', label: 'Todo mês' },
  { value: 'quinzenal', label: 'A cada 15 dias' },
  { value: 'semanal', label: 'Toda semana' },
  { value: 'anual', label: 'Todo ano' },
];

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** "2026-03" → "mar/26" */
export function monthShort(m) {
  const x = String(m || '').match(/^(\d{4})-(\d{2})/);
  return x ? `${MESES[Number(x[2]) - 1]}/${x[1].slice(2)}` : String(m || '');
}
/** "2026-03" → "março de 2026" */
export function monthLong(m) {
  const x = String(m || '').match(/^(\d{4})-(\d{2})/);
  return x ? `${MESES_LONGO[Number(x[2]) - 1]} de ${x[1]}` : String(m || '');
}
/** Mês atual (ou deslocado) no formato YYYY-MM. */
export function thisMonth(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export const pct = (v, digits = 1) => `${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

export const FREQUENCIES = [
  { value: 'mensal', label: 'Todo mês' },
  { value: 'bimestral', label: 'A cada 2 meses' },
  { value: 'trimestral', label: 'A cada 3 meses' },
  { value: 'semestral', label: 'A cada 6 meses' },
  { value: 'anual', label: 'Todo ano' },
  { value: 'quinzenal', label: 'A cada 15 dias' },
  { value: 'semanal', label: 'Toda semana' },
];
export const frequencyLabel = (v) => FREQUENCIES.find((f) => f.value === v)?.label || v || '—';
