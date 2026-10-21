// Gravador das vídeo-aulas do CIFREN (mesmo padrão didático do TORVEN, ORBI, RUSTEN e APOLVEN).
// Cada aula: cartão de abertura (título, para que serve e "Nesta aula você vai aprender") → passos (ação na tela + falas) → cartão final de resumo.
// Cada fala tem áudio próprio (Kokoro pf_dora, velocidade 0,92), aparece como legenda grande na tela e entra no .vtt com o mesmo instante.
// Durante os passos: selo "Passo X de N · assunto" (passos com `tag`), destaque e cursor animado, cartões de slide (`h.card(html)`).
// Opções da aula: host (a tela abre no endereço de produção, atendida pelo servidor local; padrão cifren.lorler.com.br; null = endereço local),
// setup(api,h) / teardown(api,h,state), start (rota inicial).
// Cada aula cria uma organização NOVA pelo cadastro público (POST /api/auth/signup), só com dados fictícios, no banco de gravação
// (cifren_rec, que pode ser apagado inteiro depois). Nada sai da máquina: IA e WhatsApp respondem pelos serviços falsos (fake-externos.mjs).
// Uso:
//   node record.mjs texts [n...]         → out/texts.json (falas para o TTS)
//   node record.mjs rec [n...] [--dry]   → out/raw/<file>.webm + out/raw/<file>.json (linha do tempo); --dry: ensaio sem vídeo, com capturas em out/dry
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import pg from 'pg';
import { LESSONS, MODULES } from './lessons.mjs';

const HOST_DEFAULT = 'cifren.lorler.com.br';
const API = process.env.REC_API || 'http://127.0.0.1:3363';
const DB = process.env.REC_DB || 'postgres://cifren_app:cifren_app@localhost:5432/cifren_rec';
const FAKES = process.env.REC_FAKES || 'http://127.0.0.1:4521';
// o navegador pede https://<host>/…; o gravador entrega o conteúdo ao servidor local de gravação (proxy.mjs), sem sair da máquina
const FWD = process.env.REC_FWD || 'http://127.0.0.1:3364';
const CHROME = process.env.REC_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
// a organização de gravação tem e-mail e senha próprios (conta de verdade, com dados de exemplo)
export const DEMO_PASSWORD = 'Treinamento-2026!';
const OUT = path.resolve('out');
const [mode, ...rest] = process.argv.slice(2);
const DRY = rest.includes('--dry');
const only = rest.filter((x) => /^\d+$/.test(x)).map(Number);
fs.mkdirSync(path.join(OUT, 'raw'), { recursive: true });

const idOf = (n, i, j) => `${String(n).padStart(2, '0')}-${i}-${j}`;
const chunks = (say) => (Array.isArray(say) ? say : say ? [say] : []);
const SPEED = 0.92; // voz um pouco mais lenta, para quem nunca usou o sistema
const introText = (l) => l.intro || `Aula ${l.n}: ${l.title}. Nesta aula você vai aprender: ${l.learn.join('; ')}.`;
const outroText = (l) => l.outro || `Recapitulando: ${l.learn.join('; ')}. Se precisar, assista de novo quando quiser. Até a próxima aula!`;
const item = (id, text) => ({ id, text, speed: SPEED });

if (mode === 'texts') {
  const items = [];
  for (const l of LESSONS.filter((x) => !only.length || only.includes(x.n))) {
    items.push(item(idOf(l.n, 'i', 0), introText(l)));
    l.steps.forEach((s, i) => chunks(s.say).forEach((t, j) => items.push(item(idOf(l.n, i, j), t))));
    items.push(item(idOf(l.n, 'o', 0), outroText(l)));
  }
  fs.writeFileSync(path.join(OUT, 'texts.json'), JSON.stringify(items, null, 1));
  console.log(items.length, 'falas');
  process.exit(0);
}

const durs = DRY ? {} : JSON.parse(fs.readFileSync(path.join(OUT, 'tts', 'durations.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Executa SQL no banco de gravação (apoio de quem prepara ou limpa dados fictícios). */
async function sql(text, params = []) {
  const db = new pg.Client(DB);
  await db.connect();
  try { return (await db.query(text, params)).rows; } finally { await db.end(); }
}

/** Cria a organização de gravação pelo cadastro público e devolve o cookie da sessão (a API usa cookie + cabeçalho x-cifren). */
async function newCompany(l) {
  await sql('delete from rate_limits').catch(() => {}); // o cadastro e o login têm limite por IP: cada aula começa limpa
  const email = `aula${Date.now()}@treinamento.cifren.app`;
  const r = await fetch(`${API}/api/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cifren': '1' },
    body: JSON.stringify({ name: 'Marina Souza', email, password: DEMO_PASSWORD, company_name: l.company || 'Comércio Exemplo Ltda' }) });
  const cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  if (r.status !== 201 || !cookie) throw new Error(`cadastro: ${r.status} ${await r.text()}`);
  const me = await (await fetch(`${API}/api/auth/me`, { headers: { cookie } })).json();
  return { cookie, email, orgId: me.org?.id, companyId: me.companies?.[0]?.id, me };
}

function apiClient(cookie) {
  return async (method, p, body) => {
    const r = await fetch(`${API}/api${p}`, { method, headers: { 'content-type': 'application/json', cookie, 'x-cifren': '1' }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    if (r.status >= 400) console.warn(`  [api ${method} ${p}] ${r.status} ${text.slice(0, 300)}`);
    return data;
  };
}

// --- camada visual injetada na página (legenda, destaque, cursor, cartões) ---
const OVERLAY = () => {
  if (window.__av) return;
  const css = document.createElement('style');
  document.body.classList.add('av-std');
  css.textContent = `
  #av-cap{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);width:max-content;max-width:min(1040px,86vw);z-index:2147483646;
    background:rgba(10,30,55,.94);color:#fff;font:600 24px/1.35 Inter,system-ui,sans-serif;padding:13px 24px;border-radius:14px;
    box-shadow:0 10px 30px rgba(0,0,0,.35);text-align:center;transition:opacity .2s;pointer-events:none}
  #av-cap:empty{opacity:0}
  #av-spot{position:fixed;z-index:2147483645;border:3px solid #f28c28;border-radius:12px;box-shadow:0 0 0 6px rgba(242,140,40,.25),0 0 24px rgba(242,140,40,.55);
    pointer-events:none;transition:all .35s ease;opacity:0}
  #av-cur{position:fixed;z-index:2147483647;width:34px;height:34px;margin:-4px 0 0 -4px;pointer-events:none;transition:left .55s ease,top .55s ease;left:640px;top:420px}
  #av-cur svg{width:34px;height:34px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
  #av-cur.click::after{content:'';position:absolute;left:-6px;top:-6px;width:46px;height:46px;border-radius:50%;background:rgba(20,163,163,.45);animation:avp .45s ease-out}
  @keyframes avp{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}
  body:has(#av-card) #av-cur{opacity:0}
  #av-card{position:fixed;inset:0;z-index:2147483644;display:flex;flex-direction:column;justify-content:flex-start;padding:70px 110px 0;color:#fff;
    background:radial-gradient(1200px 700px at 85% 10%,rgba(20,163,163,.38),transparent),linear-gradient(135deg,#06121f,#0a1e37 55%,#0f2f4f);font-family:Inter,system-ui,sans-serif;transition:opacity .5s}
  #av-card .k{display:flex;align-items:center;gap:14px;font:700 22px/1 Inter,system-ui;letter-spacing:.08em;opacity:.95}
  #av-card .k span.l{width:46px;height:46px;border-radius:50%;background:#0a1e37;display:grid;place-items:center;overflow:hidden}
  #av-card .k span.l img{width:46px;height:46px;display:block}
  #av-card .n{margin-top:34px;font:700 24px/1 Inter,system-ui;color:#7fd6d6}
  #av-card h1{margin:12px 0 0;font:800 52px/1.08 Inter,system-ui;max-width:1000px}
  #av-card p{margin:16px 0 0;font:400 24px/1.4 Inter,system-ui;max-width:900px;color:#e6f1f8}
  #av-card .m{position:absolute;top:34px;right:110px;font:600 18px/1 Inter,system-ui;color:#7fd6d6}
  #av-card ul.b{margin:18px 0 0;padding:0;list-style:none;font:500 25px/1.45 Inter,system-ui;color:#eef6fb;max-width:1000px}
  #av-card ul.b li{margin:10px 0;padding-left:42px;position:relative}
  #av-card ul.b li::before{content:attr(data-i);position:absolute;left:0;top:3px;width:30px;height:30px;border-radius:50%;background:#e6f1f8;color:#0a1e37;font:800 16px/30px Inter,system-ui;text-align:center}
  #av-card .flow{display:flex;align-items:stretch;gap:16px;margin-top:28px;font:600 22px/1.35 Inter,system-ui}
  #av-card .flow div{background:rgba(255,255,255,.1);border:1px solid rgba(230,241,248,.32);border-radius:16px;padding:16px 18px;flex:1}
  #av-card .flow b{display:block;color:#ffd3a3;font:700 21px/1.3 Inter,system-ui;margin-top:8px}
  #av-card .flow span.ar{flex:0 0 auto;align-self:center;font-size:30px;border:0;background:none;padding:0}
  #av-step{position:fixed;top:66px;right:22px;z-index:2147483646;background:#0e7c7c;color:#fff;font:700 15px/1 Inter,system-ui,sans-serif;padding:9px 14px;border-radius:999px;
    box-shadow:0 6px 18px rgba(14,124,124,.45);pointer-events:none;transition:opacity .25s}
  #av-step:empty{opacity:0}
  #av-card em{font-style:normal;color:#ffd3a3;font-weight:500}
  #av-card .site{display:inline-flex;align-items:center;gap:12px;margin-top:14px;background:rgba(0,0,0,.32);border:1px solid rgba(230,241,248,.32);border-radius:12px;padding:10px 18px;font:600 20px/1.2 Inter,system-ui}
  #av-card .site span{color:#7fd6d6;font-weight:700;font-size:15px;letter-spacing:.06em;text-transform:uppercase}
  #av-card .site b{font:700 28px/1.2 ui-monospace,monospace;color:#fff}
  #av-card .trail{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin-top:16px;max-width:1060px}
  #av-card .trail span{background:rgba(255,255,255,.12);border:1px solid rgba(230,241,248,.36);border-radius:999px;padding:8px 18px;font:600 23px/1.25 Inter,system-ui}
  #av-card .trail i{font-style:normal;font-size:26px;color:#7fd6d6}
  #av-card ul.b.sm{font-size:26px;line-height:1.4;max-width:1080px}
  #av-card ul.b.md{font-size:28px;max-width:1080px}
  #av-card ul.b.lg{font-size:31px;max-width:1080px}
  #av-card ul.b.lg li{margin:14px 0;padding-left:48px}
  #av-card ul.b.lg li::before{width:34px;height:34px;font:800 19px/34px Inter,system-ui}
  #av-card ul.b.sm li{margin:7px 0}
  #av-card .note{margin-top:18px;max-width:1000px;background:#eef6fb;color:#0a1e37;border-radius:16px;border-left:10px solid #14a3a3;padding:14px 22px;box-shadow:0 10px 30px rgba(0,0,0,.25)}
  #av-card .note .nh{font:800 15px/1 Inter,system-ui;letter-spacing:.08em;text-transform:uppercase;color:#0e7c7c}
  #av-card .note b{display:block;margin-top:8px;font:800 32px/1.2 Inter,system-ui}
  #av-card .note small{display:block;margin-top:6px;font:500 23px/1.35 Inter,system-ui;color:#284a66}
  #av-card .note code{display:inline-block;margin-top:8px;background:#d9eef0;border-radius:8px;padding:4px 12px;font:700 25px/1.3 ui-monospace,monospace;color:#0a1e37}
  #av-card .notes{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px;max-width:1060px}
  #av-card .notes .note{margin-top:0}
  #av-card .notes ul{margin:8px 0 0;padding-left:22px;font:500 24px/1.4 Inter,system-ui;color:#284a66}
  #av-card .warn{margin-top:18px;max-width:1000px;background:#7f1d1d;color:#fff;border-radius:16px;border-left:10px solid #fca5a5;padding:14px 22px;box-shadow:0 10px 30px rgba(0,0,0,.3)}
  #av-card .warn .nh{font:800 15px/1 Inter,system-ui;letter-spacing:.08em;text-transform:uppercase;color:#fecaca}
  #av-card .warn ul{margin:10px 0 0;padding-left:26px;list-style:disc;font:600 25px/1.4 Inter,system-ui}
  #av-card .cd{display:block;margin-top:14px;max-width:1060px;background:rgba(0,0,0,.32);border:1px solid rgba(230,241,248,.28);border-radius:12px;padding:12px 16px;font:700 22px/1.35 ui-monospace,monospace;color:#ffd3a3;word-break:break-all}
  #av-card p.s{margin-top:16px;font-size:26px}
  #av-card .flow.w{margin-top:28px}
  #av-card .flow.w div{font-size:22px}`;
  document.head.appendChild(css);
  const mk = (id, html = '') => { const e = document.createElement('div'); e.id = id; e.innerHTML = html; document.body.appendChild(e); return e; };
  const cap = mk('av-cap');
  const spot = mk('av-spot');
  const step = mk('av-step');
  const cur = mk('av-cur', '<svg viewBox="0 0 24 24"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.3-3.4-6.8L5 19z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>');
  window.__av = {
    cap: (t) => { cap.textContent = t || ''; },
    step: (t) => { step.textContent = t || ''; },
    spot: (r) => { if (!r) { spot.style.opacity = 0; return; } Object.assign(spot.style, { left: `${r.x - 7}px`, top: `${r.y - 7}px`, width: `${r.width + 14}px`, height: `${r.height + 14}px`, opacity: 1 }); },
    move: (x, y) => { cur.style.left = `${x}px`; cur.style.top = `${y}px`; },
    click: () => { cur.classList.remove('click'); void cur.offsetWidth; cur.classList.add('click'); },
    card: (h) => { let c = document.getElementById('av-card'); if (!h) { if (c) { c.style.opacity = 0; setTimeout(() => c.remove(), 520); } return; } if (!c) c = mk('av-card'); c.style.opacity = 1; c.innerHTML = h; },
  };
  // a camada some se o app recriar o body: reinstala
  new MutationObserver(() => { for (const e of [cap, spot, cur, step]) if (!e.isConnected) document.body.appendChild(e); }).observe(document.body, { childList: true });
};

function helpers(page, api, tl, t0, base) {
  const ensure = () => page.evaluate(OVERLAY);
  const now = () => (Date.now() - t0) / 1000;
  const warn = (m) => { console.warn(`  ! ${m}`); tl.warnings.push(m); };
  const loc = (target) => (typeof target === 'string' ? page.getByText(target, { exact: true }).locator('visible=true').first() : target.first());
  const settle = async (ms = 500) => { await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {}); await sleep(ms); await ensure(); };
  // a legenda ocupa a faixa de baixo da tela: o que vai ser mostrado é trazido para o meio antes do destaque
  const center = async (l) => {
    const r = await l.boundingBox().catch(() => null);
    if (!r || (r.y > 110 && r.y + r.height < 520)) { await l.scrollIntoViewIfNeeded().catch(() => {}); return; }
    await l.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => {});
    await sleep(650);
  };
  const h = {
    page, api, now, warn, settle, sleep, password: DEMO_PASSWORD, base, center, sql, apiBase: API, focusBase: FAKES,
    async go(route) { await page.goto(h.base + route); await settle(700); },
    async find(target, { timeout = 4000 } = {}) {
      const l = loc(target);
      try { await l.waitFor({ state: 'visible', timeout }); return l; } catch { warn(`não achei: ${typeof target === 'string' ? target : target.toString()}`); return null; }
    },
    async spot(target, { pad = true } = {}) {
      const l = await h.find(target); if (!l) return null;
      await center(l); await sleep(250);
      const r = await l.boundingBox();
      if (r) { await page.evaluate(([b]) => window.__av.spot(b), [r]); await page.evaluate(([x, y]) => window.__av.move(x, y), [r.x + Math.min(r.width / 2, 60), r.y + r.height / 2]); }
      await sleep(pad ? 600 : 100);
      return l;
    },
    async unspot() { await page.evaluate(() => window.__av?.spot(null)); },
    /** Selo "Passo n · assunto" no canto da tela (vazio = some). */
    async step(t) { await ensure(); await page.evaluate(([x]) => window.__av.step(x), [t || '']); },
    /** Cartão explicativo em tela cheia (mesmo visual da abertura); null fecha. */
    async card(html) { await ensure(); if (html) await page.evaluate(() => window.__av.spot(null)); await page.evaluate(([x]) => window.__av.card(x), [html]); await sleep(html ? 450 : 650); },
    async click(target, { wait = 700 } = {}) {
      const l = await h.spot(target, { pad: false }); if (!l) return false;
      await sleep(450); await page.evaluate(() => window.__av.click());
      await l.click().catch((e) => warn(`clique falhou: ${e.message.split('\n')[0]}`));
      await h.unspot(); await settle(wait); return true;
    },
    async label(text) { return h.find(page.getByLabel(text, { exact: false })); },
    /** Preenche de uma vez (datas, mês) mostrando o cursor no campo. */
    async fill(target, value) {
      const l = typeof target === 'string' ? await h.label(target) : await h.find(target); if (!l) return;
      await center(l);
      const r = await l.boundingBox(); if (r) await page.evaluate(([x, y]) => window.__av.move(x, y), [r.x + 30, r.y + r.height / 2]);
      await l.fill(String(value)).catch((e) => warn(`fill: ${e.message.split('\n')[0]}`)); await sleep(350);
    },
    async type(target, value, { delay = 45 } = {}) {
      const l = typeof target === 'string' ? await h.label(target) : await h.find(target); if (!l) return;
      await center(l);
      const r = await l.boundingBox(); if (r) await page.evaluate(([x, y]) => window.__av.move(x, y), [r.x + 30, r.y + r.height / 2]);
      await l.click().catch(() => {}); await l.fill(''); await l.pressSequentially(String(value), { delay });
      await sleep(250);
    },
    async select(labelText, option) {
      const l = await h.label(labelText); if (!l) return;
      await center(l);
      await l.selectOption(typeof option === 'string' ? { label: option } : option).catch((e) => warn(`select ${labelText}: ${e.message.split('\n')[0]}`));
      await sleep(400);
    },
    async scroll(dy, ms = 900) {
      await page.evaluate(([d]) => {
        const sc = (e) => { for (let x = e; x && x !== document.body; x = x.parentElement) { const st = getComputedStyle(x); if (/(auto|scroll)/.test(st.overflowY) && x.scrollHeight > x.clientHeight + 5) return x; } return null; };
        const can = (e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 5;
        const dlg = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null || e.getClientRects().length).pop();
        const t = (dlg && [dlg, ...dlg.querySelectorAll('*')].find(can)) || sc(document.elementFromPoint(640, 420)) || document.scrollingElement;
        t.scrollBy({ top: d, behavior: 'smooth' });
      }, [dy]);
      await sleep(ms);
    },
    async top() { await page.evaluate(() => { document.querySelectorAll('main, .overflow-y-auto').forEach((e) => e.scrollTo({ top: 0, behavior: 'smooth' })); window.scrollTo({ top: 0, behavior: 'smooth' }); }); await sleep(600); },
    async esc() { await page.keyboard.press('Escape'); await sleep(400); },
    /** Janela (diálogo) aberta no momento. */
    dlg: () => page.getByRole('dialog').last(),
  };
  return h;
}

async function speak(page, tl, t0, id, text) {
  await page.evaluate(([t]) => window.__av.cap(t), [text]);
  const at = (Date.now() - t0) / 1000;
  tl.cues.push({ id, text, at });
  const d = DRY ? 0.4 : durs[id];
  if (d == null) throw new Error(`sem áudio para ${id}`);
  await sleep(d * 1000 + 260);
}

const ICON = '<span class="l"><img src="/favicon.svg" alt="" /></span>';
const learnList = (l) => `<ul class="b">${l.learn.map((t, i) => `<li data-i="${i + 1}">${t}</li>`).join('')}</ul>`;

async function recordLesson(browser, l) {
  const host = l.host === undefined ? HOST_DEFAULT : l.host;
  await fetch(`${FAKES}/__reset`, { method: 'POST' }).catch(() => {});
  const co = await newCompany(l);
  const api = apiClient(co.cookie);
  let ctx = null;
  let state = {};
  let h = null;
  try {
    ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
      recordVideo: DRY ? undefined : { dir: path.join(OUT, 'raw', 'tmp'), size: { width: 1280, height: 800 } } });
    await ctx.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
    // a tela abre no endereço real do sistema (https://cifren.lorler.com.br); o navegador não sai da máquina: cada pedido a esse
    // endereço é atendido pelo servidor local de gravação (assim o endereço do webhook que aparece na tela é o de produção)
    const base = host ? `https://${host}` : (process.env.REC_BASE || FWD);
    if (host) {
      const hostRe = new RegExp(`^https://${host.replace(/\./g, '\\.')}/`);
      await ctx.route(hostRe, async (route) => {
        const rq = route.request();
        try {
          const headers = { ...rq.headers() };
          for (const k of ['host', 'content-length', 'connection', 'accept-encoding']) delete headers[k];
          const r = await fetch(rq.url().replace(`https://${host}`, FWD), { method: rq.method(), headers, body: rq.postDataBuffer() || undefined, redirect: 'manual' });
          const out = {};
          r.headers.forEach((v, k) => { if (k !== 'set-cookie') out[k] = v; });
          const cookies = r.headers.getSetCookie?.() || [];
          if (cookies.length) out['set-cookie'] = cookies.join('\n'); // o cookie da sessão (__Host-, só HTTPS) vale por causa do endereço https
          delete out['content-encoding']; delete out['content-length']; delete out['transfer-encoding'];
          await route.fulfill({ status: r.status, headers: out, body: Buffer.from(await r.arrayBuffer()) });
        } catch (e) { console.warn(`  ! rota ${rq.method()} ${rq.url()}: ${e.message}`); await route.abort(); }
      });
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base }).catch(() => {});
    }
    const page = await ctx.newPage();
    // abas extras (arquivos exportados, links) não entram no vídeo: fecham sozinhas
    ctx.on('page', (p) => { if (p !== page) setTimeout(() => p.close().catch(() => {}), 1200); });
    const t0 = Date.now();
    const tl = { n: l.n, file: l.file, cues: [], warnings: [], start: 0, end: 0 };
    h = helpers(page, api, tl, t0, base);
    h.companyId = co.companyId; h.orgId = co.orgId; h.email = co.email; h.me = co.me;
    page.on('pageerror', (e) => h.warn(`pageerror ${e.message}`));
    // entra pelo formulário de login (antes da aula começar; esta parte é cortada do vídeo)
    await page.goto(`${base}/entrar`);
    await page.getByLabel('E-mail').fill(co.email);
    await page.getByLabel('Senha').first().fill(DEMO_PASSWORD);
    await page.keyboard.press('Enter');
    try { await page.waitForURL((u) => !/\/entrar/.test(u.pathname), { timeout: 15000 }); } catch (e) {
      fs.mkdirSync(path.join(OUT, 'dry'), { recursive: true });
      await page.screenshot({ path: path.join(OUT, 'dry', 'login-falhou.png') });
      throw new Error(`login não concluiu (${page.url()}): ${(await page.locator('body').innerText()).slice(0, 300)}`);
    }
    await settle0(page);
    state = l.setup ? (await l.setup(api, h)) || {} : {};
    h.state = state;
    await h.go(l.start || '/');
    await page.evaluate(() => document.querySelector('[aria-label="Fechar"]')?.click());
    const modLabel = MODULES.find((m) => m.key === l.mod)?.label || '';
    // cartão de abertura: título, para que serve e o que será aprendido
    await h.card(`<div class="k">${ICON}CIFREN · TREINAMENTO</div><div class="n">Aula ${l.n} · ${modLabel}</div><h1>${l.title}</h1><p>${l.desc}</p><div class="n" style="margin-top:34px;font-size:22px">Nesta aula você vai aprender:</div>${learnList(l)}<div class="m">Dados fictícios de exemplo</div>`);
    tl.start = (Date.now() - t0) / 1000 - 0.15;
    await speak(page, tl, t0, idOf(l.n, 'i', 0), introText(l));
    await sleep(500);
    await page.evaluate(() => window.__av.card(null));
    await sleep(650);
    const total = l.steps.filter((s) => s.tag).length;
    let k = 0;
    for (const [i, s] of l.steps.entries()) {
      if (s.tag) { k += 1; await h.step(`Passo ${k} de ${total} · ${s.tag}`); }
      if (s.act) { try { await s.act(h, state); } catch (e) { h.warn(`passo ${i}: ${e.message.split('\n')[0]}`); } }
      for (const [j, t] of chunks(s.say).entries()) await speak(page, tl, t0, idOf(l.n, i, j), t);
      if (s.after) { try { await s.after(h, state); } catch (e) { h.warn(`após ${i}: ${e.message.split('\n')[0]}`); } }
      if (DRY) await page.screenshot({ path: path.join(OUT, 'dry', `${l.file}-${String(i).padStart(2, '0')}.png`) });
    }
    await h.unspot(); await h.step('');
    // cartão final: resumo do que foi aprendido
    await page.evaluate(([html]) => window.__av.card(html), [`<div class="k">${ICON}CIFREN · TREINAMENTO</div><div class="n">Resumo da aula ${l.n}</div><h1>${l.title}</h1>${learnList(l)}<div class="m">Assista de novo quando quiser · Suporte e treinamento</div>`]);
    await sleep(500);
    await page.evaluate(() => window.__av.cap(''));
    await speak(page, tl, t0, idOf(l.n, 'o', 0), outroText(l));
    if (DRY) await page.screenshot({ path: path.join(OUT, 'dry', `${l.file}-zz.png`) });
    await page.evaluate(() => window.__av.cap(''));
    await sleep(900);
    tl.end = (Date.now() - t0) / 1000;
    const video = page.video();
    await ctx.close(); ctx = null;
    if (l.teardown) { try { await l.teardown(api, h, state); } catch (e) { console.warn(`  ! limpeza: ${e.message.split('\n')[0]}`); } }
    if (video) fs.renameSync(await video.path(), path.join(OUT, 'raw', `${l.file}.webm`));
    fs.writeFileSync(path.join(OUT, 'raw', `${l.file}.json`), JSON.stringify(tl, null, 1));
    console.log(`aula ${l.n} ${l.file}: ${(tl.end - tl.start).toFixed(1)}s, ${tl.warnings.length} aviso(s)`);
  } finally {
    if (ctx) await ctx.close().catch(() => {});
  }
}
const settle0 = async (page) => { await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {}); await sleep(500); };

if (mode === 'rec') {
  if (DRY) fs.mkdirSync(path.join(OUT, 'dry'), { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' }, args: ['--lang=pt-BR', '--no-proxy-server'] });
  for (const l of LESSONS.filter((x) => !only.length || only.includes(x.n))) {
    try { await recordLesson(browser, l); } catch (e) { console.error(`aula ${l.n} falhou:`, e); }
  }
  await browser.close();
}
