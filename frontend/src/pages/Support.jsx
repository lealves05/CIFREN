import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, LifeBuoy, Map as MapIcon, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { P } from '../lib/permissions';
import { supportChat, assistantName } from '../lib/supportChat';
import { PageHeader } from '../components/ui';
import { AssistantLauncher, AssistantPanel } from '../components/AssistantChat';

/**
 * Suporte do CIFREN: conversa com o assistente da Central de Atendimento LORLER (IA, com atendente da equipe quando precisa).
 * `/suporte?chat=1` já abre o chat. O "Assistente IA" do menu é outro recurso: responde sobre os dados financeiros da organização.
 */
export default function Support() {
  const { user, can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [name, setName] = useState('');
  const chatOpen = params.get('chat') === '1';
  const setChat = useCallback((on) => setParams((p) => {
    const q = new URLSearchParams(p); if (on) q.set('chat', '1'); else q.delete('chat'); return q;
  }, { replace: true }), [setParams]);
  const close = useCallback(() => setChat(false), [setChat]);
  useEffect(() => { let alive = true; assistantName().then((n) => { if (alive) setName(n); }); return () => { alive = false; }; }, []);

  const row = (to, Icon, title, text) => (
    <Link to={to} className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted">
      <Icon className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
      <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-ink-faint">{text}</span></span>
      <ChevronRight className="h-4 w-4 text-ink-faint" aria-hidden="true" />
    </Link>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Suporte" icon={LifeBuoy} subtitle="Tire dúvidas sobre o CIFREN, a assinatura e as configurações com a equipe LORLER." />
      <AssistantLauncher name={name} onOpen={() => setChat(true)} />
      {chatOpen && <AssistantPanel client={supportChat} userName={user?.name} onClose={close} />}

      <section aria-labelledby="outras-ajudas">
        <h2 id="outras-ajudas" className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-ink-faint">Outras formas de ajuda</h2>
        <div className="card divide-y divide-line">
          {row('/visao-geral', MapIcon, 'Visão geral do CIFREN', 'Mapa de tudo o que o sistema faz e onde fica cada função.')}
          {can(P.aiUse, P.dashboard) && row('/assistente', Sparkles, 'Assistente IA (financeiro)', 'Perguntas sobre os números da sua organização: caixa, contas, atrasos e gastos.')}
        </div>
        <p className="mt-3 px-1 text-xs text-ink-faint">
          Precisa falar com uma pessoa? Peça no chat: o assistente chama alguém da equipe LORLER no horário de atendimento. Nunca pedimos senhas nem códigos.
        </p>
      </section>
    </div>
  );
}
