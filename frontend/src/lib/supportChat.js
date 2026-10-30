import { api } from './api';

/** Rotas do chat com o assistente da Central de Atendimento LORLER (o servidor do CIFREN repassa para a central). */
export const supportChat = {
  view: (after) => api.get(`/support-chat${after ? `?after=${encodeURIComponent(after)}` : ''}`),
  send: (body) => api.post('/support-chat/messages', { body }),
  approve: (id) => api.post(`/support-chat/actions/${id}/approve`),
  reject: (id) => api.post(`/support-chat/actions/${id}/reject`),
  undo: (id) => api.post(`/support-chat/actions/${id}/undo`),
  close: (rating) => api.post('/support-chat/close', { rating: rating || null }),
};

/** Nome do assistente para o botão "Falar com …" (vazio se a central não responder). */
export const assistantName = () => supportChat.view().then((d) => d?.assistant?.name || '').catch(() => '');
