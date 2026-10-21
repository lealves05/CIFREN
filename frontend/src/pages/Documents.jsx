import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Search, Copy as CopyIcon, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, qs } from '../lib/api';
import { usePaged } from '../lib/useAsync';
import { P } from '../lib/permissions';
import { money, date, dateTime } from '../lib/format';
import { DOC_KIND, DOC_STATUS, docKindLabel, docStatus } from '../lib/documents';
import DocumentCapture from '../components/DocumentCapture';
import { PageHeader, Loading, ErrorState, EmptyState, Badge, LoadMore, InlineError } from '../components/ui';
import { Panel } from '../components/kit';

export default function Documents() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [qd, setQd] = useState('');
  useEffect(() => { const t = setTimeout(() => setQd(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const list = usePaged((cursor) => api.get(`/documents${qs({ status, kind, q: qd, limit: 30, cursor })}`), [status, kind, qd]);
  const canSend = can(P.docsUpload);

  return (
    <div>
      <PageHeader title="Documentos" icon={FileText} subtitle="Notas fiscais, boletos, Pix e comprovantes. O CIFREN lê os dados e lança as contas para você." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr] lg:items-start">
        {canSend && (
          <Panel title="Enviar documento" className="lg:sticky lg:top-20">
            <DocumentCapture onCreated={(doc) => { list.reload(); if (doc?.id) navigate(`/documentos/${doc.id}`); }} />
          </Panel>
        )}
        <div className={canSend ? '' : 'lg:col-span-2'}>
          <div className="card mb-3 grid gap-2 p-3 sm:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
              <input type="search" className="input pl-9" placeholder="Fornecedor, número ou arquivo" aria-label="Buscar documentos" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="input" aria-label="Situação" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todas as situações</option>{Object.entries(DOC_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="input" aria-label="Tipo" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Todos os tipos</option>{Object.entries(DOC_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {list.loading ? <Loading /> : list.error && !list.items.length ? <ErrorState error={list.error} onRetry={list.reload} className="card" /> : !list.items.length ? (
            <EmptyState className="card" icon={FileText} title={qd || status || kind ? 'Nada encontrado' : 'Nenhum documento ainda'}>
              {canSend ? 'Envie a primeira nota ou boleto ao lado (no celular, use o botão Enviar).' : 'Quando alguém enviar documentos, eles aparecem aqui.'}
            </EmptyState>
          ) : (
            <>
              <ul className="card divide-y divide-line">
                {list.items.map((d) => {
                  const st = docStatus(d.status);
                  const x = d.extracted || {};
                  return (
                    <li key={d.id}>
                      <Link to={`/documentos/${d.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-app-sm bg-accent/10 text-positive"><FileText className="h-4 w-4" aria-hidden="true" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                            <span className="truncate">{x.supplier_name || d.filename || docKindLabel(d.kind)}</span>
                            <Badge tone={st.tone}>{st.label}</Badge>
                            {d.duplicate_of && <Badge tone="danger"><CopyIcon className="h-3 w-3" aria-hidden="true" />Duplicado</Badge>}
                          </span>
                          <span className="block truncate text-xs text-ink-faint">
                            {docKindLabel(d.kind)}{x.number && ` nº ${x.number}`}{x.issue_date && ` · ${date(x.issue_date)}`} · enviado {dateTime(d.created_at)}
                          </span>
                        </span>
                        {x.total != null && <span className="text-sm font-semibold tabular-nums">{money(x.total)}</span>}
                        <ChevronRight className="h-4 w-4 text-ink-faint" aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {list.error && <div className="mt-3"><InlineError error={list.error} /></div>}
              <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={list.more} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
