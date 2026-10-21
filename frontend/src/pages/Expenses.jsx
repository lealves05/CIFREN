import { useEffect, useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Receipt, Plus, Trash2, Send, Pencil, Wallet, Paperclip, ClipboardCheck, UserCheck, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { api, qs, errorMessage, notifyCountsChanged } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { loadRefs } from '../lib/refData';
import { P } from '../lib/permissions';
import { money, date, dateTime, round2, today, accountTypeLabel } from '../lib/format';
import Modal from '../components/Modal';
import Drawer from '../components/Drawer';
import MoneyInput from '../components/MoneyInput';
import CategorySelect from '../components/CategorySelect';
import DocUploadButton from '../components/DocUploadButton';
import { PageHeader, Tabs, Loading, ErrorState, EmptyState, Badge, Input, Select, InlineError, SubmitButton, cx } from '../components/ui';
import { DRow } from '../components/kit';

const STATUS = {
  rascunho: { label: 'Rascunho', tone: 'neutral' },
  enviada: { label: 'Aguardando aprovação', tone: 'warn' },
  aprovada: { label: 'Aprovada — a pagar', tone: 'brand' },
  reprovada: { label: 'Reprovada', tone: 'danger' },
  paga: { label: 'Reembolsada', tone: 'positive' },
};
const sum = (items) => round2((items || []).reduce((a, i) => a + (Number(i.amount) || 0), 0));
const blank = () => ({ date: today(), description: '', category_id: null, amount: null, doc: null });

/** Nome da despesa ligado ao associado: digita e escolhe na lista; se não achar, o nome fica livre (sem vínculo). */
function MemberName({ value, member, onChange }) {
  const id = useId();
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrap = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => { api.get(`/expenses/members${qs({ q: value.trim() })}`).then((r) => { setList(r?.items || []); setActive(-1); }).catch(() => setList([])); }, 220);
    return () => clearTimeout(t);
  }, [value, open]);
  useEffect(() => {
    const close = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const pick = (m) => { onChange(m.name, m); setOpen(false); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && list[active]) { e.preventDefault(); pick(list[active]); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
  };
  return (
    <div ref={wrap} className="relative">
      <label htmlFor={id} className="label">Nome <span className="text-danger" aria-hidden="true">*</span></label>
      <div className="relative">
        <input id={id} className={cx('input', member && 'pr-9')} value={value} maxLength={150} autoComplete="off" placeholder="Nome do associado (ou digite outro nome)"
          role="combobox" aria-expanded={open} aria-controls={`${id}-l`} aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
          onFocus={() => setOpen(true)} onKeyDown={onKey}
          onChange={(e) => { onChange(e.target.value, member && e.target.value === member.name ? member : null); setOpen(true); }} />
        {member && <button type="button" className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-faint hover:text-ink" aria-label="Tirar o vínculo com o associado" onClick={() => onChange(value, null)}><X className="h-4 w-4" /></button>}
      </div>
      {member ? <p className="mt-1 flex items-center gap-1 text-xs text-positive"><UserCheck className="h-3.5 w-3.5" aria-hidden="true" /> Associado vinculado: o reembolso é pago a {member.name}.</p>
        : <p className="mt-1 text-xs text-ink-faint">Escolha o associado na lista. Não achou? Digite o nome: fica sem vínculo.</p>}
      {open && list.length > 0 && !(member && member.name === value) && (
        <ul id={`${id}-l`} role="listbox" aria-label="Associados" className="card absolute inset-x-0 top-[4.4rem] z-30 max-h-60 overflow-y-auto p-1 animate-pop">
          {list.map((m, i) => (
            <li key={m.id} id={`${id}-${i}`} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); pick(m); }}
              className={cx('cursor-pointer rounded-app-sm px-3 py-2 text-sm', i === active ? 'bg-muted' : 'hover:bg-muted')}>{m.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExpenseForm({ open, onClose, expense, onSaved }) {
  const { companies, companyId } = useAuth();
  const { toast } = useUI();
  const [f, setF] = useState(null);
  const [cats, setCats] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  useEffect(() => {
    if (!open) return;
    setError('');
    loadRefs(['categories']).then((r) => setCats(r.categories));
    setF(expense ? {
      company_id: expense.company?.id, title: expense.title, member: expense.member || null, event: expense.event || '',
      items: (expense.items || []).map((i) => ({ ...i, doc: i.document_id ? { id: i.document_id, filename: 'Comprovante' } : null })),
    } : { company_id: companyId || companies[0]?.id || '', title: '', member: null, event: '', items: [blank()] });
  }, [open, expense]); // eslint-disable-line react-hooks/exhaustive-deps
  const setItem = (i, k, v) => setF((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));
  const save = async (send) => {
    const items = f.items.filter((i) => i.description.trim() || i.amount);
    if (!f.title.trim()) { setError('Informe o nome: escolha o associado ou digite o nome.'); return; }
    if (!items.length || items.some((i) => !i.description.trim() || !(i.amount > 0) || !i.date)) { setError('Cada item precisa de data, descrição e valor.'); return; }
    setSaving(send ? 'send' : 'draft'); setError('');
    try {
      const body = {
        company_id: f.company_id, title: f.title.trim(), member_id: f.member?.id || null, event: f.event.trim() || null,
        items: items.map((i) => ({ date: i.date, description: i.description.trim(), category_id: i.category_id || null, amount: round2(i.amount), document_id: i.doc?.id || null })),
      };
      let id = expense?.id;
      if (id) await api.put(`/expenses/${id}`, body); else id = (await api.post('/expenses', body))?.id;
      if (send && id) await api.post(`/expenses/${id}/submit`);
      toast(send ? 'Enviado para aprovação.' : 'Rascunho salvo.');
      notifyCountsChanged(); onSaved(); onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(''); }
  };
  return (
    <Modal open={open} onClose={onClose} onSubmit={() => save(true)} size="lg" title={expense ? 'Editar despesa' : 'Nova despesa para reembolso'}
      subtitle="Junte os gastos que você pagou do próprio bolso. Anexe a foto de cada comprovante."
      footer={<><button type="button" className="btn-outline" onClick={() => save(false)} disabled={!!saving}>Salvar rascunho</button><SubmitButton loading={saving === 'send'}><Send className="h-4 w-4" aria-hidden="true" /> Enviar para aprovação</SubmitButton></>}>
      {f && (
        <div className="space-y-4">
          <InlineError error={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={companies.length > 1 ? '' : 'sm:col-span-2'}>
              <MemberName value={f.title} member={f.member} onChange={(title, member) => setF((x) => ({ ...x, title, member }))} />
            </div>
            {companies.length > 1 && <Select label="Empresa" value={f.company_id} onChange={(e) => setF({ ...f, company_id: e.target.value })}>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
            <Input className="sm:col-span-2" label="Evento" value={f.event} onChange={(e) => setF({ ...f, event: e.target.value })} maxLength={160} placeholder="Ex.: Encontro de motoclubes em Campinas" />
          </div>
          <ul className="space-y-3">
            {f.items.map((it, i) => (
              <li key={i} className="rounded-app-sm border border-line p-3">
                <div className="grid gap-3 sm:grid-cols-[140px_1fr_160px]">
                  <Input label="Data" type="date" value={it.date} onChange={(e) => setItem(i, 'date', e.target.value)} />
                  <Input label={`Gasto ${i + 1}`} value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} maxLength={200} placeholder="Ex.: Almoço, Uber, estacionamento" />
                  <MoneyInput label="Valor" value={it.amount} onChange={(v) => setItem(i, 'amount', v)} />
                </div>
                <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <CategorySelect categories={cats} type="despesa" value={it.category_id} onChange={(v) => setItem(i, 'category_id', v)} />
                  <div className="flex items-center gap-1">
                    <DocUploadButton companyId={f.company_id} value={it.doc} onChange={(d) => setItem(i, 'doc', d)} capture />
                    <button type="button" className="btn-ghost btn-icon text-danger" aria-label={`Tirar gasto ${i + 1}`} disabled={f.items.length === 1}
                      onClick={() => setF((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setF((x) => ({ ...x, items: [...x.items, blank()] }))}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Adicionar gasto</button>
            <span className="text-sm">Total: <strong className="tabular-nums">{money(sum(f.items))}</strong></span>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PayModal({ expense, onClose, onDone }) {
  const { toast } = useUI();
  const [accounts, setAccounts] = useState(null);
  const [f, setF] = useState({ account_id: '', paid_at: today() });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!expense) return;
    setError(''); setF({ account_id: '', paid_at: today() });
    loadRefs(['accounts']).then(({ accounts: a }) => {
      const act = a.filter((x) => x.active !== false && (!x.company_id || x.company_id === expense.company?.id));
      setAccounts(act); if (act.length === 1) setF((x) => ({ ...x, account_id: act[0].id }));
    });
  }, [expense]);
  const submit = async () => {
    if (!f.account_id) { setError('Escolha de qual conta sai o reembolso.'); return; }
    setSaving(true); setError('');
    try { await api.post(`/expenses/${expense.id}/pay`, f); toast('Reembolso pago e lançado.'); onDone(); onClose(); } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open={!!expense} onClose={onClose} onSubmit={submit} size="sm" title="Pagar reembolso" subtitle={expense && `${expense.user?.name} · ${money(expense.total)}`}
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving}>Confirmar pagamento</SubmitButton></>}>
      {!accounts ? <Loading /> : (
        <div className="space-y-4">
          <InlineError error={error} />
          <Select label="Pago com a conta" required value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value })}>
            <option value="">Escolha…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {accountTypeLabel(a.type)}</option>)}
          </Select>
          <Input label="Data do pagamento" type="date" value={f.paid_at} onChange={(e) => setF({ ...f, paid_at: e.target.value })} />
          <p className="text-xs text-ink-faint">O CIFREN cria a conta a pagar “Reembolso — {expense?.user?.name}” já baixada.</p>
        </div>
      )}
    </Modal>
  );
}

export default function Expenses() {
  const { can, user, companyId } = useAuth();
  const { toast } = useUI();
  const [params, setParams] = useSearchParams();
  const tabs = [
    can(P.expenseRequest) && { value: 'minhas', label: 'Minhas' },
    can(P.expenseApprove, P.approve) && { value: 'aprovar', label: 'Para aprovar' },
    can(P.expensePay) && { value: 'pagar', label: 'Para pagar' },
    can(P.expenseApprove, P.expensePay) && { value: 'todas', label: 'Todas' },
  ].filter(Boolean);
  const [tab, setTab] = useState(tabs[0]?.value || 'minhas');
  const [form, setForm] = useState(undefined);
  const [sel, setSel] = useState(null);
  const [pay, setPay] = useState(null);
  const query = { minhas: { mine: 1 }, aprovar: { status: 'enviada' }, pagar: { status: 'aprovada' }, todas: {} }[tab] || {};
  const { data, error, loading, reload } = useAsync(() => api.get(`/expenses${qs(query)}`), [tab]);
  const items = (data?.items || []).filter((e) => !companyId || !e.company?.id || e.company.id === companyId);
  useEffect(() => {
    const id = params.get('id');
    if (id && data) { const e = (data.items || []).find((x) => x.id === id); if (e) setSel(e); params.delete('id'); setParams(params, { replace: true }); }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = () => { reload(); notifyCountsChanged(); setSel(null); };
  const submit = async (e) => {
    try { await api.post(`/expenses/${e.id}/submit`); toast('Enviado para aprovação.'); changed(); } catch (err) { toast(errorMessage(err), 'error'); }
  };
  const mineOwner = (e) => e.user?.id === user?.id;
  const s = sel && (STATUS[sel.status] || { label: sel.status, tone: 'neutral' });

  return (
    <div>
      <PageHeader title="Despesas e reembolsos" icon={Receipt} subtitle="Gastos pagos do próprio bolso: envie, alguém aprova e o financeiro reembolsa."
        actions={can(P.expenseRequest) && <button type="button" className="btn-cta" onClick={() => setForm(null)}><Plus className="h-4 w-4" aria-hidden="true" /> Nova despesa</button>} />
      {tabs.length > 1 && <div className="card mb-4"><Tabs label="Lista" tabs={tabs} value={tab} onChange={setTab} className="px-2" /></div>}
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} className="card" /> : !items.length ? (
        <EmptyState className="card" icon={Receipt} title={tab === 'minhas' ? 'Você não tem despesas lançadas' : 'Nada nesta lista'}
          action={tab === 'minhas' && can(P.expenseRequest) && <button type="button" className="btn-primary" onClick={() => setForm(null)}><Plus className="h-4 w-4" aria-hidden="true" /> Lançar despesa</button>}>
          {tab === 'minhas' ? 'Tire foto dos comprovantes e peça o reembolso por aqui.' : ''}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((e) => {
            const st = STATUS[e.status] || { label: e.status, tone: 'neutral' };
            return (
              <li key={e.id}>
                <button type="button" onClick={() => setSel(e)} className="card focus-ring flex w-full flex-wrap items-center gap-3 p-4 text-left hover:border-accent/60">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{e.title}</span>{e.member && <Badge tone="brand">Associado</Badge>}<Badge tone={st.tone}>{st.label}</Badge></div>
                    {e.event && <div className="text-xs text-ink-soft">Evento: {e.event}</div>}
                    <div className="text-xs text-ink-faint">{e.number ? `#${e.number} · ` : ''}{e.user?.name} · {(e.items || []).length} gasto(s) · {dateTime(e.created_at)}</div>
                  </div>
                  <div className="text-lg font-semibold tabular-nums">{money(e.total)}</div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Drawer open={!!sel} onClose={() => setSel(null)} title={sel?.title || ''} subtitle={sel && `Despesa${sel.number ? ` #${sel.number}` : ''} · ${sel.user?.name || ''}`}
        footer={sel && (
          <>
            {sel.status === 'rascunho' && mineOwner(sel) && <button type="button" className="btn-outline" onClick={() => { setForm(sel); setSel(null); }}><Pencil className="h-4 w-4" aria-hidden="true" /> Editar</button>}
            {sel.status === 'rascunho' && mineOwner(sel) && <button type="button" className="btn-primary" onClick={() => submit(sel)}><Send className="h-4 w-4" aria-hidden="true" /> Enviar para aprovação</button>}
            {sel.status === 'enviada' && can(P.expenseApprove, P.approve) && !mineOwner(sel) && <Link to="/aprovacoes?entity=expense" className="btn-outline"><ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Aprovar ou reprovar</Link>}
            {sel.status === 'aprovada' && can(P.expensePay) && <button type="button" className="btn-cta" onClick={() => setPay(sel)}><Wallet className="h-4 w-4" aria-hidden="true" /> Pagar reembolso</button>}
          </>
        )}>
        {sel && (
          <div className="space-y-4">
            <Badge tone={s.tone}>{s.label}</Badge>
            <dl className="divide-y divide-line">
              {sel.member && <DRow label="Associado">{sel.member.name}</DRow>}
              {sel.event && <DRow label="Evento">{sel.event}</DRow>}
              <DRow label="Lançado por">{sel.user?.name}</DRow>
              <DRow label="Empresa">{sel.company?.name}</DRow>
              <DRow label="Total">{money(sel.total)}</DRow>
            </dl>
            <ul className="divide-y divide-line rounded-app-sm border border-line">
              {(sel.items || []).map((i, k) => (
                <li key={k} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1"><span className="block">{i.description}</span><span className="text-xs text-ink-faint">{date(i.date)}</span></span>
                  {i.document_id
                    ? <Link to={`/documentos/${i.document_id}`} className="inline-flex items-center gap-1 text-xs font-medium text-positive hover:underline"><Paperclip className="h-3 w-3" aria-hidden="true" /> comprovante</Link>
                    : <span className="text-xs text-warn">sem comprovante</span>}
                  <span className={cx('w-24 text-right tabular-nums')}>{money(i.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Drawer>
      <ExpenseForm open={form !== undefined} expense={form} onClose={() => setForm(undefined)} onSaved={changed} />
      <PayModal expense={pay} onClose={() => setPay(null)} onDone={changed} />
    </div>
  );
}
