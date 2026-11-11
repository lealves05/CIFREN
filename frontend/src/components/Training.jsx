// Vídeo-aulas narradas do CIFREN (Suporte › Treinamento): player com legenda na imagem, velocidade, texto clicável da aula,
// busca por assunto ou frase falada e progresso por usuário (só neste navegador). Índice gerado em lib/training.js.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Captions, CheckCircle2, Clock, Gauge, PlayCircle, Search, X } from 'lucide-react';
import { Badge } from './ui';
import { LESSONS, MODULES, captionsUrl, fmtDur, posterUrl, thumbUrl, videoUrl } from '../lib/training';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SPEEDS = [[0.75, 'Mais devagar (0,75x)'], [1, 'Normal'], [1.25, 'Mais rápido (1,25x)']];
const SPEED_KEY = 'cifren.aulas.velocidade';
export const TOTAL_MIN = Math.round(LESSONS.reduce((a, l) => a + l.s, 0) / 60);

/** Lê o .vtt da aula: [{ at, text }] para o texto clicável. */
function useTranscript(lesson) {
  const [cues, setCues] = useState([]);
  useEffect(() => {
    let alive = true;
    setCues([]);
    if (!lesson) return undefined;
    fetch(captionsUrl(lesson)).then((r) => (r.ok ? r.text() : '')).then((t) => {
      if (!alive) return;
      const out = [];
      for (const block of t.split(/\r?\n\r?\n/)) {
        const lines = block.split(/\r?\n/);
        const k = lines.findIndex((l) => l.includes('-->'));
        const m = k >= 0 && lines[k].match(/(\d\d):(\d\d):(\d\d)\.(\d+)\s*-->/);
        if (!m) continue;
        const text = lines.slice(k + 1).join(' ').trim();
        if (text) out.push({ at: +m[1] * 3600 + +m[2] * 60 + +m[3] + +`0.${m[4]}`, text });
      }
      setCues(out);
    }).catch(() => {});
    return () => { alive = false; };
  }, [lesson?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  return cues;
}

/** Aulas já assistidas (por usuário, só neste navegador; sem armazenamento a lista começa vazia). */
function useWatched(userId) {
  const key = `cifren.aulas.${userId || 'anon'}`;
  const [seen, setSeen] = useState(() => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } });
  const mark = (n) => setSeen((s) => {
    if (s[n]) return s;
    const next = { ...s, [n]: 1 };
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* sem armazenamento */ }
    return next;
  });
  return [seen, mark];
}

export default function Training({ userId }) {
  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState('');
  const [seen, mark] = useWatched(userId);
  const player = useRef(null);
  const [speed, setSpeed] = useState(() => { try { return Number(localStorage.getItem(SPEED_KEY)) || 1; } catch { return 1; } });
  const [now, setNow] = useState(0);
  const cur = LESSONS.find((l) => l.n === Number(params.get('aula'))) || LESSONS[0];
  const idx = LESSONS.indexOf(cur);
  const done = LESSONS.filter((l) => seen[l.n]).length;
  const cues = useTranscript(cur);

  const open = (l, play = true) => {
    setParams((p) => { const q = new URLSearchParams(p); q.set('aula', String(l.n)); return q; }, { replace: true });
    if (play) setTimeout(() => { player.current?.play?.().catch(() => {}); player.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); }, 60);
  };
  useEffect(() => { player.current?.load?.(); }, [cur?.n]);
  useEffect(() => {
    if (player.current) player.current.playbackRate = speed;
    try { localStorage.setItem(SPEED_KEY, String(speed)); } catch { /* sem armazenamento */ }
  }, [speed, cur?.n]);
  const seek = (t) => { const v = player.current; if (!v) return; v.currentTime = t; v.play?.().catch(() => {}); };
  const groups = useMemo(() => {
    const t = norm(term.trim());
    const hit = (l) => !t || norm(`${l.title} ${l.desc} ${l.learn.join(' ')} ${l.text || ''}`).includes(t);
    return MODULES.map((m) => ({ ...m, items: LESSONS.filter((l) => l.mod === m.key && hit(l)) })).filter((g) => g.items.length);
  }, [term]);
  if (!cur) return null;

  return (
    <section aria-labelledby="treinamento" className="space-y-3">
      <h2 id="treinamento" className="px-1 text-xs font-semibold uppercase tracking-wider text-ink-faint">
        Vídeo-aulas · {LESSONS.length} aulas narradas, {TOTAL_MIN} min
      </h2>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3" aria-label="Aula atual">
          <video ref={player} key={cur.n} controls playsInline preload="metadata" poster={posterUrl(cur)} aria-label={`Aula ${cur.n}: ${cur.title}`}
            className="aspect-[16/10] w-full rounded-xl bg-black shadow-lg"
            onEnded={() => { mark(cur.n); if (LESSONS[idx + 1]) open(LESSONS[idx + 1], false); }}
            onLoadedMetadata={(e) => { e.currentTarget.playbackRate = speed; }} onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}>
            <source src={videoUrl(cur)} type="video/mp4" />
            <track kind="captions" src={captionsUrl(cur)} srcLang="pt-BR" label="Português (a legenda já aparece na imagem)" />
            Seu navegador não reproduz vídeos.
          </video>
          <div className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">Aula {cur.n}</Badge>
              <span className="inline-flex items-center gap-1 text-sm text-ink-faint"><Clock className="h-3.5 w-3.5" aria-hidden="true" /> {fmtDur(cur.s)}</span>
              {seen[cur.n] && <Badge tone="positive">assistida</Badge>}
            </div>
            <h3 className="mt-2 text-xl font-semibold">{cur.title}</h3>
            <p className="text-sm text-ink-soft">{cur.desc}</p>
            <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-3">
              {cur.learn.map((x) => <li key={x} className="flex gap-1.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />{x}</li>)}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className="btn-ghost" disabled={idx === 0} onClick={() => open(LESSONS[idx - 1])}>Aula anterior</button>
              <button type="button" className="btn-primary" disabled={idx === LESSONS.length - 1} onClick={() => open(LESSONS[idx + 1])}>Próxima aula</button>
              <span className="ml-auto flex flex-wrap items-center gap-1" role="group" aria-label="Velocidade da aula">
                <Gauge className="h-4 w-4 text-ink-faint" aria-hidden="true" />
                {SPEEDS.map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={speed === v} aria-label={l} title={l} onClick={() => setSpeed(v)}
                    className={`h-8 rounded-lg border px-2.5 text-xs font-semibold ${speed === v ? 'border-accent bg-accent/15 text-ink' : 'border-line text-ink-faint hover:bg-muted'}`}>
                    {String(v).replace('.', ',')}x
                  </button>
                ))}
              </span>
            </div>
          </div>
          {cues.length > 0 && (
            <details className="card p-4" open>
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                <Captions className="h-4 w-4 text-accent" aria-hidden="true" /> Texto da aula
                <span className="text-xs font-normal text-ink-faint">— clique numa frase para ir até ela no vídeo</span>
              </summary>
              <ol className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1 text-sm">
                {cues.map((c, i) => {
                  const on = now >= c.at && (i === cues.length - 1 || now < cues[i + 1].at);
                  return (
                    <li key={c.at}>
                      <button type="button" onClick={() => seek(c.at)} aria-current={on ? 'true' : undefined}
                        className={`flex w-full gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted ${on ? 'bg-accent/15 font-semibold' : ''}`}>
                        <span className="w-10 shrink-0 text-xs tabular-nums text-ink-faint">{fmtDur(c.at)}</span><span>{c.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </details>
          )}
        </div>
        <aside className="space-y-3">
          <div className="card p-3">
            <div className="mb-2 flex items-center justify-between text-sm"><span className="font-semibold">Seu progresso</span><span className="text-ink-faint">{done} de {LESSONS.length}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-accent" style={{ width: `${(done / LESSONS.length) * 100}%` }} /></div>
            <label className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-bg px-3">
              <Search className="h-4 w-4 text-ink-faint" aria-hidden="true" />
              <input className="w-full bg-transparent py-2 text-sm outline-none" placeholder="Buscar aula ou frase falada" value={term}
                onChange={(e) => setTerm(e.target.value)} aria-label="Buscar aula" />
              {term && <button type="button" className="text-ink-faint hover:text-ink" onClick={() => setTerm('')} aria-label="Limpar busca"><X className="h-4 w-4" /></button>}
            </label>
          </div>
          <div className="card max-h-[70vh] overflow-y-auto p-2">
            {groups.map((g) => (
              <div key={g.key} className="mb-2">
                <div className="px-2 pt-1 text-xs font-bold uppercase tracking-wide text-ink-faint">{g.label}</div>
                {g.items.map((l) => (
                  <button key={l.n} type="button" onClick={() => open(l)} aria-current={l.n === cur.n ? 'true' : undefined}
                    className={`mt-1 flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted ${l.n === cur.n ? 'bg-accent/15 ring-1 ring-accent/40' : ''}`}>
                    <span className="relative shrink-0"><img src={thumbUrl(l)} alt="" loading="lazy" className="h-14 w-24 rounded object-cover" />
                      <PlayCircle className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow" aria-hidden="true" /></span>
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{l.n}. {l.title}</span>
                      <span className="text-xs text-ink-faint">{fmtDur(l.s)}{seen[l.n] ? ' · ✓ assistida' : ''}</span></span>
                  </button>
                ))}
              </div>
            ))}
            {!groups.length && <p className="p-3 text-sm text-ink-faint">Nenhuma aula encontrada.</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}
