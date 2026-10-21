import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import { Loading, FeatureDisabledNotice } from './components/ui';
import { Mark } from './components/Brand';
import { firstAllowed } from './lib/nav';
import { P, APPROVER_PERMS } from './lib/permissions';
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
const Overview = lazy(() => import('./pages/Overview'));
const Approvals = lazy(() => import('./pages/Approvals'));
const Reconciliation = lazy(() => import('./pages/Reconciliation'));
const Recurring = lazy(() => import('./pages/Recurring'));
const CashFlow = lazy(() => import('./pages/reports/CashFlow'));
const Dre = lazy(() => import('./pages/reports/Dre'));
const CostCenterReport = lazy(() => import('./pages/reports/CostCenterReport'));
const Aging = lazy(() => import('./pages/reports/Aging'));
const ExportPage = lazy(() => import('./pages/reports/Export'));
const Purchases = lazy(() => import('./pages/Purchases'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Documents = lazy(() => import('./pages/Documents'));
const DocumentDetail = lazy(() => import('./pages/DocumentDetail'));
const Assistant = lazy(() => import('./pages/Assistant'));
const AiSettings = lazy(() => import('./pages/settings/AiSettings'));
const NotificationSettings = lazy(() => import('./pages/settings/NotificationSettings'));
const Integrations = lazy(() => import('./pages/settings/Integrations'));
const Security = lazy(() => import('./pages/settings/Security'));
const ApprovalRules = lazy(() => import('./pages/settings/ApprovalRules'));

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
  if (perms && !can(...perms)) return <Navigate to={firstAllowed(can, moduleOn)} replace />;
  return children;
}

function Home() {
  const { can, moduleOn } = useAuth();
  if (!can(P.dashboard)) return <Navigate to={firstAllowed(can, moduleOn)} replace />;
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
            <Route path="aprovacoes" element={<Allow perms={APPROVER_PERMS} module="financeiro"><Approvals /></Allow>} />
            <Route path="conciliacao" element={<Allow perms={[P.reconImport, P.reconMatch]} module="conciliacao_bancaria"><Reconciliation /></Allow>} />
            <Route path="recorrentes" element={<Allow perms={[P.recurringManage, P.forecastView]} module="recorrencias"><Recurring /></Allow>} />
            <Route path="relatorios/fluxo" element={<Allow perms={[P.reportsView, P.forecastView]} module="relatorios"><CashFlow /></Allow>} />
            <Route path="relatorios/dre" element={<Allow perms={[P.dre]} module="relatorios"><Dre /></Allow>} />
            <Route path="relatorios/centros" element={<Allow perms={[P.reportsView]} module="relatorios"><CostCenterReport /></Allow>} />
            <Route path="relatorios/inadimplencia" element={<Allow perms={[P.reportsView]} module="relatorios"><Aging /></Allow>} />
            <Route path="relatorios/exportar" element={<Allow perms={[P.reportsView, P.exportAccounting]} module="relatorios"><ExportPage /></Allow>} />
            <Route path="compras" element={<Allow perms={[P.purchaseRequest, P.purchaseApprove, P.purchaseManage]} module="compras"><Purchases /></Allow>} />
            <Route path="despesas" element={<Allow perms={[P.expenseRequest, P.expenseApprove, P.expensePay]} module="despesas"><Expenses /></Allow>} />
            <Route path="documentos" element={<Allow perms={[P.docsView, P.docsUpload, P.docsManage]} module="documentos_ia"><Documents /></Allow>} />
            <Route path="documentos/:id" element={<Allow perms={[P.docsView, P.docsUpload, P.docsManage]} module="documentos_ia"><DocumentDetail /></Allow>} />
            <Route path="assistente" element={<Allow perms={[P.aiUse, P.dashboard]}><Assistant /></Allow>} />
            <Route path="configuracoes/ia" element={<Allow perms={[P.aiConfig]} module="agentes_ia"><AiSettings /></Allow>} />
            <Route path="configuracoes/notificacoes" element={<NotificationSettings />} />
            <Route path="configuracoes/integracoes" element={<Allow perms={[P.integrations]} module="integracoes_lorler"><Integrations /></Allow>} />
            <Route path="configuracoes/seguranca" element={<Allow perms={[P.security]}><Security /></Allow>} />
            <Route path="configuracoes/alcadas" element={<Allow perms={[P.approvalRules]}><ApprovalRules /></Allow>} />
            <Route path="visao-geral" element={<Overview />} />
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
