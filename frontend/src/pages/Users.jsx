import { useState } from 'react';
import { Users as UsersIcon, UserCog, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useAuth } from '../context/AuthContext';
import { P } from '../lib/permissions';
import { PageHeader, Tabs, Loading, ErrorState } from '../components/ui';
import UsersTab from '../components/users/UsersTab';
import RolesTab from '../components/users/RolesTab';

export default function Users() {
  const { can } = useAuth();
  const tabs = [
    can(P.usersManage) && { value: 'usuarios', label: 'Usuários', icon: UserCog },
    can(P.rolesManage) && { value: 'perfis', label: 'Perfis', icon: ShieldCheck },
  ].filter(Boolean);
  const [tab, setTab] = useState(tabs[0]?.value);
  // a lista de perfis serve às duas abas (escolher o perfil de um usuário e editar perfis)
  const roles = useAsync(() => api.get('/roles').catch((e) => (can(P.rolesManage) ? Promise.reject(e) : null)), []);
  return (
    <div>
      <PageHeader title="Usuários e perfis" icon={UsersIcon} subtitle="Quem acessa e o que cada um pode fazer." />
      <div className="card">
        {tabs.length > 1 && <Tabs label="Usuários e perfis" tabs={tabs} value={tab} onChange={setTab} className="px-2" />}
        <div className="p-4" role="tabpanel">
          {tab === 'usuarios' && <UsersTab roles={roles.data?.roles || []} />}
          {tab === 'perfis' && (roles.loading && !roles.data ? <Loading /> : roles.error ? <ErrorState error={roles.error} onRetry={roles.reload} /> : <RolesTab data={roles.data} reload={roles.reload} />)}
        </div>
      </div>
    </div>
  );
}
