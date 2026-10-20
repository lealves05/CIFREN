import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

/** Lista de migrações lidas da pasta (só arquivos .sql; a pasta rollback/ fica de fora). */
function listMigrations() {
  const embedded = globalThis.__CIFREN_MIGRATIONS__;
  if (embedded) return embedded;
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

/** Trava de migração (advisory lock de sessão, na mesma conexão): instâncias simultâneas esperam em vez de aplicar a mesma migração duas vezes. */
export const MIGRATE_LOCK = "select pg_advisory_lock(hashtext('cifren_migrate'))";
const MIGRATE_UNLOCK = "select pg_advisory_unlock(hashtext('cifren_migrate'))";

export async function migrate() {
  const client = await pool.connect();
  let locked = false;
  try {
    // caminho rápido (cada instância nova da Edge Function passa por aqui): se todas as migrações deste pacote já
    // estão registradas, uma consulta basta — sem trava, sem DDL. Só com migração pendente segue o caminho completo.
    try {
      const names = listMigrations().map((m) => m.name);
      const { rows: [c] } = await client.query('select count(*)::int as n from _migrations where name = any($1::text[])', [names]);
      if (c.n === names.length) return;
    } catch { /* tabela de controle ainda não existe: caminho completo */ }
    // quem esperou pela trava lê a lista de aplicadas DEPOIS de obtê-la e encontra tudo pronto
    await client.query(MIGRATE_LOCK);
    locked = true;
    await client.query(`create table if not exists _migrations (
      name text primary key, applied_at timestamptz not null default now())`);
    await client.query('alter table _migrations enable row level security');
    const { rows } = await client.query('select name from _migrations');
    const done = new Set(rows.map((r) => r.name));
    for (const { name: file, sql } of listMigrations()) {
      if (done.has(file)) continue;
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('insert into _migrations(name) values ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[migrate] aplicada ${file}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Falha na migração ${file}: ${e.message}`);
      }
    }
  } finally {
    if (locked) await client.query(MIGRATE_UNLOCK).catch(() => {});
    client.release();
  }
}

if (import.meta.url.startsWith('file:') && process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate()
    .then(() => { console.log('[migrate] ok'); return pool.end(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
