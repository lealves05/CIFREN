import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LineChart, Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, qs } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { P } from '../../lib/permissions';
import { money, moneyCompact, monthShort, monthLong } from '../../lib/format';
import { PageHeader, Loading, ErrorState, EmptyState, cx } from '../../components/ui';
import { Notice, Panel } from '../../components/kit';

const C = { rin: '#0b7575', fin: '#5fd3d3', rout: '#c2410c', fout: '#fdba74' };

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs">
      <div className="font-semibold">{monthLong(label)}</div>
      {payload.map((p) => <div key={p.dataKey} className="tabular-nums" style={{ color: p.color }}>{p.name}: {money(p.value)}</div>)}
    </div>
  );
}

export default function CashFlow() {
  const { companyId, can } = useAuth();
  const y = new Date().getFullYear();
  const [from, setFrom] = useState(`${y}-01`);
  const [to, setTo] = useState(`${y}-12`);
  const { data, error, loading, reload } = useAsync(() => api.get(`/reports/cashflow${qs({ from, to, company_id: companyId })}`), [from, to, companyId]);
  const months = data?.months || [];
  const exportHref = `/api/export/cashflow.xlsx${qs({ from, to, company_id: companyId })}`;
  return (
    <div>
      <PageHeader title="Fluxo de caixa" icon={LineChart} subtitle="Previsto × realizado, mês a mês."
        actions={can(P.reportsView) && <a href={exportHref} className="btn-outline" download><Download className="h-4 w-4" aria-hidden="true" /> Baixar planilha</a>} />
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <div><label htmlFor="cf-de" className="label">De</label><input id="cf-de" type="month" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label htmlFor="cf-ate" className="label">Até</label><input id="cf-ate" type="month" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
        {data?.opening_balance != null && <p className="pb-2 text-sm text-ink-soft">Saldo inicial: <strong className="tabular-nums">{money(data.opening_balance)}</strong></p>}
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} className="card" /> : !months.length ? <EmptyState className="card" title="Sem dados no período" /> : (
        <div className="space-y-4">
          <Panel title="Entradas e saídas por mês">
            <p className="sr-only">Gráfico de barras com entradas e saídas realizadas e previstas por mês. Os valores estão na tabela abaixo.</p>
            <div className="h-64 text-ink-faint" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} vertical={false} />
                  <XAxis dataKey="month" tickFormatter={monthShort} tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={moneyCompact} tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} width={70} />
                  <Tooltip content={<Tip />} cursor={{ fill: 'currentColor', fillOpacity: 0.06 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="realized_in" name="Entrou (realizado)" fill={C.rin} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="forecast_in" name="Entrada prevista" fill={C.fin} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="realized_out" name="Saiu (realizado)" fill={C.rout} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="forecast_out" name="Saída prevista" fill={C.fout} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <div className="card overflow-x-auto">
            <table className="table-clean min-w-[720px]">
              <caption className="sr-only">Fluxo de caixa previsto e realizado por mês</caption>
              <thead>
                <tr><th scope="col">Mês</th><th scope="col" className="text-right">Entrou</th><th scope="col" className="text-right">Saiu</th><th scope="col" className="text-right">Saldo realizado</th>
                  <th scope="col" className="text-right">Entrada prevista</th><th scope="col" className="text-right">Saída prevista</th><th scope="col" className="text-right">Saldo previsto</th></tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month}>
                    <th scope="row" className="px-4 py-3 text-left font-medium">{monthShort(m.month)}</th>
                    <td className="text-right tabular-nums text-positive">{money(m.realized_in)}</td>
                    <td className="text-right tabular-nums text-danger">{money(m.realized_out)}</td>
                    <td className={cx('text-right font-medium tabular-nums', m.realized_balance < 0 && 'text-danger')}>{money(m.realized_balance)}</td>
                    <td className="text-right tabular-nums text-ink-soft">{money(m.forecast_in)}</td>
                    <td className="text-right tabular-nums text-ink-soft">{money(m.forecast_out)}</td>
                    <td className={cx('text-right font-medium tabular-nums', m.forecast_balance < 0 && 'text-danger')}>{money(m.forecast_balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(data?.notes || []).map((n) => <Notice key={n}>{n}</Notice>)}
        </div>
      )}
    </div>
  );
}
