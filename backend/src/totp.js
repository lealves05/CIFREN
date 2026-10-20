// Verificação em duas etapas por aplicativo autenticador (TOTP, RFC 6238: SHA-1, 30 s, 6 dígitos).
import crypto from 'node:crypto';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function newSecret() {
  const bytes = crypto.randomBytes(20);
  let bits = ''; let out = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i + 5 <= bits.length; i += 5) out += ALPHA[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function decode(b32) {
  let bits = ''; const out = [];
  for (const ch of String(b32).replace(/[=\s]/g, '').toUpperCase()) { const v = ALPHA.indexOf(ch); if (v >= 0) bits += v.toString(2).padStart(5, '0'); }
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}

export function totp(secret, t = Date.now()) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = crypto.createHmac('sha1', decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** Aceita o código do intervalo atual e de um intervalo antes/depois (relógio do celular adiantado/atrasado). */
export function verifyTotp(secret, code, t = Date.now()) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6) return false;
  return [-1, 0, 1].some((w) => crypto.timingSafeEqual(Buffer.from(totp(secret, t + w * 30000)), Buffer.from(c)));
}

export const otpauthUrl = (secret, email) =>
  `otpauth://totp/${encodeURIComponent(`CIFREN:${email}`)}?secret=${secret}&issuer=CIFREN&algorithm=SHA1&digits=6&period=30`;

/** 10 códigos de recuperação legíveis (xxxx-xxxx). */
export function recoveryCodes(n = 10) {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: n }, () => {
    const b = crypto.randomBytes(8);
    const s = [...b].map((x) => abc[x % abc.length]).join('');
    return `${s.slice(0, 4)}-${s.slice(4, 8)}`;
  });
}
