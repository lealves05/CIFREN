import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import AuthShell from '../components/AuthShell';
import { Input, InlineError, SubmitButton } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState(null);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const goIn = async () => {
    await refresh();
    const from = location.state?.from;
    navigate(from && !from.startsWith('/entrar') ? from : '/', { replace: true });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) { setError('Informe seu e-mail e sua senha.'); return; }
    setBusy(true);
    try {
      const res = await api.post('/auth/login', { email: email.trim(), password });
      if (res?.mfa_required) { setMfaToken(res.mfa_token); setCode(''); }
      else await goIn();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  const submitMfa = async (e) => {
    e.preventDefault();
    setError('');
    const clean = useRecovery ? code.trim() : code.replace(/\D/g, '');
    if (!useRecovery && clean.length !== 6) { setError('O código tem 6 números.'); return; }
    if (useRecovery && clean.length < 6) { setError('Digite o código de recuperação completo.'); return; }
    setBusy(true);
    try {
      await api.post('/auth/mfa', { mfa_token: mfaToken, code: clean });
      await goIn();
    } catch (err) {
      if (err.status === 401 && /expir/i.test(err.message)) setMfaToken(null);
      setError(errorMessage(err));
    } finally { setBusy(false); }
  };

  if (mfaToken) {
    return (
      <AuthShell title="Confirme que é você" subtitle={useRecovery ? 'Digite um dos códigos de recuperação que você guardou.' : 'Abra o aplicativo autenticador no celular e digite o código de 6 números.'}>
        <form onSubmit={submitMfa} className="space-y-4" noValidate>
          <InlineError error={error} />
          {useRecovery ? (
            <Input label="Código de recuperação" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" autoFocus placeholder="xxxx-xxxx" required />
          ) : (
            <Input label="Código de 6 números" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="000000" className="[&_input]:text-center [&_input]:text-lg [&_input]:tracking-[0.4em]" required />
          )}
          <SubmitButton loading={busy} className="btn-primary w-full"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Confirmar e entrar</SubmitButton>
          <button type="button" className="btn-ghost w-full" onClick={() => { setUseRecovery((v) => !v); setCode(''); setError(''); }}>
            {useRecovery ? 'Usar o código do aplicativo' : 'Perdi o celular: usar código de recuperação'}
          </button>
          <button type="button" className="btn-ghost w-full" onClick={() => { setMfaToken(null); setError(''); }}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Entrar" subtitle="Acesse a gestão financeira da sua empresa."
      footer={<>Ainda não tem conta? <Link to="/criar-conta" className="font-semibold text-positive underline-offset-2 hover:underline">Criar conta grátis</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <InlineError error={error} />
        <Input label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
        <Input label="Senha" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <SubmitButton loading={busy} className="btn-primary w-full">Entrar</SubmitButton>
      </form>
    </AuthShell>
  );
}
