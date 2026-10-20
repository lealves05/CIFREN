import { useState } from 'react';
import { ShieldCheck, FilterX, History } from 'lucide-react';
import { api, qs } from '../lib/api';
import { usePaged, useAsync } from '../lib/useAsync';
import { useAuth } from '../context/AuthContext';
import { P } from '../lib/permissions';
import { dateTime } from '../lib/format';
import { PageHeader, Loading, ErrorState, EmptyState, LoadMore, Badge } from '../components/ui';

export const ENTITIES = [
  { value: 'title', label: 'Contas a pagar/receber' },
  { value: 'settlement', label: 'Baixas e estornos' },
  { value: 'counterparty', label: 'Fornecedores e clientes' },
  { value: 'category', label: 'Categorias' },
  { value: 'cost_center', label: 'Centros de custo' },
  { value: 'account', label: 'Contas bancárias' },
  { value: 'company', label: 'Empresas' },
  { value: 'user', label: 'Usuários' },
  { value: 'role', label: 'Perfis' },
  { value: 'auth', label: 'Entradas e segurança' },
];
const entityLabel = (v) => ENTITIES.find((e) => e.value === v)?.label || v;

export default function Audit() {
  const { can } = useAuth();
  const [f, setF] = useState({ from: '', to: '', user_id: '', entity: '' });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const users = useAsync(() => (can(P.usersManage) ? api.get('/users') : Promise.resolve(null)), []);
  const fetchPage = (cursor) => api.get(`/audit${qs({ ...f, limit: 50, cursor })}`);
  const list = usePaged(fetchPage, [f.from, f.to, f.user_id, f.entity]);
  const filtered = Object.values(f).some(Boolean);
  return (
    <div>
      <PageHeader title="Auditoria" icon={ShieldCheck} subtitle="Tudo o que foi criado, alterado ou apagado, por quem e quando." />
      <div className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[auto_auto_1fr_1fr_auto] lg:items-end">
        <div><label htmlFor="a-de" className="label">De</label><input id="a-de" type="date" className="input" value={f.from} onChange={set('from')} /></div>
        <div><label htmlFor="a-ate" className="label">Até</label><input id="a-ate" type="date" className="input" value={f.to} min={f.from || undefined} onChange={set('to')} /></div>
        {users.data?.items?.length > 0 && (
          <div><label htmlFor="a-user" className="label">Usuário</label>
            <select id="a-user" className="input" value={f.user_id} onChange={set('user_id')}>
              <option value="">Todos</option>{users.data.items.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}
        <div><label htmlFor="a-ent" className="label">O que mudou</label>
          <select id="a-ent" className="input" value={f.entity} onChange={set('entity')}>
            <option value="">Tudo</option>{ENTITIES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </div>
        {filtered && <button type="button" className="btn-ghost" onClick={() => setF({ from: '', to: '', user_id: '', entity: '' })}><FilterX className="h-4 w-4" aria-hidden="true" /> Limpar</button>}
      </div>
      <div className="card">
        {list.loading ? <Loading /> : list.error && !list.items.length ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.items.length ? (
          <EmptyState icon={History} title={filtered ? 'Nada encontrado com esses filtros' : 'Nenhum registro ainda'}>
            {filtered ? 'Tente outro período ou outro filtro.' : 'As ações feitas no sistema aparecem aqui automaticamente.'}
          </EmptyState>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {list.items.map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{a.user_name || 'Sistema'}</span>
                    <Badge>{entityLabel(a.entity)}</Badge>
                    <span className="text-xs text-ink-faint">{a.action}</span>
                    <time dateTime={a.at} className="ml-auto text-xs tabular-nums text-ink-faint">{dateTime(a.at)}</time>
                  </div>
                  {a.summary && <p className="mt-1 break-words text-sm text-ink-soft">{a.summary}</p>}
                  {a.ip && <p className="mt-0.5 text-[11px] text-ink-faint">IP {a.ip}</p>}
                </li>
              ))}
            </ul>
            <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={list.more} />
          </>
        )}
      </div>
    </div>
  );
}
