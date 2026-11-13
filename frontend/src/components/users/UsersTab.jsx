import { useEffect, useState } from 'react';
import { UserPlus, Pencil, KeyRound, ShieldCheck, Users as UsersIcon, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { dateTime } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import Modal from '../Modal';
import { cx, Input, Select, Toggle, InlineError, SubmitButton, Loading, ErrorState, EmptyState, Badge, Avatar } from '../ui';
import CompanyAccess from './CompanyAccess';
import TempPassword from './TempPassword';

const RISK = { baixo: null, medio: { tone: 'warn', label: 'sensível' }, alto: { tone: 'danger', label: 'crítico' } };

/**
 * Visão por usuário: libera ou bloqueia permissões só para esta pessoa, por cima do que o perfil dela já dá.
 * value = { perm_add:[], perm_remove:[] }. baseline = permissões do perfil escolhido.
 */
function VisibilityEditor({ catalog, baseline, value, onChange, canGrant }) {
  const base = new Set(baseline || []);
  const add = new Set(value.perm_add || []);
  const rem = new Set(value.perm_remove || []);
  const effective = (code) => (rem.has(code) ? false : add.has(code) ? true : base.has(code));
  const changed = (code) => add.has(code) || rem.has(code);
  const total = [...add, ...rem].filter((c) => (base.has(c) ? rem.has(c) : add.has(c))).length;
  const set = (code, on) => {
    const a = new Set(add); const r = new Set(rem);
    a.delete(code); r.delete(code);
    if (on && !base.has(code)) a.add(code);
    if (!on && base.has(code)) r.add(code);
    onChange({ perm_add: [...a], perm_remove: [...r] });
  };
  if (!catalog?.length) return null;
  return (
    <details className="rounded-app-sm border border-line">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm font-medium">
        <SlidersHorizontal className="h-4 w-4 text-ink-faint" aria-hidden="true" /> Ajustes de acesso desta pessoa
        {total > 0 && <Badge tone="brand">{total} ajuste{total > 1 ? 's' : ''}</Badge>}
      </summary>
      <div className="space-y-3 border-t border-line p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-ink-faint">Por padrão o acesso segue o perfil. Aqui você <b>libera</b> ou <b>bloqueia</b> permissões só para esta pessoa, sem mudar o perfil.</p>
          {total > 0 && <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => onChange({ perm_add: [], perm_remove: [] })}><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Voltar ao perfil</button>}
        </div>
        {catalog.map((g) => (
          <fieldset key={g.group} className="space-y-1">
            <legend className="text-xs font-semibold text-ink-faint">{g.group}</legend>
            {g.items.map((it) => {
              const on = effective(it.code);
              const noGrant = !base.has(it.code) && !canGrant(it.code); // não dá para liberar o que o seu próprio perfil não tem
              const r = RISK[it.risk];
              return (
                <label key={it.code} className={cx('flex items-center gap-2 rounded-app-sm px-2 py-1 text-sm', changed(it.code) && 'bg-brand/5', noGrant && 'opacity-50')}>
                  <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={on} disabled={noGrant} onChange={(e) => set(it.code, e.target.checked)} />
                  <span className="flex-1">{it.label}</span>
                  {r && <Badge tone={r.tone}>{r.label}</Badge>}
                  {changed(it.code) && <Badge tone={on ? 'positive' : 'danger'}>{on ? 'liberado' : 'bloqueado'}</Badge>}
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
    </details>
  );
}

function InviteModal({ open, onClose, roles, catalog, onSaved }) {
  const { can } = useAuth();
  const [f, setF] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!open) return;
    setError(''); setTouched(false); setResult(null);
    setF({ name: '', email: '', role_key: roles.find((r) => r.key === 'lancamentos')?.key || roles.find((r) => r.key !== 'dono')?.key || '', company_ids: null, perm_add: [], perm_remove: [] });
  }, [open, roles]);
  const baseline = roles.find((r) => r.key === f.role_key)?.permissions || [];
  const companiesError = Array.isArray(f.company_ids) && !f.company_ids.length ? 'Marque pelo menos uma empresa.' : '';
  const submit = async () => {
    setTouched(true); setError('');
    if (!f.name.trim() || !f.email.trim() || !f.role_key || companiesError) return;
    setSaving(true);
    try {
      const res = await api.post('/users', { name: f.name.trim(), email: f.email.trim(), role_key: f.role_key, company_ids: f.company_ids, perm_add: f.perm_add, perm_remove: f.perm_remove });
      setResult({ password: res?.temporary_password, email: f.email.trim(), sent: !!res?.invite?.sent, existing: !!res?.existing_account, error: res?.invite?.error });
      onSaved();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };
  if (result) {
    return (
      <Modal open={open} onClose={onClose} title="Usuário criado" footer={<button type="button" className="btn-primary" onClick={onClose}>{result.password ? 'Já copiei, fechar' : 'Fechar'}</button>}>
        {result.password ? <>
          <p className="mb-3 text-sm text-ink-soft">O e-mail com a senha provisória não foi enviado{result.error ? ` (${result.error})` : ''}. Repasse a senha abaixo.</p>
          <TempPassword password={result.password} email={result.email} />
        </> : result.existing
          ? <p className="text-sm">Esta pessoa já tem conta no CIFREN. Ela entra com a senha que já usa e passa a ver esta organização.</p>
          : <p className="text-sm">Enviamos para <strong>{result.email}</strong> uma <strong>senha provisória</strong>. No primeiro acesso o CIFREN pede para a pessoa criar a própria senha.</p>}
      </Modal>
    );
  }
  return (
    <Modal open={open} onClose={onClose} onSubmit={submit} title="Convidar usuário" subtitle="A pessoa recebe por e-mail uma senha provisória e troca no primeiro acesso."
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving}>Criar acesso</SubmitButton></>}>
      <div className="space-y-4">
        <InlineError error={error} />
        <Input label="Nome" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={touched && !f.name?.trim() ? 'Informe o nome.' : ''} data-autofocus />
        <Input label="E-mail" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={touched && !f.email?.trim() ? 'Informe o e-mail.' : ''} />
        <Select label="Perfil" required value={f.role_key} onChange={(e) => setF({ ...f, role_key: e.target.value, perm_add: [], perm_remove: [] })} hint="O perfil define o que a pessoa pode ver e fazer; ajuste os detalhes abaixo.">
          {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
        </Select>
        <CompanyAccess value={f.company_ids} onChange={(v) => setF({ ...f, company_ids: v })} error={touched ? companiesError : ''} />
        <VisibilityEditor catalog={catalog} baseline={baseline} value={f} canGrant={can} onChange={(v) => setF({ ...f, ...v })} />
      </div>
    </Modal>
  );
}

function EditModal({ open, onClose, user, roles, catalog, onSaved, isSelf }) {
  const { toast } = useUI();
  const { can } = useAuth();
  const [f, setF] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open && user) setF({ role_key: user.role_key, company_ids: user.company_ids ?? null, active: user.active !== false, perm_add: user.perm_add || [], perm_remove: user.perm_remove || [] });
  }, [open, user]);
  const baseline = roles.find((r) => r.key === f.role_key)?.permissions || user?.role_permissions || [];
  const companiesError = Array.isArray(f.company_ids) && !f.company_ids.length ? 'Marque pelo menos uma empresa.' : '';
  const submit = async () => {
    if (companiesError) return;
    setSaving(true); setError('');
    try {
      await api.put(`/users/${user.id}`, f);
      toast('Usuário atualizado.');
      onSaved(); onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} onSubmit={submit} title={`Editar ${user?.name || ''}`} subtitle={user?.email}
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving}>Salvar</SubmitButton></>}>
      <div className="space-y-4">
        <InlineError error={error} />
        <Select label="Perfil" value={f.role_key || ''} onChange={(e) => setF({ ...f, role_key: e.target.value, perm_add: [], perm_remove: [] })}>
          {!roles.some((r) => r.key === f.role_key) && f.role_key && <option value={f.role_key}>{user?.role_name}</option>}
          {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
        </Select>
        <CompanyAccess value={f.company_ids} onChange={(v) => setF({ ...f, company_ids: v })} error={companiesError} />
        <VisibilityEditor catalog={catalog} baseline={baseline} value={f} canGrant={can} onChange={(v) => setF({ ...f, ...v })} />
        <Toggle label="Acesso ativo" hint={isSelf ? 'Você não pode desativar o seu próprio acesso.' : 'Desativado, a pessoa não consegue mais entrar. O histórico continua.'}
          checked={!!f.active} onChange={(v) => setF({ ...f, active: v })} disabled={isSelf} />
      </div>
    </Modal>
  );
}

export default function UsersTab({ roles, catalog }) {
  const { user: me } = useAuth();
  const { confirm, toast } = useUI();
  const { data, error, loading, reload } = useAsync(() => api.get('/users'), []);
  const [invite, setInvite] = useState(false);
  const [edit, setEdit] = useState(null);
  const [reset, setReset] = useState(null); // { email, password }
  const users = data?.items || [];
  const roleOptions = roles.length ? roles : [...new Map(users.map((u) => [u.role_key, { key: u.role_key, name: u.role_name, permissions: u.role_permissions }])).values()];

  const doReset = async (u) => {
    const ok = await confirm({ title: `Enviar nova senha provisória para ${u.name}?`, message: `A senha atual deixa de funcionar. ${u.email} recebe por e-mail uma senha provisória e troca no primeiro acesso.`, confirmText: 'Enviar nova senha' });
    if (!ok) return;
    try {
      const res = await api.post(`/users/${u.id}/reset-password`);
      if (res?.temporary_password) setReset({ email: u.email, password: res.temporary_password });
      else toast(`Senha provisória enviada para ${u.email}.`);
      reload();
    } catch (e) { toast(errorMessage(e), 'error'); }
  };
  const adjusted = (u) => (u.perm_add?.length || 0) + (u.perm_remove?.length || 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-faint">Quem tem acesso ao CIFREN desta organização. Cada pessoa segue um perfil, com ajustes individuais quando precisar.</p>
        <button type="button" className="btn-primary" onClick={() => setInvite(true)}><UserPlus className="h-4 w-4" aria-hidden="true" /> Convidar usuário</button>
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !users.length ? (
        <EmptyState icon={UsersIcon} title="Só você por enquanto">Convide quem ajuda nas finanças: sócio, funcionário ou contador.</EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-app-sm border border-line">
          {users.map((u) => (
            <li key={u.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${u.active === false ? 'opacity-60' : ''}`}>
              <Avatar name={u.name} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {u.name}{u.id === me?.id && <Badge>Você</Badge>}{u.active === false && <Badge tone="danger">Desativado</Badge>}{u.must_change_password && u.id !== me?.id && <Badge tone="warn">Aguardando 1º acesso</Badge>}
                  {adjusted(u) > 0 && <Badge tone="brand">acesso ajustado</Badge>}
                  {u.mfa_enabled && <span title="Verificação em duas etapas ativa" className="text-positive"><ShieldCheck className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Verificação em duas etapas ativa</span></span>}
                </div>
                <div className="truncate text-xs text-ink-faint">{u.email} · {u.role_name}{Array.isArray(u.company_ids) && ` · ${u.company_ids.length} empresa(s)`}</div>
                <div className="text-[11px] text-ink-faint">{u.last_login_at ? `Último acesso: ${dateTime(u.last_login_at)}` : 'Ainda não entrou'}</div>
              </div>
              <div className="flex gap-1">
                <button type="button" className="btn-ghost btn-sm" onClick={() => setEdit(u)} aria-label={`Editar ${u.name}`}><Pencil className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Editar</span></button>
                {u.id !== me?.id && <button type="button" className="btn-ghost btn-sm" onClick={() => doReset(u)} aria-label={`Gerar nova senha para ${u.name}`}><KeyRound className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Nova senha</span></button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <InviteModal open={invite} onClose={() => setInvite(false)} roles={roleOptions} catalog={catalog} onSaved={reload} />
      <EditModal open={!!edit} onClose={() => setEdit(null)} user={edit} roles={roleOptions} catalog={catalog} onSaved={reload} isSelf={edit?.id === me?.id} />
      <Modal open={!!reset} onClose={() => setReset(null)} title="O e-mail não saiu: repasse a senha provisória" footer={<button type="button" className="btn-primary" onClick={() => setReset(null)}>Já copiei, fechar</button>}>
        {reset && <TempPassword password={reset.password} email={reset.email} />}
      </Modal>
    </div>
  );
}
