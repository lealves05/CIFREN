import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Landmark, Upload, Wand2, Sparkles, Check, Plus, EyeOff, Undo2, Search, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { api, qs, errorMessage, notifyCountsChanged } from '../lib/api';
import { usePaged, useAsync } from '../lib/useAsync';
import { useApiError } from '../lib/useApiError';
import { loadRefs } from '../lib/refData';
import { P } from '../lib/permissions';
import { money, date, dateTime, pct } from '../lib/format';
import { checkFile, readAsBase64, STATEMENT_ACCEPT, STATEMENT_KINDS, MAX_STATEMENT_BYTES } from '../lib/files';
import Modal from '../components/Modal';
import CategorySelect from '../components/CategorySelect';
import CounterpartyPicker from '../components/CounterpartyPicker';
import TitlePicker from '../components/TitlePicker';
import { PageHeader, Tabs, Loading, ErrorState, EmptyState, Badge, LoadMore, InlineError, Input, Select, SubmitButton, Spinner, cx } from '../components/ui';
import { Notice } from '../components/kit';

const TABS = [
  { value: 'pendente', label: 'Pendentes' },
  { value: 'conciliada', label: 'Conciliadas' },
  { value: 'ignorada', label: 'Ignoradas' },
  { value: 'todas', label: 'Todas' },
];
const ST = { pendente: { label: 'Pendente', tone: 'warn' }, conciliada: { label: 'Conciliada', tone: 'positive' }, ignorada: { label: 'Ignorada', tone: 'neutral' } };

/** Criar conta + baixa a partir da linha (ex.: tarifa bancária), com sugestão da IA. */
function CreateModal({ line, onClose, onDone }) {
  const { toast } = useUI();
  const onError = useApiError();
  const out = Number(line?.amount) < 0;
  const [f, setF] = useState({});
  const [refs, setRefs] = useState({ categories: [], costCenters: [] });
  const [ai, setAi] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!line) return;
    setF({ description: line.description || '', category_id: null, counterparty: null, cost_center_id: null });
    setAi(null); setError('');
    loadRefs(['categories', 'costCenters']).then(setRefs);
  }, [line]);
  const suggest = async () => {
    setAiBusy(true);
    try {
      const r = await api.post(`/reconciliation/lines/${line.id}/ai-suggest`);
      setAi(r);
      if (r?.category_id) setF((x) => ({ ...x, category_id: r.category_id }));
    } catch (e) { onError(e); } finally { setAiBusy(false); }
  };
  const submit = async () => {
    if (!f.description.trim()) { setError('Escreva uma descrição.'); return; }
    setSaving(true); setError('');
    try {
      await api.post(`/reconciliation/lines/${line.id}/create`, {
        description: f.description.trim(), category_id: f.category_id || undefined, counterparty_id: f.counterparty?.id || undefined, cost_center_id: f.cost_center_id || undefined,
      });
      toast('Lançamento criado e conciliado.'); onDone(); onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open={!!line} onClose={onClose} onSubmit={submit} title="Criar lançamento a partir da linha"
      subtitle={line && `${date(line.date)} · ${line.description} · ${money(line.amount)}`}
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving}>Criar e conciliar</SubmitButton></>}>
      {line && (
        <div className="space-y-4">
          <InlineError error={error} />
          <p className="text-sm text-ink-soft">Cria uma conta {out ? 'a pagar' : 'a receber'} já baixada nesta conta bancária. Bom para tarifas, juros, rendimentos e Pix avulsos.</p>
          <Input label="Descrição" required value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={200} />
          <div className="grid gap-4 sm:grid-cols-2">
            <CategorySelect categories={refs.categories} type={out ? 'despesa' : 'receita'} value={f.category_id} onChange={(v) => setF({ ...f, category_id: v })} />
            <Select label="Centro de custo" value={f.cost_center_id || ''} onChange={(e) => setF({ ...f, cost_center_id: e.target.value || null })}>
              <option value="">Nenhum</option>
              {refs.costCenters.filter((c) => c.active !== false).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <CounterpartyPicker kind={out ? 'fornecedor' : 'cliente'} value={f.counterparty} onChange={(v) => setF({ ...f, counterparty: v })} label={`${out ? 'Fornecedor' : 'Cliente'} (opcional)`} />
          <div className="rounded-app-sm border border-violet-500/30 bg-violet-500/5 p-3">
            <button type="button" className="btn-outline btn-sm" onClick={suggest} disabled={aiBusy}>{aiBusy ? <Spinner /> : <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" aria-hidden="true" />} Sugerir com IA</button>
            {ai && (
              <p className="mt-2 text-sm" aria-live="polite">
                Sugestão: <strong>{ai.category_name || 'sem categoria'}</strong>{ai.counterparty_name && <> · {ai.counterparty_name}</>}
                {ai.confidence != null && <span className="text-ink-faint"> (confiança {pct((ai.confidence || 0) * 100, 0)})</span>}
                {ai.reason && <span className="block text-xs text-ink-faint">{ai.reason}</span>}
              </p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Line({ l, canMatch, onAction, busy }) {
  const st = ST[l.status] || ST.pendente;
  const neg = Number(l.amount) < 0;
  const sugg = l.suggestions || [];
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint"><span className="tabular-nums">{date(l.date)}</span><Badge tone={st.tone}>{st.label}</Badge>{l.account?.name && <span>{l.account.name}</span>}</div>
          <div className="mt-1 break-words font-medium">{l.description}</div>
          {l.status === 'conciliada' && l.title && <div className="text-xs text-ink-soft">Ligada a: {l.title.description || 'conta'}</div>}
        </div>
        <div className={cx('text-lg font-semibold tabular-nums', neg ? 'text-danger' : 'text-positive')}>{money(l.amount)}<span className="sr-only">{neg ? ' (saída)' : ' (entrada)'}</span></div>
      </div>
      {l.status === 'pendente' && canMatch && (
        <>
          {sugg.length > 0 && (
            <ul className="mt-3 space-y-2" aria-label="Sugestões">
              {sugg.map((s, i) => (
                <li key={s.title_id || s.settlement_id || i} className="flex flex-wrap items-center gap-2 rounded-app-sm border border-line bg-muted/50 px-3 py-2">
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium">{s.description}{s.counterparty && <span className="font-normal text-ink-faint"> · {s.counterparty}</span>}</div>
                    <div className="text-xs text-ink-faint">
                      {s.type === 'settlement' ? `Baixa já lançada em ${date(s.paid_at)}` : `Vence ${date(s.due_date)}`} · {money(s.open_amount ?? s.amount)} · {s.reason}
                    </div>
                  </div>
                  <Badge tone={s.score >= 0.9 ? 'positive' : 'warn'}>{pct((s.score || 0) * 100, 0)}</Badge>
                  <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => onAction('match', l, s)}><Check className="h-3.5 w-3.5" aria-hidden="true" /> Conciliar</button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-line pt-3">
            <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => onAction('ignore', l)}><EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> Ignorar</button>
            <button type="button" className="btn-outline btn-sm" disabled={busy} onClick={() => onAction('pick', l)}><Search className="h-3.5 w-3.5" aria-hidden="true" /> Procurar conta</button>
            <button type="button" className="btn-outline btn-sm" disabled={busy} onClick={() => onAction('create', l)}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Criar lançamento</button>
          </div>
        </>
      )}
      {l.status !== 'pendente' && canMatch && (
        <div className="mt-3 flex justify-end border-t border-line pt-3">
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => onAction('undo', l)}><Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Desfazer</button>
        </div>
      )}
    </li>
  );
}

export default function Reconciliation() {
  const { can, companyId } = useAuth();
  const { toast, confirm } = useUI();
  const onError = useApiError();
  const accountsQ = useAsync(() => loadRefs(['accounts']).then((r) => r.accounts.filter((a) => a.active !== false)), []);
  const accounts = useMemo(() => (accountsQ.data || []).filter((a) => !companyId || !a.company_id || a.company_id === companyId), [accountsQ.data, companyId]);
  const [accountId, setAccountId] = useState('');
  const [status, setStatus] = useState('pendente');
  const [busy, setBusy] = useState('');
  const [create, setCreate] = useState(null);
  const [pick, setPick] = useState(null);
  const fileRef = useRef(null);
  const canMatch = can(P.reconMatch);

  useEffect(() => { if (accounts.length && !accounts.some((a) => a.id === accountId)) setAccountId(accounts[0].id); }, [accounts]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = usePaged((cursor) => api.get(`/reconciliation/lines${qs({ account_id: accountId, status, limit: 50, cursor })}`), [accountId, status]);
  const imports = useAsync(() => (accountId ? api.get(`/reconciliation/imports${qs({ account_id: accountId })}`) : Promise.resolve({ items: [] })), [accountId]);
  const refresh = () => { lines.reload(); imports.reload(); notifyCountsChanged(); };

  const upload = async (file) => {
    const problem = checkFile(file, { max: MAX_STATEMENT_BYTES, kinds: STATEMENT_KINDS });
    if (problem) { toast(problem, 'error'); return; }
    setBusy('import');
    try {
      const r = await api.post('/reconciliation/imports', { account_id: accountId, filename: file.name, content_base64: await readAsBase64(file) });
      toast(`Extrato importado: ${r?.lines ?? 0} linha(s)${r?.duplicates ? `, ${r.duplicates} repetida(s) ignorada(s)` : ''}.`);
      setStatus('pendente'); refresh();
    } catch (e) { onError(e); } finally { setBusy(''); }
  };

  const auto = async () => {
    setBusy('auto');
    try {
      const r = await api.post('/reconciliation/auto', { account_id: accountId });
      toast(r?.matched ? `${r.matched} linha(s) conciliada(s) automaticamente.` : 'Nenhuma linha com certeza suficiente. Revise as sugestões abaixo.');
      refresh();
    } catch (e) { onError(e); } finally { setBusy(''); }
  };

  const act = async (what, l, s) => {
    if (what === 'create') { setCreate(l); return; }
    if (what === 'pick') { setPick(l); return; }
    if (what === 'ignore' && !(await confirm({ title: 'Ignorar esta linha?', message: 'Ela sai da lista de pendentes (ex.: transferência entre contas suas). Dá para desfazer depois.', confirmText: 'Ignorar' }))) return;
    if (what === 'undo' && !(await confirm({ title: 'Desfazer?', message: 'Se a conciliação criou o pagamento, ele será estornado e a linha volta a pendente.', confirmText: 'Desfazer' }))) return;
    setBusy(l.id);
    try {
      if (what === 'match') await api.post(`/reconciliation/lines/${l.id}/match`, s.type === 'settlement' ? { settlement_id: s.settlement_id } : { title_id: s.title_id || s.id });
      if (what === 'ignore') await api.post(`/reconciliation/lines/${l.id}/ignore`, {});
      if (what === 'undo') await api.post(`/reconciliation/lines/${l.id}/undo`);
      toast({ match: 'Linha conciliada.', ignore: 'Linha ignorada.', undo: 'Conciliação desfeita.' }[what]);
      refresh();
    } catch (e) { onError(e); } finally { setBusy(''); }
  };

  const matchPicked = async (t) => {
    const l = pick; setPick(null);
    setBusy(l.id);
    try { await api.post(`/reconciliation/lines/${l.id}/match`, { title_id: t.id }); toast('Linha conciliada.'); refresh(); } catch (e) { onError(e); } finally { setBusy(''); }
  };

  if (accountsQ.loading && !accountsQ.data) return <Loading />;
  const imp = imports.data?.items || [];

  return (
    <div>
      <PageHeader title="Conciliação bancária" icon={Landmark} subtitle="Confira o extrato do banco com o que foi lançado no CIFREN." />
      {!accounts.length ? (
        <EmptyState className="card" icon={Landmark} title="Nenhuma conta bancária" action={<Link to="/cadastros?aba=contas" className="btn-primary">Cadastrar conta</Link>}>
          Para conciliar, cadastre a conta do banco primeiro.
        </EmptyState>
      ) : (
        <>
          <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
            <div className="min-w-[200px] flex-1">
              <label htmlFor="rc-acc" className="label">Conta bancária</label>
              <select id="rc-acc" className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.bank_name ? ` — ${a.bank_name}` : ''}</option>)}
              </select>
            </div>
            {can(P.reconImport) && (
              <>
                <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()} disabled={!!busy}>{busy === 'import' ? <Spinner /> : <Upload className="h-4 w-4" aria-hidden="true" />} Importar extrato</button>
                <input ref={fileRef} type="file" className="sr-only" tabIndex={-1} accept={STATEMENT_ACCEPT} aria-label="Arquivo do extrato (OFX ou CSV)"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} />
              </>
            )}
            {canMatch && <button type="button" className="btn-outline" onClick={auto} disabled={!!busy}>{busy === 'auto' ? <Spinner /> : <Wand2 className="h-4 w-4" aria-hidden="true" />} Conciliar automaticamente</button>}
          </div>
          <Notice className="mb-4">Baixe o extrato no site do banco em <strong>OFX</strong> (melhor) ou <strong>CSV</strong>, até 5 MB. “Conciliar automaticamente” só liga o que tem valor exato e certeza alta; o resto você confere.</Notice>

          {imp.length > 0 && (
            <details className="card mb-4">
              <summary className="focus-ring cursor-pointer list-none px-4 py-3 text-sm font-semibold"><FileSpreadsheet className="mr-2 inline h-4 w-4 text-accent" aria-hidden="true" />Extratos importados ({imp.length})</summary>
              <ul className="divide-y divide-line border-t border-line">
                {imp.map((i) => (
                  <li key={i.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5 text-sm">
                    <span className="min-w-0 truncate">{i.filename} <span className="text-xs text-ink-faint">· {dateTime(i.created_at)}</span></span>
                    <span className="text-xs text-ink-soft">{i.lines} linhas · {i.matched} conciliadas · {i.pending} pendentes</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="card mb-3"><Tabs label="Situação das linhas" tabs={TABS} value={status} onChange={setStatus} className="px-2" /></div>
          {lines.loading ? <Loading /> : lines.error && !lines.items.length ? <ErrorState error={lines.error} onRetry={lines.reload} className="card" /> : !lines.items.length ? (
            <EmptyState className="card" icon={Landmark} title={status === 'pendente' ? 'Nada pendente nesta conta' : 'Nenhuma linha'}>
              {status === 'pendente' ? 'Importe o extrato do banco para começar.' : 'Mude o filtro para ver outras linhas.'}
            </EmptyState>
          ) : (
            <>
              <ul className="space-y-3">{lines.items.map((l) => <Line key={l.id} l={l} canMatch={canMatch} busy={busy === l.id} onAction={act} />)}</ul>
              {lines.error && <div className="mt-3"><InlineError error={lines.error} /></div>}
              <LoadMore hasMore={lines.hasMore} loading={lines.loadingMore} onClick={lines.more} />
            </>
          )}
        </>
      )}
      <CreateModal line={create} onClose={() => setCreate(null)} onDone={refresh} />
      <TitlePicker open={!!pick} onClose={() => setPick(null)} onPick={matchPicked} kind={pick && Number(pick.amount) > 0 ? 'receber' : 'pagar'}
        title="Conciliar com qual conta?" hint={pick ? `${date(pick.date)} · ${pick.description} · ${money(pick.amount)}` : undefined} />
    </div>
  );
}
