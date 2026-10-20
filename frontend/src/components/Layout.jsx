import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, UserRound, Building2, Check, MoreHorizontal, Clock, Repeat } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { visibleNav } from '../lib/nav';
import { daysUntil, date, plural } from '../lib/format';
import { errorMessage } from '../lib/api';
import { Logo } from './Brand';
import { Avatar, cx, Spinner } from './ui';

function useClickOutside(ref, onOut) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOut(); };
    const k = (e) => { if (e.key === 'Escape') onOut(); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [ref, onOut]);
}

/** Menu suspenso simples e acessível. */
function Dropdown({ label, button, children, align = 'right', className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));
  return (
    <div ref={ref} className={cx('relative', className)}>
      <button type="button" className="btn-ghost max-w-full px-2" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        {button}<ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className={cx('card absolute top-full z-40 mt-1 w-64 p-1 animate-pop', align === 'right' ? 'right-0' : 'left-0')}
          onClick={(e) => { if (e.target.closest('[role="menuitem"]')) setOpen(false); }}>
          {children}
        </div>
      )}
    </div>
  );
}

const itemCls = 'focus-ring flex w-full items-center gap-2 rounded-app-sm px-3 py-2 text-left text-sm hover:bg-muted';

export function OrgSwitcher({ inline }) {
  const { org, orgs, switchOrg } = useAuth();
  const { toast } = useUI();
  const navigate = useNavigate();
  const [busy, setBusy] = useState('');
  if (!org) return null;
  const change = async (id) => {
    if (id === org.id) return;
    setBusy(id);
    try { await switchOrg(id); navigate('/'); toast('Organização trocada.'); } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(''); }
  };
  if (orgs.length <= 1) {
    return inline ? null : <div className="hidden min-w-0 truncate px-2 text-sm font-semibold sm:block" title={org.name}>{org.name}</div>;
  }
  const list = orgs.map((o) => (
    <button key={o.id} type="button" role="menuitem" className={itemCls} onClick={() => change(o.id)} disabled={!!busy}>
      {busy === o.id ? <Spinner /> : <Check className={cx('h-4 w-4', o.id === org.id ? 'text-positive' : 'invisible')} aria-hidden="true" />}
      <span className="min-w-0 flex-1"><span className="block truncate">{o.name}</span><span className="block text-xs text-ink-faint">{o.role_name}</span></span>
    </button>
  ));
  if (inline) return <div role="group" aria-label="Trocar organização">{list}</div>;
  return (
    <Dropdown label={`Organização: ${org.name}. Trocar`} align="left" className="min-w-0"
      button={<span className="flex min-w-0 items-center gap-1.5"><Repeat className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" /><span className="truncate font-semibold text-ink">{org.name}</span></span>}>
      <p className="px-3 pb-1 pt-2 text-xs font-medium text-ink-faint">Trocar de organização</p>
      {list}
    </Dropdown>
  );
}

export function CompanyFilter({ className }) {
  const { companies, companyId, setCompanyId, me } = useAuth();
  if (!companies.length) return null;
  const locked = companies.length === 1 && Array.isArray(me?.company_scope);
  return (
    <div className={cx('relative min-w-0', className)}>
      <Building2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
      <select className="input max-w-[220px] pl-8 text-sm" aria-label="Filtrar por empresa" value={companyId}
        disabled={locked} onChange={(e) => setCompanyId(e.target.value)}>
        {!locked && <option value="">Todas as empresas</option>}
        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
}

function UserMenu() {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const out = async () => { await logout(); navigate('/entrar', { replace: true }); };
  return (
    <Dropdown label="Menu do usuário" button={<Avatar name={user?.name} />}>
      <div className="border-b border-line px-3 pb-2 pt-1.5">
        <div className="truncate text-sm font-semibold">{user?.name}</div>
        <div className="truncate text-xs text-ink-faint">{user?.email}</div>
        {role?.name && <div className="mt-1 text-xs text-ink-soft">Perfil: {role.name}</div>}
      </div>
      <Link role="menuitem" to="/conta" className={cx(itemCls, 'mt-1')}><UserRound className="h-4 w-4" aria-hidden="true" /> Minha conta</Link>
      <button type="button" role="menuitem" className={cx(itemCls, 'text-danger')} onClick={out}><LogOut className="h-4 w-4" aria-hidden="true" /> Sair</button>
    </Dropdown>
  );
}

function TrialBanner() {
  const { access } = useAuth();
  if (access?.status !== 'TRIAL') return null;
  const left = daysUntil(access.trial_ends_at);
  const text = left == null ? 'Você está no período de teste grátis.'
    : left > 0 ? `Teste grátis: faltam ${plural(left, 'dia', 'dias')} (até ${date(access.trial_ends_at)}).`
      : left === 0 ? 'Seu teste grátis termina hoje.' : 'Seu teste grátis terminou.';
  return (
    <div role="status" className={cx('flex items-center justify-center gap-2 px-4 py-2 text-center text-sm', left != null && left <= 3 ? 'bg-cta text-cta-fg' : 'bg-accent/15 text-ink')}>
      <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{text} Para continuar usando depois, fale com o suporte LORLER.</span>
    </div>
  );
}

const BOTTOM = ['/', '/pagar', '/receber', '/cadastros'];

export default function Layout() {
  const { can } = useAuth();
  const location = useLocation();
  const nav = visibleNav(can);
  const bottom = nav.filter((n) => BOTTOM.includes(n.to));
  const mainRef = useRef(null);

  // ao trocar de tela, leva o foco ao conteúdo (leitores de tela anunciam a nova página)
  useEffect(() => { mainRef.current?.focus({ preventScroll: true }); try { window.scrollTo(0, 0); } catch { /* ambiente sem rolagem */ } }, [location.pathname]);

  return (
    <div className="flex min-h-screen">
      <a href="#conteudo" className="sr-only z-50 rounded bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:left-2 focus:top-2">Pular para o conteúdo</a>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-brand text-brand-fg md:flex" aria-label="Menu principal">
        <div className="px-4 py-5"><Logo light /></div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => cx('focus-ring flex items-center gap-3 rounded-app-sm px-3 py-2.5 text-sm font-medium transition',
                isActive ? 'bg-brand-soft text-brand-fg shadow-[inset_3px_0_0_rgb(var(--accent))]' : 'text-brand-fg/75 hover:bg-brand-soft/70 hover:text-brand-fg')}>
              <n.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <p className="px-4 py-4 text-[11px] text-brand-fg/60">Um sistema LORLER</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TrialBanner />
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface/95 px-3 py-2 backdrop-blur sm:px-5">
          <Link to="/" className="md:hidden" aria-label="CIFREN, ir para o início"><Logo compact /></Link>
          <div className="min-w-0 flex-1"><OrgSwitcher /></div>
          <CompanyFilter className="hidden sm:block" />
          <UserMenu />
        </header>
        <div className="border-b border-line bg-surface px-3 py-2 sm:hidden"><CompanyFilter className="[&_select]:max-w-none" /></div>

        <main id="conteudo" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-5 outline-none sm:px-6 md:pb-10">
          <Outlet />
        </main>
      </div>

      <nav aria-label="Menu rápido" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface md:hidden">
        <ul className="flex">
          {bottom.map((n) => (
            <li key={n.to} className="flex-1">
              <NavLink to={n.to} end={n.end} className={({ isActive }) => cx('focus-ring flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-positive' : 'text-ink-faint')}>
                <n.icon className="h-5 w-5" aria-hidden="true" /> {n.short}
              </NavLink>
            </li>
          ))}
          <li className="flex-1">
            <NavLink to="/mais" className={({ isActive }) => cx('focus-ring flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-positive' : 'text-ink-faint')}>
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" /> Mais
            </NavLink>
          </li>
        </ul>
      </nav>
    </div>
  );
}
