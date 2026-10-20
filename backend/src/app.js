// Montagem da API do CIFREN (Express 5: erros de rotas async chegam ao tratador sozinhos).
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { HttpError } from './util.js';
import { edgeProxyIp, edgeDirectBlocked, proxyKeyMissing } from './edgeProxy.js';
import { requireAuth, requireCsrfHeader } from './auth.js';
import { platformGate } from './platform.js';
import authRoutes from './routes/auth.js';
import { companies, users, roles, auditRoutes } from './routes/admin.js';
import { counterparties, categoriesRouter, costCenters, accounts } from './routes/cadastros.js';
import { titles, settlements, dashboard } from './routes/titles.js';
import { platformApi, billing } from './routes/platform.js';

export const VERSION = process.env.CIFREN_VERSION || '2026.10-a';

/** Enquanto a senha provisória não for trocada, só as rotas de conta funcionam. */
function passwordChangeGate(req, _res, next) {
  if (req.user?.must_change_password) throw new HttpError(403, 'Troque a senha provisória para continuar.', { code: 'PASSWORD_CHANGE_REQUIRED' });
  next();
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  // na VPS a API só atende o lorler-edge (EDGE_REQUIRE_PROXY_KEY=1); quem chama direto recebe 404
  app.use((req, res, next) => (edgeDirectBlocked(req) ? res.status(404).end() : next()));
  app.use(edgeProxyIp);
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(compression());
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store'); res.set('Pragma', 'no-cache');
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { if (req.originalUrl?.startsWith('/api/platform/')) req.rawBody = buf; } }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, version: VERSION, ...(proxyKeyMissing() ? { warning: 'EDGE_PROXY_KEY ausente' } : {}) }));
  app.use('/api/platform/v1', platformApi);

  app.use('/api', requireCsrfHeader);
  app.use('/api/auth', authRoutes);

  const priv = express.Router();
  priv.use(requireAuth, passwordChangeGate, platformGate);
  priv.use('/billing', billing);
  priv.use('/companies', companies);
  priv.use('/users', users);
  priv.use('/roles', roles);
  priv.use('/audit', auditRoutes);
  priv.use('/counterparties', counterparties);
  priv.use('/categories', categoriesRouter);
  priv.use('/cost-centers', costCenters);
  priv.use('/accounts', accounts);
  priv.use('/titles', titles);
  priv.use('/settlements', settlements);
  priv.use('/dashboard', dashboard);
  app.use('/api', priv);

  app.use((_req, _res, next) => next(new HttpError(404, 'Rota não encontrada.')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    let status = err.status || err.statusCode || 500;
    let message = err.message || 'Erro interno';
    if (err.code === '23505') { status = 409; message = 'Registro duplicado.'; }
    else if (err.code === '23503') { status = 409; message = 'Registro vinculado a outros dados.'; }
    else if (err.code === '22P02' || err.code === '22007' || err.code === '22008') { status = 400; message = 'Dado inválido.'; }
    else if (err.code === '42501') { status = 403; message = 'Acesso negado.'; }
    else if (err.type === 'entity.too.large') { status = 413; message = 'Requisição grande demais.'; }
    else if (err.type === 'entity.parse.failed') { status = 400; message = 'Requisição inválida.'; }
    const expected = err instanceof HttpError || (status < 500 && (err.code || err.type));
    if (status >= 500 && !(err instanceof HttpError)) console.error(err);
    res.status(status).json({ error: status >= 500 && !expected ? 'Erro interno no servidor.' : message, ...(err.extra || {}) });
  });
  return app;
}
