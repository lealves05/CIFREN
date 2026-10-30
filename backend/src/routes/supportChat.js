// Central de Atendimento LORLER (contrato v1.4) — chat do cliente do CIFREN (Suporte › Falar com o assistente).
// O CIFREN só repassa o chat do usuário logado para a central (chamadas assinadas do platform.js); a conversa fica lá.
// Quem é o usuário e o que ele pode vêm SEMPRE da sessão (nunca do corpo): can_approve = pode alterar as configurações
// da organização; is_owner = perfil Dono ou Administrador. A central decide pelo Perfil do assistente quem autoriza alterações.
// O CIFREN não publica parâmetros por organização: ali o assistente só tira dúvidas.
// Nada de log com o texto das mensagens.
import { Router } from 'express';
import { z } from 'zod';
import { parse, HttpError, isUuid } from '../util.js';
import { can } from '../auth.js';
import { hubCall, platformConfig } from '../platform.js';
import { limitByKey } from '../security.js';

export const supportChat = Router();

const OWNER_ROLES = ['dono', 'administrador'];
const NOT_LINKED = 'A central de atendimento ainda não está ligada neste sistema.';
const SEND_TIMEOUT_MS = 90000; // a IA responde antes de a central devolver (até ~60 s)

/** Quem fala, montado da sessão. `ref` = id do usuário no CIFREN. */
export const chatUser = (req) => ({
  ref: req.user.id, name: req.user.name || 'Usuário',
  can_approve: can(req, 'configuracoes.gerenciar'), is_owner: OWNER_ROLES.includes(req.role?.key),
});

/** Chamada à central para a organização da sessão (remote_id = id da organização, o mesmo de tenantPayload). */
async function central(req, method, sub, payload, timeoutMs) {
  if (!(await platformConfig())) throw new HttpError(503, NOT_LINKED);
  try {
    return await hubCall(method, `/support/tenants/${encodeURIComponent(req.orgId)}/chat${sub}`, payload, timeoutMs);
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    if (e.extra?.code === 'PLATFORM_UNAVAILABLE') throw new HttpError(503, 'A central de atendimento não respondeu. Tente novamente em instantes.');
    if (e.extra?.code === 'PLATFORM_NOT_CONFIGURED') throw new HttpError(503, NOT_LINKED);
    // repassa o status e a mensagem da central ({ error }); 401 já vira 502 no hubCall (não derruba a sessão do usuário)
    throw new HttpError(e.status === 402 ? 502 : e.status, e.message);
  }
}

supportChat.get('/', async (req, res) => {
  const u = chatUser(req);
  const p = new URLSearchParams();
  const after = typeof req.query.after === 'string' ? req.query.after : '';
  if (after && after.length <= 40 && !Number.isNaN(Date.parse(after))) p.set('after', after);
  if (u.can_approve) p.set('can_approve', '1');
  if (u.is_owner) p.set('owner', '1');
  const qs = p.toString();
  res.json(await central(req, 'GET', qs ? `?${qs}` : '', undefined, 15000));
});

supportChat.post('/messages', async (req, res) => {
  const d = parse(z.object({ body: z.string().trim().min(1).max(6000) }), req.body);
  await limitByKey('support-chat', `${req.orgId}:${req.user.id}`, 30, 10 * 60, res, 'Muitas mensagens seguidas. Aguarde alguns minutos.');
  res.json(await central(req, 'POST', '/messages', { user: chatUser(req), body: d.body }, SEND_TIMEOUT_MS));
});

supportChat.post('/actions/:id/:op', async (req, res) => {
  if (!['approve', 'reject', 'undo'].includes(req.params.op)) throw new HttpError(404, 'Rota não encontrada.');
  if (!isUuid(req.params.id)) throw new HttpError(400, 'Proposta inválida.');
  res.json(await central(req, 'POST', `/actions/${req.params.id.toLowerCase()}/${req.params.op}`, { user: chatUser(req) }, 30000));
});

supportChat.post('/close', async (req, res) => {
  const d = parse(z.object({ rating: z.number().int().min(1).max(5).nullable().optional() }), req.body || {});
  res.json(await central(req, 'POST', '/close', { user: chatUser(req), rating: d.rating ?? null }, 15000));
});
