import { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import MoneyInput from '../MoneyInput';
import CounterpartyPicker from '../CounterpartyPicker';
import CategorySelect from '../CategorySelect';
import { Input, Select, Textarea, InlineError, Loading, SubmitButton } from '../ui';
import { api, errorMessage } from '../../lib/api';
import { loadRefs } from '../../lib/refData';
import { KIND } from '../../lib/titles';
import { money, round2, today, INTERVALS } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';

const empty = (companyId) => ({
  description: '', amount: null, due_date: today(), company_id: companyId || '', counterparty: null,
  category_id: null, cost_center_id: null, document_number: '', competence: '', notes: '',
  installments: 1, interval: 'mensal',
});

/** Formulário para lançar ou editar uma conta a pagar/receber. */
export default function TitleForm({ open, onClose, kind, titleId, onSaved }) {
  const { companies, companyId } = useAuth();
  const { toast } = useUI();
  const k = KIND[kind];
  const editing = !!titleId;
  const [f, setF] = useState(empty(companyId || companies[0]?.id));
  const [orig, setOrig] = useState(null);
  const [refs, setRefs] = useState({ categories: [], costCenters: [] });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(''); setTouched(false); setOrig(null);
    setF(empty(companyId || (companies.length === 1 ? companies[0].id : companies[0]?.id)));
    setLoading(true);
    (async () => {
      try {
        const [r, t] = await Promise.all([loadRefs(['categories', 'costCenters']), editing ? api.get(`/titles/${titleId}`) : null]);
        setRefs(r);
        if (t) {
          setOrig(t);
          setF({
            description: t.description || '', amount: t.amount, due_date: t.due_date || '', company_id: t.company?.id || t.company_id || '',
            counterparty: t.counterparty ? { id: t.counterparty.id, name: t.counterparty.name } : null,
            category_id: t.category?.id || null, cost_center_id: t.cost_center?.id || null,
            document_number: t.document_number || '', competence: (t.competence_date || '').slice(0, 7), notes: t.notes || '',
            installments: 1, interval: 'mensal',
          });
        }
      } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
    })();
  }, [open, titleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (v) => setF((x) => ({ ...x, [key]: v && v.target ? v.target.value : v }));
  const amountLocked = editing && orig && (orig.status !== 'aberto' || Number(orig.paid_amount) > 0);
  const n = Math.min(120, Math.max(1, Number(f.installments) || 1));
  // 1 parcela: o valor digitado é o total; mais de 1: é o valor de cada parcela (o total é calculado)
  const total = n > 1 ? round2((Number(f.amount) || 0) * n) : round2(Number(f.amount) || 0);
  const preview = useMemo(() => {
    if (!f.amount || n < 2) return '';
    return `${n} parcelas de ${money(f.amount)} — total ${money(total)}`;
  }, [f.amount, n, total]);

  const errs = {
    description: !f.description.trim() ? 'Escreva uma descrição (ex.: Aluguel de outubro).' : '',
    amount: !(f.amount > 0) ? (n > 1 ? 'Informe o valor de cada parcela.' : 'Informe o valor.') : '',
    due_date: !f.due_date ? 'Informe o vencimento.' : '',
    company_id: !f.company_id ? 'Escolha a empresa.' : '',
  };
  const show = (key) => (touched ? errs[key] : '');

  const submit = async () => {
    setTouched(true); setError('');
    if (Object.values(errs).some(Boolean)) return;
    const body = {
      description: f.description.trim(), due_date: f.due_date,
      counterparty_id: f.counterparty?.id || null, category_id: f.category_id || null, cost_center_id: f.cost_center_id || null,
      document_number: f.document_number.trim() || null, competence_date: f.competence ? `${f.competence}-01` : null,
      notes: f.notes.trim() || null,
    };
    setSaving(true);
    try {
      if (editing) {
        if (!amountLocked) body.amount = round2(f.amount);
        await api.put(`/titles/${titleId}`, body);
        toast('Alterações salvas.');
      } else {
        await api.post('/titles', {
          ...body, kind, company_id: f.company_id, amount: total,
          ...(n > 1 ? { installments: n, interval: f.interval } : {}),
        });
        toast(n > 1 ? `${n} parcelas lançadas.` : 'Conta lançada.');
      }
      onSaved?.();
      onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" onSubmit={submit}
      title={editing ? `Editar ${k.one}` : k.newLabel}
      subtitle={editing ? undefined : 'Os campos com * são obrigatórios. O resto ajuda a organizar seus relatórios.'}
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving} disabled={loading}>{editing ? 'Salvar alterações' : 'Lançar'}</SubmitButton></>}>
      {loading ? <Loading /> : (
        <div className="space-y-4">
          <InlineError error={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input className="sm:col-span-2" label="Descrição" required value={f.description} onChange={set('description')} maxLength={200}
              placeholder={kind === 'pagar' ? 'Ex.: Aluguel da loja' : 'Ex.: Venda para cliente'} error={show('description')} data-autofocus />
            <MoneyInput label={!editing && n > 1 ? 'Valor de cada parcela' : editing ? 'Valor' : 'Valor total'} required value={f.amount} onChange={set('amount')} error={show('amount')}
              disabled={amountLocked} hint={amountLocked ? 'O valor não pode mudar porque já houve baixa.' : !editing && n > 1 ? `Total: ${money(total)} em ${n} parcelas.` : undefined} />
            <Input label={n > 1 ? 'Vencimento da 1ª parcela' : 'Vencimento'} type="date" required value={f.due_date} onChange={set('due_date')} error={show('due_date')} />
            {(!editing && companies.length > 1) ? (
              <Select label="Empresa" required value={f.company_id} onChange={set('company_id')} error={show('company_id')}>
                <option value="">Escolha…</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            ) : null}
            <div className={!editing && companies.length > 1 ? '' : 'sm:col-span-2'}>
              <CounterpartyPicker kind={k.party} value={f.counterparty} onChange={set('counterparty')} label={`${k.partyLabel} (opcional)`} />
            </div>
            <CategorySelect categories={refs.categories} type={k.categoryType} value={f.category_id} onChange={set('category_id')} />
            <Select label="Centro de custo" value={f.cost_center_id || ''} onChange={(e) => set('cost_center_id')(e.target.value || null)}
              hint={!refs.costCenters.length ? 'Opcional. Cadastre em Cadastros › Centros de custo.' : undefined}>
              <option value="">Nenhum</option>
              {refs.costCenters.filter((c) => c.active !== false).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Input label="Nº do documento" value={f.document_number} onChange={set('document_number')} maxLength={60} placeholder="Nota, boleto, recibo…" />
            <Input label="Mês de competência" type="month" value={f.competence} onChange={set('competence')} hint="Mês a que a despesa ou receita se refere." />
          </div>

          {!editing && (
            <fieldset className="rounded-app-sm border border-line p-3">
              <legend className="px-1 text-xs font-medium text-ink-soft">Parcelamento</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Número de parcelas" type="number" min={1} max={120} value={f.installments}
                  onChange={(e) => set('installments')(e.target.value)} onBlur={() => set('installments')(n)} hint="De 1 a 120." />
                <Select label="Repetir" value={f.interval} onChange={set('interval')} disabled={n < 2}>
                  {INTERVALS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
                </Select>
              </div>
              {preview && <p className="mt-2 text-sm text-ink-soft" aria-live="polite">{preview}.</p>}
            </fieldset>
          )}

          <Textarea label="Observações" value={f.notes} onChange={set('notes')} rows={2} maxLength={1000} />
        </div>
      )}
    </Modal>
  );
}
