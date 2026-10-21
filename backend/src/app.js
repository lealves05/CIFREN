// Montagem da API do CIFREN (Express 5: erros de rotas async chegam ao tratador sozinhos).
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { HttpError } from './util.js';
import { edgeProxyIp, edgeDirectBlocked, proxyKeyMissing } from './edgeProxy.js';
import { requireAuth, requireCsrfHeader, mfaGate } from './auth.js';
import { platformGate } from './platform.js';
import authRoutes from './routes/auth.js';
import { companies, users, roles, auditRoutes } from './routes/admin.js';
import { counterparties, categoriesRouter, costCenters, accounts } from './routes/cadastros.js';
import { titles, settlements, dashboard } from './routes/titles.js';
import { platformApi, billing } from './routes/platform.js';
import { approvals, approvalRules } from './routes/approvals.js';
import { reconciliation } from './routes/reconciliation.js';
import { recurring } from './routes/recurring.js';
import { reports, exportRoutes } from './routes/reports.js';
import { purchases, expenses } from './routes/purchases.js';
import { documents } from './routes/documents.js';
import { ai, insights, notifications, security } from './routes/settings.js';
import { integrations, lorlerApi } from './routes/integrations.js';

export const VERSION = process.env.CIFREN_VERSION || '2026.10-b';

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
  // arquivos (documentos até 10 MB, extratos até 5 MB) chegam em base64: limite maior só nessas rotas
  const bigJson = express.json({ limit: '15mb' });
  const json = express.json({ limit: '1mb', verify: (req, _res, buf) => { if (req.originalUrl?.startsWith('/api/platform/')) req.rawBody = buf; } });
  app.use((req, res, next) => (req.method === 'POST' && /^\/api\/(documents|reconciliation\/imports)\/?$/.test(req.path) ? bigJson : json)(req, res, next));

  app.get('/api/health', (_req, res) => res.json({ ok: true, version: VERSION, ...(proxyKeyMissing() ? { warning: 'EDGE_PROXY_KEY ausente' } : {}) }));
  app.use('/api/platform/v1', platformApi);
  // sistemas LORLER (chave Bearer, sem cookie): fora da proteção de navegador e da sessão
  app.use('/api/integrations/lorler/v1', lorlerApi);

  app.use('/api', requireCsrfHeader);
  app.use('/api/auth', authRoutes);

  const priv = express.Router();
  priv.use(requireAuth, passwordChangeGate, mfaGate, platformGate);
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
  priv.use('/approvals', approvals);
  priv.use('/approval-rules', approvalRules);
  priv.use('/reconciliation', reconciliation);
  priv.use('/recurring', recurring);
  priv.use('/reports', reports);
  priv.use('/export', exportRoutes);
  priv.use('/purchases', purchases);
  priv.use('/expenses', expenses);
  priv.use('/documents', documents);
  priv.use('/ai', ai);
  priv.use('/insights', insights);
  priv.use('/notifications', notifications);
  priv.use('/security', security);
  priv.use('/integrations', integrations);
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
