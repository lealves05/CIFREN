// Ambiente de teste: banco próprio com papel NÃO superusuário (a RLS vale como na VPS).
//   DATABASE_URL padrão: postgres://cifren_app:cifren_app@localhost:5432/cifren_test
process.env.DATABASE_URL ||= 'postgres://cifren_app:cifren_app@localhost:5432/cifren_test';
process.env.RATE_LIMIT_FACTOR ||= '1000';
process.env.NODE_ENV = 'test';

export async function boot() {
  const { pool } = await import('../src/db.js');
  const { rows: [r] } = await pool.query('select rolsuper, rolbypassrls from pg_roles where rolname = current_user');
  if (r.rolsuper || r.rolbypassrls) throw new Error('Os testes precisam de um papel sem superusuário/BYPASSRLS para valer a RLS.');
  await pool.query('drop schema if exists public cascade; create schema public;');
  const { migrate } = await import('../src/migrate.js');
  const { ensureSecrets } = await import('../src/secrets.js');
  await migrate(); await ensureSecrets();
  const { createApp } = await import('../src/app.js');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((ok) => server.once('listening', ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, pool, close: async () => { await new Promise((ok) => server.close(ok)); await pool.end(); } };
}

/** Cliente com "pote" de cookies, como um navegador. */
export function client(base) {
  let cookie = '';
  const call = async (method, path, body, headers = {}) => {
    const h = { ...headers };
    if (cookie) h.cookie = cookie;
    if (method !== 'GET' && !('x-cifren' in h)) h['x-cifren'] = '1';
    if (body !== undefined) h['content-type'] = 'application/json';
    const res = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [kv] = c.split(';'); const [k, v] = kv.split('=');
      cookie = v ? `${k}=${v}` : '';
    }
    const text = await res.text();
    let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data };
  };
  return {
    get: (p, h) => call('GET', p, undefined, h), post: (p, b, h) => call('POST', p, b ?? {}, h),
    put: (p, b, h) => call('PUT', p, b ?? {}, h), del: (p, h) => call('DELETE', p, undefined, h),
    get cookie() { return cookie; },
  };
}

export const PASS = 'Senha-forte-2026';
export async function signup(base, n) {
  const c = client(base);
  const r = await c.post('/api/auth/signup', { name: `Dono ${n}`, email: `dono${n}@exemplo.com`, password: PASS, company_name: `Empresa ${n}` });
  if (r.status !== 201) throw new Error(`signup ${n}: ${r.status} ${JSON.stringify(r.data)}`);
  return c;
}
