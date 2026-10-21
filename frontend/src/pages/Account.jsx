import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { UserRound, KeyRound, ShieldCheck, ShieldOff, MonitorSmartphone, Copy, Check, AlertTriangle, LogOut } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { passwordOk } from '../lib/masks';
import { dateTime } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import Modal from '../components/Modal';
import PasswordHints from '../components/PasswordHints';
import { PageHeader, Input, InlineError, SubmitButton, Loading, ErrorState, Badge, Spinner } from '../components/ui';

function Section({ icon: Icon, title, desc, children }) {
  return (
    <section className="card p-5" aria-labelledby={`s-${title}`}>
      <h2 id={`s-${title}`} className="flex items-center gap-2 text-base font-semibold"><Icon className="h-5 w-5 text-accent" aria-hidden="true" />{title}</h2>
      {desc && <p className="mt-1 text-sm text-ink-faint">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PasswordForm({ onChanged }) {
  const { toast } = useUI();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (!f.current) { setError('Digite sua senha atual.'); return; }
    if (!passwordOk(f.next)) { setError('A nova senha ainda não segue as regras.'); return; }
    if (f.next !== f.confirm) { setError('A confirmação não é igual à nova senha.'); return; }
    setBusy(true);
    try {
      await api.put('/auth/password', { current_password: f.current, new_password: f.next });
      setF({ current: '', next: '', confirm: '' });
      toast('Senha alterada. As outras sessões foram encerradas.');
      onChanged?.();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="max-w-md space-y-4" noValidate>
      <InlineError error={error} />
      <Input label="Senha atual" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
      <div>
        <Input label="Nova senha" type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} aria-describedby="nova-regras" />
        <PasswordHints value={f.next} id="nova-regras" />
      </div>
      <Input label="Repita a nova senha" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })}
        error={f.confirm && f.confirm !== f.next ? 'As senhas não são iguais.' : ''} />
      <SubmitButton loading={busy}>Trocar senha</SubmitButton>
    </form>
  );
}

function CopyButton({ text, label = 'Copiar' }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="btn-outline btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); } catch { /* seleciona à mão */ } }}>
      {ok ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}{ok ? 'Copiado' : label}
    </button>
  );
}

function MfaSetup({ open, onClose, onDone }) {
  const [step, setStep] = useState('loading'); // loading | scan | codes | error
  const [setup, setSetup] = useState(null);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setStep('loading'); setCode(''); setError(''); setCodes([]); setQr('');
    (async () => {
      try {
        const res = await api.post('/auth/mfa/setup');
        setSetup(res);
        setQr(await QRCode.toDataURL(res.otpauth_url, { margin: 1, width: 220, errorCorrectionLevel: 'M', color: { dark: '#0a1e37', light: '#ffffff' } }));
        setStep('scan');
      } catch (e) { setError(errorMessage(e)); setStep('error'); }
    })();
  }, [open]);
  const confirm = async () => {
    setError('');
    if (code.length !== 6) { setError('Digite os 6 números que aparecem no aplicativo.'); return; }
    setBusy(true);
    try {
      const res = await api.post('/auth/mfa/enable', { code });
      setCodes(res?.recovery_codes || []);
      setStep('codes');
      onDone();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const footer = step === 'scan'
    ? <><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={busy}>Ativar</SubmitButton></>
    : step === 'codes' ? <button type="button" className="btn-primary" onClick={onClose}>Já guardei os códigos</button> : null;
  return (
    <Modal open={open} onClose={onClose} onSubmit={step === 'scan' ? confirm : undefined} title={step === 'codes' ? 'Guarde seus códigos de recuperação' : 'Ativar verificação em duas etapas'} footer={footer}>
      {step === 'loading' && <Loading />}
      {step === 'error' && <InlineError error={error} />}
      {step === 'scan' && setup && (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
            <li>Instale um aplicativo autenticador no celular (Google Authenticator, Microsoft Authenticator ou similar).</li>
            <li>No aplicativo, escolha adicionar conta e aponte a câmera para o código abaixo.</li>
            <li>Digite o código de 6 números que aparecer.</li>
          </ol>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            {qr && <img src={qr} alt="Código QR para configurar o aplicativo autenticador" width="180" height="180" className="rounded-app-sm border border-line bg-white p-1" />}
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-ink-faint">Não consegue ler o QR? Digite esta chave no aplicativo:</p>
              <code className="mt-1 block break-all rounded-app-sm bg-muted px-3 py-2 font-mono text-sm tracking-wider">{setup.secret}</code>
              <div className="mt-2"><CopyButton text={setup.secret} label="Copiar chave" /></div>
            </div>
          </div>
          <InlineError error={error} />
          <Input label="Código de 6 números" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className="max-w-[200px] [&_input]:text-center [&_input]:tracking-[0.3em]" />
        </div>
      )}
      {step === 'codes' && (
        <div className="space-y-4">
          <div role="alert" className="flex items-start gap-2 rounded-app-sm border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Estes códigos aparecem <strong>só agora</strong>. Se perder o celular, cada código permite entrar uma vez. Guarde num lugar seguro (papel ou gerenciador de senhas).</span>
          </div>
          <ul className="grid grid-cols-2 gap-2 rounded-app-sm bg-muted p-3 font-mono text-sm">
            {codes.map((c) => <li key={c} className="select-all text-center">{c}</li>)}
          </ul>
          <CopyButton text={codes.join('\n')} label="Copiar todos" />
        </div>
      )}
    </Modal>
  );
}

function MfaDisable({ open, onClose, onDone }) {
  const { toast } = useUI();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setPassword(''); setError(''); } }, [open]);
  const submit = async () => {
    if (!password) { setError('Digite sua senha.'); return; }
    setBusy(true); setError('');
    try { await api.post('/auth/mfa/disable', { password }); toast('Verificação em duas etapas desativada.'); onDone(); onClose(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} onSubmit={submit} size="sm" title="Desativar verificação em duas etapas"
      subtitle="Sua conta fica menos protegida. Para confirmar, digite sua senha."
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Voltar</button><SubmitButton loading={busy} className="btn-danger">Desativar</SubmitButton></>}>
      <div className="space-y-4">
        <InlineError error={error} />
        <Input label="Sua senha" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus />
      </div>
    </Modal>
  );
}

function deviceName(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} no ${os}` : browser;
}

function Sessions({ version }) {
  const { toast, confirm } = useUI();
  const { data, error, loading, reload } = useAsync(() => api.get('/auth/sessions'), [version]);
  const [busy, setBusy] = useState('');
  const end = async (s) => {
    const ok = await confirm({ title: 'Encerrar esta sessão?', message: `${deviceName(s.user_agent)} precisará entrar de novo.`, confirmText: 'Encerrar' });
    if (!ok) return;
    setBusy(s.id);
    try { await api.del(`/auth/sessions/${s.id}`); toast('Sessão encerrada.'); reload(); } catch (e) { toast(errorMessage(e), 'error'); } finally { setBusy(''); }
  };
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const items = data?.items || [];
  return (
    <ul className="divide-y divide-line rounded-app-sm border border-line">
      {items.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <MonitorSmartphone className="h-5 w-5 text-ink-faint" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium">{deviceName(s.user_agent)}{s.current && <Badge tone="positive">Esta sessão</Badge>}</div>
            <div className="text-xs text-ink-faint">Último uso {dateTime(s.last_seen_at)} · desde {dateTime(s.created_at)}{s.ip && ` · IP ${s.ip}`}</div>
          </div>
          {!s.current && (
            <button type="button" className="btn-ghost btn-sm text-danger" onClick={() => end(s)} disabled={busy === s.id}>
              {busy === s.id ? <Spinner /> : <LogOut className="h-3.5 w-3.5" aria-hidden="true" />} Encerrar
            </button>
          )}
        </li>
      ))}
      {!items.length && <li className="px-4 py-6 text-center text-sm text-ink-faint">Nenhuma sessão ativa.</li>}
    </ul>
  );
}

export default function Account() {
  const { user, role, org, refresh } = useAuth();
  const [setup, setSetup] = useState(false);
  const [disable, setDisable] = useState(false);
  const [version, setVersion] = useState(0);
  const mfa = !!user?.mfa_enabled;
  const [params] = useSearchParams();
  const required = (params.get('exigir2etapas') === '1' || !!org?.require_mfa) && !mfa;
  return (
    <div className="space-y-4">
      <PageHeader title="Minha conta" icon={UserRound} subtitle={`${user?.name || ''} · ${user?.email || ''}`} />
      {required && (
        <div role="alert" className="flex flex-wrap items-start gap-3 rounded-app border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-warn">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <strong className="block">Sua organização exige a verificação em duas etapas.</strong>
            Ative agora para voltar a usar o CIFREN. Leva menos de 2 minutos com um aplicativo autenticador no celular.
          </div>
          <button type="button" className="btn-cta" onClick={() => setSetup(true)}><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Ativar agora</button>
        </div>
      )}
      <div className="card flex flex-wrap gap-x-8 gap-y-2 p-5 text-sm">
        <div><span className="text-ink-faint">Organização: </span><strong>{org?.name}</strong></div>
        <div><span className="text-ink-faint">Seu perfil: </span><strong>{role?.name}</strong></div>
      </div>
      <Section icon={KeyRound} title="Trocar senha" desc="Ao trocar, você continua conectado aqui e as outras sessões são encerradas.">
        <PasswordForm onChanged={() => setVersion((v) => v + 1)} />
      </Section>
      <Section icon={mfa ? ShieldCheck : ShieldOff} title="Verificação em duas etapas"
        desc="Além da senha, pede um código do celular na hora de entrar. Protege sua conta mesmo se alguém descobrir a senha.">
        <div className="flex flex-wrap items-center gap-3">
          {mfa ? <Badge tone="positive">Ativada</Badge> : <Badge tone="warn">Desativada</Badge>}
          {mfa
            ? <button type="button" className="btn-outline text-danger" onClick={() => setDisable(true)}>Desativar</button>
            : <button type="button" className="btn-cta" onClick={() => setSetup(true)}><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Ativar agora</button>}
        </div>
      </Section>
      <Section icon={MonitorSmartphone} title="Sessões ativas" desc="Aparelhos onde sua conta está conectada. Encerre os que você não reconhece.">
        <Sessions version={version} />
      </Section>
      <MfaSetup open={setup} onClose={() => setSetup(false)} onDone={() => refresh().catch(() => {})} />
      <MfaDisable open={disable} onClose={() => setDisable(false)} onDone={() => refresh().catch(() => {})} />
    </div>
  );
}
