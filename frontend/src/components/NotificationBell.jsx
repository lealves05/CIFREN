import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api, EVENTS } from '../lib/api';
import { dateTime } from '../lib/format';
import { cx, Spinner } from './ui';

/** Sino do topo: quantas não lidas, lista e marcar como lidas. */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], unread: 0 });
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  const load = useCallback(async () => {
    try {
      const res = await api.get('/notifications');
      setData({ items: res?.items || [], unread: Number(res?.unread) || 0 });
    } catch { /* sino é secundário: falha silenciosa */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 90000);
    window.addEventListener(EVENTS.countsChanged, load);
    return () => { clearInterval(t); window.removeEventListener(EVENTS.countsChanged, load); };
  }, [load]);
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) { setLoading(true); await load(); setLoading(false); }
  };
  const readOne = async (n) => {
    if (!n.read_at) {
      setData((d) => ({ unread: Math.max(0, d.unread - 1), items: d.items.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) }));
      api.post(`/notifications/${n.id}/read`).catch(() => {});
    }
    if (n.link) { setOpen(false); if (/^https?:/.test(n.link)) window.location.href = n.link; else navigate(n.link); }
  };
  const readAll = async () => {
    try { await api.post('/notifications/read-all'); } catch { /* tenta de novo depois */ }
    load();
  };

  const n = data.unread;
  return (
    <div ref={ref} className="relative">
      <button type="button" className="btn-ghost btn-icon relative" aria-haspopup="dialog" aria-expanded={open} onClick={toggle}
        aria-label={n ? `Notificações: ${n} não lida${n > 1 ? 's' : ''}` : 'Notificações'}>
        <Bell className="h-5 w-5" aria-hidden="true" />
        {n > 0 && <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-cta px-1 text-[10px] font-bold text-cta-fg" aria-hidden="true">{n > 99 ? '99+' : n}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notificações" className="card fixed inset-x-2 top-14 z-40 max-h-[70vh] overflow-hidden p-0 animate-pop sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1 sm:w-96">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <h2 className="text-sm font-semibold">Notificações</h2>
            {n > 0 && <button type="button" className="btn-ghost btn-sm" onClick={readAll}><CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Marcar todas como lidas</button>}
          </div>
          <div className="max-h-[calc(70vh-48px)] overflow-y-auto">
            {loading && !data.items.length ? <div className="flex justify-center py-6"><Spinner /></div>
              : !data.items.length ? <p className="px-4 py-8 text-center text-sm text-ink-faint">Nenhuma notificação por enquanto.</p> : (
                <ul className="divide-y divide-line">
                  {data.items.map((it) => (
                    <li key={it.id}>
                      <button type="button" onClick={() => readOne(it)} className={cx('focus-ring flex w-full gap-3 px-4 py-3 text-left hover:bg-muted', !it.read_at && 'bg-accent/5')}>
                        <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', it.read_at ? 'bg-transparent' : 'bg-cta')} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className={cx('block text-sm', !it.read_at && 'font-semibold')}>{it.title}{!it.read_at && <span className="sr-only"> (não lida)</span>}</span>
                          {it.body && <span className="block text-xs text-ink-soft">{it.body}</span>}
                          <span className="block text-[11px] text-ink-faint">{dateTime(it.created_at)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
