import { useEffect, useState } from 'react';
import { Building2, Plus, Pencil, Archive } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { maskCnpj, cnpjHint, onlyDigits } from '../lib/masks';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import Modal from '../components/Modal';
import { PageHeader, Input, Select, InlineError, SubmitButton, Loading, ErrorState, EmptyState, Badge } from '../components/ui';
import { useArchive } from '../components/cadastros/useArchive';

const TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'Brasília (SP, RJ, MG, Sul, Nordeste…)' },
  { value: 'America/Manaus', label: 'Amazonas, Rondônia, Roraima, MT, MS' },
  { value: 'America/Belem', label: 'Pará e Amapá' },
  { value: 'America/Fortaleza', label: 'Ceará, RN, PB, PI, MA' },
  { value: 'America/Recife', label: 'Pernambuco' },
  { value: 'America/Bahia', label: 'Bahia' },
  { value: 'America/Cuiaba', label: 'Mato Grosso' },
  { value: 'America/Campo_Grande', label: 'Mato Grosso do Sul' },
  { value: 'America/Porto_Velho', label: 'Rondônia' },
  { value: 'America/Rio_Branco', label: 'Acre' },
  { value: 'America/Noronha', label: 'Fernando de Noronha' },
];

function Form({ open, onClose, item, onSaved }) {
  const { toast } = useUI();
  const [f, setF] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError(''); setTouched(false);
    setF({ name: item?.name || '', trade_name: item?.trade_name || '', document: maskCnpj(item?.document || ''), timezone: item?.timezone || 'America/Sao_Paulo' });
  }, [open, item]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: k === 'document' ? maskCnpj(e.target.value) : e.target.value }));
  const dh = cnpjHint(f.document);
  const submit = async () => {
    setTouched(true); setError('');
    if (!f.name?.trim() || dh) return;
    setSaving(true);
    try {
      const body = { name: f.name.trim(), trade_name: f.trade_name.trim() || null, document: onlyDigits(f.document) ? f.document : null, timezone: f.timezone };
      if (item) await api.put(`/companies/${item.id}`, body); else await api.post('/companies', body);
      toast(item ? 'Empresa atualizada.' : 'Empresa cadastrada.');
      onSaved(); onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} onSubmit={submit} title={item ? 'Editar empresa' : 'Nova empresa'}
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving}>Salvar</SubmitButton></>}>
      <div className="space-y-4">
        <InlineError error={error} />
        <Input label="Razão social ou nome" required value={f.name} onChange={set('name')} error={touched && !f.name?.trim() ? 'Informe o nome.' : ''} maxLength={200} data-autofocus />
        <Input label="Nome fantasia" value={f.trade_name} onChange={set('trade_name')} hint="Como a empresa é conhecida. Opcional." maxLength={200} />
        <Input label="CNPJ" inputMode="numeric" value={f.document} onChange={set('document')} placeholder="00.000.000/0000-00" error={touched ? dh : ''} hint="Opcional." />
        <Select label="Fuso horário" value={f.timezone} onChange={set('timezone')}>
          {TIMEZONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
      </div>
    </Modal>
  );
}

export default function Companies() {
  const { refresh } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api.get('/companies'), []);
  const [edit, setEdit] = useState(undefined);
  const archive = useArchive();
  const after = () => { reload(); refresh().catch(() => {}); };
  const items = (data?.items || []).filter((c) => c.active !== false);
  return (
    <div>
      <PageHeader title="Empresas" icon={Building2} subtitle="Cada CNPJ do seu grupo. As contas e lançamentos ficam separados por empresa."
        actions={<button type="button" className="btn-primary" onClick={() => setEdit(null)}><Plus className="h-4 w-4" aria-hidden="true" /> Nova empresa</button>} />
      <div className="card">
        {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !items.length ? (
          <EmptyState icon={Building2} title="Nenhuma empresa ativa" action={<button type="button" className="btn-primary" onClick={() => setEdit(null)}><Plus className="h-4 w-4" aria-hidden="true" /> Cadastrar empresa</button>} />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-ink dark:bg-brand-soft"><Building2 className="h-4 w-4" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.trade_name || c.name}</div>
                  <div className="truncate text-xs text-ink-faint">{[c.trade_name && c.name, c.document ? maskCnpj(c.document) : 'Sem CNPJ'].filter(Boolean).join(' · ')}</div>
                </div>
                {items.length === 1 && <Badge>Principal</Badge>}
                <button type="button" className="btn-ghost btn-icon" aria-label={`Editar ${c.name}`} onClick={() => setEdit(c)}><Pencil className="h-4 w-4" /></button>
                {items.length > 1 && <button type="button" className="btn-ghost btn-icon text-danger" aria-label={`Arquivar ${c.name}`} onClick={() => archive(`/companies/${c.id}`, c.name, 'empresa', after)}><Archive className="h-4 w-4" /></button>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Form open={edit !== undefined} item={edit} onClose={() => setEdit(undefined)} onSaved={after} />
    </div>
  );
}
