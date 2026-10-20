import { useEffect, useState } from 'react';
import { Plus, Pencil, Archive, Tags, CornerDownRight } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { useUI } from '../../context/UIContext';
import { categoryTree } from '../CategorySelect';
import Modal from '../Modal';
import { Input, Select, InlineError, SubmitButton, Loading, ErrorState, EmptyState } from '../ui';
import { useArchive } from './useArchive';

function Form({ open, onClose, item, preset, categories, onSaved }) {
  const { toast } = useUI();
  const [f, setF] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError(''); setTouched(false);
    setF({ name: item?.name || '', type: item?.type || preset?.type || 'despesa', parent_id: item?.parent_id || preset?.parent_id || '' });
  }, [open, item, preset]);
  // só um nível de subcategoria: pais possíveis = categorias principais do mesmo tipo
  const parents = categoryTree(categories, f.type).filter((c) => c.id !== item?.id);
  const hasChildren = item && categories.some((c) => c.parent_id === item.id && c.active !== false);
  const submit = async () => {
    setTouched(true); setError('');
    if (!f.name.trim()) return;
    setSaving(true);
    try {
      const body = { name: f.name.trim(), type: f.type, parent_id: f.parent_id || null };
      if (item) await api.put(`/categories/${item.id}`, body); else await api.post('/categories', body);
      toast(item ? 'Categoria atualizada.' : 'Categoria criada.');
      onSaved(); onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} onSubmit={submit} size="sm" title={item ? 'Editar categoria' : 'Nova categoria'}
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving}>Salvar</SubmitButton></>}>
      <div className="space-y-4">
        <InlineError error={error} />
        <Input label="Nome" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={touched && !f.name?.trim() ? 'Informe o nome.' : ''} maxLength={100} data-autofocus />
        <Select label="Tipo" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value, parent_id: '' })} disabled={!!item}>
          <option value="despesa">Despesa (dinheiro que sai)</option><option value="receita">Receita (dinheiro que entra)</option>
        </Select>
        <Select label="Dentro de" value={f.parent_id} onChange={(e) => setF({ ...f, parent_id: e.target.value })} disabled={hasChildren}
          hint={hasChildren ? 'Esta categoria tem subcategorias, por isso fica como principal.' : 'Deixe “Nenhuma” para criar uma categoria principal.'}>
          <option value="">Nenhuma (categoria principal)</option>
          {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>
    </Modal>
  );
}

function Group({ title, tree, canManage, onAdd, onEdit, onArchive }) {
  return (
    <section aria-labelledby={`g-${title}`} className="rounded-app-sm border border-line">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h3 id={`g-${title}`} className="text-sm font-semibold">{title}</h3>
        {canManage && <button type="button" className="btn-ghost btn-sm" onClick={() => onAdd(null)}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Nova</button>}
      </div>
      {!tree.length ? <p className="px-4 py-6 text-center text-sm text-ink-faint">Nenhuma categoria.</p> : (
        <ul className="divide-y divide-line">
          {tree.map((c) => (
            <li key={c.id}>
              <Row c={c} canManage={canManage} onEdit={onEdit} onArchive={onArchive} onAdd={() => onAdd(c)} />
              {c.children.length > 0 && (
                <ul className="divide-y divide-line border-t border-line bg-muted/40">
                  {c.children.map((s) => <li key={s.id}><Row c={s} sub canManage={canManage} onEdit={onEdit} onArchive={onArchive} /></li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ c, sub, canManage, onEdit, onArchive, onAdd }) {
  return (
    <div className={`flex items-center gap-2 py-2 pr-2 ${sub ? 'pl-8' : 'pl-4'}`}>
      {sub && <CornerDownRight className="h-3.5 w-3.5 text-ink-faint" aria-hidden="true" />}
      <span className={`min-w-0 flex-1 truncate text-sm ${sub ? '' : 'font-medium'}`}>{c.name}</span>
      {canManage && (
        <div className="flex">
          {onAdd && <button type="button" className="btn-ghost btn-icon btn-sm" aria-label={`Nova subcategoria em ${c.name}`} title="Nova subcategoria" onClick={onAdd}><Plus className="h-4 w-4" /></button>}
          <button type="button" className="btn-ghost btn-icon btn-sm" aria-label={`Editar ${c.name}`} onClick={() => onEdit(c)}><Pencil className="h-4 w-4" /></button>
          <button type="button" className="btn-ghost btn-icon btn-sm text-danger" aria-label={`Arquivar ${c.name}`} onClick={() => onArchive(c)}><Archive className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}

export default function Categories({ canManage }) {
  const { data, error, loading, reload } = useAsync(() => api.get('/categories'), []);
  const [form, setForm] = useState(null); // { item?, preset? }
  const archive = useArchive();
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const all = data?.items || [];
  if (!all.filter((c) => c.active !== false).length) {
    return (
      <>
        <EmptyState icon={Tags} title="Nenhuma categoria" action={canManage && <button type="button" className="btn-primary" onClick={() => setForm({})}><Plus className="h-4 w-4" aria-hidden="true" /> Criar categoria</button>}>
          Categorias mostram para onde vai e de onde vem o dinheiro (ex.: Aluguel, Vendas).
        </EmptyState>
        <Form open={!!form} onClose={() => setForm(null)} item={form?.item} preset={form?.preset} categories={all} onSaved={reload} />
      </>
    );
  }
  const handlers = (type) => ({
    onAdd: (parent) => setForm({ preset: { type, parent_id: parent?.id } }),
    onEdit: (c) => setForm({ item: c }),
    onArchive: (c) => archive(`/categories/${c.id}`, c.name, 'categoria', reload),
  });
  return (
    <div>
      <p className="mb-3 text-sm text-ink-faint">Use categorias para saber para onde vai e de onde vem o dinheiro. Subcategorias detalham uma categoria principal.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Group title="Receitas" tree={categoryTree(all, 'receita')} canManage={canManage} {...handlers('receita')} />
        <Group title="Despesas" tree={categoryTree(all, 'despesa')} canManage={canManage} {...handlers('despesa')} />
      </div>
      <Form open={!!form} onClose={() => setForm(null)} item={form?.item} preset={form?.preset} categories={all} onSaved={reload} />
    </div>
  );
}
