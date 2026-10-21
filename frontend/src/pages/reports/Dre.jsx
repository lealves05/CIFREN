import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Table2, Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, qs } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { P } from '../../lib/permissions';
import { money, monthShort } from '../../lib/format';
import { PageHeader, Loading, ErrorState, EmptyState, cx } from '../../components/ui';
import { Notice, Segmented } from '../../components/kit';

const rowCls = (r) => (r.type === 'subtotal' ? 'bg-muted/70 font-semibold' : r.type === 'group' ? 'font-semibold' : 'text-ink-soft');
const valCls = (v, r) => cx('whitespace-nowrap text-right tabular-nums', r.type !== 'category' && v < 0 && 'text-danger', r.key === 'resultado_liquido' && (v < 0 ? 'text-danger' : 'text-positive'));

export default function Dre() {
  const { companyId, can } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [basis, setBasis] = useState('competencia');
  const [month, setMonth] = useState('total');
  const { data, error, loading, reload } = useAsync(() => api.get(`/reports/dre${qs({ year, basis, company_id: companyId })}`), [year, basis, companyId]);
  const months = data?.months || [];
  const rows = useMemo(() => data?.rows || [], [data]);
  const noGroup = rows.filter((r) => r.parent === 'sem_grupo' || r.key === 'sem_grupo');
  const noGroupTotal = rows.find((r) => r.key === 'sem_grupo')?.total;
  const hasNoGroup = noGroup.some((r) => r.type === 'category') || (noGroupTotal != null && Number(noGroupTotal) !== 0);
  const mi = months.indexOf(month);
  const years = [0, -1, -2].map((d) => new Date().getFullYear() + d);
  return (
    <div>
      <PageHeader title="DRE e resultados" icon={Table2} subtitle="Quanto entrou, quanto custou e quanto sobrou — por mês."
        actions={can(P.reportsView) && <a href={`/api/export/dre.xlsx${qs({ year, basis, company_id: companyId })}`} className="btn-outline" download><Download className="h-4 w-4" aria-hidden="true" /> Baixar planilha</a>} />
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <div><label htmlFor="dre-y" className="label">Ano</label>
          <select id="dre-y" className="input w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
        <div><span className="label" id="dre-b">Regime</span>
          <Segmented label="Regime" value={basis} onChange={setBasis} options={[{ value: 'competencia', label: 'Competência' }, { value: 'caixa', label: 'Caixa' }]} /></div>
        <p className="pb-2 text-xs text-ink-faint">{basis === 'competencia' ? 'Pelo mês a que a receita/despesa se refere.' : 'Pelo dia em que o dinheiro entrou ou saiu.'}</p>
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} className="card" /> : !rows.length ? <EmptyState className="card" title="Sem lançamentos neste ano" /> : (
        <div className="space-y-4">
          {hasNoGroup && (
            <Notice tone="warn" title="Há categorias sem grupo no DRE"
              action={can(P.registryManage) && <Link to="/cadastros?aba=categorias" className="btn-outline btn-sm">Ajustar categorias</Link>}>
              Os valores delas aparecem em “Sem grupo” e não entram nos subtotais. Escolha o “Grupo no DRE” de cada categoria em Cadastros › Categorias.
            </Notice>
          )}

          {/* Celular: um mês por vez */}
          <div className="md:hidden">
            <label htmlFor="dre-m" className="label">Mês</label>
            <select id="dre-m" className="input mb-3" value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="total">Ano inteiro</option>
              {months.map((m) => <option key={m} value={m}>{monthShort(m)}</option>)}
            </select>
            <dl className="card divide-y divide-line">
              {rows.map((r) => {
                const v = mi >= 0 ? r.values?.[mi] : r.total;
                return (
                  <div key={r.key} className={cx('flex justify-between gap-3 px-4 py-2.5 text-sm', rowCls(r), r.type === 'category' && 'pl-7')}>
                    <dt className="min-w-0">{r.label}</dt><dd className={valCls(v, r)}>{money(v)}</dd>
                  </div>
                );
              })}
            </dl>
          </div>

          {/* Computador: tabela completa */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="table-clean min-w-[1100px] text-xs lg:text-sm">
              <caption className="sr-only">DRE gerencial de {year}</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 bg-surface">Linha</th>
                  {months.map((m) => <th key={m} scope="col" className="text-right">{monthShort(m)}</th>)}
                  <th scope="col" className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className={rowCls(r)}>
                    <th scope="row" className={cx('sticky left-0 z-10 bg-surface px-4 py-2.5 text-left', r.type === 'category' && 'pl-8 font-normal', r.type === 'subtotal' && 'bg-muted')}>{r.label}</th>
                    {months.map((m, i) => <td key={m} className={valCls(r.values?.[i], r)}>{money(r.values?.[i])}</td>)}
                    <td className={cx(valCls(r.total, r), 'font-semibold')}>{money(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Notice title="Premissas">
            <ul className="list-disc space-y-0.5 pl-4">{(data?.premises || ['DRE gerencial; não substitui o demonstrativo contábil oficial.']).map((p) => <li key={p}>{p}</li>)}</ul>
          </Notice>
        </div>
      )}
    </div>
  );
}
