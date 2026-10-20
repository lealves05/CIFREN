import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import PasswordHints from '../components/PasswordHints';
import { Input, InlineError, SubmitButton, Loading } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { maskCnpj, cnpjHint, onlyDigits, passwordOk } from '../lib/masks';
import { useAuth } from '../context/AuthContext';

export default function Signup() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(null);
  const [f, setF] = useState({ name: '', email: '', password: '', company_name: '', document: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: k === 'document' ? maskCnpj(e.target.value) : e.target.value }));

  useEffect(() => {
    api.get('/auth/state').then((r) => setOpen(r?.signup_open !== false)).catch(() => setOpen(true));
  }, []);

  const docHint = cnpjHint(f.document);
  const submit = async (e) => {
    e.preventDefault();
    setTouched(true); setError('');
    if (!f.name.trim() || !f.email.trim() || !f.company_name.trim()) { setError('Preencha seu nome, e-mail e o nome da empresa.'); return; }
    if (!passwordOk(f.password)) { setError('A senha ainda não segue as regras abaixo dela.'); return; }
    if (docHint) { setError(docHint); return; }
    setBusy(true);
    try {
      await api.post('/auth/signup', {
        name: f.name.trim(), email: f.email.trim(), password: f.password, company_name: f.company_name.trim(),
        document: onlyDigits(f.document) ? f.document : undefined,
      });
      await refresh();
      navigate('/', { replace: true });
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  if (open === null) return <AuthShell title="Criar conta"><Loading /></AuthShell>;
  if (!open) {
    return (
      <AuthShell title="Cadastro fechado" subtitle="No momento não estamos abrindo novas contas por aqui."
        footer={<Link to="/entrar" className="font-semibold text-positive hover:underline">Voltar para entrar</Link>}>
        <p className="text-sm text-ink-soft">Se você foi convidado por alguém, peça a essa pessoa o seu acesso.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Criar conta" subtitle="Leva 1 minuto. Você começa com um período de teste grátis."
      footer={<>Já tem conta? <Link to="/entrar" className="font-semibold text-positive underline-offset-2 hover:underline">Entrar</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <InlineError error={error} />
        <Input label="Seu nome" autoComplete="name" value={f.name} onChange={set('name')} required autoFocus
          error={touched && !f.name.trim() ? 'Informe seu nome.' : ''} />
        <Input label="E-mail" type="email" autoComplete="email" value={f.email} onChange={set('email')} required
          error={touched && !f.email.trim() ? 'Informe seu e-mail.' : ''} />
        <div>
          <Input label="Senha" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} required aria-describedby="senha-regras" />
          <PasswordHints value={f.password} id="senha-regras" />
        </div>
        <Input label="Nome da empresa" autoComplete="organization" value={f.company_name} onChange={set('company_name')} required
          error={touched && !f.company_name.trim() ? 'Informe o nome da empresa.' : ''} />
        <Input label="CNPJ (opcional)" inputMode="numeric" value={f.document} onChange={set('document')} placeholder="00.000.000/0000-00"
          error={docHint && onlyDigits(f.document).length === 14 ? docHint : ''} hint="Pode deixar em branco e preencher depois." />
        <SubmitButton loading={busy} className="btn-cta w-full">Criar minha conta</SubmitButton>
      </form>
    </AuthShell>
  );
}
