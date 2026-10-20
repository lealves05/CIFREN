import { cx } from './ui';

export function Mark({ className = 'h-9 w-9' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#0a1e37" />
      <path d="M44 21.5A15 15 0 1 0 44 42.5" fill="none" stroke="#14a3a3" strokeWidth="7" strokeLinecap="round" />
      <circle cx="45" cy="32" r="4" fill="#f28c28" />
    </svg>
  );
}

export function Logo({ light, compact, className }) {
  return (
    <div className={cx('flex min-w-0 items-center gap-2.5', className)}>
      <Mark className={cx('h-9 w-9 shrink-0', light && 'rounded-[10px] ring-1 ring-white/15')} />
      {!compact && (
        <div className="min-w-0 leading-tight">
          <div className="text-base font-bold tracking-wide">CIFREN</div>
          <div className={cx('whitespace-nowrap text-[11px]', light ? 'text-brand-fg/70' : 'text-ink-faint')}>Gestão Financeira · LORLER</div>
        </div>
      )}
    </div>
  );
}
