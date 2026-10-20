// Acesso ao PostgreSQL. Toda leitura/gravação de dados de negócio passa por orgTx(), que abre uma transação e define
// app.org_id: a RLS do banco só mostra a organização da sessão (defesa extra além dos filtros da API).
import pg from 'pg';

// numeric → number (valores em reais com 2 casas), bigint → number, date → 'YYYY-MM-DD'
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
pg.types.setTypeParser(1082, (v) => v);

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/cifren';
const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/.test(connectionString);
const ssl = process.env.DATABASE_SSL === 'false' || isLocal ? false : { rejectUnauthorized: false };

export const pool = new pg.Pool({ connectionString, ssl, max: Number(process.env.DB_POOL_MAX || 10), idleTimeoutMillis: 30000 });
pool.on('error', (err) => console.error('[db] erro no pool', err.message));

/** Consulta fora de organização (identidade, sessões, segredos). Nunca usar para tabelas de negócio. */
export const q = (text, params) => pool.query(text, params);
export async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}

/** Transação simples (sem organização). */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Transação presa a uma organização: define app.org_id (local à transação) e entrega um cliente com
 * helpers { query, one, all }. Tudo que a RLS protege só é visível/gravável dentro daqui.
 */
export async function orgTx(orgId, fn) {
  if (!UUID.test(String(orgId || ''))) throw new Error('organização inválida');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("select set_config('app.org_id', $1, true)", [orgId]);
    const db = {
      query: (t, p) => client.query(t, p),
      one: async (t, p) => (await client.query(t, p)).rows[0] || null,
      all: async (t, p) => (await client.query(t, p)).rows,
      orgId,
    };
    const r = await fn(db);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
}
