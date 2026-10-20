import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import { Loading, FeatureDisabledNotice } from './components/ui';
import { Mark } from './components/Brand';
import { firstAllowed } from './lib/nav';
import { P } from './lib/permissions';
import Blocked from './pages/Blocked';
import Login from './pages/Login';
import Signup from './pages/Signup';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Titles = lazy(() => import('./pages/Titles'));
const Cadastros = lazy(() => import('./pages/Cadastros'));
const Companies = lazy(() => import('./pages/Companies'));
const Users = lazy(() => import('./pages/Users'));
const Audit = lazy(() => import('./pages/Audit'));
const Account = lazy(() => import('./pages/Account'));
const More = lazy(() => import('./pages/More'));
const NotFound = lazy(() => import('./pages/NotFound'));

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center" role="status" aria-label="Carregando o CIFREN">
      <Mark className="h-12 w-12 animate-pulse" />
    </div>
  );
}

function RequireAuth({ children }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'blocked') return <Blocked />;
  if (status !== 'ready') return <Navigate to="/entrar" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

function GuestOnly({ children }) {
  const { status } = useAuth();
  if (status === 'loading') return <Splash />;
  if (status === 'ready') return <Navigate to="/" replace />;
  if (status === 'blocked') return <Blocked />;
  return children;
}

/** Libera a tela se tiver alguma das permissões; módulo financeiro desligado mostra aviso amigável. */
function Allow({ perms, module, children }) {
  const { can, moduleOn } = useAuth();
  if (module && !moduleOn(module)) return <FeatureDisabledNotice className="card" />;
  if (perms && !can(...perms)) return <Navigate to={firstAllowed(can)} replace />;
  return children;
}

function Home() {
  const { can } = useAuth();
  if (!can(P.dashboard)) return <Navigate to={firstAllowed(can)} replace />;
  return <Allow module="financeiro"><Dashboard /></Allow>;
}

export default function App() {
  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route path="/entrar" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/criar-conta" element={<GuestOnly><Signup /></GuestOnly>} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route element={<SuspenseOutlet />}>
            <Route index element={<Home />} />
            <Route path="pagar" element={<Allow perms={[P.titlesView]} module="financeiro"><Titles kind="pagar" key="pagar" /></Allow>} />
            <Route path="receber" element={<Allow perms={[P.titlesView]} module="financeiro"><Titles kind="receber" key="receber" /></Allow>} />
            <Route path="cadastros" element={<Allow perms={[P.registryView, P.registryManage, P.accountsManage]}><Cadastros /></Allow>} />
            <Route path="empresas" element={<Allow perms={[P.companiesManage]}><Companies /></Allow>} />
            <Route path="usuarios" element={<Allow perms={[P.usersManage, P.rolesManage]}><Users /></Allow>} />
            <Route path="auditoria" element={<Allow perms={[P.auditView]}><Audit /></Allow>} />
            <Route path="conta" element={<Account />} />
            <Route path="mais" element={<More />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}

// Suspense interno: troca de tela mostra "Carregando" dentro do layout em vez de tela branca.
function SuspenseOutlet() {
  return <Suspense fallback={<Loading />}><Outlet /></Suspense>;
}
