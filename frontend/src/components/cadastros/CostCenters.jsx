import { useEffect, useState } from 'react';
import { Plus, Pencil, Archive, Target } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { useUI } from '../../context/UIContext';
import Modal from '../Modal';
import { Input, InlineError, SubmitButton, Loading, ErrorState, EmptyState } from '../ui';
import { useArchive } from './useArchive';

function Form({ open, onClose, item, onSaved }) {
  const { toast } = useUI();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setName(item?.name || ''); setError(''); setTouched(false); } }, [open, item]);
  const submit = async () => {
    setTouched(true); setError('');
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (item) await api.put(`/cost-centers/${item.id}`, { name: name.trim() }); else await api.post('/cost-centers', { name: name.trim() });
      toast('Centro de custo salvo.');
      onSaved(); onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} onSubmit={submit} size="sm" title={item ? 'Editar centro de custo' : 'Novo centro de custo'}
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving}>Salvar</SubmitButton></>}>
      <div className="space-y-4">
        <InlineError error={error} />
        <Input label="Nome" required value={name} onChange={(e) => setName(e.target.value)} error={touched && !name.trim() ? 'Informe o nome.' : ''}
          hint="Ex.: Loja Centro, Administrativo, Obra Rua X." maxLength={100} data-autofocus />
      </div>
    </Modal>
  );
}

export default function CostCenters({ canManage }) {
  const { data, error, loading, reload } = useAsync(() => api.get('/cost-centers'), []);
  const [edit, setEdit] = useState(undefined);
  const archive = useArchive();
  const items = (data?.items || []).filter((c) => c.active !== false);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-faint">Separe os gastos por setor, loja ou projeto. É opcional.</p>
        {canManage && items.length > 0 && <button type="button" className="btn-primary" onClick={() => setEdit(null)}><Plus className="h-4 w-4" aria-hidden="true" /> Novo</button>}
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !items.length ? (
        <EmptyState icon={Target} title="Nenhum centro de custo" action={canManage && <button type="button" className="btn-primary" onClick={() => setEdit(null)}><Plus className="h-4 w-4" aria-hidden="true" /> Criar centro de custo</button>}>
          Se você não precisa separar gastos por setor, pode ignorar esta parte.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-app-sm border border-line">
          {items.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-4 py-2.5">
              <span className="flex-1 text-sm font-medium">{c.name}</span>
              {canManage && (
                <>
                  <button type="button" className="btn-ghost btn-icon" aria-label={`Editar ${c.name}`} onClick={() => setEdit(c)}><Pencil className="h-4 w-4" /></button>
                  <button type="button" className="btn-ghost btn-icon text-danger" aria-label={`Arquivar ${c.name}`} onClick={() => archive(`/cost-centers/${c.id}`, c.name, 'centro de custo', reload)}><Archive className="h-4 w-4" /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <Form open={edit !== undefined} item={edit} onClose={() => setEdit(undefined)} onSaved={reload} />
    </div>
  );
}
