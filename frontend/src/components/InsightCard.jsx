import { Link } from 'react-router-dom';
import { AlertTriangle, TrendingUp, Eye } from 'lucide-react';
import { cx } from './ui';

export const INSIGHT = {
  risco: { label: 'Risco', icon: AlertTriangle, cls: 'border-danger/30 bg-danger-soft text-danger' },
  atencao: { label: 'Atenção', icon: Eye, cls: 'border-warn/40 bg-warn-soft text-warn' },
  oportunidade: { label: 'Oportunidade', icon: TrendingUp, cls: 'border-accent/40 bg-accent/10 text-positive' },
};

export default function InsightCard({ it }) {
  const k = INSIGHT[it.level] || INSIGHT.atencao;
  const body = (
    <>
      <k.icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold"><span className="sr-only">{k.label}: </span>{it.title}</span>
        {it.detail && <span className="block text-sm text-ink-soft">{it.detail}</span>}
      </span>
    </>
  );
  const cls = cx('flex items-start gap-2 rounded-app-sm border px-3 py-2.5', k.cls);
  return it.link && it.link.startsWith('/') ? <Link to={it.link} className={cx(cls, 'hover:brightness-95')}>{body}</Link> : <div className={cls}>{body}</div>;
}

