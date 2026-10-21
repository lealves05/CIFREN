import { Link } from 'react-router-dom';
import { Lock, ShieldCheck, Users, ScrollText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { api, errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { P } from '../../lib/permissions';
import { PageHeader, Loading, ErrorState, Toggle } from '../../components/ui';
import { Notice, Panel } from '../../components/kit';

export default function Security() {
  const { user, can, refresh } = useAuth();
  const { toast, confirm } = useUI();
  const { data, error, loading, reload, setData } = useAsync(() => api.get('/security'), []);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} className="card" />;
  const set = async (v) => {
    if (v && !(await confirm({ title: 'Exigir verificação em duas etapas de todos?', message: 'Quem ainda não ativou será levado a ativar no próximo uso e não consegue trabalhar até ativar.', confirmText: 'Exigir de todos' }))) return;
    setData({ ...data, require_mfa: v });
    try { await api.put('/security', { require_mfa: v }); await refresh().catch(() => {}); toast(v ? 'Agora todos precisam usar as 2 etapas.' : 'As 2 etapas voltaram a ser opcionais.'); } catch (e) { toast(errorMessage(e), 'error'); reload(); }
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Segurança" icon={Lock} subtitle="Regras de acesso que valem para toda a organização." />
      <Panel title="Verificação em duas etapas">
        {!user?.mfa_enabled && (
          <Notice tone="warn" className="mb-3" action={<Link to="/conta" className="btn-outline btn-sm">Ativar na minha conta</Link>}>
            Ative primeiro na sua própria conta, para não ficar sem acesso.
          </Notice>
        )}
        {data?.users_without_mfa > 0 && (
          <p className="mb-2 text-sm text-ink-soft">{data.users_without_mfa === 1 ? '1 pessoa ainda não ativou' : `${data.users_without_mfa} pessoas ainda não ativaram`} as 2 etapas.</p>
        )}
        <Toggle label="Exigir de todos os usuários" hint="Além da senha, cada pessoa usa um código do celular para entrar." checked={!!data?.require_mfa}
          disabled={!user?.mfa_enabled && !data?.require_mfa} onChange={set} />
      </Panel>
      <div className="grid gap-4 sm:grid-cols-2">
        {can(P.rolesManage, P.usersManage) && (
          <Link to="/usuarios?aba=perfis" className="card flex items-start gap-3 p-4 hover:border-accent/60">
            <Users className="h-5 w-5 text-accent" aria-hidden="true" />
            <span><span className="block text-sm font-semibold">Perfis, empresas e dados sensíveis</span><span className="block text-xs text-ink-faint">Quem vê o quê, em quais empresas, e quem vê CPF/CNPJ, e-mail e telefone completos.</span></span>
          </Link>
        )}
        {can(P.auditView) && (
          <Link to="/auditoria" className="card flex items-start gap-3 p-4 hover:border-accent/60">
            <ScrollText className="h-5 w-5 text-accent" aria-hidden="true" />
            <span><span className="block text-sm font-semibold">Auditoria</span><span className="block text-xs text-ink-faint">Tudo o que foi feito, por quem e quando.</span></span>
          </Link>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-ink-faint"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />Sessões por cookie protegido, proteção contra envio forjado e registro de auditoria em todas as alterações.</p>
    </div>
  );
}
