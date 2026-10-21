import { useEffect, useState } from 'react';
import { Bell, Mail, MessageCircle, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { api, errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { P } from '../../lib/permissions';
import { PageHeader, Loading, ErrorState, Input, Toggle, InlineError, SubmitButton, Badge, Spinner } from '../../components/ui';
import { Panel } from '../../components/kit';

function MyPrefs() {
  const { toast } = useUI();
  const { data, error, loading, reload, setData } = useAsync(() => api.get('/notifications/preferences'), []);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const set = async (v) => {
    setData({ ...data, email_daily: v });
    try { await api.put('/notifications/preferences', { email_daily: v }); toast(v ? 'Você vai receber o resumo diário por e-mail.' : 'Resumo diário desligado.'); } catch (e) { toast(errorMessage(e), 'error'); reload(); }
  };
  return (
    <>
      <Toggle label="Resumo diário por e-mail" hint="Contas que vencem, aprovações pendentes e avisos do dia." checked={!!data?.email_daily} onChange={set} />
      {data?.email_configured === false && <p className="mt-1 text-xs text-warn">O e-mail da instalação ainda não foi configurado: o resumo só começa a chegar depois disso.</p>}
    </>
  );
}

function EmailSettings() {
  const { toast } = useUI();
  const { data, error, loading, reload } = useAsync(() => api.get('/notifications/email-settings'), []);
  const [f, setF] = useState(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  useEffect(() => { if (data) setF({ host: data.host || '', port: data.port || 587, user: data.user || '', password: '', from: data.from || '', secure: !!data.secure }); }, [data]);
  const configured = !!(data?.configured ?? data?.host);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!f) return null;
  const save = async (e) => {
    e.preventDefault(); setErr('');
    if (!f.host.trim() || !f.from.trim()) { setErr('Informe o servidor (SMTP) e o remetente.'); return; }
    setSaving(true);
    try {
      const body = { host: f.host.trim(), port: Number(f.port) || 587, user: f.user.trim(), from: f.from.trim(), secure: f.secure };
      if (f.password) body.password = f.password;
      await api.put('/notifications/email-settings', body);
      toast('E-mail da instalação salvo.'); setF((x) => ({ ...x, password: '' })); reload();
    } catch (e2) { setErr(errorMessage(e2)); } finally { setSaving(false); }
  };
  const test = async () => {
    setTesting(true);
    try { await api.post('/notifications/email-test'); toast('E-mail de teste enviado. Confira sua caixa de entrada.'); } catch (e) { toast(errorMessage(e), 'error'); } finally { setTesting(false); }
  };
  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <InlineError error={err} />
      <div>{configured ? <Badge tone="positive">Configurado</Badge> : <Badge tone="warn">Ainda não configurado</Badge>}</div>
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <Input label="Servidor SMTP" value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} placeholder="smtp.seuprovedor.com.br" autoComplete="off" />
        <Input label="Porta" type="number" value={f.port} onChange={(e) => setF({ ...f, port: e.target.value })} />
        <Input label="Usuário" value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })} autoComplete="off" />
        <Input label="Senha" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" placeholder={data.password_set ? '•••••• (salva — digite para trocar)' : ''} />
        <Input className="sm:col-span-2" label="Remetente" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} placeholder="CIFREN <avisos@suaempresa.com.br>" />
      </div>
      <Toggle label="Conexão segura (SSL/TLS)" hint="Normalmente ligado na porta 465." checked={f.secure} onChange={(v) => setF({ ...f, secure: v })} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton loading={saving}>Salvar</SubmitButton>
        <button type="button" className="btn-outline" onClick={test} disabled={testing || !configured}>{testing ? <Spinner /> : <Send className="h-4 w-4" aria-hidden="true" />} Enviar teste</button>
      </div>
    </form>
  );
}

export default function NotificationSettings() {
  const { can, role } = useAuth();
  const canConfig = can(P.notifyConfig) && (!role?.key || role.key === 'dono');
  return (
    <div className="space-y-4">
      <PageHeader title="Notificações e e-mail" icon={Bell} subtitle="Como o CIFREN te avisa: no sino do sistema, por e-mail e, em breve, pelo WhatsApp." />
      <Panel title="Meus avisos"><MyPrefs /></Panel>
      {canConfig && <Panel title="E-mail da instalação" subtitle="Servidor que envia os e-mails do CIFREN (só o Dono configura)."><EmailSettings /></Panel>}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4"><Bell className="h-5 w-5 text-accent" aria-hidden="true" /><div className="mt-2 text-sm font-semibold">No sistema</div><Badge tone="positive" className="mt-1">Disponível</Badge></div>
        <div className="card p-4"><Mail className="h-5 w-5 text-accent" aria-hidden="true" /><div className="mt-2 text-sm font-semibold">E-mail</div><Badge tone="positive" className="mt-1">Disponível</Badge></div>
        <div className="card p-4 opacity-80"><MessageCircle className="h-5 w-5 text-ink-faint" aria-hidden="true" /><div className="mt-2 text-sm font-semibold">WhatsApp</div><Badge className="mt-1">Em breve</Badge></div>
      </div>
    </div>
  );
}
