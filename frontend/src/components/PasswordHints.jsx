import { Check, Circle } from 'lucide-react';
import { passwordChecks } from '../lib/masks';
import { cx } from './ui';

export default function PasswordHints({ value, id }) {
  return (
    <ul id={id} className="mt-2 space-y-1" aria-label="Regras da senha">
      {passwordChecks(value).map((c) => (
        <li key={c.label} className={cx('flex items-center gap-1.5 text-xs', c.ok ? 'text-positive' : 'text-ink-faint')}>
          {c.ok ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5" aria-hidden="true" />}
          {c.label}<span className="sr-only">{c.ok ? ': ok' : ': pendente'}</span>
        </li>
      ))}
    </ul>
  );
}
