// Servidor local para gravação e conferência: serve o build (frontend/dist, com fallback SPA) e encaminha /api para a API de gravação (3363).
// O gravador faz o navegador abrir https://cifren.lorler.com.br e entrega cada pedido a este servidor (nada sai da máquina).
// Uso: node proxy.mjs   (porta REC_PROXY_PORT, padrão 3364; encerre pelo PID que você iniciou)
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIST = fileURLToPath(new URL('../../dist', import.meta.url));
const PUB = fileURLToPath(new URL('../../public', import.meta.url));
const PORT = Number(process.env.REC_PROXY_PORT || 3364);
const API_PORT = Number(process.env.REC_API_PORT || 3363);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.vtt': 'text/vtt; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const isFile = (x) => { try { return fs.statSync(x).isFile(); } catch { return false; } };

http.createServer((req, res) => {
  if (req.url.startsWith('/api')) {
    const p = http.request({ host: '127.0.0.1', port: API_PORT, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${API_PORT}` } }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    p.on('error', () => { res.statusCode = 502; res.end(); });
    req.pipe(p);
    return;
  }
  const u = decodeURIComponent(req.url.split('?')[0]);
  // os vídeos novos (frontend/public/treinamento) valem mesmo antes de um novo build
  const cands = [path.join(DIST, u), path.join(PUB, u)].filter((x) => (x.startsWith(DIST) || x.startsWith(PUB)) && isFile(x));
  const f = cands.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || path.join(DIST, 'index.html');
  const size = fs.statSync(f).size;
  const type = TYPES[path.extname(f)] || 'application/octet-stream';
  const range = req.headers.range;
  if (range) {
    const [a, b] = range.replace('bytes=', '').split('-');
    const start = Number(a) || 0;
    const end = b ? Number(b) : size - 1;
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
    fs.createReadStream(f, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, '127.0.0.1');
