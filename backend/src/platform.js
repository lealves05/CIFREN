/**
 * Ligação do CIFREN com a central da plataforma (Master LORLER) — contrato v1, o mesmo dos outros sistemas.
 * A central decide assinatura, teste grátis, bloqueio e módulos de cada organização; o CIFREN guarda a última situação
 * (organizations.platform_access) e aplica localmente. Central fora do ar: vale a última situação conhecida.
 * Assinatura: X-Platform-Product · X-Platform-Timestamp · X-Platform-Signature = hex(HMAC-SHA256(segredo, `${ts}\n${MÉTODO}\n${rota}\n${sha256(corpo)}`))
 * Configuração: PLATFORM_HUB_URL + PLATFORM_SECRET (+ PLATFORM_PRODUCT=cifren) ou _secrets. Sem configuração: modo independente.
 */
import crypto from 'node:crypto';
import { q, one } from './db.js';
import { HttpError } from './util.js';
import { hit } from './security.js';

const SKEW = 300;
const FRESH_MS = 5 * 60 * 1000;
const STALE_MAX_MS = 72 * 3600 * 1000;
let hubDownUntil = 0;

/** Módulos que a central liga/desliga por plano. `routes` = prefixos da API interna. */
export const FEATURES = {
  financeiro: { label: 'Contas a pagar e a receber, caixa e painel', routes: ['/titles', '/settlements', '/dashboard'] },
  conciliacao_bancaria: { label: 'Conciliação bancária (extratos OFX/CSV)', routes: ['/reconciliation'] },
  recorrencias: { label: 'Compromissos recorrentes e previsão (estimado × real)', routes: ['/recurring'] },
  cobranca: { label: 'Cobrança por boleto e Pix', routes: ['/charges'] },
  maquininha: { label: 'Maquininhas de cartão', routes: ['/terminals'] },
  documentos_ia: { label: 'Leitura de notas, fotos e boletos', routes: ['/documents'] },
  cofre_sieg: { label: 'Cofre SIEG (notas de fornecedores e envio ao contador)', routes: ['/sieg'] },
  fiscal: { label: 'Emissão de notas fiscais', routes: ['/invoices', '/fiscal'] },
  orcamento: { label: 'Orçamento (previsto × realizado)', routes: ['/budgets'] },
  relatorios: { label: 'Relatórios e exportação', routes: ['/reports', '/export'] },
  whatsapp: { label: 'Agente do WhatsApp', routes: ['/whatsapp'] },
  integracoes_lorler: { label: 'Integração com ORBI, TORVEN, RUSTEN e APOLVEN', routes: ['/integrations/lorler'] },
};
const BLOCKED_ALLOWED = ['/billing'];

let cfgCache = { at: 0, v: null };
export async function platformConfig() {
  if (Date.now() - cfgCache.at < 60000) return cfgCache.v;
  let hub = process.env.PLATFORM_HUB_URL || ''; let secret = process.env.PLATFORM_SECRET || ''; let product = process.env.PLATFORM_PRODUCT || '';
  if (!hub || !secret) {
    const { rows } = await q("select key, value from _secrets where key in ('platform_hub_url','platform_secret','platform_product')").catch(() => ({ rows: [] }));
    const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    hub ||= m.platform_hub_url || ''; secret ||= m.platform_secret || ''; product ||= m.platform_product || '';
  }
  const v = hub && secret ? { hub: hub.replace(/\/+$/, ''), secret, product: product || 'cifren' } : null;
  cfgCache = { at: Date.now(), v };
  return v;
}
export const clearPlatformConfig = () => { cfgCache.at = 0; };

const sha = (s) => crypto.createHash('sha256').update(s || '').digest('hex');
const sign = (secret, ts, method, route, body) => crypto.createHmac('sha256', secret).update(`${ts}\n${method.toUpperCase()}\n${route}\n${sha(body)}`).digest('hex');

export async function hubCall(method, route, payload, timeoutMs = 10000) {
  const cfg = await platformConfig();
  if (!cfg) throw new HttpError(503, 'A assinatura ainda não está configurada nesta instalação.', { code: 'PLATFORM_NOT_CONFIGURED' });
  const body = payload === undefined ? '' : JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  let res;
  try {
    res = await fetch(`${cfg.hub}/api/hub/v1${route}`, {
      method, signal: AbortSignal.timeout(timeoutMs), body: body || undefined,
      headers: { 'Content-Type': 'application/json', 'X-Platform-Product': cfg.product, 'X-Platform-Timestamp': String(ts), 'X-Platform-Signature': sign(cfg.secret, ts, method, route, body) },
    });
  } catch { throw new HttpError(503, 'A central de assinaturas não respondeu. Tente novamente em instantes.', { code: 'PLATFORM_UNAVAILABLE' }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status === 401 ? 502 : res.status, data?.error || `Central: erro ${res.status}`, { code: data?.code });
  return data;
}

/** Dados da organização enviados à central (sem dados financeiros dos clientes, sem senhas). */
export async function tenantPayload(orgId) {
  const o = await one(`select o.id, o.name, o.created_at, o.is_demo,
      (select u.name from memberships m join roles r on r.id=m.role_id join users u on u.id=m.user_id where m.org_id=o.id and r.key='dono' order by m.created_at limit 1) as owner_name,
      (select u.email from memberships m join roles r on r.id=m.role_id join users u on u.id=m.user_id where m.org_id=o.id and r.key='dono' order by m.created_at limit 1) as owner_email,
      (select max(m.last_login_at) from memberships m where m.org_id=o.id) as last_access_at,
      (select count(*)::int from memberships m where m.org_id=o.id and m.active) as users
     from organizations o where o.id=$1`, [orgId]);
  if (!o) return null;
  return { remote_id: o.id, name: o.name, email: o.owner_email, owner_name: o.owner_name, created_at: o.created_at,
    last_access_at: o.last_access_at, is_demo: o.is_demo, metrics: { users: o.users } };
}

export async function storeAccess(orgId, access) {
  await q('update organizations set platform_access=$2, platform_access_at=now() where id=$1', [orgId, JSON.stringify(access)]);
}

export async function registerOrganization(orgId) {
  if (!(await platformConfig())) return null;
  const t = await tenantPayload(orgId);
  if (!t || t.is_demo) return null;
  const { is_demo: _d, ...payload } = t;
  const out = await hubCall('POST', '/tenants', payload);
  await q('update organizations set platform_registered_at=coalesce(platform_registered_at, now()) where id=$1', [orgId]);
  if (out?.access) await storeAccess(orgId, out.access);
  return out?.access || null;
}

export async function accessFor(orgId, { fresh = false, row = null } = {}) {
  if (!(await platformConfig())) return null;
  const o = row || await one('select is_demo, platform_access, platform_access_at from organizations where id=$1', [orgId]);
  if (!o || o.is_demo) return null;
  const age = o.platform_access_at ? Date.now() - new Date(o.platform_access_at).getTime() : Infinity;
  if (!fresh && o.platform_access && age < FRESH_MS) return o.platform_access;
  if (!fresh && Date.now() < hubDownUntil) return o.platform_access || null;
  try {
    const out = await hubCall('GET', `/tenants/${encodeURIComponent(orgId)}/access`, undefined, 4000);
    await storeAccess(orgId, out.access);
    o.platform_access = out.access; o.platform_access_at = new Date();
    return out.access;
  } catch (e) {
    if (e.status === 404) { try { return await registerOrganization(orgId); } catch { /* segue */ } } else hubDownUntil = Date.now() + 60000;
    return o.platform_access || null;
  }
}

/** standalone (sem cobrança central) ou saas_required. Padrão: standalone enquanto a central não estiver configurada. */
export async function platformMode() {
  const m = process.env.PLATFORM_MODE || (await one("select value from _secrets where key='platform_mode'").catch(() => null))?.value || '';
  if (['standalone', 'saas_required'].includes(m)) return m;
  return (await platformConfig()) ? 'saas_required' : 'standalone';
}

/** Rota cujo módulo ('' = núcleo) é o da regra mais específica. */
export function moduleForRoute(path) {
  let best = ''; let len = -1;
  for (const [k, f] of Object.entries(FEATURES)) for (const p of f.routes) if ((path === p || path.startsWith(`${p}/`)) && p.length > len) { best = k; len = p.length; }
  return best;
}

export async function orgAccessCheck(orgId, rawPath) {
  const mode = await platformMode();
  const o = await one('select is_demo, platform_access, platform_access_at from organizations where id=$1', [orgId]);
  const access = await accessFor(orgId, { row: o });
  if (!access) {
    if (mode === 'standalone' || o?.is_demo) return null;
    throw new HttpError(503, 'Não foi possível confirmar a situação da assinatura agora. Tente de novo em alguns minutos.', { code: 'PLATFORM_UNAVAILABLE' });
  }
  if (mode === 'saas_required') {
    const age = o?.platform_access_at ? Date.now() - new Date(o.platform_access_at).getTime() : Infinity;
    if (age > STALE_MAX_MS && !access.blocked) throw new HttpError(503, 'Não foi possível confirmar a situação da assinatura agora.', { code: 'PLATFORM_UNAVAILABLE' });
  }
  const path = String(rawPath || '/').toLowerCase();
  if (access.blocked && !BLOCKED_ALLOWED.some((p) => path === p || path.startsWith(`${p}/`))) {
    throw new HttpError(402, 'O acesso está temporariamente suspenso devido à situação da assinatura. Seus dados permanecem preservados.', { code: 'TENANT_BLOCKED', status: access.status });
  }
  const key = moduleForRoute(path);
  if (key && access.features && access.features[key] === false) {
    throw new HttpError(403, `O módulo "${FEATURES[key].label}" não está disponível no seu plano.`, { code: 'FEATURE_DISABLED', feature: key });
  }
  return access;
}

export async function platformGate(req, _res, next) {
  req.access = await orgAccessCheck(req.orgId, req.path);
  next();
}

/** Módulos efetivos da organização (tela). Sem central: todos ligados. */
export function modulesFrom(access) {
  return Object.fromEntries(Object.keys(FEATURES).map((k) => [k, !(access?.features && access.features[k] === false)]));
}

// ---------------- central → CIFREN ----------------
export async function verifyHubRequest(req, _res, next) {
  const cfg = await platformConfig();
  const deny = () => new HttpError(401, 'Chamada da central não autenticada.');
  if (!cfg) throw new HttpError(503, 'Ligação com a central não configurada.');
  const ts = Number(req.headers['x-platform-timestamp']);
  const sig = String(req.headers['x-platform-signature'] || '');
  if (String(req.headers['x-platform-product'] || '') !== cfg.product || !Number.isFinite(ts) || !/^[0-9a-f]{64}$/.test(sig)) throw deny();
  if (Math.abs(Date.now() / 1000 - ts) > SKEW) throw deny();
  const body = req.rawBody ? req.rawBody.toString('utf8') : '';
  const want = sign(cfg.secret, ts, req.method, req.originalUrl.replace(/^\/api\/platform\/v1/, ''), body);
  if (!crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) throw deny();
  if ((await hit(`hub-sig:${sig}`, 1, SKEW * 2)).blocked) throw deny();
  next();
}
