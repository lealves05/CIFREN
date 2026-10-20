// Segredos do servidor. Na VPS, o lorler-start lê a tabela _secrets e entrega as chaves como variáveis (DATA_KEY…).
// Na primeira vez que o CIFREN sobe, ele mesmo gera as chaves que faltam e grava em _secrets (nunca em git ou log).
import crypto from 'node:crypto';
import { q } from './db.js';

const NEEDED = { data_key: 32 };

export async function ensureSecrets() {
  for (const [key, bytes] of Object.entries(NEEDED)) {
    const env = key.toUpperCase();
    if (process.env[env]) continue;
    const row = (await q('select value from _secrets where key = $1', [key])).rows[0];
    if (row?.value) { process.env[env] = row.value; continue; }
    const value = crypto.randomBytes(bytes).toString('base64url');
    await q('insert into _secrets (key, value) values ($1, $2) on conflict (key) do nothing', [key, value]);
    process.env[env] = (await q('select value from _secrets where key = $1', [key])).rows[0].value;
    console.log(`[segredos] chave ${key} criada`);
  }
}

/** Chave de cifra derivada (HKDF) para um uso específico. */
export function derivedKey(purpose) {
  const base = process.env.DATA_KEY;
  if (!base) throw new Error('DATA_KEY ausente');
  return Buffer.from(crypto.hkdfSync('sha256', base, 'cifren', `cifren:${purpose}`, 32));
}

/** Objeto → "v1.iv.tag.dados" (AES-256-GCM). */
export function seal(value, purpose = 'geral') {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', derivedKey(purpose), iv);
  const data = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}
export function unseal(text, purpose = 'geral') {
  const [v, iv, tag, data] = String(text || '').split('.');
  if (v !== 'v1') throw new Error('formato de segredo desconhecido');
  const d = crypto.createDecipheriv('aes-256-gcm', derivedKey(purpose), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8'));
}

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export function sameText(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
