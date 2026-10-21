import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ShoppingCart, Plus, Trash2, Truck, PackageCheck, FileCheck2, Ban, Sparkles, ClipboardCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { api, qs, errorMessage, notifyCountsChanged } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useApiError } from '../lib/useApiError';
import { loadRefs } from '../lib/refData';
import { P } from '../lib/permissions';
import { money, date, dateTime, round2, today } from '../lib/format';
import Modal from '../components/Modal';
import Drawer from '../components/Drawer';
import MoneyInput from '../components/MoneyInput';
import CategorySelect from '../components/CategorySelect';
import CounterpartyPicker from '../components/CounterpartyPicker';
import DocUploadButton from '../components/DocUploadButton';
import { PageHeader, Tabs, Loading, ErrorState, EmptyState, Badge, Input, Select, Textarea, Toggle, InlineError, SubmitButton, Spinner, cx } from '../components/ui';
import { DRow, Notice } from '../components/kit';

export const PURCHASE_STATUS = {
  solicitada: { label: 'Aguardando aprovação', tone: 'warn' },
  aprovada: { label: 'Aprovada', tone: 'brand' },
  reprovada: { label: 'Reprovada', tone: 'danger' },
  pedido: { label: 'Pedido feito', tone: 'brand' },
  recebida: { label: 'Recebida', tone: 'positive' },
  faturada: { label: 'Faturada', tone: 'positive' },
  cancelada: { label: 'Cancelada', tone: 'neutral' },
};
const TABS = [
  { value: '', label: 'Todas' }, { value: 'solicitada', label: 'Em aprovação' }, { value: 'aprovada', label: 'Aprovadas' },
  { value: 'pedido', label: 'Pedidos' }, { value: 'recebida', label: 'Recebidas' }, { value: 'faturada', label: 'Faturadas' },
];
const STEPS = ['solicitada', 'aprovada', 'pedido', 'recebida', 'faturada'];
const itemsTotal = (items) => round2((items || []).reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.unit_price) || 0), 0));

function RequestForm({ open, onClose, onSaved }) {
  const { companies, companyId } = useAuth();
  const { toast } = useUI();
  const [f, setF] = useState({});
  const [refs, setRefs] = useState({ categories: [], costCenters: [] });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError('');
    setF({ company_id: companyId || companies[0]?.id || '', title: '', needed_by: '', notes: '', category_id: null, cost_center_id: null, items: [{ description: '', qty: 1, unit_price: null }] });
    loadRefs(['categories', 'costCenters']).then(setRefs);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const setItem = (i, k, v) => setF((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));
  const submit = async () => {
    const items = (f.items || []).filter((i) => i.description.trim());
    if (!f.title.trim()) { setError('Diga o que precisa comprar (ex.: Material de limpeza).'); return; }
    if (!items.length) { setError('Inclua pelo menos um item.'); return; }
    setSaving(true); setError('');
    try {
      const res = await api.post('/purchases', {
        company_id: f.company_id, title: f.title.trim(), needed_by: f.needed_by || undefined, notes: f.notes.trim() || undefined,
        category_id: f.category_id || undefined, cost_center_id: f.cost_center_id || undefined,
        items: items.map((i) => ({ description: i.description.trim(), qty: Number(i.qty) || 1, unit_price: round2(i.unit_price || 0) })),
      });
      toast(res?.status === 'aprovada' ? 'Solicitação criada e já aprovada.' : 'Solicitação enviada para aprovação.');
      notifyCountsChanged(); onSaved(); onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} onSubmit={submit} size="lg" title="Nova solicitação de compra"
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving}>Enviar solicitação</SubmitButton></>}>
      {f.items && (
        <div className="space-y-4">
          <InlineError error={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input className="sm:col-span-2" label="O que precisa" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={150} placeholder="Ex.: Material de escritório" data-autofocus />
            {companies.length > 1 && (
              <Select label="Empresa" value={f.company_id} onChange={(e) => setF({ ...f, company_id: e.target.value })}>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            )}
            <Input label="Precisa até" type="date" value={f.needed_by} onChange={(e) => setF({ ...f, needed_by: e.target.value })} />
            <CategorySelect categories={refs.categories} type="despesa" value={f.category_id} onChange={(v) => setF({ ...f, category_id: v })} />
            <Select label="Centro de custo" value={f.cost_center_id || ''} onChange={(e) => setF({ ...f, cost_center_id: e.target.value || null })}>
              <option value="">Nenhum</option>{refs.costCenters.filter((c) => c.active !== false).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <fieldset className="rounded-app-sm border border-line p-3">
            <legend className="px-1 text-xs font-medium text-ink-soft">Itens</legend>
            <ul className="space-y-3">
              {f.items.map((it, i) => (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_80px_140px_auto] sm:items-end">
                  <Input className="col-span-3 sm:col-span-1" label={`Item ${i + 1}`} value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} maxLength={200} />
                  <Input label="Qtd." type="number" min={1} value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} />
                  <MoneyInput label="Preço unit. (estimado)" value={it.unit_price} onChange={(v) => setItem(i, 'unit_price', v)} />
                  <button type="button" className="btn-ghost btn-icon self-end text-danger" aria-label={`Tirar item ${i + 1}`} disabled={f.items.length === 1}
                    onClick={() => setF((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setF((x) => ({ ...x, items: [...x.items, { description: '', qty: 1, unit_price: null }] }))}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Adicionar item</button>
              <span className="text-sm">Total estimado: <strong className="tabular-nums">{money(itemsTotal(f.items))}</strong></span>
            </div>
          </fieldset>
          <Textarea label="Observações" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} />
        </div>
      )}
    </Modal>
  );
}

function OrderModal({ purchase, onClose, onDone }) {
  const { toast } = useUI();
  const [supplier, setSupplier] = useState(null);
  const [total, setTotal] = useState(null);
  const [expected, setExpected] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const sugg = useAsync(() => (purchase ? api.get(`/purchases/${purchase.id}/supplier-suggestions`).catch(() => ({ items: [] })) : Promise.resolve(null)), [purchase?.id]);
  useEffect(() => { if (purchase) { setSupplier(purchase.supplier || null); setTotal(purchase.total ?? null); setExpected(''); setError(''); } }, [purchase]);
  const submit = async () => {
    if (!supplier) { setError('Escolha o fornecedor.'); return; }
    setSaving(true); setError('');
    try {
      await api.post(`/purchases/${purchase.id}/order`, { supplier_id: supplier.id, total: total ?? undefined, expected_at: expected || undefined });
      toast('Pedido registrado.'); onDone(); onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };
  const list = sugg.data?.items || [];
  return (
    <Modal open={!!purchase} onClose={onClose} onSubmit={submit} title="Fazer pedido ao fornecedor" subtitle={purchase && `${purchase.number ? `#${purchase.number} · ` : ''}${purchase.title}`}
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving}>Registrar pedido</SubmitButton></>}>
      <div className="space-y-4">
        <InlineError error={error} />
        <section className="rounded-app-sm border border-violet-500/30 bg-violet-500/5 p-3" aria-labelledby="ag-compras">
          <h3 id="ag-compras" className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-300" aria-hidden="true" /> Sugestões do Agente de Compras</h3>
          {sugg.loading ? <div className="py-2"><Spinner /></div> : !list.length ? <p className="mt-1 text-xs text-ink-faint">Sem histórico de compras parecidas ainda.</p> : (
            <ul className="mt-2 space-y-1.5">
              {list.map((s) => (
                <li key={s.supplier?.id}>
                  <button type="button" onClick={() => setSupplier(s.supplier)} className={cx('focus-ring w-full rounded-app-sm border px-3 py-2 text-left text-sm', supplier?.id === s.supplier?.id ? 'border-accent bg-accent/10' : 'border-line bg-surface hover:bg-muted')}>
                    <span className="font-medium">{s.supplier?.name}</span>{s.last_price != null && <span className="text-ink-faint"> · último {money(s.last_price)}</span>}
                    <span className="block text-xs text-ink-faint">{s.reason}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <CounterpartyPicker kind="fornecedor" value={supplier} onChange={setSupplier} label="Fornecedor" />
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyInput label="Valor do pedido" value={total} onChange={setTotal} hint="Deixe o estimado se ainda não souber." />
          <Input label="Previsão de entrega" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

function InvoiceModal({ purchase, onClose, onDone }) {
  const { toast } = useUI();
  const [f, setF] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (purchase) { setF({ due_date: today(30), amount: purchase.total ?? null, installments: 1, doc: null }); setError(''); } }, [purchase]);
  const submit = async () => {
    if (!f.due_date) { setError('Informe o vencimento.'); return; }
    setSaving(true); setError('');
    try {
      await api.post(`/purchases/${purchase.id}/invoice`, { due_date: f.due_date, amount: f.amount ?? undefined, installments: Number(f.installments) || 1, document_id: f.doc?.id || undefined });
      toast('Compra faturada: a conta a pagar foi criada.'); onDone(); onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open={!!purchase} onClose={onClose} onSubmit={submit} size="sm" title="Faturar compra" subtitle="Cria a conta a pagar para o fornecedor."
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving}>Criar conta a pagar</SubmitButton></>}>
      <div className="space-y-4">
        <InlineError error={error} />
        <MoneyInput label="Valor da nota" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
        <Input label="Vencimento (1ª parcela)" type="date" required value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} />
        <Input label="Parcelas" type="number" min={1} max={120} value={f.installments} onChange={(e) => setF({ ...f, installments: e.target.value })} />
        <div><span className="label">Nota fiscal (opcional)</span><DocUploadButton companyId={purchase?.company?.id} value={f.doc} onChange={(d) => setF({ ...f, doc: d })} label="Anexar nota" /></div>
      </div>
    </Modal>
  );
}

function Detail({ purchase, onClose, onAction }) {
  const { can } = useAuth();
  if (!purchase) return <Drawer open={false} onClose={onClose} />;
  const p = purchase;
  const s = PURCHASE_STATUS[p.status] || { label: p.status, tone: 'neutral' };
  const step = STEPS.indexOf(p.status);
  const manage = can(P.purchaseManage);
  const footer = (
    <>
      {manage && !['faturada', 'cancelada', 'reprovada'].includes(p.status) && <button type="button" className="btn-ghost text-danger" onClick={() => onAction('cancel', p)}><Ban className="h-4 w-4" aria-hidden="true" /> Cancelar</button>}
      {p.status === 'solicitada' && can(P.purchaseApprove, P.approve) && <Link to="/aprovacoes?entity=purchase" className="btn-outline"><ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Ir para aprovações</Link>}
      {manage && p.status === 'aprovada' && <button type="button" className="btn-primary" onClick={() => onAction('order', p)}><Truck className="h-4 w-4" aria-hidden="true" /> Fazer pedido</button>}
      {manage && p.status === 'pedido' && <button type="button" className="btn-primary" onClick={() => onAction('receive', p)}><PackageCheck className="h-4 w-4" aria-hidden="true" /> Marcar recebida</button>}
      {manage && p.status === 'recebida' && <button type="button" className="btn-cta" onClick={() => onAction('invoice', p)}><FileCheck2 className="h-4 w-4" aria-hidden="true" /> Faturar</button>}
    </>
  );
  return (
    <Drawer open onClose={onClose} title={p.title} subtitle={`Compra${p.number ? ` #${p.number}` : ''}`} footer={footer}>
      <div className="space-y-5">
        <Badge tone={s.tone}>{s.label}</Badge>
        {step >= 0 && (
          <ol className="flex items-center gap-1 text-[11px]" aria-label="Etapas da compra">
            {STEPS.map((k, i) => (
              <li key={k} className="flex flex-1 flex-col items-center gap-1 text-center">
                <span className={cx('h-1.5 w-full rounded-full', i <= step ? 'bg-accent' : 'bg-line')} aria-hidden="true" />
                <span className={i <= step ? 'font-medium text-ink' : 'text-ink-faint'}>{PURCHASE_STATUS[k].label.replace('Aguardando aprovação', 'Solicitada')}{i === step && <span className="sr-only"> (etapa atual)</span>}</span>
              </li>
            ))}
          </ol>
        )}
        <dl className="divide-y divide-line">
          <DRow label="Pedido por">{p.requester?.name}</DRow>
          <DRow label="Empresa">{p.company?.name}</DRow>
          <DRow label="Precisa até">{p.needed_by ? date(p.needed_by) : '—'}</DRow>
          <DRow label="Fornecedor">{p.supplier?.name || '—'}</DRow>
          <DRow label="Criada em">{dateTime(p.created_at)}</DRow>
          {p.title_id && <DRow label="Conta a pagar"><Link to="/pagar" className="text-positive hover:underline">criada</Link></DRow>}
        </dl>
        <section>
          <h3 className="mb-2 text-sm font-semibold">Itens</h3>
          <ul className="divide-y divide-line rounded-app-sm border border-line">
            {(p.items || []).map((i, k) => (
              <li key={k} className="flex justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0">{i.qty} × {i.description}</span>
                <span className="tabular-nums text-ink-soft">{money((Number(i.qty) || 0) * (Number(i.unit_price) || 0))}</span>
              </li>
            ))}
            <li className="flex justify-between gap-2 bg-muted/60 px-3 py-2 text-sm font-semibold"><span>Total</span><span className="tabular-nums">{money(p.total)}</span></li>
          </ul>
        </section>
      </div>
    </Drawer>
  );
}

export default function Purchases() {
  const { can, companyId, companies } = useAuth();
  const { toast, askReason, confirm } = useUI();
  const onError = useApiError();
  const [params, setParams] = useSearchParams();
  const onlyMine = !can(P.purchaseApprove, P.purchaseManage);
  const [status, setStatus] = useState('');
  const [mine, setMine] = useState(onlyMine);
  const [creating, setCreating] = useState(false);
  const [sel, setSel] = useState(null);
  const [order, setOrder] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const { data, error, loading, reload } = useAsync(() => api.get(`/purchases${qs({ status, mine: mine || onlyMine ? 1 : '' })}`), [status, mine]);
  const items = (data?.items || []).filter((p) => !companyId || !p.company?.id || p.company.id === companyId);

  useEffect(() => {
    const id = params.get('id');
    if (id && data) { const p = (data.items || []).find((x) => x.id === id); if (p) setSel(p); params.delete('id'); setParams(params, { replace: true }); }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (sel) setSel((items.find((x) => x.id === sel.id)) || null); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = () => { reload(); notifyCountsChanged(); };
  const action = async (what, p) => {
    if (what === 'order') { setOrder(p); return; }
    if (what === 'invoice') { setInvoice(p); return; }
    try {
      if (what === 'receive') {
        if (!(await confirm({ title: 'Mercadoria recebida?', message: 'Confirme que o pedido chegou. Depois é só faturar.', confirmText: 'Confirmar recebimento' }))) return;
        await api.post(`/purchases/${p.id}/receive`); toast('Recebimento registrado.');
      }
      if (what === 'cancel') {
        const reason = await askReason({ title: 'Cancelar esta compra?', label: 'Motivo', confirmText: 'Cancelar compra', danger: true });
        if (!reason) return;
        await api.post(`/purchases/${p.id}/cancel`, { reason }); toast('Compra cancelada.');
      }
      changed();
    } catch (e) { onError(e); }
  };

  return (
    <div>
      <PageHeader title="Compras" icon={ShoppingCart} subtitle="Solicitação → aprovação → pedido → recebimento → conta a pagar."
        actions={can(P.purchaseRequest) && <button type="button" className="btn-cta" onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Nova solicitação</button>} />
      <div className="card mb-4">
        <Tabs label="Situação" tabs={TABS} value={status} onChange={setStatus} className="px-2" />
        {!onlyMine && <div className="px-3 py-2"><Toggle label="Só as minhas solicitações" checked={mine} onChange={setMine} /></div>}
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} className="card" /> : !items.length ? (
        <EmptyState className="card" icon={ShoppingCart} title="Nenhuma compra por aqui"
          action={can(P.purchaseRequest) && <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Solicitar compra</button>}>
          Peça o que precisa comprar. Quem aprova recebe o aviso.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((p) => {
            const s = PURCHASE_STATUS[p.status] || { label: p.status, tone: 'neutral' };
            return (
              <li key={p.id}>
                <button type="button" onClick={() => setSel(p)} className="card focus-ring flex w-full flex-wrap items-center gap-3 p-4 text-left hover:border-accent/60">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{p.title}</span><Badge tone={s.tone}>{s.label}</Badge></div>
                    <div className="text-xs text-ink-faint">{p.number ? `#${p.number} · ` : ''}{p.requester?.name}{p.supplier?.name && ` · ${p.supplier.name}`}{companies.length > 1 && p.company?.name && ` · ${p.company.name}`}{p.needed_by && ` · até ${date(p.needed_by)}`}</div>
                  </div>
                  <div className="text-right font-semibold tabular-nums">{money(p.total)}<div className="text-xs font-normal text-ink-faint">{(p.items || []).length} item(ns)</div></div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {onlyMine && <Notice className="mt-4">Você vê só as suas solicitações. A aprovação e o pedido ficam com o responsável pelas compras.</Notice>}
      <RequestForm open={creating} onClose={() => setCreating(false)} onSaved={changed} />
      <Detail purchase={sel} onClose={() => setSel(null)} onAction={action} />
      <OrderModal purchase={order} onClose={() => setOrder(null)} onDone={changed} />
      <InvoiceModal purchase={invoice} onClose={() => setInvoice(null)} onDone={changed} />
    </div>
  );
}
