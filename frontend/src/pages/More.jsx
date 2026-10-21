import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { visibleGroups, OVERVIEW } from '../lib/nav';
import { OrgSwitcher, BOTTOM } from '../components/Layout';
import { PageHeader } from '../components/ui';

/** Tela "Mais" do celular: o restante do menu em grupos, visão geral, troca de organização e Sair. */
export default function More() {
  const { can, moduleOn, logout, orgs, user } = useAuth();
  const navigate = useNavigate();
  const groups = visibleGroups(can, moduleOn)
    .map((g) => ({ ...g, items: g.items.filter((n) => !BOTTOM.includes(n.to)) }))
    .filter((g) => g.items.length);
  const row = (n) => (
    <Link key={n.to} to={n.to} className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium hover:bg-muted">
      <n.icon className="h-5 w-5 text-accent" aria-hidden="true" /><span className="flex-1">{n.label}</span><ChevronRight className="h-4 w-4 text-ink-faint" aria-hidden="true" />
    </Link>
  );
  return (
    <div>
      <PageHeader title="Mais opções" subtitle={user?.email} />
      <Link to={OVERVIEW.to} className="card mb-4 flex items-center gap-3 bg-brand p-4 text-brand-fg">
        <OVERVIEW.icon className="h-6 w-6 text-accent" aria-hidden="true" />
        <span className="flex-1"><span className="block text-sm font-semibold">Conheça o CIFREN</span><span className="block text-xs text-brand-fg/75">Mapa de tudo o que o sistema faz</span></span>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
      <div className="space-y-4">
        {groups.map((g) => (
          <nav key={g.key} aria-label={g.label || g.items[0].label}>
            {g.label && <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-ink-faint">{g.label}</h2>}
            <div className="card divide-y divide-line">{g.items.map(row)}</div>
          </nav>
        ))}
      </div>
      {orgs.length > 1 && (
        <section className="card mt-4 p-2">
          <h2 className="px-3 pb-1 pt-2 text-xs font-medium text-ink-faint">Trocar de organização</h2>
          <OrgSwitcher inline />
        </section>
      )}
      <button type="button" className="btn-outline mt-4 w-full text-danger" onClick={async () => { await logout(); navigate('/entrar', { replace: true }); }}>
        <LogOut className="h-4 w-4" aria-hidden="true" /> Sair
      </button>
    </div>
  );
}
