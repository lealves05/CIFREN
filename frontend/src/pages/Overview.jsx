import { Link } from 'react-router-dom';
import {
  Map as MapIcon, Users, FileInput, Boxes, Bot, ShieldCheck, Send, ArrowRight, ArrowDown, CheckCircle2, Settings2, Clock, Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { canOpen } from '../lib/nav';
import { P } from '../lib/permissions';
import { PageHeader, cx } from '../components/ui';

/*
 * Mapa clicável da arquitetura do CIFREN: entradas à esquerda, módulos no centro,
 * agentes de IA à direita, segurança e saídas embaixo. Cada item leva à tela e mostra
 * se está disponível, se precisa configurar ou se vem em breve.
 */

const TONES = {
  users: { box: 'border-slate-400/50 bg-slate-500/5', head: 'bg-slate-700 text-white dark:bg-slate-600', item: 'hover:border-slate-400' },
  inputs: { box: 'border-sky-500/40 bg-sky-500/5', head: 'bg-sky-700 text-white dark:bg-sky-600', item: 'hover:border-sky-500' },
  modules: { box: 'border-teal-500/40 bg-teal-500/5', head: 'bg-teal-700 text-white dark:bg-teal-600', item: 'hover:border-teal-500' },
  agents: { box: 'border-violet-500/40 bg-violet-500/5', head: 'bg-violet-700 text-white dark:bg-violet-600', item: 'hover:border-violet-500' },
  security: { box: 'border-rose-500/40 bg-rose-500/5', head: 'bg-rose-700 text-white dark:bg-rose-600', item: 'hover:border-rose-500' },
  outputs: { box: 'border-emerald-500/40 bg-emerald-500/5', head: 'bg-emerald-700 text-white dark:bg-emerald-600', item: 'hover:border-emerald-500' },
};

const STATUS = {
  ok: { label: 'disponível', cls: 'bg-accent/15 text-positive', icon: CheckCircle2 },
  config: { label: 'configurar', cls: 'bg-warn-soft text-warn', icon: Settings2 },
  soon: { label: 'em breve', cls: 'bg-muted text-ink-faint', icon: Clock },
  locked: { label: 'sem acesso', cls: 'bg-muted text-ink-faint', icon: Lock },
};

function Item({ it, tone }) {
  const s = STATUS[it.status];
  const body = (
    <>
      <span className="block text-sm font-medium leading-snug">{it.label}</span>
      {it.desc && <span className="block text-xs text-ink-faint">{it.desc}</span>}
      {!it.noStatus && <span className={cx('chip mt-1.5 w-fit', s.cls)}><s.icon className="h-3 w-3" aria-hidden="true" />{s.label}</span>}
    </>
  );
  const cls = 'flex h-full flex-col items-start rounded-app-sm border border-line bg-surface px-3 py-2.5 text-left';
  if (it.status === 'soon' || it.status === 'locked' || !it.to) return <li><div className={cx(cls, 'opacity-75')}>{body}</div></li>;
  return <li><Link to={it.to} className={cx(cls, 'transition hover:shadow-soft', TONES[tone].item)}>{body}</Link></li>;
}

function Block({ title, icon: Icon, tone, items, cols, className }) {
  const t = TONES[tone];
  return (
    <section aria-label={title} className={cx('flex flex-col overflow-hidden rounded-app border', t.box, className)}>
      <h2 className={cx('flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider', t.head)}>
        <Icon className="h-4 w-4" aria-hidden="true" />{title}
      </h2>
      <ul className={cx('grid flex-1 content-start gap-2 p-3', cols)}>
        {items.map((it) => <Item key={it.label} it={it} tone={tone} />)}
      </ul>
    </section>
  );
}

const Arrow = ({ down, className }) => (
  <div className={cx('flex items-center justify-center text-ink-faint', className)} aria-hidden="true">
    {down ? <ArrowDown className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
  </div>
);

export default function Overview() {
  const { can, moduleOn } = useAuth();
  const ai = useAsync(() => (can(P.aiConfig) ? api.get('/ai/settings').catch(() => null) : Promise.resolve(null)), []);
  const mail = useAsync(() => (can(P.notifyConfig) ? api.get('/notifications/email-settings').catch(() => null) : Promise.resolve(null)), []);

  // IA: só dá para saber o estado para quem configura; os demais veem "disponível".
  const aiReady = ai.data ? !!(ai.data.enabled && ai.data.key_set) : true;
  const mailReady = mail.data ? !!(mail.data.configured ?? mail.data.host) : true;
  const st = (to, { needsAi, needsMail, soon } = {}) => {
    if (soon) return 'soon';
    if (to && !canOpen(to.split('?')[0], can, moduleOn)) return 'locked';
    if (needsAi && !aiReady) return 'config';
    if (needsMail && !mailReady) return 'config';
    return 'ok';
  };
  const mk = (label, to, opts = {}) => ({ label, to: opts.configTo && st(to, opts) === 'config' ? opts.configTo : to, desc: opts.desc, status: st(to, opts) });
  const aiCfg = { needsAi: true, configTo: can(P.aiConfig) ? '/configuracoes/ia' : undefined };

  const users = ['Administrador', 'Gestor', 'Financeiro', 'Aprovador', 'Colaborador', 'Contador']
    .map((r) => { const x = mk(r, '/usuarios?aba=perfis'); return { ...x, noStatus: x.status === 'ok' }; });
  const inputs = [
    mk('Notas fiscais', '/documentos', { desc: 'XML, PDF, foto, QR da NFC-e e leitura por IA' }),
    mk('Extratos bancários', '/conciliacao', { desc: 'OFX ou CSV para conciliar' }),
    mk('Boletos e comprovantes', '/documentos', { desc: 'Linha digitável e Pix copia-e-cola' }),
    mk('Movimentações dos sistemas LORLER', '/configuracoes/integracoes', { desc: 'ORBI, TORVEN, RUSTEN, APOLVEN' }),
    mk('Lançamentos manuais com aprovação', '/pagar', { desc: 'Acima da alçada, alguém aprova' }),
  ];
  const modules = [
    mk('Contas a pagar', '/pagar', { desc: 'com aprovações' }),
    mk('Contas a receber', '/receber'),
    mk('Conciliação bancária', '/conciliacao'),
    mk('Fluxo de caixa', '/relatorios/fluxo', { desc: 'previsto × realizado' }),
    mk('DRE e resultados', '/relatorios/dre'),
    mk('Centro de custos', '/relatorios/centros'),
    mk('Gestão de compras', '/compras', { desc: 'solicitação → pedido → faturar' }),
    mk('Despesas e reembolsos', '/despesas'),
    mk('Gestão de documentos', '/documentos'),
  ];
  const agents = [
    mk('Agente de Documentos', '/documentos', { ...aiCfg, desc: 'lê notas e fotos' }),
    mk('Agente Financeiro', '/assistente', { ...aiCfg, desc: 'responde perguntas no chat' }),
    mk('Agente de Compras', '/compras', { desc: 'sugere fornecedor pelo histórico' }),
    mk('Agente de Conciliação', '/conciliacao', { ...aiCfg, desc: 'sugere categoria e fornecedor' }),
    mk('Agente de Insights', '/assistente?aba=insights', { desc: 'riscos e oportunidades' }),
  ];
  const security = [
    mk('Verificação em 2 etapas', '/configuracoes/seguranca', { desc: 'pode exigir de todos' }),
    mk('Perfis personalizados', '/usuarios?aba=perfis'),
    mk('Acesso por empresa', '/usuarios'),
    mk('Permissões por função e campo', '/usuarios?aba=perfis', { desc: 'dados sensíveis mascarados' }),
    mk('Auditoria', '/auditoria'),
  ];
  const outputs = [
    mk('Relatórios', '/relatorios/fluxo'),
    mk('Dashboards', '/'),
    mk('Exportação contábil', '/relatorios/exportar', { desc: 'CSV/XLSX — não é SPED' }),
    mk('Notificações', '/configuracoes/notificacoes', { needsMail: true, desc: 'no sistema e por e-mail' }),
    { label: 'WhatsApp', desc: 'avisos pelo WhatsApp', status: 'soon' },
    mk('Integração LORLER', '/configuracoes/integracoes'),
    mk('Decisões com apoio da IA', '/assistente', aiCfg),
  ];

  return (
    <div>
      <PageHeader title="Visão geral do CIFREN" icon={MapIcon}
        subtitle="Como as informações entram, viram controle e saem como decisão. Toque num bloco para abrir a tela." />

      <Block title="Usuários" icon={Users} tone="users" items={users} cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" />
      <Arrow down className="py-2" />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_1.35fr_auto_1fr]">
        <Block title="Entradas de dados" icon={FileInput} tone="inputs" items={inputs} />
        <Arrow className="lg:flex [&>svg]:rotate-90 lg:[&>svg]:rotate-0" />
        <Block title="Módulos" icon={Boxes} tone="modules" items={modules} cols="sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" />
        <Arrow className="[&>svg]:rotate-90 lg:[&>svg]:rotate-0" />
        <Block title="Agentes de IA" icon={Bot} tone="agents" items={agents} />
      </div>
      <Arrow down className="py-2" />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Block title="Segurança" icon={ShieldCheck} tone="security" items={security} cols="sm:grid-cols-2" />
        <Block title="Saídas" icon={Send} tone="outputs" items={outputs} cols="sm:grid-cols-2" />
      </div>

      <p className="mt-4 text-xs text-ink-faint">
        “Configurar” indica algo que precisa de ajuste antes de usar (por exemplo, a chave da IA). “Sem acesso” aparece quando seu perfil não libera aquela parte.
      </p>
    </div>
  );
}
