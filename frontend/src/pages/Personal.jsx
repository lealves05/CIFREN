import { useEffect, useMemo, useState } from 'react';
import {
  PiggyBank, Plus, Wallet, ArrowLeftRight, Target, Repeat, Users2, LayoutDashboard, ListOrdered,
  Trash2, Pencil, Check, X, LogOut, Mail, TrendingUp, TrendingDown, PieChart, Upload, Loader2,
} from 'lucide-react';
import { api, qs, errorMessage } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { money, date, today } from '../lib/format';
import { useUI } from '../context/UIContext';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import MoneyInput from '../components/MoneyInput';
import { PageHeader, Tabs, Input, Select, Loading, ErrorState, EmptyState, Badge, SubmitButton, Avatar, cx } from '../components/ui';

const ROLE_LABEL = { dono: 'Dono', editor: 'Editor', visualizador: 'Visualizador' };
const KIND_LABEL = { conta: 'Conta', carteira: 'Carteira', cartao: 'Cartão', poupanca: 'Poupança', investimento: 'Investimento' };
const INTERVAL_LABEL = { semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal', bimestral: 'Bimestral', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' };
const canEdit = (role) => role === 'dono' || role === 'editor';

// ----------------------------------------------------------------- página
export default function Personal() {
  const { toast } = useUI();
  const spaces = useAsync(() => api.get('/personal/spaces'), []);
  const invites = useAsync(() => api.get('/personal/invites'), []);
  const [spaceId, setSpaceId] = useState(null);
  const [tab, setTab] = useState('painel');
  const [newSpace, setNewSpace] = useState(false);

  const list = spaces.data?.items || [];
  const active = list.find((s) => s.id === spaceId) || list.find((s) => !s.archived) || list[0];
  useEffect(() => { if (active && active.id !== spaceId) setSpaceId(active.id); }, [active, spaceId]);

  const pendingInvites = invites.data?.items || [];
  const acceptInvite = async (sid) => {
    try { await api.post(`/personal/invites/${sid}/accept`); toast('Você entrou no espaço.'); spaces.reload(); invites.reload(); setSpaceId(sid); }
    catch (e) { toast(errorMessage(e), 'error'); }
  };
  const declineInvite = async (sid) => { try { await api.post(`/personal/invites/${sid}/decline`); invites.reload(); } catch (e) { toast(errorMessage(e), 'error'); } };

  const tabs = [
    { value: 'painel', label: 'Painel', icon: LayoutDashboard },
    { value: 'lancamentos', label: 'Lançamentos', icon: ListOrdered },
    { value: 'contas', label: 'Contas e categorias', icon: Wallet },
    { value: 'orcamentos', label: 'Orçamentos', icon: PieChart },
    { value: 'metas', label: 'Metas', icon: Target },
    { value: 'recorrentes', label: 'Recorrentes', icon: Repeat },
    { value: 'compartilhar', label: 'Compartilhar', icon: Users2 },
  ];

  if (spaces.loading && !spaces.data) return <div><PageHeader title="Finanças pessoais" icon={PiggyBank} /><Loading /></div>;
  if (spaces.error) return <div><PageHeader title="Finanças pessoais" icon={PiggyBank} /><ErrorState error={spaces.error} onRetry={spaces.reload} /></div>;

  return (
    <div>
      <PageHeader title="Finanças pessoais" icon={PiggyBank} subtitle="O seu dinheiro, separado da empresa. Compartilhe um espaço com quem você quiser (cônjuge, família)."
        actions={<button type="button" className="btn-primary" onClick={() => setNewSpace(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Novo espaço</button>} />

      {pendingInvites.length > 0 && (
        <div className="mb-4 space-y-2">
          {pendingInvites.map((i) => (
            <div key={i.space_id} className="flex flex-wrap items-center gap-2 rounded-app-sm border border-brand/40 bg-brand/5 px-3 py-2 text-sm">
              <Mail className="h-4 w-4 text-brand" aria-hidden="true" />
              <span className="flex-1"><b>{i.invited_by || 'Alguém'}</b> convidou você para o espaço <b>{i.name}</b> como {ROLE_LABEL[i.role] || i.role}.</span>
              <button type="button" className="btn-primary btn-sm" onClick={() => acceptInvite(i.space_id)}><Check className="h-3.5 w-3.5" aria-hidden="true" /> Entrar</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => declineInvite(i.space_id)}><X className="h-3.5 w-3.5" aria-hidden="true" /> Recusar</button>
            </div>
          ))}
        </div>
      )}

      {!list.length ? (
        <EmptyState icon={PiggyBank} title="Crie o seu primeiro espaço" action={<button type="button" className="btn-primary" onClick={() => setNewSpace(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Novo espaço</button>}>
          Um espaço guarda as suas contas, lançamentos e metas pessoais. Você pode ter vários (ex.: “Meu dinheiro”, “Casa”) e compartilhar com outras pessoas.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="text-sm text-ink-faint" htmlFor="space-sel">Espaço:</label>
            <select id="space-sel" className="input max-w-xs" value={active?.id || ''} onChange={(e) => setSpaceId(e.target.value)}>
              {list.map((s) => <option key={s.id} value={s.id}>{s.name}{s.archived ? ' (arquivado)' : ''} · {ROLE_LABEL[s.role]}</option>)}
            </select>
            {active && <Badge tone={active.role === 'visualizador' ? 'neutral' : 'positive'}>{ROLE_LABEL[active.role]}</Badge>}
          </div>

          {active && (
            <div className="card">
              <Tabs label="Seções" tabs={tabs} value={tab} onChange={setTab} className="px-2" />
              <div className="p-4" role="tabpanel">
                {tab === 'painel' && <PanelTab space={active} />}
                {tab === 'lancamentos' && <TransactionsTab space={active} />}
                {tab === 'contas' && <AccountsTab space={active} />}
                {tab === 'orcamentos' && <BudgetsTab space={active} />}
                {tab === 'metas' && <GoalsTab space={active} />}
                {tab === 'recorrentes' && <RecurringTab space={active} />}
                {tab === 'compartilhar' && <ShareTab space={active} onChanged={() => { spaces.reload(); }} />}
              </div>
            </div>
          )}
        </>
      )}

      {newSpace && <NewSpaceModal onClose={() => setNewSpace(false)} onCreated={(sp) => { setNewSpace(false); spaces.reload(); setSpaceId(sp.id); }} />}
    </div>
  );
}

function NewSpaceModal({ onClose, onCreated }) {
  const [f, setF] = useState({ name: '', first_account: 'Conta principal' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async () => {
    if (!f.name.trim()) { setErr('Dê um nome ao espaço.'); return; }
    setBusy(true); setErr('');
    try { const sp = await api.post('/personal/spaces', { name: f.name.trim(), first_account: f.first_account.trim() || undefined }); onCreated(sp); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} onSubmit={submit} title="Novo espaço pessoal"
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={busy}>Criar</SubmitButton></>}>
      <div className="space-y-4">
        {err && <div className="rounded-app-sm bg-danger-soft p-2 text-sm text-danger">{err}</div>}
        <Input label="Nome do espaço" placeholder="Ex.: Meu dinheiro, Casa, Família" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-autofocus />
        <Input label="Primeira conta (opcional)" hint="Você pode criar mais contas depois." value={f.first_account} onChange={(e) => setF({ ...f, first_account: e.target.value })} />
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------- Painel
function PanelTab({ space }) {
  const month = today().slice(0, 7);
  const sum = useAsync(() => api.get(`/personal/spaces/${space.id}/summary${qs({ month })}`), [space.id]);
  if (sum.loading && !sum.data) return <Loading />;
  if (sum.error) return <ErrorState error={sum.error} onRetry={sum.reload} />;
  const d = sum.data;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Saldo somado" value={money(d.total_balance)} tone={d.total_balance < 0 ? 'danger' : 'default'} />
        <Stat label="Entradas do mês" value={money(d.income)} icon={TrendingUp} tone="positive" />
        <Stat label="Saídas do mês" value={money(d.expense)} icon={TrendingDown} tone="danger" />
      </div>
      {d.pending !== 0 && <p className="text-sm text-ink-faint">A receber/pagar ainda em aberto: <b className={d.pending < 0 ? 'text-danger' : 'text-positive'}>{money(d.pending)}</b></p>}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Contas</h3>
          <ul className="divide-y divide-line rounded-app-sm border border-line">
            {d.accounts.filter((a) => !a.archived).map((a) => (
              <li key={a.id} className="flex items-center justify-between px-3 py-2 text-sm"><span>{a.name} <span className="text-ink-faint">· {KIND_LABEL[a.kind]}</span></span><b className={cx('tabular-nums', a.balance < 0 && 'text-danger')}>{money(a.balance)}</b></li>
            ))}
            {!d.accounts.length && <li className="px-3 py-2 text-sm text-ink-faint">Nenhuma conta ainda.</li>}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Para onde foi o dinheiro ({date(`${month}-01`).slice(3)})</h3>
          {d.by_category.length ? (
            <ul className="space-y-1">
              {d.by_category.map((c) => {
                const pct = d.expense > 0 ? Math.round((c.amount / d.expense) * 100) : 0;
                return (
                  <li key={c.category}>
                    <div className="flex justify-between text-sm"><span>{c.category}</span><span className="tabular-nums text-ink-faint">{money(c.amount)} · {pct}%</span></div>
                    <div className="h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-ink-faint">Sem despesas neste mês.</p>}
        </div>
      </div>
    </div>
  );
}
function Stat({ label, value, icon: Icon, tone }) {
  const color = tone === 'positive' ? 'text-positive' : tone === 'danger' ? 'text-danger' : '';
  return (
    <div className="rounded-app-sm border border-line p-3">
      <div className="flex items-center gap-1 text-xs text-ink-faint">{Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}{label}</div>
      <div className={cx('mt-1 text-xl font-semibold tabular-nums', color)}>{value}</div>
    </div>
  );
}

// ----------------------------------------------------------------- Lançamentos
function TransactionsTab({ space }) {
  const { toast, confirm } = useUI();
  const base = `/personal/spaces/${space.id}`;
  const [filter, setFilter] = useState({ type: '', account_id: '', from: '', to: '' });
  const tx = useAsync(() => api.get(`${base}/transactions${qs(filter)}`), [space.id, JSON.stringify(filter)]);
  const accounts = useAsync(() => api.get(`${base}/accounts`), [space.id]);
  const cats = useAsync(() => api.get(`${base}/categories`), [space.id]);
  const [edit, setEdit] = useState(null);
  const [importing, setImporting] = useState(false);
  const editable = canEdit(space.role);
  const accs = (accounts.data?.items || []).filter((a) => !a.archived);
  const remove = async (t) => {
    if (!(await confirm({ title: 'Apagar lançamento?', confirmText: 'Apagar' }))) return;
    try { await api.del(`${base}/transactions/${t.id}`); tx.reload(); } catch (e) { toast(errorMessage(e), 'error'); }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Select label="Tipo" value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })} className="w-40">
          <option value="">Todos</option><option value="receita">Entradas</option><option value="despesa">Saídas</option><option value="transferencia">Transferências</option>
        </Select>
        <Select label="Conta" value={filter.account_id} onChange={(e) => setFilter({ ...filter, account_id: e.target.value })} className="w-44">
          <option value="">Todas</option>{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Input label="De" type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} className="w-40" />
        <Input label="Até" type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} className="w-40" />
        <div className="flex-1" />
        {editable && <button type="button" className="btn-outline" onClick={() => setImporting(true)}><Upload className="h-4 w-4" aria-hidden="true" /> Importar extrato</button>}
        {editable && <button type="button" className="btn-primary" onClick={() => setEdit({})}><Plus className="h-4 w-4" aria-hidden="true" /> Novo lançamento</button>}
      </div>
      {tx.loading && !tx.data ? <Loading /> : tx.error ? <ErrorState error={tx.error} onRetry={tx.reload} /> : !(tx.data?.items?.length) ? (
        <EmptyState icon={ListOrdered} title="Nenhum lançamento">Registre entradas, saídas e transferências entre as suas contas.</EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-app-sm border border-line">
          {tx.data.items.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <TxIcon type={t.type} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{t.description || (t.type === 'transferencia' ? `Transferência` : t.category_name || KIND_LABEL[t.type] || t.type)}{!t.paid && <Badge tone="warn">em aberto</Badge>}</div>
                <div className="truncate text-xs text-ink-faint">{date(t.date)} · {t.account_name}{t.type === 'transferencia' ? ` → ${t.transfer_account_name}` : t.category_name ? ` · ${t.category_name}` : ''}</div>
              </div>
              <b className={cx('tabular-nums', t.type === 'receita' ? 'text-positive' : t.type === 'despesa' ? 'text-danger' : '')}>{t.type === 'receita' ? '+' : t.type === 'despesa' ? '−' : ''}{money(t.amount)}</b>
              {editable && <div className="flex gap-0.5">
                <button type="button" className="btn-ghost btn-icon" onClick={() => setEdit(t)} aria-label="Editar"><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                <button type="button" className="btn-ghost btn-icon text-danger" onClick={() => remove(t)} aria-label="Apagar"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
              </div>}
            </li>
          ))}
        </ul>
      )}
      {edit && <TxModal space={space} tx={edit} accounts={accs} cats={cats.data?.items || []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); tx.reload(); }} />}
      {importing && <ImportModal space={space} accounts={accs} cats={cats.data?.items || []} onClose={() => setImporting(false)} onDone={() => { setImporting(false); tx.reload(); accounts.reload(); }} />}
    </div>
  );
}

// -------- Importar extrato (OFX / CSV / PDF) --------
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
    r.readAsDataURL(file);
  });
}
function ImportModal({ space, accounts, cats, onClose, onDone }) {
  const { toast } = useUI();
  const base = `/personal/spaces/${space.id}`;
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState(null); // { format, account, total, novos, duplicados, lines:[{...checked}] }
  const [defaultCat, setDefaultCat] = useState('');
  const expenseCats = cats.filter((c) => !c.archived && c.type === 'despesa');

  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!accountId) { setErr('Escolha a conta antes.'); return; }
    setErr(''); setBusy(true); setPreview(null);
    try {
      const content_base64 = await fileToBase64(file);
      const res = await api.post(`${base}/import/preview`, { account_id: accountId, filename: file.name, content_base64 });
      setPreview({ ...res, lines: res.lines.map((l) => ({ ...l, checked: !l.duplicate })) });
    } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); e.target.value = ''; }
  };
  const toggle = (i) => setPreview((p) => ({ ...p, lines: p.lines.map((l, j) => (j === i ? { ...l, checked: !l.checked } : l)) }));
  const commit = async () => {
    const lines = preview.lines.filter((l) => l.checked && !l.duplicate)
      .map((l) => ({ date: l.date, amount: l.amount, type: l.type, description: l.description, line_hash: l.line_hash, category_id: l.type === 'despesa' ? (defaultCat || null) : null }));
    if (!lines.length) { setErr('Nenhuma linha nova selecionada.'); return; }
    setBusy(true); setErr('');
    try { const r = await api.post(`${base}/import/commit`, { account_id: accountId, lines }); toast(`${r.imported} lançamento(s) importado(s).`); onDone(); }
    catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} size="lg" title="Importar extrato do banco"
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Fechar</button>
        {preview && <SubmitButton loading={busy} onClick={commit}>Importar selecionados</SubmitButton>}</>}>
      <div className="space-y-4">
        {err && <div className="rounded-app-sm bg-danger-soft p-2 text-sm text-danger">{err}</div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Conta de destino" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <div>
            <span className="label">Arquivo do extrato</span>
            <label className="btn-outline mt-1 w-full cursor-pointer justify-center">
              <Upload className="h-4 w-4" aria-hidden="true" /> Escolher arquivo
              <input type="file" accept=".ofx,.csv,.pdf,text/csv,application/pdf" className="sr-only" onChange={onFile} disabled={busy || !accountId} />
            </label>
          </div>
        </div>
        <p className="text-xs text-ink-faint">Aceita <b>OFX</b> e <b>CSV</b> (exportados pelo app do banco) e <b>PDF</b>. O PDF é lido pelo assistente de IA — precisa estar ligado em Configurações › IA. OFX e CSV são os mais precisos.</p>

        {busy && !preview && <div className="flex items-center gap-2 text-sm text-ink-faint"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Lendo o extrato…</div>}

        {preview && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="brand">{preview.format.toUpperCase()}</Badge>
              <span>{preview.total} lançamento(s): <b className="text-positive">{preview.novos} novo(s)</b>{preview.duplicados > 0 && <>, <b className="text-ink-faint">{preview.duplicados} já importado(s)</b></>}</span>
              {expenseCats.length > 0 && <span className="ml-auto flex items-center gap-1">Categoria das saídas:
                <select className="input h-8 w-40 py-0 text-sm" value={defaultCat} onChange={(e) => setDefaultCat(e.target.value)}><option value="">Sem categoria</option>{expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              </span>}
            </div>
            <div className="max-h-80 overflow-auto rounded-app-sm border border-line">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface"><tr className="border-b border-line text-left text-xs text-ink-faint"><th className="p-2" /><th className="p-2">Data</th><th className="p-2">Descrição</th><th className="p-2 text-right">Valor</th></tr></thead>
                <tbody>
                  {preview.lines.map((l, i) => (
                    <tr key={i} className={cx('border-b border-line/60', l.duplicate && 'opacity-50')}>
                      <td className="p-2"><input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={l.checked} disabled={l.duplicate} onChange={() => toggle(i)} /></td>
                      <td className="whitespace-nowrap p-2">{date(l.date)}</td>
                      <td className="p-2">{l.description || '—'}{l.duplicate && <Badge>já importado</Badge>}</td>
                      <td className={cx('whitespace-nowrap p-2 text-right tabular-nums', l.type === 'receita' ? 'text-positive' : 'text-danger')}>{l.type === 'receita' ? '+' : '−'}{money(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
function TxIcon({ type }) {
  if (type === 'receita') return <span className="rounded-full bg-positive/15 p-1 text-positive"><TrendingUp className="h-4 w-4" aria-hidden="true" /></span>;
  if (type === 'despesa') return <span className="rounded-full bg-danger/15 p-1 text-danger"><TrendingDown className="h-4 w-4" aria-hidden="true" /></span>;
  return <span className="rounded-full bg-line p-1 text-ink-soft"><ArrowLeftRight className="h-4 w-4" aria-hidden="true" /></span>;
}
function TxModal({ space, tx, accounts, cats, onClose, onSaved }) {
  const isNew = !tx.id;
  const [f, setF] = useState({ type: tx.type || 'despesa', amount: tx.amount ?? null, date: tx.date || today(), account_id: tx.account_id || accounts[0]?.id || '',
    transfer_account_id: tx.transfer_account_id || '', category_id: tx.category_id || '', description: tx.description || '', paid: tx.paid ?? true });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const catsOfType = cats.filter((c) => !c.archived && c.type === (f.type === 'receita' ? 'receita' : 'despesa'));
  const submit = async () => {
    if (!f.amount || f.amount <= 0) { setErr('Informe o valor.'); return; }
    if (f.type === 'transferencia' && (!f.transfer_account_id || f.transfer_account_id === f.account_id)) { setErr('Escolha a conta de destino.'); return; }
    setBusy(true); setErr('');
    const body = { type: f.type, amount: f.amount, date: f.date, account_id: f.account_id, description: f.description || null, paid: f.paid,
      transfer_account_id: f.type === 'transferencia' ? f.transfer_account_id : null, category_id: f.type === 'transferencia' ? null : (f.category_id || null) };
    try { await api[isNew ? 'post' : 'put'](isNew ? `/personal/spaces/${space.id}/transactions` : `/personal/spaces/${space.id}/transactions/${tx.id}`, body); onSaved(); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} onSubmit={submit} title={isNew ? 'Novo lançamento' : 'Editar lançamento'}
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={busy}>Salvar</SubmitButton></>}>
      <div className="space-y-4">
        {err && <div className="rounded-app-sm bg-danger-soft p-2 text-sm text-danger">{err}</div>}
        <div className="grid grid-cols-3 gap-2">
          {['receita', 'despesa', 'transferencia'].map((t) => (
            <button key={t} type="button" className={cx('rounded-app-sm border px-2 py-2 text-sm', f.type === t ? 'border-brand bg-brand/10 font-medium' : 'border-line')} onClick={() => setF({ ...f, type: t })}>
              {t === 'receita' ? 'Entrada' : t === 'despesa' ? 'Saída' : 'Transferência'}
            </button>
          ))}
        </div>
        <MoneyInput label="Valor" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={f.type === 'transferencia' ? 'Conta de origem' : 'Conta'} value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value })}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          {f.type === 'transferencia'
            ? <Select label="Conta de destino" value={f.transfer_account_id} onChange={(e) => setF({ ...f, transfer_account_id: e.target.value })}><option value="">Escolha…</option>{accounts.filter((a) => a.id !== f.account_id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
            : <Select label="Categoria" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}><option value="">Sem categoria</option>{catsOfType.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Data" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <Input label="Descrição (opcional)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </div>
        {f.type !== 'transferencia' && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={f.paid} onChange={(e) => setF({ ...f, paid: e.target.checked })} /> Já {f.type === 'receita' ? 'recebido' : 'pago'} (entra no saldo)</label>
        )}
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------- Contas e categorias
function AccountsTab({ space }) {
  const { toast, confirm } = useUI();
  const base = `/personal/spaces/${space.id}`;
  const accounts = useAsync(() => api.get(`${base}/accounts`), [space.id]);
  const cats = useAsync(() => api.get(`${base}/categories`), [space.id]);
  const [accModal, setAccModal] = useState(null);
  const [catModal, setCatModal] = useState(null);
  const editable = canEdit(space.role);
  const removeAcc = async (a) => { if (!(await confirm({ title: `Remover ${a.name}?`, message: 'Se houver lançamentos, a conta é arquivada.', confirmText: 'Remover' }))) return;
    try { await api.del(`${base}/accounts/${a.id}`); accounts.reload(); } catch (e) { toast(errorMessage(e), 'error'); } };
  const removeCat = async (c) => { try { await api.del(`${base}/categories/${c.id}`); cats.reload(); } catch (e) { toast(errorMessage(e), 'error'); } };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Contas</h3>{editable && <button type="button" className="btn-outline btn-sm" onClick={() => setAccModal({})}><Plus className="h-4 w-4" aria-hidden="true" /> Conta</button>}</div>
        {accounts.loading && !accounts.data ? <Loading /> : (
          <ul className="divide-y divide-line rounded-app-sm border border-line">
            {(accounts.data?.items || []).map((a) => (
              <li key={a.id} className={cx('flex items-center gap-2 px-3 py-2 text-sm', a.archived && 'opacity-50')}>
                <Wallet className="h-4 w-4 text-ink-faint" aria-hidden="true" />
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{a.name} {a.archived && <Badge>arquivada</Badge>}</div><div className="text-xs text-ink-faint">{KIND_LABEL[a.kind]} · saldo {money(a.balance)}</div></div>
                {editable && !a.archived && <><button type="button" className="btn-ghost btn-icon" onClick={() => setAccModal(a)} aria-label="Editar"><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                  <button type="button" className="btn-ghost btn-icon text-danger" onClick={() => removeAcc(a)} aria-label="Remover"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></>}
              </li>
            ))}
            {!(accounts.data?.items?.length) && <li className="px-3 py-2 text-sm text-ink-faint">Nenhuma conta.</li>}
          </ul>
        )}
      </section>
      <section>
        <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Categorias</h3>{editable && <button type="button" className="btn-outline btn-sm" onClick={() => setCatModal({ type: 'despesa' })}><Plus className="h-4 w-4" aria-hidden="true" /> Categoria</button>}</div>
        {cats.loading && !cats.data ? <Loading /> : (
          <div className="grid grid-cols-2 gap-4">
            {['despesa', 'receita'].map((type) => (
              <div key={type}>
                <h4 className="mb-1 text-xs font-semibold text-ink-faint">{type === 'despesa' ? 'Saídas' : 'Entradas'}</h4>
                <ul className="space-y-0.5">
                  {(cats.data?.items || []).filter((c) => c.type === type && !c.archived).map((c) => (
                    <li key={c.id} className="group flex items-center justify-between rounded-app-sm px-2 py-1 text-sm hover:bg-line/40"><span>{c.name}</span>
                      {editable && <button type="button" className="btn-ghost btn-icon opacity-0 group-hover:opacity-100" onClick={() => removeCat(c)} aria-label={`Remover ${c.name}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
      {accModal && <AccountModal space={space} acc={accModal} onClose={() => setAccModal(null)} onSaved={() => { setAccModal(null); accounts.reload(); }} />}
      {catModal && <CategoryModal space={space} cat={catModal} onClose={() => setCatModal(null)} onSaved={() => { setCatModal(null); cats.reload(); }} />}
    </div>
  );
}
function AccountModal({ space, acc, onClose, onSaved }) {
  const isNew = !acc.id;
  const [f, setF] = useState({ name: acc.name || '', kind: acc.kind || 'conta', opening_balance: acc.opening_balance ?? null });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async () => {
    if (!f.name.trim()) { setErr('Dê um nome.'); return; }
    setBusy(true); setErr('');
    try { await api[isNew ? 'post' : 'put'](isNew ? `/personal/spaces/${space.id}/accounts` : `/personal/spaces/${space.id}/accounts/${acc.id}`, { name: f.name.trim(), kind: f.kind, opening_balance: f.opening_balance ?? 0 }); onSaved(); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} onSubmit={submit} title={isNew ? 'Nova conta' : 'Editar conta'}
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={busy}>Salvar</SubmitButton></>}>
      <div className="space-y-4">
        {err && <div className="rounded-app-sm bg-danger-soft p-2 text-sm text-danger">{err}</div>}
        <Input label="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-autofocus />
        <Select label="Tipo" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        <MoneyInput label="Saldo inicial" hint="Quanto há nesta conta hoje." value={f.opening_balance} onChange={(v) => setF({ ...f, opening_balance: v })} />
      </div>
    </Modal>
  );
}
function CategoryModal({ space, cat, onClose, onSaved }) {
  const [f, setF] = useState({ name: cat.name || '', type: cat.type || 'despesa' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async () => { if (!f.name.trim()) { setErr('Dê um nome.'); return; } setBusy(true); setErr('');
    try { await api.post(`/personal/spaces/${space.id}/categories`, { name: f.name.trim(), type: f.type }); onSaved(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); } };
  return (
    <Modal open onClose={onClose} onSubmit={submit} title="Nova categoria" footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={busy}>Salvar</SubmitButton></>}>
      <div className="space-y-4">
        {err && <div className="rounded-app-sm bg-danger-soft p-2 text-sm text-danger">{err}</div>}
        <Input label="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-autofocus />
        <Select label="Tipo" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="despesa">Saída</option><option value="receita">Entrada</option></Select>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------- Orçamentos
function BudgetsTab({ space }) {
  const { toast } = useUI();
  const month = today().slice(0, 7);
  const base = `/personal/spaces/${space.id}`;
  const bud = useAsync(() => api.get(`${base}/budgets${qs({ month })}`), [space.id]);
  const cats = useAsync(() => api.get(`${base}/categories`), [space.id]);
  const editable = canEdit(space.role);
  const [add, setAdd] = useState(false);
  const save = async (category_id, amount) => { try { await api.put(`${base}/budgets`, { category_id, month: 'sempre', amount }); bud.reload(); } catch (e) { toast(errorMessage(e), 'error'); } };
  if (bud.loading && !bud.data) return <Loading />;
  const items = bud.data?.items || [];
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-faint">Defina um limite por categoria e acompanhe o quanto já gastou no mês.</p>
      {!items.length ? (
        <EmptyState icon={PieChart} title="Sem orçamentos" action={editable && <button type="button" className="btn-primary" onClick={() => setAdd(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Definir orçamento</button>}>Escolha uma categoria e um limite mensal.</EmptyState>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((b) => {
              const pct = b.amount > 0 ? Math.min(100, Math.round((b.spent / b.amount) * 100)) : 0;
              const over = b.spent > b.amount;
              return (
                <li key={b.id} className="rounded-app-sm border border-line p-3">
                  <div className="flex justify-between text-sm"><b>{b.category_name}</b><span className={cx('tabular-nums', over && 'text-danger')}>{money(b.spent)} / {money(b.amount)}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-line"><div className={cx('h-2 rounded-full', over ? 'bg-danger' : 'bg-brand')} style={{ width: `${pct}%` }} /></div>
                </li>
              );
            })}
          </ul>
          {editable && <button type="button" className="btn-outline btn-sm" onClick={() => setAdd(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Novo orçamento</button>}
        </>
      )}
      {add && <BudgetModal cats={(cats.data?.items || []).filter((c) => c.type === 'despesa' && !c.archived)} onClose={() => setAdd(false)} onSave={async (cid, amt) => { await save(cid, amt); setAdd(false); }} />}
    </div>
  );
}
function BudgetModal({ cats, onClose, onSave }) {
  const [f, setF] = useState({ category_id: cats[0]?.id || '', amount: null });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async () => { if (!f.category_id || !f.amount) { setErr('Escolha a categoria e o valor.'); return; } setBusy(true); try { await onSave(f.category_id, f.amount); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); } };
  return (
    <Modal open onClose={onClose} onSubmit={submit} title="Orçamento da categoria" footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={busy}>Salvar</SubmitButton></>}>
      <div className="space-y-4">
        {err && <div className="rounded-app-sm bg-danger-soft p-2 text-sm text-danger">{err}</div>}
        <Select label="Categoria" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <MoneyInput label="Limite mensal" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------- Metas
function GoalsTab({ space }) {
  const { toast, confirm } = useUI();
  const base = `/personal/spaces/${space.id}`;
  const goals = useAsync(() => api.get(`${base}/goals`), [space.id]);
  const editable = canEdit(space.role);
  const [modal, setModal] = useState(null);
  const [contrib, setContrib] = useState(null);
  const remove = async (g) => { if (!(await confirm({ title: `Apagar a meta ${g.name}?`, confirmText: 'Apagar' }))) return; try { await api.del(`${base}/goals/${g.id}`); goals.reload(); } catch (e) { toast(errorMessage(e), 'error'); } };
  if (goals.loading && !goals.data) return <Loading />;
  const items = (goals.data?.items || []).filter((g) => !g.archived);
  return (
    <div className="space-y-3">
      <div className="flex justify-between"><p className="text-sm text-ink-faint">Junte dinheiro para objetivos (viagem, reserva, troca de carro).</p>{editable && <button type="button" className="btn-outline btn-sm" onClick={() => setModal({})}><Plus className="h-4 w-4" aria-hidden="true" /> Nova meta</button>}</div>
      {!items.length ? <EmptyState icon={Target} title="Sem metas">Crie uma meta e registre aportes.</EmptyState> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((g) => (
            <div key={g.id} className="rounded-app-sm border border-line p-3">
              <div className="flex items-start justify-between"><b>{g.name}</b>{editable && <button type="button" className="btn-ghost btn-icon text-danger" onClick={() => remove(g)} aria-label="Apagar"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}</div>
              <div className="mt-1 text-sm text-ink-faint">{money(g.saved)} de {money(g.target)}{g.due_date ? ` · até ${date(g.due_date)}` : ''}</div>
              <div className="mt-1 h-2 rounded-full bg-line"><div className="h-2 rounded-full bg-brand" style={{ width: `${g.progress}%` }} /></div>
              {editable && <button type="button" className="btn-outline btn-sm mt-2" onClick={() => setContrib(g)}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Guardar dinheiro</button>}
            </div>
          ))}
        </div>
      )}
      {modal && <GoalModal space={space} onClose={() => setModal(null)} onSaved={() => { setModal(null); goals.reload(); }} />}
      {contrib && <ContribModal space={space} goal={contrib} onClose={() => setContrib(null)} onSaved={() => { setContrib(null); goals.reload(); }} />}
    </div>
  );
}
function GoalModal({ space, onClose, onSaved }) {
  const [f, setF] = useState({ name: '', target: null, due_date: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async () => { if (!f.name.trim() || !f.target) { setErr('Informe o nome e o valor da meta.'); return; } setBusy(true);
    try { await api.post(`/personal/spaces/${space.id}/goals`, { name: f.name.trim(), target: f.target, due_date: f.due_date || null }); onSaved(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); } };
  return (
    <Modal open onClose={onClose} onSubmit={submit} title="Nova meta" footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={busy}>Criar</SubmitButton></>}>
      <div className="space-y-4">
        {err && <div className="rounded-app-sm bg-danger-soft p-2 text-sm text-danger">{err}</div>}
        <Input label="Objetivo" placeholder="Ex.: Viagem, Reserva de emergência" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-autofocus />
        <MoneyInput label="Quanto quer juntar" value={f.target} onChange={(v) => setF({ ...f, target: v })} />
        <Input label="Prazo (opcional)" type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} />
      </div>
    </Modal>
  );
}
function ContribModal({ space, goal, onClose, onSaved }) {
  const [amount, setAmount] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async () => { if (!amount) { setErr('Informe o valor.'); return; } setBusy(true);
    try { await api.post(`/personal/spaces/${space.id}/goals/${goal.id}/contribute`, { amount }); onSaved(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); } };
  return (
    <Modal open onClose={onClose} onSubmit={submit} title={`Guardar para ${goal.name}`} footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={busy}>Guardar</SubmitButton></>}>
      <div className="space-y-4">{err && <div className="rounded-app-sm bg-danger-soft p-2 text-sm text-danger">{err}</div>}<MoneyInput label="Valor do aporte" value={amount} onChange={setAmount} /></div>
    </Modal>
  );
}

// ----------------------------------------------------------------- Recorrentes
function RecurringTab({ space }) {
  const { toast, confirm } = useUI();
  const base = `/personal/spaces/${space.id}`;
  const rec = useAsync(() => api.get(`${base}/recurring`), [space.id]);
  const accounts = useAsync(() => api.get(`${base}/accounts`), [space.id]);
  const cats = useAsync(() => api.get(`${base}/categories`), [space.id]);
  const editable = canEdit(space.role);
  const [modal, setModal] = useState(null);
  const run = async () => { try { const r = await api.post(`${base}/recurring/run`); toast(r.generated ? `${r.generated} lançamento(s) gerado(s).` : 'Nada vencido para lançar.'); rec.reload(); } catch (e) { toast(errorMessage(e), 'error'); } };
  const remove = async (r) => { if (!(await confirm({ title: 'Apagar recorrência?', confirmText: 'Apagar' }))) return; try { await api.del(`${base}/recurring/${r.id}`); rec.reload(); } catch (e) { toast(errorMessage(e), 'error'); } };
  if (rec.loading && !rec.data) return <Loading />;
  const items = rec.data?.items || [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-ink-faint">Contas fixas (salário, aluguel, assinaturas). Lance as vencidas com um clique.</p>
        <div className="flex gap-2">{items.length > 0 && editable && <button type="button" className="btn-outline btn-sm" onClick={run}><Check className="h-4 w-4" aria-hidden="true" /> Lançar vencidas</button>}{editable && <button type="button" className="btn-primary btn-sm" onClick={() => setModal({})}><Plus className="h-4 w-4" aria-hidden="true" /> Nova</button>}</div>
      </div>
      {!items.length ? <EmptyState icon={Repeat} title="Sem recorrências">Cadastre entradas e saídas que se repetem.</EmptyState> : (
        <ul className="divide-y divide-line rounded-app-sm border border-line">
          {items.map((r) => (
            <li key={r.id} className={cx('flex items-center gap-3 px-3 py-2 text-sm', !r.active && 'opacity-50')}>
              <TxIcon type={r.type} />
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.description || r.category_name || (r.type === 'receita' ? 'Entrada' : 'Saída')}</div><div className="text-xs text-ink-faint">{INTERVAL_LABEL[r.interval]} · {r.account_name} · próxima {date(r.next_date)}</div></div>
              <b className="tabular-nums">{money(r.amount)}</b>
              {editable && <button type="button" className="btn-ghost btn-icon text-danger" onClick={() => remove(r)} aria-label="Apagar"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
            </li>
          ))}
        </ul>
      )}
      {modal && <RecurringModal space={space} accounts={(accounts.data?.items || []).filter((a) => !a.archived)} cats={cats.data?.items || []} onClose={() => setModal(null)} onSaved={() => { setModal(null); rec.reload(); }} />}
    </div>
  );
}
function RecurringModal({ space, accounts, cats, onClose, onSaved }) {
  const [f, setF] = useState({ type: 'despesa', amount: null, account_id: accounts[0]?.id || '', category_id: '', description: '', interval: 'mensal', next_date: today() });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const catsOfType = cats.filter((c) => !c.archived && c.type === f.type);
  const submit = async () => { if (!f.amount || !f.account_id) { setErr('Informe valor e conta.'); return; } setBusy(true);
    try { await api.post(`/personal/spaces/${space.id}/recurring`, { ...f, category_id: f.category_id || null, description: f.description || null }); onSaved(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); } };
  return (
    <Modal open onClose={onClose} onSubmit={submit} title="Nova recorrência" footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={busy}>Salvar</SubmitButton></>}>
      <div className="space-y-4">
        {err && <div className="rounded-app-sm bg-danger-soft p-2 text-sm text-danger">{err}</div>}
        <div className="grid grid-cols-2 gap-2">{['receita', 'despesa'].map((t) => <button key={t} type="button" className={cx('rounded-app-sm border px-2 py-2 text-sm', f.type === t ? 'border-brand bg-brand/10 font-medium' : 'border-line')} onClick={() => setF({ ...f, type: t, category_id: '' })}>{t === 'receita' ? 'Entrada' : 'Saída'}</button>)}</div>
        <MoneyInput label="Valor" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Conta" value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
          <Select label="Categoria" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}><option value="">Sem categoria</option>{catsOfType.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Repete" value={f.interval} onChange={(e) => setF({ ...f, interval: e.target.value })}>{Object.entries(INTERVAL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          <Input label="Primeira data" type="date" value={f.next_date} onChange={(e) => setF({ ...f, next_date: e.target.value })} />
        </div>
        <Input label="Descrição (opcional)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------- Compartilhar
function ShareTab({ space, onChanged }) {
  const { user: me } = useAuth();
  const { toast, confirm } = useUI();
  const base = `/personal/spaces/${space.id}`;
  const detail = useAsync(() => api.get(base), [space.id]);
  const [invite, setInvite] = useState(false);
  const isOwner = space.role === 'dono';
  if (detail.loading && !detail.data) return <Loading />;
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />;
  const { members = [], invites = [] } = detail.data || {};
  const myId = me?.id;
  const setRole = async (userId, role) => { try { await api.put(`${base}/members/${userId}`, { role }); detail.reload(); onChanged?.(); } catch (e) { toast(errorMessage(e), 'error'); } };
  const removeMember = async (m) => {
    const self = m.user_id === myId;
    if (!(await confirm({ title: self ? 'Sair do espaço?' : `Remover ${m.name}?`, message: self ? 'Você perde o acesso a este espaço.' : '', confirmText: self ? 'Sair' : 'Remover' }))) return;
    try { await api.del(`${base}/members/${m.user_id}`); if (self) onChanged?.(); else detail.reload(); } catch (e) { toast(errorMessage(e), 'error'); }
  };
  const cancelInvite = async (id) => { try { await api.del(`${base}/invites/${id}`); detail.reload(); } catch (e) { toast(errorMessage(e), 'error'); } };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-ink-faint">Quem acessa este espaço. {isOwner ? 'Convide outras pessoas e defina o que cada uma pode fazer.' : 'Só o dono gerencia os participantes.'}</p>
        {isOwner && <button type="button" className="btn-primary btn-sm" onClick={() => setInvite(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Convidar</button>}</div>
      <ul className="divide-y divide-line rounded-app-sm border border-line">
        {members.map((m) => (
          <li key={m.user_id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <Avatar name={m.name} />
            <div className="min-w-0 flex-1"><div className="truncate font-medium">{m.name} {m.user_id === myId && <Badge>Você</Badge>} {m.pending && <Badge tone="warn">convite pendente</Badge>}</div><div className="truncate text-xs text-ink-faint">{m.email}</div></div>
            {isOwner && !m.pending && m.user_id !== myId
              ? <select className="input h-8 w-36 py-0 text-sm" value={m.role} onChange={(e) => setRole(m.user_id, e.target.value)}>{Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              : <Badge tone={m.role === 'dono' ? 'brand' : 'neutral'}>{ROLE_LABEL[m.role]}</Badge>}
            {(m.user_id === myId || (isOwner && m.user_id !== myId)) && (
              <button type="button" className="btn-ghost btn-icon text-danger" onClick={() => removeMember(m)} aria-label={m.user_id === myId ? 'Sair' : `Remover ${m.name}`}>{m.user_id === myId ? <LogOut className="h-4 w-4" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}</button>
            )}
          </li>
        ))}
      </ul>
      {invites.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold text-ink-faint">Convites por e-mail (ainda sem conta)</h4>
          <ul className="divide-y divide-line rounded-app-sm border border-line">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-2 px-3 py-2 text-sm"><Mail className="h-4 w-4 text-ink-faint" aria-hidden="true" /><span className="flex-1">{i.email} · {ROLE_LABEL[i.role]}</span>
                {isOwner && <button type="button" className="btn-ghost btn-icon text-danger" onClick={() => cancelInvite(i.id)} aria-label="Cancelar convite"><X className="h-4 w-4" aria-hidden="true" /></button>}</li>
            ))}
          </ul>
        </div>
      )}
      {isOwner && space.role === 'dono' && (
        <div className="rounded-app-sm border border-danger/30 p-3">
          <h4 className="text-sm font-semibold text-danger">Apagar o espaço</h4>
          <p className="mb-2 text-xs text-ink-faint">Apaga contas, lançamentos, metas e tira o acesso de todos. Não dá para desfazer.</p>
          <button type="button" className="btn-outline btn-sm text-danger" onClick={async () => { if (await confirm({ title: `Apagar o espaço ${space.name}?`, message: 'Esta ação é permanente.', confirmText: 'Apagar tudo', danger: true })) { try { await api.del(base); onChanged?.(); } catch (e) { toast(errorMessage(e), 'error'); } } }}><Trash2 className="h-4 w-4" aria-hidden="true" /> Apagar espaço</button>
        </div>
      )}
      {invite && <InviteSpaceModal space={space} onClose={() => setInvite(false)} onSaved={() => { setInvite(false); detail.reload(); }} />}
    </div>
  );
}
function InviteSpaceModal({ space, onClose, onSaved }) {
  const { toast } = useUI();
  const [f, setF] = useState({ email: '', role: 'editor' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async () => { if (!f.email.trim()) { setErr('Informe o e-mail.'); return; } setBusy(true); setErr('');
    try { const r = await api.post(`/personal/spaces/${space.id}/invites`, { email: f.email.trim(), role: f.role }); toast(r.pending_user ? 'Convite enviado: a pessoa aceita ao entrar no CIFREN.' : 'Convite guardado: vale quando a pessoa criar a conta com este e-mail.'); onSaved(); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); } };
  return (
    <Modal open onClose={onClose} onSubmit={submit} title="Convidar para o espaço" subtitle="A pessoa precisa ter (ou criar) uma conta no CIFREN com este e-mail."
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={busy}>Convidar</SubmitButton></>}>
      <div className="space-y-4">
        {err && <div className="rounded-app-sm bg-danger-soft p-2 text-sm text-danger">{err}</div>}
        <Input label="E-mail" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} data-autofocus />
        <Select label="Pode" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          <option value="editor">Editar (lançar e alterar)</option><option value="visualizador">Só visualizar</option>
        </Select>
      </div>
    </Modal>
  );
}
