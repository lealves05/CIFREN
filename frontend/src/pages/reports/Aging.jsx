import { useState } from 'react';
import { AlarmClock } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { money, plural } from '../../lib/format';
import { PageHeader, Loading, ErrorState, cx } from '../../components/ui';
import { Panel, Segmented } from '../../components/kit';

export default function Aging() {
  const [kind, setKind] = useState('receber');
  const { data, error, loading, reload } = useAsync(() => api.get(`/reports/aging${qs({ kind })}`), [kind]);
  const buckets = data?.buckets || [];
  const top = data?.top || [];
  const max = Math.max(1, ...buckets.map((b) => Number(b.amount) || 0));
  return (
    <div>
      <PageHeader title="Inadimplência" icon={AlarmClock} subtitle="Quanto está atrasado e há quanto tempo." />
      <Segmented className="mb-4" label="Tipo" value={kind} onChange={setKind} options={[{ value: 'receber', label: 'Clientes que devem' }, { value: 'pagar', label: 'Contas que eu devo' }]} />
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} className="card" /> : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Por tempo de atraso">
            <ul className="space-y-3">
              {buckets.map((b, i) => (
                <li key={b.label}>
                  <div className="flex justify-between gap-2 text-sm"><span>{b.label}{b.n != null && <span className="text-ink-faint"> · {plural(b.n || 0, 'conta', 'contas')}</span>}</span><span className="font-medium tabular-nums">{money(b.amount)}</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div className={cx('h-full rounded-full', i === 0 ? 'bg-accent' : i >= 3 ? 'bg-danger' : 'bg-cta')} style={{ width: `${Math.max(1, (Number(b.amount) / max) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title={kind === 'receber' ? 'Quem mais deve' : 'Para quem mais devo'}>
            {!top.length ? <p className="py-6 text-center text-sm text-ink-faint">Ninguém em atraso. Ótimo!</p> : (
              <ol className="divide-y divide-line">
                {top.map((t, i) => (
                  <li key={i} className="flex justify-between gap-2 py-2.5 text-sm">
                    <span className="min-w-0 truncate">{i + 1}. {t.counterparty?.name || t.counterparty || 'Sem nome'} <span className="text-ink-faint">· {plural(t.n || 0, 'conta', 'contas')}</span></span>
                    <span className="font-semibold tabular-nums text-danger">{money(t.amount)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
