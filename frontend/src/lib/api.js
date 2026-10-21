/**
 * Cliente da API interna do CIFREN.
 * - Sessão por cookie HttpOnly (o site nunca lê o cookie): credentials 'same-origin'.
 * - Toda requisição que altera dados leva o cabeçalho X-CIFREN: 1 (proteção CSRF).
 * - Erros chegam como { error, code? }.
 */
export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || (status === 0
      ? 'Não foi possível falar com o servidor. Verifique sua internet e tente de novo.'
      : 'Algo deu errado. Tente de novo em instantes.'));
    this.status = status;
    this.code = data?.code;
    this.data = data;
  }
}

export const EVENTS = {
  unauthorized: 'cifren:unauthorized',
  blocked: 'cifren:blocked',
  mfaRequired: 'cifren:mfa-required',
  countsChanged: 'cifren:counts-changed',
};

/** Avisa o menu (contador de aprovações, sino) que algo mudou. */
export const notifyCountsChanged = () => { try { window.dispatchEvent(new CustomEvent(EVENTS.countsChanged)); } catch { /* sem window */ } };

async function request(method, path, body) {
  const write = method !== 'GET';
  const headers = { Accept: 'application/json' };
  if (write) headers['X-CIFREN'] = '1';
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, null);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new CustomEvent(EVENTS.unauthorized, { detail: { path } }));
    if (res.status === 402) window.dispatchEvent(new CustomEvent(EVENTS.blocked, { detail: data }));
    if (res.status === 403 && data?.code === 'MFA_SETUP_REQUIRED') window.dispatchEvent(new CustomEvent(EVENTS.mfaRequired, { detail: data }));
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  put: (p, b = {}) => request('PUT', p, b),
  del: (p) => request('DELETE', p),
};

/** Monta a query string ignorando valores vazios. */
export const qs = (obj) => {
  const s = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') s.set(k, v); });
  const str = s.toString();
  return str ? `?${str}` : '';
};

export const isFeatureDisabled = (err) => err?.status === 403 && err?.code === 'FEATURE_DISABLED';
export const isMfaRequired = (err) => err?.status === 403 && err?.code === 'MFA_SETUP_REQUIRED';
export const isAiNotConfigured = (err) => err?.code === 'AI_NOT_CONFIGURED';
export const isApprovalRequired = (err) => err?.code === 'APPROVAL_REQUIRED';
export const isDuplicate = (err) => err?.code === 'DUPLICATE';

/** Textos de reserva quando a API não manda mensagem para um código conhecido. */
const CODE_TEXT = {
  MFA_SETUP_REQUIRED: 'Sua organização exige a verificação em duas etapas. Ative em Minha conta para continuar.',
  AI_NOT_CONFIGURED: 'A inteligência artificial ainda não está ligada. Quem administra a conta ativa em Configurações › IA.',
  APPROVAL_REQUIRED: 'Esta conta precisa ser aprovada antes de ser paga.',
  DUPLICATE: 'Este documento já foi lançado antes. Confira as contas existentes para não pagar duas vezes.',
};

/** Mensagem amigável para mostrar ao usuário. */
export function errorMessage(err) {
  if (!err) return '';
  if (isFeatureDisabled(err)) return 'Este módulo não faz parte do seu plano atual.';
  if (err.code && CODE_TEXT[err.code] && !err.data?.error) return CODE_TEXT[err.code];
  if (err.status === 403 && !err.data?.error) return 'Você não tem permissão para fazer isso. Fale com o responsável pela conta.';
  return err.message || 'Algo deu errado. Tente de novo.';
}
