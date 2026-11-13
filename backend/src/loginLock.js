// @ts-check
/**
 * Bloqueio de login por tentativas de senha (anti-força-bruta), padrão do ecossistema LORLER.
 * Trava a conta após 5 erros, libera sozinho após uma janela (anti-negação), manda e-mail ao titular
 * (dono da organização, pela central) e alerta o Master (motivo, data/hora e IP das tentativas).
 * A tabela `users` do CIFREN não tem RLS (acesso pré-sessão), então tudo aqui usa `q` normalmente.
 */
import crypto from 'node:crypto';
import { q, one } from './db.js';
import { hubCall } from './platform.js';

const BRAND = 'CIFREN';
export const MAX_FAILS = 5;
export const COOLDOWN_MIN = 30;
export const UNLOCK_TOKEN_MIN = 60;
export const LOCK_MESSAGE =
  'Acesso bloqueado por segurança após várias tentativas. O titular da conta recebeu por e-mail as instruções para liberar o acesso.';

const warn = (m, e) => { try { console.warn(`[loginLock] ${m}:`, e?.message || e); } catch { /* noop */ } };
const sha = (/** @type {string} */ t) => crypto.createHash('sha256').update(t).digest('hex');
const esc = (/** @type {any} */ t) => String(t ?? '').replace(/[&<>"']/g, (c) => /** @type {Record<string,string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** @param {{ locked_at?: any, lock_auto_until?: any } | null | undefined} user */
export function lockState(user) {
  if (!user || !user.locked_at) return { locked: false, expired: false };
  const until = user.lock_auto_until ? new Date(user.lock_auto_until).getTime() : 0;
  if (until && until <= Date.now()) return { locked: false, expired: true };
  return { locked: true, expired: false };
}

/** Zera o contador e remove o bloqueio (sucesso, troca de senha ou liberação). */
export async function clearLock(userId) {
  await q("update users set failed_logins=0, locked_at=null, lock_auto_until=null, login_fail_log='[]'::jsonb where id=$1", [userId]);
}

async function sendUnlockEmail(contact, orgName, attempts) {
  if (!contact?.email) return;
  const token = crypto.randomBytes(32).toString('hex');
  await q('update user_unlock_tokens set used_at=now() where user_id=$1 and used_at is null', [contact.userId]);
  await q(`insert into user_unlock_tokens (user_id, token_hash, expires_at, ip) values ($1,$2, now() + make_interval(mins => $3), $4)`,
    [contact.userId, sha(token), UNLOCK_TOKEN_MIN, String(attempts[0]?.ip || '').slice(0, 64)]);
  try {
    await hubCall('POST', '/mail/login-locked', {
      to: contact.email, name: contact.name, company: orgName,
      path: `/api/auth/unlock?token=${token}`, minutes: UNLOCK_TOKEN_MIN, cooldown: COOLDOWN_MIN,
      attempts: attempts.map((a) => ({ at: a.at, ip: a.ip })),
    }, 20000);
  } catch (e) { warn('unlock_email_failed', e); }
}

/**
 * Conta a senha errada; ao atingir o limite, trava a conta, avisa o titular e manda o alerta ao Master.
 * @param {{ id: string, name?: string, email: string }} user @param {{ ip?: string }} ctx
 */
export async function onLoginFailure(user, ctx = {}) {
  const item = JSON.stringify([{ at: new Date().toISOString(), ip: String(ctx.ip || 'desconhecido').slice(0, 64) }]);
  const row = await one(
    `update users set failed_logins = failed_logins + 1,
        login_fail_log = (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements($2::jsonb || coalesce(login_fail_log,'[]'::jsonb)) e limit 8) s)
      where id=$1 returning failed_logins, login_fail_log`, [user.id, item]);
  const fails = row?.failed_logins || 0;
  if (fails < MAX_FAILS) return { locked: false };
  await q(`update users set locked_at = coalesce(locked_at, now()), lock_auto_until = coalesce(lock_auto_until, now() + make_interval(mins => $2)) where id=$1`,
    [user.id, COOLDOWN_MIN]);
  const attempts = Array.isArray(row?.login_fail_log) ? row.login_fail_log : [];
  const info = await one(`select u.email as self_email, u.name as self_name, o.name as org_name, ow.email as owner_email, ow.name as owner_name
      from users u
      left join lateral (select org_id from memberships where user_id=u.id and active order by last_login_at desc nulls last, created_at limit 1) pm on true
      left join organizations o on o.id = pm.org_id
      left join lateral (select ux.email, ux.name from memberships m join roles r on r.id=m.role_id and r.key='dono' join users ux on ux.id=m.user_id
                          where m.org_id = pm.org_id and m.active order by m.created_at limit 1) ow on true
      where u.id=$1`, [user.id]).catch(() => null);
  const contact = { userId: user.id, email: info?.owner_email || info?.self_email || user.email, name: info?.owner_name || info?.self_name || user.name };
  const reason = `Conta bloqueada após ${MAX_FAILS} erros de senha seguidos.`;
  try { await hubCall('POST', '/security-event', { kind: 'login_locked', email: info?.self_email || user.email, company: info?.org_name, reason, attempts: attempts.map((a) => ({ at: a.at, ip: a.ip })) }, 10000); }
  catch (e) { warn('security_event_failed', e); }
  await sendUnlockEmail(contact, info?.org_name, attempts);
  return { locked: true };
}

/** Consome um token de desbloqueio (uso único, dentro da validade) e libera a conta. */
export async function consumeUnlockToken(token, ip) {
  if (!token || typeof token !== 'string' || token.length > 200) return null;
  const row = await one(`update user_unlock_tokens set used_at=now(), ip=coalesce($2, ip) where token_hash=$1 and used_at is null and expires_at > now() returning user_id`,
    [sha(token), String(ip || '').slice(0, 64)]);
  if (!row) return null;
  await clearLock(row.user_id);
  return row.user_id;
}

// ---------------- páginas HTML servidas pelo backend (sem JS inline; só formulário) ----------------
const shell = (title, body) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f4f4f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
<div style="max-width:440px;margin:8vh auto;padding:0 16px">
<div style="background:#fff;border:1px solid #e4e4e7;border-radius:16px;padding:28px 24px;box-shadow:0 4px 24px rgba(0,0,0,.05)">
<div style="font-weight:800;font-size:20px;letter-spacing:.5px;margin-bottom:4px">${BRAND}</div>
${body}
</div></div></body></html>`;

export function unlockPage(token) {
  const t = esc(String(token || ''));
  return shell(`${BRAND} — liberar acesso`, `
<h1 style="font-size:18px;margin:8px 0 10px">Liberar seu acesso</h1>
<p style="color:#52525b;font-size:14px;line-height:1.5">Sua conta foi bloqueada por segurança após várias tentativas de senha. Clique no botão abaixo para liberar o acesso agora.</p>
<form method="post" action="/api/auth/unlock?token=${t}" style="margin-top:18px">
<button type="submit" style="width:100%;background:#111;color:#fff;border:0;padding:12px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer">Liberar meu acesso</button>
</form>
<p style="color:#a1a1aa;font-size:12px;margin-top:16px">Se você não reconhece esse bloqueio, alguém pode estar tentando entrar na sua conta — troque a senha depois de liberar.</p>`);
}

export function unlockResultPage(ok) {
  return shell(`${BRAND} — ${ok ? 'acesso liberado' : 'link inválido'}`, ok ? `
<h1 style="font-size:18px;margin:8px 0 10px;color:#15803d">Acesso liberado ✓</h1>
<p style="color:#52525b;font-size:14px;line-height:1.5">Pronto! Você já pode voltar ao ${BRAND} e entrar normalmente com seu e-mail e senha.</p>` : `
<h1 style="font-size:18px;margin:8px 0 10px;color:#b91c1c">Link inválido ou expirado</h1>
<p style="color:#52525b;font-size:14px;line-height:1.5">Este link de desbloqueio não vale mais (já foi usado ou passou de ${UNLOCK_TOKEN_MIN} minutos). O acesso também é liberado sozinho após ${COOLDOWN_MIN} minutos, ou peça ao suporte um novo link.</p>`);
}
