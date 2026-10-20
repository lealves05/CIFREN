// Auditoria só de inclusão, com hash encadeado por organização (qualquer alteração posterior quebra a corrente).
import crypto from 'node:crypto';

const SENSITIVE = /(password|senha|secret|token|code|codigo|hash|key|chave)/i;
function clean(v, depth = 0) {
  if (v == null || depth > 4) return v ?? null;
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => clean(x, depth + 1));
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SENSITIVE.test(k) ? '[omitido]' : clean(x, depth + 1)]));
  return typeof v === 'string' ? v.slice(0, 500) : v;
}

/** JSON com chaves em ordem (o jsonb do banco reordena as chaves; o hash precisa ser o mesmo na gravação e na conferência). */
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
const digest = (parts) => crypto.createHash('sha256').update(canonical(parts)).digest('hex');

/** Grava um evento (db = cliente de orgTx). actor = { id, name } ou null; req opcional para o IP. */
export async function audit(db, { actor, req, action, entity, entityId, summary, data }) {
  await db.query('select pg_advisory_xact_lock(hashtext($1))', [`audit:${db.orgId}`]);
  const prev = (await db.one('select hash from audit_events order by id desc limit 1'))?.hash || null;
  const at = new Date().toISOString();
  const payload = clean(data ?? null);
  const hash = digest([prev, db.orgId, actor?.id || null, action, entity, entityId ? String(entityId) : null, summary || null, payload, at]);
  await db.query(`insert into audit_events (org_id, user_id, user_name, action, entity, entity_id, summary, data, ip, at, prev_hash, hash)
                  values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
  [db.orgId, actor?.id || null, actor?.name || null, action, entity, entityId ? String(entityId) : null, summary || null,
    payload == null ? null : JSON.stringify(payload), req?.ip || null, at, prev, hash]);
}

/** Confere a corrente de uma organização (usado nos testes e na tela de auditoria). */
export async function verifyChain(db) {
  const rows = await db.all('select * from audit_events order by id');
  let prev = null;
  for (const r of rows) {
    const at = new Date(r.at).toISOString();
    const h = digest([prev, r.org_id, r.user_id, r.action, r.entity, r.entity_id, r.summary, r.data, at]);
    if (r.prev_hash !== prev || r.hash !== h) return { ok: false, broken_at: r.id };
    prev = r.hash;
  }
  return { ok: true, n: rows.length };
}
