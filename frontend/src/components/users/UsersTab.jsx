import { useEffect, useState } from 'react';
import { UserPlus, Pencil, KeyRound, ShieldCheck, Users as UsersIcon } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { dateTime } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import Modal from '../Modal';
import { Input, Select, Toggle, InlineError, SubmitButton, Loading, ErrorState, EmptyState, Badge, Avatar } from '../ui';
import CompanyAccess from './CompanyAccess';
import TempPassword from './TempPassword';

function InviteModal({ open, onClose, roles, onSaved }) {
  const [f, setF] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!open) return;
    setError(''); setTouched(false); setResult(null);
    setF({ name: '', email: '', role_key: roles.find((r) => r.key === 'lancamentos')?.key || roles.find((r) => r.key !== 'dono')?.key || '', company_ids: null });
  }, [open, roles]);
  const companiesError = Array.isArray(f.company_ids) && !f.company_ids.length ? 'Marque pelo menos uma empresa.' : '';
  const submit = async () => {
    setTouched(true); setError('');
    if (!f.name.trim() || !f.email.trim() || !f.role_key || companiesError) return;
    setSaving(true);
    try {
      const res = await api.post('/users', { name: f.name.trim(), email: f.email.trim(), role_key: f.role_key, company_ids: f.company_ids });
      setResult({ password: res?.temporary_password, email: f.email.trim() });
      onSaved();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };
  if (result) {
    return (
      <Modal open={open} onClose={onClose} title="Usuário criado" footer={<button type="button" className="btn-primary" onClick={onClose}>Já copiei, fechar</button>}>
        <TempPassword password={result.password} email={result.email} />
      </Modal>
    );
  }
  return (
    <Modal open={open} onClose={onClose} onSubmit={submit} title="Convidar usuário" subtitle="A pessoa recebe uma senha temporária e troca no primeiro acesso."
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving}>Criar acesso</SubmitButton></>}>
      <div className="space-y-4">
        <InlineError error={error} />
        <Input label="Nome" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={touched && !f.name?.trim() ? 'Informe o nome.' : ''} data-autofocus />
        <Input label="E-mail" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={touched && !f.email?.trim() ? 'Informe o e-mail.' : ''} />
        <Select label="Perfil" required value={f.role_key} onChange={(e) => setF({ ...f, role_key: e.target.value })} hint="O perfil define o que a pessoa pode ver e fazer.">
          {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
        </Select>
        <CompanyAccess value={f.company_ids} onChange={(v) => setF({ ...f, company_ids: v })} error={touched ? companiesError : ''} />
      </div>
    </Modal>
  );
}

function EditModal({ open, onClose, user, roles, onSaved, isSelf }) {
  const { toast } = useUI();
  const [f, setF] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open && user) { setError(''); setF({ role_key: user.role_key, company_ids: user.company_ids ?? null, active: user.active !== false }); }
  }, [open, user]);
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
        <Select label="Perfil" value={f.role_key || ''} onChange={(e) => setF({ ...f, role_key: e.target.value })}>
          {!roles.some((r) => r.key === f.role_key) && f.role_key && <option value={f.role_key}>{user?.role_name}</option>}
          {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
        </Select>
        <CompanyAccess value={f.company_ids} onChange={(v) => setF({ ...f, company_ids: v })} error={companiesError} />
        <Toggle label="Acesso ativo" hint={isSelf ? 'Você não pode desativar o seu próprio acesso.' : 'Desativado, a pessoa não consegue mais entrar. O histórico continua.'}
          checked={!!f.active} onChange={(v) => setF({ ...f, active: v })} disabled={isSelf} />
      </div>
    </Modal>
  );
}

export default function UsersTab({ roles }) {
  const { user: me } = useAuth();
  const { confirm, toast } = useUI();
  const { data, error, loading, reload } = useAsync(() => api.get('/users'), []);
  const [invite, setInvite] = useState(false);
  const [edit, setEdit] = useState(null);
  const [reset, setReset] = useState(null); // { email, password }
  const users = data?.items || [];
  // perfis para escolher: os da API; se a API de perfis não estiver liberada, usa os que já aparecem nos usuários
  const roleOptions = roles.length ? roles : [...new Map(users.map((u) => [u.role_key, { key: u.role_key, name: u.role_name }])).values()];

  const doReset = async (u) => {
    const ok = await confirm({ title: `Gerar nova senha para ${u.name}?`, message: 'A senha atual deixa de funcionar e a pessoa precisará da nova senha temporária para entrar.', confirmText: 'Gerar nova senha' });
    if (!ok) return;
    try {
      const res = await api.post(`/users/${u.id}/reset-password`);
      setReset({ email: u.email, password: res?.temporary_password });
    } catch (e) { toast(errorMessage(e), 'error'); }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-faint">Quem tem acesso ao CIFREN desta organização.</p>
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
                  {u.name}{u.id === me?.id && <Badge>Você</Badge>}{u.active === false && <Badge tone="danger">Desativado</Badge>}
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
      <InviteModal open={invite} onClose={() => setInvite(false)} roles={roleOptions} onSaved={reload} />
      <EditModal open={!!edit} onClose={() => setEdit(null)} user={edit} roles={roleOptions} onSaved={reload} isSelf={edit?.id === me?.id} />
      <Modal open={!!reset} onClose={() => setReset(null)} title="Nova senha temporária" footer={<button type="button" className="btn-primary" onClick={() => setReset(null)}>Já copiei, fechar</button>}>
        {reset && <TempPassword password={reset.password} email={reset.email} />}
      </Modal>
    </div>
  );
}
