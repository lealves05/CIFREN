import { useEffect, useState } from 'react';
import { Plus, Search, Pencil, Archive, Users } from 'lucide-react';
import { api, qs, errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { maskDocument, documentHint, maskPhone, onlyDigits, isMasked, showMasked } from '../../lib/masks';
import { useUI } from '../../context/UIContext';
import Modal from '../Modal';
import { Input, Select, Textarea, InlineError, SubmitButton, Loading, ErrorState, EmptyState, Badge } from '../ui';
import { useArchive } from './useArchive';

const KINDS = [{ value: 'fornecedor', label: 'Fornecedor' }, { value: 'cliente', label: 'Cliente' }, { value: 'ambos', label: 'Cliente e fornecedor' }];
const kindLabel = (k) => KINDS.find((x) => x.value === k)?.label || k;

function Form({ open, onClose, item, onSaved }) {
  const { toast } = useUI();
  const [f, setF] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError(''); setTouched(false);
    setF({
      kind: item?.kind || 'fornecedor', name: item?.name || '', notes: item?.notes || '',
      // dados mascarados (sem permissão de dados sensíveis) não podem ser editados nem reenviados
      document: isMasked(item?.document, item) ? item.document : maskDocument(item?.document || ''),
      email: item?.email || '', phone: isMasked(item?.phone, item) ? item.phone : maskPhone(item?.phone || ''),
    });
  }, [open, item]);
  const set = (k, mask) => (e) => setF((x) => ({ ...x, [k]: mask ? mask(e.target.value) : e.target.value }));
  const lockDoc = isMasked(item?.document, item) && !!item?.document;
  const lockEmail = isMasked(item?.email, item) && !!item?.email;
  const lockPhone = isMasked(item?.phone, item) && !!item?.phone;
  const dh = lockDoc ? '' : documentHint(f.document);
  const submit = async () => {
    setTouched(true); setError('');
    if (!f.name?.trim() || dh) return;
    setSaving(true);
    try {
      const body = { kind: f.kind, name: f.name.trim(), notes: f.notes.trim() || null };
      if (!lockDoc) body.document = onlyDigits(f.document) ? f.document : null;
      if (!lockEmail) body.email = f.email.trim() || null;
      if (!lockPhone) body.phone = f.phone || null;
      if (item) await api.put(`/counterparties/${item.id}`, body); else await api.post('/counterparties', body);
      toast(item ? 'Cadastro atualizado.' : 'Cadastro criado.');
      onSaved(); onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} onSubmit={submit} title={item ? 'Editar cadastro' : 'Novo fornecedor ou cliente'}
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving}>Salvar</SubmitButton></>}>
      <div className="space-y-4">
        <InlineError error={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Tipo" value={f.kind} onChange={set('kind')}>{KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select>
          <Input label="CPF ou CNPJ" inputMode="numeric" value={f.document} onChange={set('document', maskDocument)} error={touched ? dh : ''} disabled={lockDoc} hint={lockDoc ? 'Dado protegido: seu perfil não vê o número completo.' : 'Opcional.'} />
          <Input className="sm:col-span-2" label="Nome" required value={f.name} onChange={set('name')} error={touched && !f.name?.trim() ? 'Informe o nome.' : ''} maxLength={200} data-autofocus />
          <Input label="E-mail" type="email" value={f.email} onChange={set('email')} disabled={lockEmail} hint={lockEmail ? 'Dado protegido.' : undefined} />
          <Input label="Telefone" type="tel" inputMode="tel" value={f.phone} onChange={set('phone', maskPhone)} disabled={lockPhone} hint={lockPhone ? 'Dado protegido.' : undefined} />
        </div>
        <Textarea label="Observações" value={f.notes} onChange={set('notes')} rows={2} />
      </div>
    </Modal>
  );
}

export default function Counterparties({ canManage }) {
  const [q, setQ] = useState('');
  const [qd, setQd] = useState('');
  const [kind, setKind] = useState('');
  const [edit, setEdit] = useState(undefined);
  const archive = useArchive();
  useEffect(() => { const t = setTimeout(() => setQd(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const { data, error, loading, reload } = useAsync(() => api.get(`/counterparties${qs({ q: qd, kind, active: 'true' })}`), [qd, kind]);
  const items = data?.items || [];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
          <input type="search" className="input pl-9" placeholder="Buscar por nome ou documento" aria-label="Buscar fornecedores e clientes" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-auto" aria-label="Tipo" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Todos</option><option value="fornecedor">Fornecedores</option><option value="cliente">Clientes</option>
        </select>
        {canManage && <button type="button" className="btn-primary" onClick={() => setEdit(null)}><Plus className="h-4 w-4" aria-hidden="true" /> Novo</button>}
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !items.length ? (
        <EmptyState icon={Users} title={qd || kind ? 'Nada encontrado' : 'Nenhum fornecedor ou cliente ainda'}
          action={canManage && !qd && <button type="button" className="btn-primary" onClick={() => setEdit(null)}><Plus className="h-4 w-4" aria-hidden="true" /> Cadastrar</button>}>
          {qd || kind ? 'Tente outra busca.' : 'Cadastre quem você paga e quem te paga. Também dá para cadastrar na hora de lançar uma conta.'}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-app-sm border border-line">
          {items.map((it) => (
            <li key={it.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-medium">{it.name}<Badge>{kindLabel(it.kind)}</Badge>{it.masked && <Badge tone="neutral">dados protegidos</Badge>}</div>
                <div className="truncate text-xs text-ink-faint">{[it.document && showMasked(it.document, maskDocument), it.phone && showMasked(it.phone, maskPhone), it.email].filter(Boolean).join(' · ') || 'Sem documento ou contato'}</div>
              </div>
              {canManage && (
                <div className="flex gap-1">
                  <button type="button" className="btn-ghost btn-icon" aria-label={`Editar ${it.name}`} onClick={() => setEdit(it)}><Pencil className="h-4 w-4" /></button>
                  <button type="button" className="btn-ghost btn-icon text-danger" aria-label={`Arquivar ${it.name}`} onClick={() => archive(`/counterparties/${it.id}`, it.name, 'cadastro', reload)}><Archive className="h-4 w-4" /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Form open={edit !== undefined} item={edit} onClose={() => setEdit(undefined)} onSaved={reload} />
    </div>
  );
}
