import { useEffect, useMemo, useState } from 'react';
import { Lock, Trash2 } from 'lucide-react';
import Modal from '../Modal';
import MoneyInput from '../MoneyInput';
import CounterpartyPicker from '../CounterpartyPicker';
import CategorySelect from '../CategorySelect';
import { Input, Select, Textarea, InlineError, Loading, SubmitButton, Badge, cx } from '../ui';
import { api, errorMessage } from '../../lib/api';
import { loadRefs } from '../../lib/refData';
import { KIND } from '../../lib/titles';
import { money, date, round2 } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { P } from '../../lib/permissions';

const REPETIR = [
  { value: 'mensal', label: 'Todo mês' }, { value: 'bimestral', label: 'A cada 2 meses' }, { value: 'trimestral', label: 'A cada 3 meses' },
  { value: 'semestral', label: 'A cada 6 meses' }, { value: 'anual', label: 'Todo ano' }, { value: 'quinzenal', label: 'A cada 15 dias' }, { value: 'semanal', label: 'Toda semana' },
];
const STATUS = { aberto: ['Em aberto', 'brand'], parcial: ['Parcial', 'warn'], pago: ['Paga', 'positive'], cancelado: ['Excluída', 'neutral'] };

/**
 * Lançamento original: todas as parcelas de uma repetição juntas.
 * Muda descrição, fornecedor/cliente, categoria, valor das parcelas em aberto, vencimentos e quantidade de parcelas;
 * ou exclui o lançamento errado (as parcelas já pagas ficam, as outras saem).
 */
export default function GroupForm({ open, onClose, groupId, kind, onSaved }) {
  const { can } = useAuth();
  const { toast, askReason } = useUI();
  const [g, setG] = useState(null);
  const [f, setF] = useState(null);
  const [refs, setRefs] = useState({ categories: [], costCenters: [] });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const fill = (x) => {
    const firstOpen = x.items.find((i) => i.editable);
    setG(x);
    setF({
      description: x.description, counterparty: x.counterparty, category_id: x.category?.id || null, cost_center_id: x.cost_center?.id || null,
      document_number: x.document_number || '', notes: x.notes || '', amount: firstOpen?.amount ?? null, first_due_date: firstOpen?.due_date || '',
      interval: x.interval, installments_total: x.installments_total,
    });
  };
  useEffect(() => {
    if (!open || !groupId) return;
    setG(null); setF(null); setError('');
    Promise.all([api.get(`/title-groups/${groupId}`), loadRefs(['categories', 'costCenters'])])
      .then(([x, r]) => { setRefs(r); fill(x); })
      .catch((e) => setError(errorMessage(e)));
  }, [open, groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  const k = KIND[g?.kind || kind];
  const set = (key) => (v) => setF((x) => ({ ...x, [key]: v && v.target ? v.target.value : v }));
  const firstOpen = g?.items.find((i) => i.editable);
  const n = Math.min(360, Math.max(1, Number(f?.installments_total) || 1));

  const body = useMemo(() => {
    if (!g || !f) return {};
    const b = {};
    if (f.description.trim() && f.description.trim() !== g.description) b.description = f.description.trim();
    if ((f.counterparty?.id || null) !== (g.counterparty?.id || null)) b.counterparty_id = f.counterparty?.id || null;
    if ((f.category_id || null) !== (g.category?.id || null)) b.category_id = f.category_id || null;
    if ((f.cost_center_id || null) !== (g.cost_center?.id || null)) b.cost_center_id = f.cost_center_id || null;
    if ((f.document_number.trim() || null) !== (g.document_number || null)) b.document_number = f.document_number.trim() || null;
    if ((f.notes.trim() || null) !== (g.notes || null)) b.notes = f.notes.trim() || null;
    if (firstOpen && f.amount > 0 && round2(f.amount) !== firstOpen.amount) b.amount = round2(f.amount);
    if (firstOpen && f.first_due_date && f.first_due_date !== firstOpen.due_date) b.first_due_date = f.first_due_date;
    if (f.interval !== g.interval) { b.interval = f.interval; if (firstOpen && !b.first_due_date) b.first_due_date = f.first_due_date; }
    if (n !== g.installments_total) { b.installments_total = n; if (b.first_due_date === undefined && f.interval !== g.interval) b.interval = f.interval; }
    return b;
  }, [g, f, n, firstOpen]);
  const changed = Object.keys(body).length > 0;
  const openCount = g?.items.filter((i) => i.editable).length || 0;

  const summary = useMemo(() => {
    if (!g || !f) return '';
    const parts = [];
    if (body.amount !== undefined) parts.push(`${openCount} parcela(s) em aberto passam a ${money(body.amount)}`);
    if (body.first_due_date) parts.push(`vencimentos a partir de ${date(body.first_due_date)}`);
    if (body.installments_total) parts.push(body.installments_total > g.installments_total ? `${body.installments_total - g.installments_total} parcela(s) a mais` : `${g.installments_total - body.installments_total} parcela(s) a menos (as últimas em aberto)`);
    return parts.join('; ');
  }, [body, g, f, openCount]);

  const save = async () => {
    setError('');
    if (!f.description.trim()) { setError('Escreva a descrição.'); return; }
    if (!changed) { onClose(); return; }
    setSaving(true);
    try {
      const x = await api.put(`/title-groups/${groupId}`, body);
      fill(x);
      toast('Lançamento atualizado em todas as parcelas.');
      onSaved?.(); onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };

  const remove = async () => {
    const paid = g.items.filter((i) => i.status !== 'cancelado' && !i.editable).length;
    const reason = await askReason({
      title: 'Excluir este lançamento?', label: 'Motivo (ex.: lançado errado)', confirmText: 'Excluir lançamento', danger: true,
      message: `As ${g.items.filter((i) => i.status !== 'cancelado' && i.editable).length} parcela(s) sem pagamento de “${g.description}” saem das contas e dos totais.`
        + (paid ? ` ${paid} parcela(s) com pagamento ficam (estorne a baixa antes, se também estiverem erradas).` : '')
        + ' Elas ficam na aba Cancelados e na auditoria.',
    });
    if (!reason) return;
    try {
      const r = await api.post(`/title-groups/${groupId}/cancel`, { reason });
      toast(`Lançamento excluído: ${r.cancelled} parcela(s)${r.kept ? `, ${r.kept} paga(s) mantida(s)` : ''}.`);
      onSaved?.(); onClose();
    } catch (e) { setError(errorMessage(e)); }
  };

  const canDelete = can(P.titlesCancel) && g?.items.some((i) => i.status !== 'cancelado' && i.editable);
  return (
    <Modal open={open} onClose={onClose} size="lg" onSubmit={save} title="Lançamento original"
      subtitle={g ? `${g.installments_total} parcela(s) · total ${money(g.total)}${g.paid_total ? ` · já ${g.kind === 'pagar' ? 'pago' : 'recebido'} ${money(g.paid_total)}` : ''}` : undefined}
      footer={<>
        {canDelete && <button type="button" className="btn-ghost mr-auto text-danger" onClick={remove}><Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir lançamento</button>}
        <button type="button" className="btn-outline" onClick={onClose}>Fechar</button>
        <SubmitButton loading={saving} disabled={!f}>Salvar em todas as parcelas</SubmitButton>
      </>}>
      {!f ? (error ? <InlineError error={error} /> : <Loading />) : (
        <div className="space-y-4">
          <InlineError error={error} />
          <p className="text-sm text-ink-soft">
            As mudanças valem para todas as parcelas. Valor e vencimento só mudam nas parcelas <strong>em aberto e sem pagamento</strong>; as já pagas ficam como estão.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input className="sm:col-span-2" label="Descrição" required value={f.description} onChange={set('description')} maxLength={180} hint="O número da parcela (1/36…) é colocado sozinho." />
            <div className="sm:col-span-2"><CounterpartyPicker kind={k.party} value={f.counterparty} onChange={set('counterparty')} label={`${k.partyLabel} (opcional)`} /></div>
            <CategorySelect categories={refs.categories} type={k.categoryType} value={f.category_id} onChange={set('category_id')} />
            <Select label="Centro de custo" value={f.cost_center_id || ''} onChange={(e) => set('cost_center_id')(e.target.value || null)}>
              <option value="">Nenhum</option>
              {refs.costCenters.filter((c) => c.active !== false).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <fieldset className="rounded-app-sm border border-line p-3">
            <legend className="px-1 text-xs font-medium text-ink-soft">Parcelas em aberto ({openCount})</legend>
            {!firstOpen ? <p className="text-sm text-ink-soft">Todas as parcelas já têm pagamento: valor e vencimento não mudam mais.</p> : (
              <div className="grid gap-4 sm:grid-cols-2">
                <MoneyInput label="Valor de cada parcela" value={f.amount} onChange={set('amount')} />
                <Input label="Vencimento da 1ª parcela em aberto" type="date" value={f.first_due_date} onChange={set('first_due_date')} hint={`A primeira em aberto é a parcela ${firstOpen.installment}.`} />
                <Select label="Repetir" value={f.interval} onChange={set('interval')}>
                  {REPETIR.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
                </Select>
                <Input label="Quantidade de parcelas" type="number" min={1} max={360} value={f.installments_total} onChange={set('installments_total')}
                  hint="Aumente para incluir parcelas no fim; diminua para tirar as últimas em aberto." />
              </div>
            )}
            {summary && <p className="mt-2 text-sm font-medium text-ink" aria-live="polite">{summary}.</p>}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nº do documento" value={f.document_number} onChange={set('document_number')} maxLength={60} />
            <Textarea label="Observações" value={f.notes} onChange={set('notes')} rows={1} maxLength={1000} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Parcelas</h3>
            <ul className="max-h-60 divide-y divide-line overflow-y-auto rounded-app-sm border border-line text-sm">
              {g.items.map((i) => {
                const [label, tone] = STATUS[i.status] || [i.status, 'neutral'];
                return (
                  <li key={i.id} className={cx('flex items-center justify-between gap-2 px-3 py-2', i.status === 'cancelado' && 'opacity-60')}>
                    <span className="min-w-0 truncate tabular-nums">{i.installment}/{i.installments} · {date(i.due_date)}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums">{money(i.amount)}</span>
                      <Badge tone={tone}>{label}</Badge>
                      {!i.editable && i.status !== 'cancelado' && <Lock className="h-3.5 w-3.5 text-ink-faint" aria-label="Tem pagamento: não muda" />}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}
