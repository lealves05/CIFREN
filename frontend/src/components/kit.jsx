import { Info, AlertTriangle, ShieldAlert } from 'lucide-react';
import { cx } from './ui';

/** Cartão com título e ações à direita. */
export function Panel({ title, subtitle, actions, children, className, bodyClass = 'p-4', id }) {
  return (
    <section className={cx('card', className)} aria-labelledby={title ? id || undefined : undefined}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && <h2 id={id} className="text-sm font-semibold">{title}</h2>}
            {subtitle && <p className="text-xs text-ink-faint">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

const NOTICE = {
  info: { cls: 'border-accent/40 bg-accent/10 text-ink', icon: Info },
  warn: { cls: 'border-warn/40 bg-warn-soft text-warn', icon: AlertTriangle },
  danger: { cls: 'border-danger/30 bg-danger-soft text-danger', icon: ShieldAlert },
};
/** Caixa de aviso (informação, atenção ou perigo). */
export function Notice({ tone = 'info', title, children, className, action }) {
  const n = NOTICE[tone];
  return (
    <div role={tone === 'info' ? 'note' : 'alert'} className={cx('flex items-start gap-2 rounded-app-sm border px-3 py-2.5 text-sm', n.cls, className)}>
      <n.icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

/** Número de destaque. */
export function Stat({ label, value, sub, tone }) {
  const t = { danger: 'text-danger', positive: 'text-positive', warn: 'text-warn' }[tone] || '';
  return (
    <div className="rounded-app-sm bg-muted p-3">
      <div className="text-xs text-ink-faint">{label}</div>
      <div className={cx('mt-0.5 text-lg font-semibold tabular-nums', t)}>{value}</div>
      {sub && <div className="text-xs text-ink-faint">{sub}</div>}
    </div>
  );
}

/** Linha "rótulo: valor" em listas de definição. */
export function DRow({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{children ?? '—'}</dd>
    </div>
  );
}

/** Botão segmentado (escolha única), acessível como grupo de rádios. */
export function Segmented({ value, onChange, options, label, className }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex rounded-app-sm border border-line bg-muted p-0.5', className)}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx('focus-ring rounded-[8px] px-3 py-1.5 text-sm font-medium transition', value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-faint hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
