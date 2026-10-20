import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { visibleNav } from '../lib/nav';
import { OrgSwitcher } from '../components/Layout';
import { PageHeader } from '../components/ui';

/** Tela "Mais" do celular: o restante do menu, troca de organização e Sair. */
export default function More() {
  const { can, logout, orgs, user } = useAuth();
  const navigate = useNavigate();
  const items = visibleNav(can).filter((n) => !['/', '/pagar', '/receber', '/cadastros'].includes(n.to));
  return (
    <div>
      <PageHeader title="Mais opções" subtitle={user?.email} />
      <nav aria-label="Outras telas" className="card divide-y divide-line">
        {items.map((n) => (
          <Link key={n.to} to={n.to} className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium hover:bg-muted">
            <n.icon className="h-5 w-5 text-accent" aria-hidden="true" /><span className="flex-1">{n.label}</span><ChevronRight className="h-4 w-4 text-ink-faint" aria-hidden="true" />
          </Link>
        ))}
      </nav>
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
