import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Sparkles, Send, Lightbulb, MessageSquare, BookOpen, Bot } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, errorMessage, isAiNotConfigured } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useApiError } from '../lib/useApiError';
import { P } from '../lib/permissions';
import { PageHeader, Tabs, Loading, ErrorState, EmptyState, Spinner, cx } from '../components/ui';
import { Notice } from '../components/kit';
import InsightCard from '../components/InsightCard';

const SUGGESTED = [
  'Vou ter dinheiro para pagar as contas do mês que vem?',
  'Quais clientes estão atrasados e quanto devem?',
  'Onde estou gastando mais este mês?',
  'Quanto preciso vender para cobrir as despesas fixas?',
];

function Chat() {
  const { can } = useAuth();
  const onError = useApiError();
  const [msgs, setMsgs] = useState([]); // só na memória da tela: nada vai para o armazenamento do navegador
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' }); }, [msgs, busy]);

  const ask = async (text) => {
    const question = String(text || '').trim();
    if (!question || busy) return;
    setQ('');
    setMsgs((m) => [...m, { role: 'user', text: question }]);
    setBusy(true);
    try {
      const r = await api.post('/ai/ask', { question });
      setMsgs((m) => [...m, { role: 'ai', text: r?.answer || 'Sem resposta.', sources: r?.sources || [], period: r?.period }]);
    } catch (e) {
      if (isAiNotConfigured(e)) setNotConfigured(true);
      else onError(e);
      setMsgs((m) => [...m, { role: 'error', text: errorMessage(e) }]);
    } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-[55vh] flex-col">
      {notConfigured && (
        <Notice tone="warn" className="mb-3" title="A IA ainda não está ligada"
          action={can(P.aiConfig) && <Link to="/configuracoes/ia" className="btn-outline btn-sm">Configurar a IA</Link>}>
          {can(P.aiConfig) ? 'Coloque a chave da Anthropic (Claude) e ligue a IA.' : 'Peça a quem administra a conta para ligar em Configurações › IA.'}
        </Notice>
      )}
      <div className="flex-1 space-y-3" aria-live="polite">
        {!msgs.length && (
          <div className="py-4 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-300"><Bot className="h-6 w-6" aria-hidden="true" /></div>
            <h2 className="mt-2 text-sm font-semibold">Pergunte sobre o seu dinheiro</h2>
            <p className="mx-auto max-w-md text-sm text-ink-faint">O Agente Financeiro usa os dados do CIFREN (caixa, contas, recorrentes) e mostra de onde tirou cada resposta.</p>
            <ul className="mx-auto mt-4 grid max-w-2xl gap-2 sm:grid-cols-2">
              {SUGGESTED.map((s) => <li key={s}><button type="button" className="focus-ring w-full rounded-app-sm border border-line px-3 py-2 text-left text-sm hover:border-accent hover:bg-accent/5" onClick={() => ask(s)}>{s}</button></li>)}
            </ul>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cx('max-w-[90%] rounded-app px-4 py-2.5 text-sm sm:max-w-[75%]',
              m.role === 'user' ? 'bg-primary text-primary-fg' : m.role === 'error' ? 'border border-danger/30 bg-danger-soft text-danger' : 'border border-line bg-muted')}>
              <span className="sr-only">{m.role === 'user' ? 'Você: ' : 'Assistente: '}</span>
              <p className="whitespace-pre-line">{m.text}</p>
              {m.sources?.length > 0 && (
                <div className="mt-2 border-t border-line pt-2 text-xs text-ink-soft">
                  <div className="flex items-center gap-1 font-medium"><BookOpen className="h-3 w-3" aria-hidden="true" /> Fontes{m.period && <span className="font-normal text-ink-faint"> · período {typeof m.period === 'string' ? m.period : `${m.period.from || ''} a ${m.period.to || ''}`}</span>}</div>
                  <ul className="mt-0.5 list-disc pl-4">{m.sources.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-sm text-ink-faint" role="status"><Spinner /> Pensando…</div>}
        <div ref={end} />
      </div>
      <form className="sticky bottom-20 mt-4 flex gap-2 bg-surface md:bottom-0" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <label htmlFor="ai-q" className="sr-only">Sua pergunta</label>
        <input id="ai-q" className="input flex-1" placeholder="Escreva sua pergunta…" value={q} onChange={(e) => setQ(e.target.value)} maxLength={1000} autoComplete="off" />
        <button type="submit" className="btn-primary" disabled={busy || !q.trim()} aria-label="Enviar pergunta"><Send className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Perguntar</span></button>
      </form>
      <p className="mt-2 text-[11px] text-ink-faint">As respostas da IA podem ter erros. Confira os números antes de decidir. A conversa não fica salva no aparelho.</p>
    </div>
  );
}

function Insights() {
  const { can } = useAuth();
  const onError = useApiError();
  const { data, error, loading, reload } = useAsync(() => api.get('/insights'), []);
  const [ai, setAi] = useState(null);
  const [busy, setBusy] = useState(false);
  const gen = async () => {
    setBusy(true);
    try { const r = await api.post('/ai/insights'); setAi({ items: r?.items || [], ai: r?.ai !== false }); } catch (e) { onError(e); } finally { setBusy(false); }
  };
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const items = ai ? ai.items : data?.items || [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-faint">{ai ? (ai.ai ? 'Análise escrita pela IA a partir dos seus dados.' : 'A IA não respondeu; mostrando os avisos calculados por regras.') : 'Avisos calculados pelo CIFREN com regras simples (não usa IA).'}</p>
        {can(P.aiUse) && <button type="button" className="btn-outline btn-sm" onClick={gen} disabled={busy}>{busy ? <Spinner /> : <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" aria-hidden="true" />} Analisar com IA</button>}
      </div>
      {!items.length ? <EmptyState icon={Lightbulb} title="Nenhum aviso agora">Tudo parece em ordem.</EmptyState>
        : <ul className="space-y-2">{items.map((it, i) => <li key={i}><InsightCard it={it} /></li>)}</ul>}
    </div>
  );
}

export default function Assistant() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabs = [
    can(P.aiUse) && { value: 'chat', label: 'Agente Financeiro', icon: MessageSquare },
    { value: 'insights', label: 'Insights', icon: Lightbulb },
  ].filter(Boolean);
  const asked = params.get('aba');
  const tab = tabs.some((t) => t.value === asked) ? asked : tabs[0].value;
  return (
    <div>
      <PageHeader title="Assistente IA" icon={Sparkles} subtitle="Pergunte em português e veja riscos e oportunidades do seu caixa." />
      <div className="card">
        <Tabs label="Assistente" tabs={tabs} value={tab} onChange={(v) => setParams({ aba: v }, { replace: true })} className="px-2" />
        <div className="p-4" role="tabpanel">{tab === 'chat' ? <Chat /> : <Insights />}</div>
      </div>
    </div>
  );
}
