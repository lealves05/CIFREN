import { useSearchParams } from 'react-router-dom';
import { FolderOpen, Users, Tags, Target, Landmark } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { P } from '../lib/permissions';
import { PageHeader, Tabs } from '../components/ui';
import Counterparties from '../components/cadastros/Counterparties';
import Categories from '../components/cadastros/Categories';
import CostCenters from '../components/cadastros/CostCenters';
import Accounts from '../components/cadastros/Accounts';

export default function Cadastros() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const view = can(P.registryView, P.registryManage);
  const tabs = [
    view && { value: 'pessoas', label: 'Fornecedores e clientes', icon: Users },
    view && { value: 'categorias', label: 'Categorias', icon: Tags },
    view && { value: 'centros', label: 'Centros de custo', icon: Target },
    can(P.registryView, P.accountsManage) && { value: 'contas', label: 'Contas bancárias', icon: Landmark },
  ].filter(Boolean);
  const asked = params.get('aba');
  const tab = tabs.some((t) => t.value === asked) ? asked : tabs[0]?.value;
  const setTab = (v) => setParams({ aba: v }, { replace: true });
  const manage = can(P.registryManage);
  return (
    <div>
      <PageHeader title="Cadastros" icon={FolderOpen} subtitle="Quem você paga e quem te paga, categorias, centros de custo e contas." />
      <div className="card">
        <Tabs label="Tipo de cadastro" tabs={tabs} value={tab} onChange={setTab} className="px-2" />
        <div className="p-4" role="tabpanel">
          {tab === 'pessoas' && <Counterparties canManage={manage} />}
          {tab === 'categorias' && <Categories canManage={manage} />}
          {tab === 'centros' && <CostCenters canManage={manage} />}
          {tab === 'contas' && <Accounts canManage={can(P.accountsManage)} />}
        </div>
      </div>
    </div>
  );
}
