import { useEffect, useState } from 'react';
import { Scale, Plus, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { api, errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { money } from '../../lib/format';
import Modal from '../../components/Modal';
import MoneyInput from '../../components/MoneyInput';
import { PageHeader, Select, Toggle, InlineError, SubmitButton, Loading, ErrorState, EmptyState, Badge } from '../../components/ui';
import { Notice } from '../../components/kit';
import { ENTITY } from '../Approvals';

function RuleForm({ open, onClose, rule, onSaved }) {
  const { companies } = useAuth();
  const { toast } = useUI();
  const [f, setF] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) { setError(''); setF({ entity: rule?.entity || 'title', company_id: rule?.company_id || '', min_amount: rule?.min_amount ?? null, active: rule?.active ?? true }); }
  }, [open, rule]);
  const submit = async () => {
    if (!(f.min_amount >= 0) || f.min_amount == null) { setError('Informe a partir de qual valor precisa aprovar.'); return; }
    setSaving(true); setError('');
    try {
      const body = { entity: f.entity, company_id: f.company_id || null, min_amount: f.min_amount, active: f.active };
      if (rule) await api.put(`/approval-rules/${rule.id}`, body); else await api.post('/approval-rules', body);
      toast('Alçada salva.'); onSaved(); onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} onSubmit={submit} size="sm" title={rule ? 'Editar alçada' : 'Nova alçada'}
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving}>Salvar</SubmitButton></>}>
      <div className="space-y-4">
        <InlineError error={error} />
        <Select label="O que precisa de aprovação" value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })}>
          {Object.entries(ENTITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <MoneyInput label="A partir de (valor igual ou maior)" required value={f.min_amount} onChange={(v) => setF({ ...f, min_amount: v })} hint="Use 0,00 para exigir aprovação de tudo." />
        {companies.length > 1 && (
          <Select label="Empresa" value={f.company_id} onChange={(e) => setF({ ...f, company_id: e.target.value })}>
            <option value="">Todas as empresas</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
        <Toggle label="Regra ligada" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />
      </div>
    </Modal>
  );
}

export default function ApprovalRules() {
  const { companies } = useAuth();
  const { confirm, toast } = useUI();
  const { data, error, loading, reload } = useAsync(() => api.get('/approval-rules'), []);
  const [edit, setEdit] = useState(undefined);
  const items = data?.items || [];
  const remove = async (r) => {
    if (!(await confirm({ title: 'Excluir esta alçada?', message: 'Novos lançamentos deixam de pedir aprovação por esta regra.', confirmText: 'Excluir', danger: true }))) return;
    try { await api.del(`/approval-rules/${r.id}`); toast('Alçada excluída.'); reload(); } catch (e) { toast(errorMessage(e), 'error'); }
  };
  const companyName = (id) => (id ? companies.find((c) => c.id === id)?.name || 'Empresa' : 'Todas as empresas');
  return (
    <div>
      <PageHeader title="Alçadas de aprovação" icon={Scale} subtitle="A partir de quanto uma conta, compra ou reembolso precisa ser aprovado."
        actions={<button type="button" className="btn-cta" onClick={() => setEdit(null)}><Plus className="h-4 w-4" aria-hidden="true" /> Nova alçada</button>} />
      <Notice className="mb-4">Conta a pagar com valor igual ou acima da alçada nasce “aguardando aprovação” e só pode ser paga depois de aprovada. Quem lança não aprova o próprio pedido.</Notice>
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} className="card" /> : !items.length ? (
        <EmptyState className="card" icon={Scale} title="Nenhuma alçada definida" action={<button type="button" className="btn-primary" onClick={() => setEdit(null)}><Plus className="h-4 w-4" aria-hidden="true" /> Criar alçada</button>}>
          Sem alçadas, nada precisa de aprovação.
        </EmptyState>
      ) : (
        <ul className="card divide-y divide-line">
          {items.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-medium">{ENTITY[r.entity]?.label || r.entity}{!r.active && <Badge>Desligada</Badge>}</div>
                <div className="text-sm text-ink-soft">A partir de <strong className="tabular-nums">{money(r.min_amount)}</strong> · {companyName(r.company_id)}</div>
              </div>
              <button type="button" className="btn-ghost btn-icon" aria-label="Editar alçada" onClick={() => setEdit(r)}><Pencil className="h-4 w-4" /></button>
              <button type="button" className="btn-ghost btn-icon text-danger" aria-label="Excluir alçada" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
      <RuleForm open={edit !== undefined} rule={edit} onClose={() => setEdit(undefined)} onSaved={reload} />
    </div>
  );
}
