import { useNavigate } from 'react-router-dom';
import { Lock, LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Logo } from '../components/Brand';

/** Página inteira mostrada quando a assinatura está suspensa (402 TENANT_BLOCKED). */
export default function Blocked() {
  const { logout, refresh, org } = useAuth();
  const navigate = useNavigate();
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="flex justify-center"><Logo /></div>
        <div className="mx-auto mt-8 grid h-14 w-14 place-items-center rounded-full bg-warn-soft text-warn"><Lock className="h-7 w-7" aria-hidden="true" /></div>
        <h1 className="mt-4 text-xl font-semibold">Acesso suspenso</h1>
        <p className="mt-2 text-sm text-ink-soft">
          A assinatura {org?.name ? <>de <strong>{org.name}</strong> </> : ''}está suspensa no momento. Seus dados continuam guardados com segurança.
        </p>
        <p className="mt-2 text-sm text-ink-soft">Para voltar a usar, regularize a assinatura com o suporte LORLER. Depois é só tocar em “Verificar de novo”.</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button type="button" className="btn-primary" onClick={() => refresh().catch(() => {})}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Verificar de novo</button>
          <button type="button" className="btn-outline" onClick={async () => { await logout(); navigate('/entrar', { replace: true }); }}><LogOut className="h-4 w-4" aria-hidden="true" /> Sair</button>
        </div>
      </div>
    </main>
  );
}
