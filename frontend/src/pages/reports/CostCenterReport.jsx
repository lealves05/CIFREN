import { useState } from 'react';
import { Target } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { money, thisMonth } from '../../lib/format';
import { PageHeader, Loading, ErrorState, EmptyState, cx } from '../../components/ui';

export default function CostCenterReport() {
  const [from, setFrom] = useState(thisMonth(-2));
  const [to, setTo] = useState(thisMonth());
  const { data, error, loading, reload } = useAsync(() => api.get(`/reports/cost-centers${qs({ from, to })}`), [from, to]);
  const items = data?.items || [];
  const max = Math.max(1, ...items.map((i) => Math.max(Number(i.expenses) || 0, Number(i.revenues) || 0)));
  const sum = (k) => items.reduce((a, i) => a + (Number(i[k]) || 0), 0);
  return (
    <div>
      <PageHeader title="Centros de custo" icon={Target} subtitle="Quanto cada área, loja ou projeto gastou e trouxe." />
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <div><label htmlFor="cc-de" className="label">De</label><input id="cc-de" type="month" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label htmlFor="cc-ate" className="label">Até</label><input id="cc-ate" type="month" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} className="card" /> : !items.length ? (
        <EmptyState className="card" icon={Target} title="Nada no período">Use centros de custo ao lançar as contas para ver este relatório.</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-clean min-w-[560px]">
            <caption className="sr-only">Resultado por centro de custo</caption>
            <thead><tr><th scope="col">Centro de custo</th><th scope="col" className="text-right">Despesas</th><th scope="col" className="text-right">Receitas</th><th scope="col" className="text-right">Resultado</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.cost_center?.id || 'none'}>
                  <th scope="row" className="px-4 py-3 text-left font-medium">
                    {i.cost_center?.name || <span className="italic text-ink-faint">Sem centro de custo</span>}
                    <div className="mt-1 flex h-1.5 gap-0.5" aria-hidden="true">
                      <div className="rounded-full bg-cta" style={{ width: `${(Number(i.expenses) / max) * 100}%` }} />
                    </div>
                  </th>
                  <td className="text-right tabular-nums text-danger">{money(i.expenses)}</td>
                  <td className="text-right tabular-nums text-positive">{money(i.revenues)}</td>
                  <td className={cx('text-right font-semibold tabular-nums', i.result < 0 && 'text-danger')}>{money(i.result)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="bg-muted/60 font-semibold"><td className="px-4 py-3">Total</td><td className="px-4 py-3 text-right tabular-nums">{money(sum('expenses'))}</td><td className="px-4 py-3 text-right tabular-nums">{money(sum('revenues'))}</td><td className="px-4 py-3 text-right tabular-nums">{money(sum('result'))}</td></tr></tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
