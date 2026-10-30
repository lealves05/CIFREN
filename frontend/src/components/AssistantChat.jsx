import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cx } from './ui';
import { Bot, Check, CheckCheck, Headset, Loader2, RotateCcw, Send, ShieldCheck, Star, X } from 'lucide-react';

/**
 * Chat com o assistente da Central de Atendimento LORLER (mesmo componente nos sistemas LORLER; cópia do ORBI com as cores do CIFREN).
 * Não confundir com a página Assistente IA (pages/Assistant.jsx), que é o assistente financeiro do próprio CIFREN.
 * `client`: { view(after?) → GET, send(body), approve(id), reject(id), undo(id), close(rating) } — cada sistema liga às próprias rotas.
 * O texto das mensagens é sempre mostrado como texto (nunca HTML).
 */
const hhmm = (d) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dayLabel = (d) => {
  const x = new Date(d); const t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1);
  if (x.toDateString() === t.toDateString()) return 'Hoje';
  if (x.toDateString() === y.toDateString()) return 'Ontem';
  return x.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: x.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
};
const STATUS = {
  proposta: ['Aguardando autorização', 'bg-warn-soft text-warn'],
  executada: ['Alteração feita', 'bg-positive/15 text-positive'],
  recusada: ['Recusada', 'bg-muted text-ink-soft'],
  expirada: ['Expirou', 'bg-muted text-ink-soft'],
  falhou: ['Não foi aplicada', 'bg-danger-soft text-danger'],
  desfeita: ['Desfeita', 'bg-muted text-ink-soft'],
};

export function AssistantAvatar({ name, avatar, color, size = 'h-9 w-9', className }) {
  if (avatar) return <img src={avatar} alt="" className={cx(size, 'shrink-0 rounded-full object-cover', className)} />;
  const ini = String(name || 'A').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return <span aria-hidden="true" className={cx(size, 'grid shrink-0 place-items-center rounded-full text-xs font-semibold text-white', className)} style={{ background: color || 'rgb(var(--positive))' }}>{ini}</span>;
}

function ActionCard({ a, me, busy, onApprove, onReject, onUndo, undoDays }) {
  const [label, tone] = STATUS[a.status] || [a.status, 'bg-muted'];
  const canUndo = a.status === 'executada' && a.can_undo && me?.can_approve && a.decided_at && Date.now() - new Date(a.decided_at).getTime() < undoDays * 86400000;
  return (
    <div className="mt-1 rounded-app-sm border border-line bg-surface p-3 text-sm shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <span className="font-semibold">{a.summary}</span>
      </div>
      <ul className="space-y-1.5">
        {(a.changes || []).map((c, i) => (
          <li key={i} className="rounded-app-sm bg-muted/60 px-2 py-1.5">
            <div className="text-xs font-medium text-ink-soft">{c.campo}</div>
            <div className="text-[13px]"><span className="text-ink-faint line-through decoration-1">{c.de}</span> <span aria-hidden="true">→</span><span className="sr-only">passa a ser</span> <b>{c.para}</b></div>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-medium', tone)}>{label}</span>
        {a.decided_by_name && a.status !== 'proposta' && <span className="text-[11px] text-ink-faint">por {a.decided_by_name}</span>}
        {a.status === 'falhou' && a.error && <span className="text-[11px] text-danger">{a.error}</span>}
      </div>
      {a.status === 'proposta' && (me?.can_approve ? (
        <div className="mt-3 flex gap-2">
          <button type="button" className="btn-primary flex-1" disabled={busy} onClick={() => onApprove(a)}><Check className="h-4 w-4" /> Autorizar</button>
          <button type="button" className="btn-outline" disabled={busy} onClick={() => onReject(a)}>Recusar</button>
        </div>
      ) : <p className="mt-2 text-xs text-ink-faint">Só um responsável pelas configurações da empresa pode autorizar. Peça para ele abrir este chat.</p>)}
      {canUndo && <button type="button" className="btn-ghost btn-sm mt-2" disabled={busy} onClick={() => onUndo(a)}><RotateCcw className="h-3.5 w-3.5" /> Desfazer</button>}
    </div>
  );
}

export default function AssistantChat({ client, onClose, userName, className }) {
  const [v, setV] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rating, setRating] = useState(null);
  const listRef = useRef(null);
  const lastAt = useRef(null);
  const avatarRef = useRef(null);

  const merge = useCallback((incoming) => {
    if (!incoming?.length) return;
    setMsgs((cur) => {
      const map = new Map(cur.filter((m) => !m.pending).map((m) => [m.id, m]));
      for (const m of incoming) map.set(m.id, m);
      return [...map.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    });
    lastAt.current = incoming[incoming.length - 1].created_at;
  }, []);

  const load = useCallback(async (full = false) => {
    try {
      const d = await client.view(full ? null : lastAt.current);
      if (d.assistant?.avatar !== undefined) avatarRef.current = d.assistant.avatar;
      setV((old) => ({ ...d, assistant: { ...d.assistant, avatar: d.assistant?.avatar !== undefined ? d.assistant.avatar : old?.assistant?.avatar } }));
      if (full) { setMsgs([]); lastAt.current = null; }
      merge(d.messages);
      setError('');
    } catch (e) { setError(e.message); }
  }, [client, merge]);

  useEffect(() => { load(true); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(false); }, 4000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs.length, sending, v?.typing]);

  const actions = useMemo(() => new Map((v?.actions || []).map((a) => [a.id, a])), [v]);
  const send = async (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setError(''); setText('');
    setMsgs((cur) => [...cur, { id: `p${Date.now()}`, pending: true, sender: 'cliente', author_name: userName, body, created_at: new Date().toISOString() }]);
    try { await client.send(body); } catch (err) { setError(err.message); setText(body); }
    finally { setSending(false); await load(false); }
  };
  const act = (fn) => async (a) => {
    setBusy(true); setError('');
    try { await fn(a.id); } catch (err) { setError(err.message); } finally { setBusy(false); await load(false); }
  };
  const closeChat = async () => {
    setBusy(true);
    try { await client.close(rating); setRating(null); await load(true); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const as = v?.assistant || {};
  const human = v?.conversation?.handler === 'humano';
  const typing = sending || v?.typing;
  let lastDay = '';
  return (
    <section aria-label={`Conversa com ${as.name || 'o assistente'}`} className={cx('flex h-full min-h-0 flex-col overflow-hidden bg-bg', className)}>
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <AssistantAvatar name={as.name} avatar={as.avatar} color={as.color} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold">{as.name || 'Assistente'}</div>
          <div className="truncate text-xs text-ink-faint" aria-live="polite">
            {typing ? 'digitando…' : human ? 'Atendente da LORLER na conversa' : as.available ? 'Assistente virtual (IA) · responde na hora' : `Equipe LORLER · ${as.human_hours || 'horário comercial'}`}
          </div>
        </div>
        {v?.conversation && <button type="button" className="btn-ghost btn-sm" onClick={() => setRating(rating ?? 0)} disabled={busy}>Encerrar</button>}
        {onClose && <button type="button" className="btn-ghost btn-icon" aria-label="Fechar o chat" onClick={onClose}><X className="h-5 w-5" /></button>}
      </header>

      {rating !== null && (
        <div className="border-b border-line bg-surface px-4 py-3 text-sm">
          <div className="mb-2 font-medium">Como foi o atendimento?</div>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Nota de 1 a 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} de 5`} onClick={() => setRating(n)} className="focus-ring rounded-app-sm p-1">
                <Star className={cx('h-6 w-6', n <= (rating || 0) ? 'fill-cta text-cta' : 'text-ink-faint')} />
              </button>
            ))}
            <button type="button" className="btn-primary btn-sm ml-auto" disabled={busy} onClick={closeChat}>Encerrar atendimento</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setRating(null)}>Voltar</button>
          </div>
        </div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-5" style={{ backgroundImage: 'radial-gradient(rgb(var(--line) / .6) 1px, transparent 1px)', backgroundSize: '18px 18px' }}>
        {!v && <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-ink-faint" /></div>}
        {v && (
          <div className="flex items-end gap-2">
            <AssistantAvatar name={as.name} avatar={as.avatar} color={as.color} size="h-7 w-7" />
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-surface px-3 py-2 text-sm shadow-sm">
              <p className="whitespace-pre-wrap">{as.greeting}</p>
              <p className="mt-1 text-[11px] text-ink-faint">Sou uma inteligência artificial: as conversas são processadas por um fornecedor de IA (Anthropic) e guardadas pela LORLER para o atendimento. Não envie senhas, cartões nem dados de clientes. Nada é alterado sem a sua autorização.</p>
            </div>
          </div>
        )}
        {msgs.map((m) => {
          const day = dayLabel(m.created_at);
          const sep = day !== lastDay; lastDay = day;
          const a = m.action_id ? actions.get(m.action_id) : null;
          const mine = m.sender === 'cliente';
          return (
            <div key={m.id}>
              {sep && <div className="my-3 text-center"><span className="rounded-full bg-surface px-3 py-1 text-[11px] font-medium text-ink-faint shadow-sm">{day}</span></div>}
              {m.sender === 'sistema' ? (
                <div className="my-2 text-center"><span className="inline-block max-w-[90%] whitespace-pre-wrap rounded-app-sm bg-warn-soft px-3 py-1.5 text-xs text-ink-soft">{m.body}</span></div>
              ) : (
                <div className={cx('flex items-end gap-2', mine && 'justify-end')}>
                  {!mine && (m.sender === 'atendente'
                    ? <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-surface" aria-hidden="true"><Headset className="h-4 w-4" /></span>
                    : <AssistantAvatar name={as.name} avatar={as.avatar} color={as.color} size="h-7 w-7" />)}
                  <div className={cx('max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm', mine ? 'rounded-br-sm bg-accent/15' : 'rounded-bl-sm bg-surface')}>
                    {!mine && <div className="mb-0.5 text-[11px] font-semibold" style={{ color: m.sender === 'ia' ? as.color : undefined }}>{m.sender === 'atendente' ? `${m.author_name || 'Atendente'} · Equipe LORLER` : m.author_name || as.name}</div>}
                    {a ? <ActionCard a={a} me={v?.me} busy={busy} undoDays={v?.undo_days ?? 7} onApprove={act(client.approve)} onReject={act(client.reject)} onUndo={act(client.undo)} />
                      : <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-ink-faint">
                      {hhmm(m.created_at)}{mine && (m.pending ? <Check className="h-3 w-3" aria-label="enviando" /> : <CheckCheck className="h-3 w-3 text-sky-500" aria-label="entregue" />)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {typing && !human && (
          <div className="flex items-end gap-2" aria-hidden="true">
            <AssistantAvatar name={as.name} avatar={as.avatar} color={as.color} size="h-7 w-7" />
            <div className="rounded-2xl rounded-bl-sm bg-surface px-4 py-3 shadow-sm"><span className="inline-flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint" style={{ animationDelay: `${i * 150}ms` }} />)}</span></div>
          </div>
        )}
      </div>

      {error && <p role="alert" className="border-t border-danger/30 bg-danger-soft px-4 py-2 text-xs text-danger">{error}</p>}
      <form onSubmit={send} className="flex items-end gap-2 border-t border-line bg-surface p-3">
        <label htmlFor="assistant-msg" className="sr-only">Sua mensagem</label>
        <textarea id="assistant-msg" rows={1} value={text} maxLength={2000} placeholder={human ? 'Escreva para o atendente…' : 'Escreva sua dúvida…'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }}
          className="input max-h-36 min-h-[42px] flex-1 resize-none py-2.5" />
        <button type="submit" className="btn-primary btn-icon h-[42px] w-[42px] shrink-0 rounded-full" disabled={sending || !text.trim()} aria-label="Enviar">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </section>
  );
}

/** Botão/cartão "Falar com o assistente" da área de Suporte. */
export function AssistantLauncher({ name, onOpen }) {
  return (
    <div className="card flex flex-wrap items-center gap-4 p-5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent/15 text-accent"><Bot className="h-6 w-6" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold">Falar com {name || 'o assistente'}</h2>
        <p className="text-sm text-ink-soft">Tire dúvidas na hora e, com a sua autorização, deixe o assistente ajustar as configurações para você. Se precisar, ele chama alguém da equipe LORLER.</p>
      </div>
      <button type="button" className="btn-primary" onClick={onOpen}><Bot className="h-4 w-4" aria-hidden="true" /> Falar com o assistente</button>
    </div>
  );
}

/** Painel lateral do chat (à direita; tela cheia no celular). Esc ou clique fora fecha. */
export function AssistantPanel({ client, userName, onClose }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-[1px]" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Chat com o assistente" className="h-full w-full max-w-md animate-slide shadow-2xl sm:border-l sm:border-line">
        <AssistantChat client={client} userName={userName} onClose={onClose} />
      </div>
    </div>
  );
}
