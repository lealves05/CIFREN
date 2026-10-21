import { useState } from 'react';
import { AlarmClock, Wallet } from 'lucide-react';
import { api, qs, errorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { P } from '../../lib/permissions';
import { useAsync } from '../../lib/useAsync';
import { money, plural } from '../../lib/format';
import { PageHeader, Loading, ErrorState, Badge, Spinner, cx } from '../../components/ui';
import { Panel, Segmented } from '../../components/kit';

export default function Aging() {
  const [kind, setKind] = useState('receber');
  const { can } = useAuth();
  const { confirm, toast } = useUI();
  const [busy, setBusy] = useState('');
  const { data, error, loading, reload } = useAsync(() => api.get(`/reports/aging${qs({ kind })}`), [kind]);
  const buckets = data?.buckets || [];
  const top = data?.top || [];
  const max = Math.max(1, ...buckets.map((b) => Number(b.amount) || 0));
  const ru = data?.rusten;
  const payWithCredit = async (t) => {
    const ok = await confirm({ title: `Quitar com o crédito do RUSTEN?`, confirmText: 'Quitar com o crédito',
      message: `${t.counterparty} tem ${money(t.credit)} de crédito no RUSTEN. As mensalidades em aberto (as mais antigas primeiro) serão pagas com esse crédito, até ${money(t.covered)}. Não entra dinheiro no banco agora: ele já entrou quando o crédito foi lançado.` });
    if (!ok) return;
    setBusy(t.member_id);
    try {
      const r = await api.post(`/members/${t.member_id}/pay-with-credit`, {});
      toast(`${r.fees} mensalidade(s) paga(s) com ${money(r.paid)} de crédito. Sobrou ${money(r.credit_left)} de crédito no RUSTEN.`);
      reload();
    } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(''); }
  };
  return (
    <div>
      <PageHeader title="Inadimplência" icon={AlarmClock} subtitle="Quanto está atrasado e há quanto tempo." />
      <Segmented className="mb-4" label="Tipo" value={kind} onChange={setKind} options={[{ value: 'receber', label: 'Clientes que devem' }, { value: 'pagar', label: 'Contas que eu devo' }]} />
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} className="card" /> : (
        <>
        {ru && (Number(ru.fiado_overdue) > 0 || Number(ru.covered_by_credit) > 0) && (
          <div className="card mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm" role="note">
            <span className="flex items-center gap-2 font-semibold"><Wallet className="h-4 w-4 text-accent" aria-hidden="true" /> Conferido com o RUSTEN</span>
            <span>Fiado do RUSTEN em atraso: <strong className="tabular-nums">{money(ru.fiado_overdue)}</strong></span>
            {Number(ru.covered_by_credit) > 0 && <span>Já coberto pelo crédito dos associados no RUSTEN: <strong className="tabular-nums text-positive">{money(ru.covered_by_credit)}</strong> ({plural(ru.members_with_credit, 'associado', 'associados')})</span>}
          </div>
        )}
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
                {top.map((t, i) => {
                  const parts = [Number(t.fees) > 0 && `mensalidades ${money(t.fees)}`, Number(t.fiado) > 0 && `fiado RUSTEN ${money(t.fiado)}`,
                    Number(t.amount) - Number(t.fees || 0) - Number(t.fiado || 0) > 0.004 && Number(t.fees || t.fiado) > 0 && `outras ${money(Number(t.amount) - Number(t.fees || 0) - Number(t.fiado || 0))}`].filter(Boolean);
                  return (
                    <li key={t.member_id || i} className="py-2.5 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="min-w-0 truncate">{i + 1}. {t.counterparty?.name || t.counterparty || 'Sem nome'} <span className="text-ink-faint">· {plural(t.n || 0, 'conta', 'contas')}</span>
                          {t.rusten && <Badge className="ml-1.5" tone="neutral">RUSTEN</Badge>}</span>
                        <span className={cx('font-semibold tabular-nums', Number(t.net) > 0 ? 'text-danger' : 'text-positive')}>{money(t.amount)}</span>
                      </div>
                      {parts.length > 0 && <div className="mt-0.5 text-xs text-ink-faint">{parts.join(' · ')}</div>}
                      {Number(t.covered) > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-app-sm bg-accent/10 px-2.5 py-1.5 text-xs">
                          <span className="min-w-0 flex-1">Tem <strong>{money(t.credit)}</strong> de crédito no RUSTEN: cobre <strong>{money(t.covered)}</strong>{Number(t.net) > 0.004 ? <> · fica devendo <strong className="text-danger">{money(t.net)}</strong></> : ' · quita tudo'}</span>
                          {can(P.titlesSettle) && (
                            <button type="button" className="btn-outline btn-sm" onClick={() => payWithCredit(t)} disabled={!!busy}>
                              {busy === t.member_id ? <Spinner /> : <Wallet className="h-3.5 w-3.5" aria-hidden="true" />} Quitar com o crédito
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>
        </div>
        </>
      )}
    </div>
  );
}
