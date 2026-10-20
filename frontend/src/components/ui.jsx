import { useId } from 'react';
import { Loader2, Inbox, AlertTriangle, Lock, RefreshCw } from 'lucide-react';
import { errorMessage, isFeatureDisabled } from '../lib/api';

export const cx = (...c) => c.filter(Boolean).join(' ');

/** Rótulo + campo + dica/erro, com ids ligados para leitores de tela. */
export function Field({ label, hint, error, required, className, children, id: idProp }) {
  const auto = useId();
  const id = idProp || auto;
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cx('block', className)}>
      {label && (
        <label htmlFor={id} className="label">
          {label}{required && <span className="text-danger" aria-hidden="true"> *</span>}
        </label>
      )}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, required })}
      {error
        ? <p id={`${id}-err`} className="mt-1 text-xs text-danger">{error}</p>
        : hint && <p id={`${id}-hint`} className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

const ctl = (p) => ('value' in p ? { ...p, value: p.value ?? '' } : p);

export const Input = ({ label, hint, error, className, required, ...p }) => (
  <Field label={label} hint={hint} error={error} required={required} className={className}>
    {(a) => <input className="input" {...a} {...ctl(p)} />}
  </Field>
);

export const Textarea = ({ label, hint, error, className, rows = 3, required, ...p }) => (
  <Field label={label} hint={hint} error={error} required={required} className={className}>
    {(a) => <textarea className="input" rows={rows} {...a} {...ctl(p)} />}
  </Field>
);

export const Select = ({ label, hint, error, className, children, required, ...p }) => (
  <Field label={label} hint={hint} error={error} required={required} className={className}>
    {(a) => <select className="input" {...a} {...ctl(p)}>{children}</select>}
  </Field>
);

export function Toggle({ checked, onChange, label, hint, disabled, badge }) {
  const id = useId();
  return (
    <div className={cx('flex items-start justify-between gap-4 py-1.5', disabled && 'opacity-60')}>
      <label htmlFor={id} className={cx('min-w-0', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">{label}{badge}</span>
        {hint && <span className="block text-xs text-ink-faint">{hint}</span>}
      </label>
      <button id={id} type="button" role="switch" aria-checked={!!checked} disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cx('focus-ring relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-accent' : 'bg-line')}>
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </div>
  );
}

export function Spinner({ className = 'h-4 w-4' }) {
  return <Loader2 className={cx('animate-spin', className)} aria-hidden="true" />;
}

export function Loading({ label = 'Carregando…', className }) {
  return (
    <div role="status" className={cx('flex items-center justify-center gap-2 py-12 text-sm text-ink-faint', className)}>
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, children, action, className }) {
  return (
    <div className={cx('flex flex-col items-center px-4 py-12 text-center', className)}>
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-muted text-ink-faint"><Icon className="h-6 w-6" aria-hidden="true" /></div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {children && <div className="mt-1 max-w-sm text-sm text-ink-faint">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function FeatureDisabledNotice({ className }) {
  return (
    <EmptyState icon={Lock} title="Módulo fora do seu plano" className={className}>
      Esta parte do CIFREN não está incluída no plano contratado. Para usar, fale com o responsável pela conta ou com o suporte LORLER.
    </EmptyState>
  );
}

/** Erro de carregamento com botão de tentar de novo. */
export function ErrorState({ error, onRetry, className }) {
  if (isFeatureDisabled(error)) return <FeatureDisabledNotice className={className} />;
  return (
    <div role="alert" className={cx('flex flex-col items-center px-4 py-10 text-center', className)}>
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-danger-soft text-danger"><AlertTriangle className="h-6 w-6" aria-hidden="true" /></div>
      <h3 className="text-sm font-semibold">Não foi possível carregar</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-faint">{errorMessage(error)}</p>
      {onRetry && <button type="button" className="btn-outline mt-4" onClick={onRetry}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Tentar de novo</button>}
    </div>
  );
}

export function InlineError({ error }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-app-sm border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{typeof error === 'string' ? error : errorMessage(error)}</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
          {Icon && <Icon className="h-6 w-6 text-accent" aria-hidden="true" />}{title}
        </h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-faint">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Abas acessíveis (role=tablist), navegáveis por setas. */
export function Tabs({ tabs, value, onChange, label, className }) {
  const onKey = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next].value);
    e.currentTarget.parentElement?.children[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cx('flex gap-1 overflow-x-auto border-b border-line', className)}>
      {tabs.map((t, i) => {
        const active = t.value === value;
        return (
          <button key={t.value} type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.value)} onKeyDown={(e) => onKey(e, i)}
            className={cx('focus-ring -mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition',
              active ? 'border-accent text-ink' : 'border-transparent text-ink-faint hover:text-ink')}>
            {t.icon && <t.icon className="h-4 w-4" aria-hidden="true" />}{t.label}
            {t.count != null && <span className="chip bg-muted text-ink-soft">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

const BADGE = {
  neutral: 'bg-muted text-ink-soft',
  positive: 'bg-accent/15 text-positive',
  danger: 'bg-danger-soft text-danger',
  warn: 'bg-warn-soft text-warn',
  brand: 'bg-brand/10 text-ink dark:bg-brand-soft',
};
export const Badge = ({ tone = 'neutral', children, className }) => (
  <span className={cx('chip', BADGE[tone], className)}>{children}</span>
);

export function LoadMore({ hasMore, loading, onClick }) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center py-4">
      <button type="button" className="btn-outline" onClick={onClick} disabled={loading}>
        {loading && <Spinner />} Carregar mais
      </button>
    </div>
  );
}

export function Avatar({ name = '', className }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
  return (
    <span aria-hidden="true" className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/20 text-xs font-semibold text-positive', className)}>
      {initials}
    </span>
  );
}

/** Botão de formulário com estado de carregamento. */
export function SubmitButton({ loading, children, className = 'btn-primary', ...p }) {
  return (
    <button type="submit" className={className} disabled={loading || p.disabled} aria-busy={loading || undefined} {...p}>
      {loading && <Spinner />}{children}
    </button>
  );
}
