import { Field } from './ui';

const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Campo de valor em reais com máscara de centavos: digitar 123456 mostra 1.234,56.
 * value/onChange trabalham com número (reais) ou null quando vazio.
 */
export default function MoneyInput({ label, value, onChange, hint, error, required, className, allowEmpty = true, ...p }) {
  const display = value == null || value === '' ? '' : fmt.format(Number(value) || 0);
  const handle = (e) => {
    const digits = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 13);
    if (!digits) { onChange(allowEmpty ? null : 0); return; }
    onChange(Number(digits) / 100);
  };
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(a) => (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-faint" aria-hidden="true">R$</span>
          <input type="text" inputMode="numeric" autoComplete="off" className="input pl-10 text-right tabular-nums"
            placeholder="0,00" value={display} onChange={handle} {...a} {...p} />
        </div>
      )}
    </Field>
  );
}
