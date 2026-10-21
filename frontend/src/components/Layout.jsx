import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, UserRound, Building2, Check, MoreHorizontal, Clock, Repeat, Send, Map as MapIcon, PlayCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { visibleGroups, visibleNav, OVERVIEW, SUPPORT } from '../lib/nav';
import { lessonFor } from '../lib/training-help';
import { daysUntil, date, plural } from '../lib/format';
import { api, errorMessage, EVENTS } from '../lib/api';
import { P, APPROVER_PERMS } from '../lib/permissions';
import { readPref, writePref } from '../lib/storage';
import { Logo } from './Brand';
import { Avatar, cx, Spinner } from './ui';
import NotificationBell from './NotificationBell';
import Modal from './Modal';
import DocumentCapture from './DocumentCapture';

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

/** Botão "Aula" do topo: abre a vídeo-aula da tela atual (ou a lista de aulas). */
function HelpLink() {
  const { pathname } = useLocation();
  if (pathname === SUPPORT.to) return null;
  const l = lessonFor(pathname);
  return (
    <Link to={l ? `${SUPPORT.to}?aula=${l.n}` : SUPPORT.to} className="btn-ghost btn-sm text-accent" title={l ? `Aula ${l.n}: ${l.title}` : 'Vídeo-aulas do CIFREN'}
      aria-label={l ? `Ver a aula desta tela: ${l.title}` : 'Ver as vídeo-aulas do CIFREN'}>
      <PlayCircle className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Aula</span>
    </Link>
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

/** Atalhos da barra inferior do celular (Enviar e Mais são botões próprios). */
export const BOTTOM = ['/', '/pagar', '/receber'];

/** Contador de aprovações pendentes que a pessoa pode decidir. */
function useApprovalCount() {
  const { can, org } = useAuth();
  const [n, setN] = useState(0);
  const allowed = can(...APPROVER_PERMS);
  useEffect(() => {
    if (!allowed) { setN(0); return undefined; }
    let alive = true;
    const load = async () => {
      try {
        const res = await api.get('/approvals?status=pendente');
        if (alive) setN((res?.items || []).filter((a) => a.can_decide !== false).length);
      } catch { /* contador é secundário */ }
    };
    load();
    const t = setInterval(load, 120000);
    window.addEventListener(EVENTS.countsChanged, load);
    return () => { alive = false; clearInterval(t); window.removeEventListener(EVENTS.countsChanged, load); };
  }, [allowed, org?.id]);
  return n;
}

const GROUP_PREF = 'cifren.menu.fechados';

function SideNav({ counts }) {
  const { can, moduleOn } = useAuth();
  const location = useLocation();
  const groups = visibleGroups(can, moduleOn);
  const [closed, setClosed] = useState(() => new Set((readPref(GROUP_PREF) || '').split(',').filter(Boolean)));
  const toggle = (k) => setClosed((s) => {
    const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k);
    writePref(GROUP_PREF, [...n].join(','));
    return n;
  });
  const link = (n, sub) => (
    <NavLink key={n.to} to={n.to} end={n.end}
      className={({ isActive }) => cx('focus-ring flex items-center gap-3 rounded-app-sm px-3 py-2 text-sm font-medium transition', sub && 'pl-5',
        isActive ? 'bg-brand-soft text-brand-fg shadow-[inset_3px_0_0_rgb(var(--accent))]' : 'text-brand-fg/75 hover:bg-brand-soft/70 hover:text-brand-fg')}>
      <n.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /> <span className="flex-1 truncate">{n.label}</span>
      {n.badge && counts[n.badge] > 0 && <span className="rounded-full bg-cta px-1.5 text-[11px] font-bold text-cta-fg" aria-label={`${counts[n.badge]} pendentes`}>{counts[n.badge]}</span>}
    </NavLink>
  );
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
      {groups.map((g) => {
        if (!g.label) return g.items.map((n) => link(n));
        const active = g.items.some((n) => location.pathname.startsWith(n.to));
        const isOpen = active || !closed.has(g.key);
        const total = g.items.reduce((a, n) => a + (n.badge ? counts[n.badge] || 0 : 0), 0);
        return (
          <div key={g.key} className="pt-1">
            <button type="button" aria-expanded={isOpen} onClick={() => !active && toggle(g.key)}
              className="focus-ring flex w-full items-center gap-3 rounded-app-sm px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-brand-fg/60 hover:text-brand-fg">
              <g.icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="flex-1">{g.label}</span>
              {!isOpen && total > 0 && <span className="rounded-full bg-cta px-1.5 text-[11px] font-bold normal-case tracking-normal text-cta-fg">{total}</span>}
              <ChevronDown className={cx('h-3.5 w-3.5 transition', isOpen && 'rotate-180', active && 'opacity-0')} aria-hidden="true" />
            </button>
            {isOpen && <div className="space-y-0.5">{g.items.map((n) => link(n, true))}</div>}
          </div>
        );
      })}
    </nav>
  );
}

/** Aviso quando a organização exige 2 etapas e a pessoa ainda não ativou. */
function useMfaGate() {
  const navigate = useNavigate();
  const { toast } = useUI();
  const last = useRef(0);
  useEffect(() => {
    const on = () => {
      if (Date.now() - last.current < 5000) return;
      last.current = Date.now();
      toast('Sua organização exige a verificação em duas etapas. Ative para continuar usando o CIFREN.', 'error');
      navigate('/conta?exigir2etapas=1');
    };
    window.addEventListener(EVENTS.mfaRequired, on);
    return () => window.removeEventListener(EVENTS.mfaRequired, on);
  }, [navigate, toast]);
}

export default function Layout() {
  const { can, moduleOn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const nav = visibleNav(can, moduleOn);
  const bottom = BOTTOM.map((to) => nav.find((n) => n.to === to)).filter(Boolean);
  const canSend = can(P.docsUpload) && moduleOn('documentos_ia');
  const mainRef = useRef(null);
  const [capture, setCapture] = useState(false);
  const approvals = useApprovalCount();
  useMfaGate();

  // ao trocar de tela, leva o foco ao conteúdo (leitores de tela anunciam a nova página)
  useEffect(() => { mainRef.current?.focus({ preventScroll: true }); try { window.scrollTo(0, 0); } catch { /* ambiente sem rolagem */ } }, [location.pathname]);

  const tab = (active) => cx('focus-ring flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium', active ? 'text-positive' : 'text-ink-faint');

  return (
    <div className="flex min-h-screen">
      <a href="#conteudo" className="sr-only z-50 rounded bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:left-2 focus:top-2">Pular para o conteúdo</a>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-brand text-brand-fg md:flex" aria-label="Menu principal">
        <div className="px-4 py-5"><Logo light /></div>
        <SideNav counts={{ approvals }} />
        <div className="border-t border-white/10 px-2 py-2">
          <NavLink to={OVERVIEW.to} className={({ isActive }) => cx('focus-ring flex items-center gap-3 rounded-app-sm px-3 py-2 text-xs font-medium', isActive ? 'bg-brand-soft text-brand-fg' : 'text-brand-fg/70 hover:text-brand-fg')}>
            <MapIcon className="h-4 w-4" aria-hidden="true" /> {OVERVIEW.label}
          </NavLink>
          <NavLink to={SUPPORT.to} className={({ isActive }) => cx('focus-ring flex items-center gap-3 rounded-app-sm px-3 py-2 text-xs font-medium', isActive ? 'bg-brand-soft text-brand-fg' : 'text-brand-fg/70 hover:text-brand-fg')}>
            <SUPPORT.icon className="h-4 w-4" aria-hidden="true" /> {SUPPORT.label}
          </NavLink>
          <p className="px-3 pt-1 text-[11px] text-brand-fg/60">Um sistema LORLER</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TrialBanner />
        <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-line bg-surface/95 px-3 py-2 backdrop-blur sm:gap-2 sm:px-5">
          <Link to="/" className="md:hidden" aria-label="CIFREN, ir para o início"><Logo compact /></Link>
          <div className="min-w-0 flex-1"><OrgSwitcher /></div>
          <CompanyFilter className="hidden sm:block" />
          {canSend && <button type="button" className="btn-outline hidden md:inline-flex" onClick={() => setCapture(true)}><Send className="h-4 w-4" aria-hidden="true" /> Enviar documento</button>}
          <HelpLink />
          <NotificationBell />
          <UserMenu />
        </header>
        <div className="border-b border-line bg-surface px-3 py-2 sm:hidden"><CompanyFilter className="[&_select]:max-w-none" /></div>

        <main id="conteudo" ref={mainRef} tabIndex={-1} className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-4 pb-28 pt-5 outline-none sm:px-6 md:pb-10">
          <Outlet />
        </main>
      </div>

      <nav aria-label="Menu rápido" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface md:hidden">
        <ul className="flex">
          {bottom.map((n) => (
            <li key={n.to} className="flex-1">
              <NavLink to={n.to} end={n.end} className={({ isActive }) => tab(isActive)}>
                <n.icon className="h-5 w-5" aria-hidden="true" /> {n.short}
              </NavLink>
            </li>
          ))}
          {canSend && (
            <li className="flex-1">
              <button type="button" className={tab(false)} onClick={() => setCapture(true)}>
                <span className="-mt-0.5 grid h-7 w-7 place-items-center rounded-full bg-cta text-cta-fg"><Send className="h-4 w-4" aria-hidden="true" /></span> Enviar
              </button>
            </li>
          )}
          <li className="flex-1">
            <NavLink to="/mais" className={({ isActive }) => tab(isActive)}>
              <span className="relative"><MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                {approvals > 0 && <span className="absolute -right-2 -top-1 rounded-full bg-cta px-1 text-[10px] font-bold text-cta-fg">{approvals}</span>}</span> Mais
            </NavLink>
          </li>
        </ul>
      </nav>

      <Modal open={capture} onClose={() => setCapture(false)} title="Enviar documento"
        subtitle="Nota fiscal, boleto, Pix ou comprovante. O CIFREN lê os dados para você.">
        <DocumentCapture compact onCreated={(doc) => { setCapture(false); if (doc?.id) navigate(`/documentos/${doc.id}`); }} />
      </Modal>
    </div>
  );
}
