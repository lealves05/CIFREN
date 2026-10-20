// Limites de tentativas guardados no PostgreSQL (valem para qualquer número de processos).
import { q } from './db.js';
import { HttpError } from './util.js';
import { sha256 } from './secrets.js';

export async function hit(key, limit, windowSec) {
  const { rows: [r] } = await q(
    `insert into rate_limits (key, count, reset_at) values ($1, 1, now() + make_interval(secs => $2))
     on conflict (key) do update set
       count = case when rate_limits.reset_at <= now() then 1 else rate_limits.count + 1 end,
       reset_at = case when rate_limits.reset_at <= now() then now() + make_interval(secs => $2) else rate_limits.reset_at end
     returning count, greatest(1, extract(epoch from (reset_at - now()))::int) as left`, [sha256(key), windowSec]);
  if (Math.random() < 0.01) q("delete from rate_limits where reset_at < now() - interval '1 day'").catch(() => {});
  return { count: r.count, blocked: r.count > limit, retryAfter: r.left };
}
export const clearHits = (key) => q('delete from rate_limits where key = $1', [sha256(key)]).catch(() => {});

const factor = () => Math.max(1, Number(process.env.RATE_LIMIT_FACTOR || 1));

/** Limite por IP (o IP real vem do lorler-edge com a EDGE_PROXY_KEY). */
export function limitByIp(scope, limit, windowSec, message = 'Muitas tentativas. Aguarde alguns minutos.') {
  return async (req, res, next) => {
    const r = await hit(`${scope}:ip:${req.ip}`, limit * factor(), windowSec);
    if (r.blocked) { res.set('Retry-After', String(r.retryAfter)); throw new HttpError(429, message); }
    next();
  };
}
export async function limitByKey(scope, id, limit, windowSec, res, message = 'Muitas tentativas. Aguarde alguns minutos.') {
  const r = await hit(`${scope}:id:${String(id).toLowerCase()}`, limit * factor(), windowSec);
  if (r.blocked) { res?.set('Retry-After', String(r.retryAfter)); throw new HttpError(429, message); }
  return r;
}
