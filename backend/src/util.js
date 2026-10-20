// Utilidades comuns: erro HTTP, validação, dinheiro e datas.
export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
export const bad = (msg, extra) => new HttpError(400, msg, extra);
export const notFound = (msg = 'Registro não encontrado.') => new HttpError(404, msg);
export const forbidden = (msg = 'Seu perfil de acesso não permite esta ação.') => new HttpError(403, msg);

/** Valida com zod e devolve os dados limpos; a primeira falha vira mensagem em português. */
export function parse(schema, data) {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    const first = r.error.issues[0];
    const field = first.path.join('.');
    throw bad(field ? `${field}: ${first.message}` : first.message);
  }
  return r.data;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => UUID_RE.test(String(v || ''));
export function uuidParam(v) { if (!isUuid(v)) throw notFound(); return v; }

/** Centavos inteiros (evita erro de ponto flutuante) ↔ reais. */
export const toCents = (v) => Math.round(Number(v) * 100);
export const fromCents = (c) => Math.round(c) / 100;
export const round2 = (n) => fromCents(toCents(n));

/** Divide um valor em n parcelas; os centavos que sobram vão para a última. */
export function splitAmount(total, n) {
  const c = toCents(total); const base = Math.floor(c / n);
  return Array.from({ length: n }, (_, i) => fromCents(i === n - 1 ? c - base * (n - 1) : base));
}

/** Soma um intervalo a uma data YYYY-MM-DD (mês: mantém o dia; dia inexistente vai para o último do mês). */
export function addInterval(dateStr, interval, k) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (interval === 'semanal' || interval === 'quinzenal') {
    const dt = new Date(Date.UTC(y, m - 1, d + k * (interval === 'semanal' ? 7 : 14)));
    return dt.toISOString().slice(0, 10);
  }
  const months = interval === 'anual' ? 12 * k : k;
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** Data de hoje (YYYY-MM-DD) no fuso informado. */
export function today(tz = 'America/Sao_Paulo') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Escapa curingas para ILIKE. */
export const likeEsc = (v) => String(v ?? '').replace(/[\\%_]/g, '\\$&');

/** Cursor opaco para paginação (base64url de JSON). */
export const encodeCursor = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function decodeCursor(s) {
  if (!s) return null;
  try { return JSON.parse(Buffer.from(String(s), 'base64url').toString('utf8')); } catch { throw bad('cursor inválido'); }
}
export const limitParam = (v, def = 50, max = 200) => Math.min(Math.max(parseInt(v, 10) || def, 1), max);

/** Política de senha: devolve a mensagem do problema ou null. */
export function passwordProblem(p) {
  const s = String(p || '');
  if (s.length < 10) return 'A senha precisa ter pelo menos 10 caracteres.';
  if (s.length > 200) return 'A senha é longa demais.';
  if (!/[A-Za-zÀ-ÿ]/.test(s) || !/\d/.test(s)) return 'A senha precisa ter letras e números.';
  if (/^(.)\1+$/.test(s) || /^(1234567890|0123456789|senha12345|password12)/i.test(s)) return 'Escolha uma senha menos óbvia.';
  return null;
}
