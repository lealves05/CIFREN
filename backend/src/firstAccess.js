// Regra do ecossistema LORLER (ORBI, ANIBI, TORVEN, RUSTEN, APOLVEN, CIFREN): todo acesso novo recebe por e-mail
// uma senha provisória e precisa criar a própria senha no primeiro login (users.must_change_password).
// O e-mail sai pela central (remetente da plataforma), com o modelo fixo "user-temp-password".
import crypto from 'node:crypto';
import { hubCall } from './platform.js';
import { HttpError, passwordProblem } from './util.js';

/** Senha provisória legível (sem 0/O, 1/l/I), sempre com letras e números e aceita pela política de senha. */
export function tempPassword() {
  const L = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', D = '23456789', A = L + D;
  const pick = (s) => s[crypto.randomInt(s.length)];
  for (;;) {
    const c = [pick(L), pick(L), pick(D), pick(D), ...Array.from({ length: 8 }, () => pick(A))];
    for (let i = c.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [c[i], c[j]] = [c[j], c[i]]; }
    const p = c.join('');
    if (!passwordProblem(p)) return p;
  }
}

/**
 * Envia a senha provisória por e-mail. Lança HttpError se não sair (quem chama decide: mostrar a senha uma vez ou avisar).
 * @param {{ name: string, email: string }} user @param {string} company @param {{ password: string, reset?: boolean }} o
 */
export async function sendTempPassword(user, company, o) {
  try {
    await hubCall('POST', '/mail/account', { kind: 'user-temp-password', to: user.email, name: user.name, company: company || 'CIFREN',
      password: o.password, path: '/entrar', reset: !!o.reset }, 20000);
  } catch (e) {
    if (e?.code === 'PLATFORM_NOT_CONFIGURED') throw new HttpError(503, 'O envio de e-mail ainda não está ativo nesta instalação.');
    throw new HttpError(e?.status === 429 ? 429 : 502, e?.status === 429 ? 'Limite de envio de e-mails atingido. Aguarde e tente de novo.' : 'Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.');
  }
}
