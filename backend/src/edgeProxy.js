// IP real do cliente quando a API está atrás do site na Cloudflare (BFF em /api).
// O site envia o IP (CF-Connecting-IP) junto com a chave EDGE_PROXY_KEY, que só o site e a API conhecem.
// Sem a chave correta o cabeçalho é ignorado: o navegador não consegue forjar o IP usado nos limites de tentativas.
import crypto from 'node:crypto';

const env = () => (globalThis.process?.env ?? {});

const sameKey = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());

/** Produção = NODE_ENV=production ou rodando como Edge Function (Deno). */
export const isProduction = () => env().NODE_ENV === 'production' || typeof globalThis.Deno !== 'undefined';

/** Em produção sem EDGE_PROXY_KEY o IP do cliente não é confiável (todos os limites de tentativas caem no IP do Worker): precisa aparecer no log e no /api/health. */
export const proxyKeyMissing = () => isProduction() && !env().EDGE_PROXY_KEY;

/**
 * Entrada direta na API (sem passar pelo site no lorler-edge).
 * Com EDGE_REQUIRE_PROXY_KEY=1 e EDGE_PROXY_KEY definida, só atende quem manda x-edge-proxy-key correta (comparação em tempo constante);
 * as demais recebem 404 (a função não confirma que existe). Sem a flag o comportamento é o de antes (não derruba produção
 * enquanto o Worker ainda não tiver a chave). Devolve true se a requisição deve ser RECUSADA.
 */
export function edgeDirectBlocked(req) {
  const e = env();
  if (e.EDGE_REQUIRE_PROXY_KEY !== '1' || !e.EDGE_PROXY_KEY) return false;
  const sent = req.headers['x-edge-proxy-key'];
  return !(typeof sent === 'string' && sent && sameKey(sent, e.EDGE_PROXY_KEY));
}

export function edgeProxyIp(req, _res, next) {
  const key = env().EDGE_PROXY_KEY;
  const sent = req.headers['x-edge-proxy-key'];
  const ip = String(req.headers['x-edge-client-ip'] || '').trim();
  delete req.headers['x-edge-proxy-key'];
  if (key && typeof sent === 'string' && ip && /^[0-9a-fA-F:.]{3,64}$/.test(ip)) {
    if (sameKey(sent, key)) Object.defineProperty(req, 'ip', { value: ip, configurable: true });
  }
  next();
}
