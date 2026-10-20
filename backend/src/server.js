import { createApp, VERSION } from './app.js';
import { migrate } from './migrate.js';
import { ensureSecrets } from './secrets.js';
import { proxyKeyMissing } from './edgeProxy.js';

const port = Number(process.env.PORT || 3333);
try {
  await migrate();
  await ensureSecrets();
} catch (e) {
  console.error('[boot] falha ao preparar o banco:', e.message);
  process.exit(1);
}
if (proxyKeyMissing()) console.warn('[boot] EDGE_PROXY_KEY ausente em produção: o IP do cliente não é confiável para os limites de tentativas.');
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0');
createApp().listen(port, host, () => console.log(`CIFREN API ${VERSION} em ${host}:${port}`));
