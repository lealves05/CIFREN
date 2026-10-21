import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardCheck, Check, X, Scale, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { api, qs, notifyCountsChanged } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useApiError } from '../lib/useApiError';
import { P } from '../lib/permissions';
import { money, dateTime } from '../lib/format';
import { PageHeader, Tabs, Loading, ErrorState, EmptyState, Badge, Spinner, cx } from '../components/ui';
import { useTitleActions } from '../components/titles/useTitleActions';

const STATUS_TABS = [
  { value: 'pendente', label: 'Pendentes' },
  { value: 'aprovado', label: 'Aprovadas' },
  { value: 'reprovado', label: 'Reprovadas' },
  { value: 'todos', label: 'Todas' },
];
export const ENTITY = {
  title: { label: 'Conta a pagar', short: 'Conta' },
  purchase: { label: 'Compra', short: 'Compra' },
  expense: { label: 'Despesa / reembolso', short: 'Despesa' },
};
const TONE = { pendente: 'warn', aprovado: 'positive', reprovado: 'danger' };
const LABEL = { pendente: 'Aguardando', aprovado: 'Aprovado', reprovado: 'Reprovado' };

export default function Approvals() {
  const { can, companies } = useAuth();
  const { confirm, askReason, toast } = useUI();
  const onError = useApiError();
  const [status, setStatus] = useState('pendente');
  const [params] = useSearchParams();
  const [entity, setEntity] = useState(() => (ENTITY[params.get('entity')] ? params.get('entity') : ''));
  const [busy, setBusy] = useState('');
  const { data, error, loading, reload } = useAsync(() => api.get(`/approvals${qs({ status, entity })}`), [status, entity]);
  const titles = useTitleActions({ kind: 'pagar', onChanged: reload });
  const items = data?.items || [];

  const decide = async (a, ok) => {
    let body = {};
    if (ok) {
      const yes = await confirm({ title: 'Aprovar?', message: `${ENTITY[a.entity]?.label || 'Item'}: ${a.summary} — ${money(a.amount)}.`, confirmText: 'Aprovar' });
      if (!yes) return;
    } else {
      const reason = await askReason({ title: 'Reprovar?', message: 'Quem pediu vai ver o motivo.', label: 'Motivo da reprovação', confirmText: 'Reprovar', danger: true });
      if (!reason) return;
      body = { reason };
    }
    setBusy(a.id);
    try {
      await api.post(`/approvals/${a.id}/${ok ? 'approve' : 'reject'}`, body);
      toast(ok ? 'Aprovado.' : 'Reprovado. Quem pediu será avisado.');
      notifyCountsChanged();
      reload();
    } catch (e) { onError(e); } finally { setBusy(''); }
  };

  const open = (a) => {
    if (a.entity === 'title') titles.openDetails({ id: a.entity_id, kind: 'pagar' });
  };
  const link = (a) => (a.entity === 'purchase' ? `/compras?id=${a.entity_id}` : a.entity === 'expense' ? `/despesas?id=${a.entity_id}` : null);

  return (
    <div>
      <PageHeader title="Aprovações" icon={ClipboardCheck} subtitle="Contas, compras e reembolsos que precisam de um “ok” antes de seguir."
        actions={can(P.approvalRules) && <Link to="/configuracoes/alcadas" className="btn-outline"><Scale className="h-4 w-4" aria-hidden="true" /> Alçadas</Link>} />
      <div className="card mb-4">
        <Tabs label="Situação" tabs={STATUS_TABS} value={status} onChange={setStatus} className="px-2" />
        <div className="flex flex-wrap items-end gap-3 p-3">
          <div>
            <label htmlFor="ap-ent" className="label">Tipo</label>
            <select id="ap-ent" className="input w-auto" value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(ENTITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <p className="pb-2 text-xs text-ink-faint">Quem pede não aprova o próprio pedido.</p>
        </div>
      </div>

      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} className="card" /> : !items.length ? (
        <EmptyState className="card" icon={ClipboardCheck} title={status === 'pendente' ? 'Nada esperando aprovação' : 'Nada por aqui'}>
          {status === 'pendente' ? 'Quando alguém lançar algo acima da alçada, aparece aqui para você decidir.' : 'Mude o filtro para ver outras decisões.'}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => {
            const to = link(a);
            return (
              <li key={a.id} className="card p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand">{ENTITY[a.entity]?.short || a.entity}</Badge>
                      <Badge tone={TONE[a.status]}>{LABEL[a.status] || a.status}</Badge>
                      {companies.length > 1 && a.company?.name && <span className="text-xs text-ink-faint">{a.company.name}</span>}
                    </div>
                    <div className="mt-1.5 font-medium">{a.summary}</div>
                    <div className="text-xs text-ink-faint">Pedido por {a.requested_by?.name || '—'} em {dateTime(a.requested_at)}</div>
                    {a.status !== 'pendente' && (
                      <div className={cx('mt-1 text-xs', a.status === 'reprovado' ? 'text-danger' : 'text-ink-soft')}>
                        {LABEL[a.status]} por {a.decided_by?.name || a.decided_by || '—'} em {dateTime(a.decided_at)}{a.reason && ` — “${a.reason}”`}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold tabular-nums">{money(a.amount)}</div>
                    {a.entity === 'title'
                      ? <button type="button" className="text-xs font-medium text-positive hover:underline" onClick={() => open(a)}>Ver detalhes</button>
                      : to && <Link to={to} className="inline-flex items-center gap-1 text-xs font-medium text-positive hover:underline">Ver detalhes <ExternalLink className="h-3 w-3" aria-hidden="true" /></Link>}
                  </div>
                </div>
                {a.status === 'pendente' && (
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
                    {a.can_decide === false ? (
                      <span className="text-xs text-ink-faint">Você não pode decidir este pedido (é seu ou falta permissão).</span>
                    ) : (
                      <>
                        <button type="button" className="btn-outline text-danger" disabled={busy === a.id} onClick={() => decide(a, false)}><X className="h-4 w-4" aria-hidden="true" /> Reprovar</button>
                        <button type="button" className="btn-primary" disabled={busy === a.id} onClick={() => decide(a, true)}>{busy === a.id ? <Spinner /> : <Check className="h-4 w-4" aria-hidden="true" />} Aprovar</button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {titles.elements}
    </div>
  );
}
