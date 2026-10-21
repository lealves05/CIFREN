import { useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { qs } from '../../lib/api';
import { P } from '../../lib/permissions';
import { monthRange } from '../../lib/format';
import { PageHeader } from '../../components/ui';
import { Notice, Panel } from '../../components/kit';

const DL = ({ href, children, icon: Icon = Download }) => <a href={href} download className="btn-outline"><Icon className="h-4 w-4" aria-hidden="true" />{children}</a>;

export default function ExportPage() {
  const { can, companyId } = useAuth();
  const r = monthRange();
  const [from, setFrom] = useState(r.from);
  const [to, setTo] = useState(r.to);
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('todos');
  const year = Number(from.slice(0, 4)) || new Date().getFullYear();
  const base = { from, to, company_id: companyId };
  return (
    <div>
      <PageHeader title="Exportar" icon={Download} subtitle="Baixe planilhas para analisar ou enviar ao contador." />
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <div><label htmlFor="ex-de" className="label">De</label><input id="ex-de" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label htmlFor="ex-ate" className="label">Até</label><input id="ex-ate" type="date" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {can(P.reportsView) && (
          <Panel title="Contas a pagar e a receber" subtitle="Lista com vencimento, valor, situação e categoria.">
            <div className="mb-3 flex flex-wrap gap-3">
              <select className="input w-auto" aria-label="Tipo" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Pagar e receber</option><option value="pagar">Só a pagar</option><option value="receber">Só a receber</option></select>
              <select className="input w-auto" aria-label="Situação" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="todos">Todas</option><option value="abertos">Abertas</option><option value="vencidos">Vencidas</option><option value="pagos">Pagas</option><option value="cancelados">Canceladas</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <DL href={`/api/export/titles.xlsx${qs({ ...base, kind, status })}`} icon={FileSpreadsheet}>Excel (XLSX)</DL>
              <DL href={`/api/export/titles.csv${qs({ ...base, kind, status })}`} icon={FileText}>CSV</DL>
            </div>
          </Panel>
        )}
        {can(P.reportsView) && (
          <Panel title="Relatórios" subtitle={`DRE de ${year} e fluxo de caixa do período.`}>
            <div className="flex flex-wrap gap-2">
              <DL href={`/api/export/dre.xlsx${qs({ year, basis: 'competencia', company_id: companyId })}`} icon={FileSpreadsheet}>DRE (competência)</DL>
              <DL href={`/api/export/dre.xlsx${qs({ year, basis: 'caixa', company_id: companyId })}`} icon={FileSpreadsheet}>DRE (caixa)</DL>
              <DL href={`/api/export/cashflow.xlsx${qs({ from: from.slice(0, 7), to: to.slice(0, 7), company_id: companyId })}`} icon={FileSpreadsheet}>Fluxo de caixa</DL>
            </div>
          </Panel>
        )}
        {can(P.exportAccounting) && (
          <Panel title="Exportação contábil" subtitle="Lançamentos: data; conta débito; conta crédito; valor; histórico; documento." className="lg:col-span-2">
            <Notice tone="warn" className="mb-3">
              Arquivo genérico para o contador importar no sistema dele. <strong>Não é SPED</strong> nem substitui a escrituração oficial.
            </Notice>
            <DL href={`/api/export/contabil.csv${qs({ from, to, company_id: companyId })}`} icon={FileText}>Baixar CSV contábil</DL>
          </Panel>
        )}
      </div>
    </div>
  );
}
