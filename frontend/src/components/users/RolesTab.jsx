import { useEffect, useMemo, useState } from 'react';
import { Plus, Lock, Trash2, ShieldAlert, Save } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useUI } from '../../context/UIContext';
import Modal from '../Modal';
import { Input, Select, Toggle, InlineError, SubmitButton, Badge, EmptyState, Spinner, cx } from '../ui';

const RISK = { alto: { label: 'Risco alto', tone: 'danger' }, medio: { label: 'Risco médio', tone: 'warn' } };

function NewRoleModal({ open, onClose, roles, onCreated }) {
  const { toast } = useUI();
  const [name, setName] = useState('');
  const [copy, setCopy] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setName(''); setCopy(''); setError(''); setTouched(false); } }, [open]);
  const submit = async () => {
    setTouched(true); setError('');
    if (!name.trim()) return;
    setSaving(true);
    try {
      const src = roles.find((r) => r.id === copy);
      const res = await api.post('/roles', { name: name.trim(), permissions: src ? src.permissions : [], ...(src ? { copy_from: src.id } : {}) });
      toast('Perfil criado. Agora escolha o que ele pode fazer.');
      onCreated(res?.id ?? res?.role?.id, name.trim());
      onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} onSubmit={submit} size="sm" title="Novo perfil"
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving}>Criar perfil</SubmitButton></>}>
      <div className="space-y-4">
        <InlineError error={error} />
        <Input label="Nome do perfil" required value={name} onChange={(e) => setName(e.target.value)} error={touched && !name.trim() ? 'Dê um nome ao perfil.' : ''} placeholder="Ex.: Caixa da loja" data-autofocus maxLength={60} />
        <Select label="Começar" value={copy} onChange={(e) => setCopy(e.target.value)} hint="Copiar facilita: depois é só ajustar o que muda.">
          <option value="">Do zero (sem nenhuma permissão)</option>
          {roles.map((r) => <option key={r.id} value={r.id}>Copiar de “{r.name}”</option>)}
        </Select>
      </div>
    </Modal>
  );
}

function RoleEditor({ role, catalog, onSaved, onDeleted }) {
  const { toast, confirm } = useUI();
  const readOnly = role.key === 'dono';
  const [name, setName] = useState(role.name);
  const [perms, setPerms] = useState(new Set(role.permissions || []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setName(role.name); setPerms(new Set(role.permissions || [])); setError(''); }, [role]);
  const dirty = name !== role.name || perms.size !== (role.permissions || []).length || [...perms].some((p) => !(role.permissions || []).includes(p));
  const toggle = (code, on) => setPerms((s) => { const n = new Set(s); if (on) n.add(code); else n.delete(code); return n; });
  const setGroup = (items, on) => setPerms((s) => { const n = new Set(s); items.forEach((i) => (on ? n.add(i.code) : n.delete(i.code))); return n; });

  const save = async () => {
    if (!name.trim()) { setError('Dê um nome ao perfil.'); return; }
    setSaving(true); setError('');
    try {
      await api.put(`/roles/${role.id}`, { ...(role.system ? {} : { name: name.trim() }), permissions: [...perms] });
      toast('Perfil salvo.');
      onSaved();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };
  const remove = async () => {
    const ok = await confirm({ title: `Excluir o perfil “${role.name}”?`, message: 'Esta ação não pode ser desfeita.', confirmText: 'Excluir', danger: true });
    if (!ok) return;
    try { await api.del(`/roles/${role.id}`); toast('Perfil excluído.'); onDeleted(); } catch (e) { toast(errorMessage(e), 'error'); }
  };

  return (
    <section aria-labelledby="role-ed-t" className="rounded-app-sm border border-line">
      <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
        <div className="min-w-[200px] flex-1">
          <h3 id="role-ed-t" className="sr-only">Editar perfil {role.name}</h3>
          <Input label="Nome do perfil" value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly || role.system}
            hint={readOnly ? 'O perfil Dono tem acesso total e não pode ser alterado.' : role.system ? 'Perfil padrão do sistema: o nome é fixo, as permissões podem ser ajustadas.' : `${role.members || 0} pessoa(s) com este perfil.`} />
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            {!role.system && (
              <button type="button" className="btn-ghost text-danger" onClick={remove} disabled={role.members > 0}
                title={role.members > 0 ? 'Só é possível excluir um perfil sem pessoas' : undefined}>
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir
              </button>
            )}
            <button type="button" className="btn-primary" onClick={save} disabled={!dirty || saving}>{saving ? <Spinner /> : <Save className="h-4 w-4" aria-hidden="true" />} Salvar</button>
          </div>
        )}
      </div>
      {error && <div className="px-4 pt-3"><InlineError error={error} /></div>}
      {readOnly && <p className="flex items-center gap-2 px-4 pt-3 text-sm text-ink-faint"><Lock className="h-4 w-4" aria-hidden="true" /> Somente leitura.</p>}
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        {catalog.map((g) => {
          const allOn = g.items.every((i) => perms.has(i.code));
          return (
            <fieldset key={g.group} className="rounded-app-sm border border-line px-3 pb-2">
              <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
                {g.group}
                {!readOnly && <button type="button" className="text-xs font-medium text-positive hover:underline" onClick={() => setGroup(g.items, !allOn)}>{allOn ? 'desmarcar todos' : 'marcar todos'}</button>}
              </legend>
              <div className="divide-y divide-line">
                {g.items.map((i) => (
                  <Toggle key={i.code} label={i.label} checked={readOnly || perms.has(i.code)} disabled={readOnly}
                    onChange={(v) => toggle(i.code, v)} badge={RISK[i.risk] && <Badge tone={RISK[i.risk].tone}>{i.risk === 'alto' && <ShieldAlert className="h-3 w-3" aria-hidden="true" />}{RISK[i.risk].label}</Badge>} />
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
      {dirty && !readOnly && <p className="px-4 pb-4 text-sm text-warn" role="status">Há alterações não salvas.</p>}
    </section>
  );
}

export default function RolesTab({ data, reload }) {
  const roles = useMemo(() => data?.roles || [], [data]);
  const catalog = data?.catalog || [];
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [pendingName, setPendingName] = useState(null);

  useEffect(() => {
    if (pendingName) {
      const r = roles.find((x) => x.id === pendingName.id) || roles.find((x) => x.name === pendingName.name);
      if (r) { setSelected(r.id); setPendingName(null); return; }
    }
    if (!roles.some((r) => r.id === selected)) setSelected(roles.find((r) => r.key !== 'dono')?.id || roles[0]?.id || null);
  }, [roles]); // eslint-disable-line react-hooks/exhaustive-deps

  const role = roles.find((r) => r.id === selected);
  if (!roles.length) return <EmptyState title="Nenhum perfil encontrado" />;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-faint">Perfis definem o que cada pessoa pode ver e fazer. Permissões de <strong className="text-danger">risco alto</strong> mexem com dinheiro ou acessos: libere com cuidado.</p>
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Novo perfil</button>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
        <div role="listbox" aria-label="Perfis" className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {roles.map((r) => (
            <button key={r.id} type="button" role="option" aria-selected={r.id === selected} onClick={() => setSelected(r.id)}
              className={cx('focus-ring flex shrink-0 items-center justify-between gap-2 rounded-app-sm border px-3 py-2.5 text-left text-sm transition',
                r.id === selected ? 'border-accent bg-accent/10' : 'border-line hover:bg-muted')}>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium">{r.key === 'dono' && <Lock className="h-3.5 w-3.5" aria-hidden="true" />}{r.name}</span>
                <span className="block text-xs text-ink-faint">{r.system ? 'Padrão' : 'Personalizado'} · {r.members || 0} pessoa(s)</span>
              </span>
            </button>
          ))}
        </div>
        {role && <RoleEditor role={role} catalog={catalog} onSaved={reload} onDeleted={() => { setSelected(null); reload(); }} />}
      </div>
      <NewRoleModal open={creating} onClose={() => setCreating(false)} roles={roles} onCreated={(id, name) => { setPendingName({ id, name }); reload(); }} />
    </div>
  );
}
