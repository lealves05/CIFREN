import { useEffect, useRef, useState } from 'react';
import { Plug, Copy, Check, Link2, Unplug, ExternalLink, Settings2, RefreshCw, ChevronDown } from 'lucide-react';
import { useUI } from '../../context/UIContext';
import { api, errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { loadRefs } from '../../lib/refData';
import { money } from '../../lib/format';
import Modal from '../../components/Modal';
import { PageHeader, Loading, ErrorState, Input, Select, Toggle, InlineError, SubmitButton, Badge, cx } from '../../components/ui';
import { Notice } from '../../components/kit';

const ABOUT = {
  rusten: 'Bares e restaurantes',
  torven: 'Assistência técnica e oficinas',
  orbi: 'Salões e barbearias',
  apolven: 'Corretoras de seguros',
  cerebro: 'Central de decisões',
};
const ago = (d) => {
  if (!d) return 'ainda não conversou';
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  return m < 1 ? 'agora há pouco' : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `em ${new Date(d).toLocaleDateString('pt-BR')}`;
};

function CopyBox({ text }) {
  const [ok, setOk] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); } catch { /* sem área de transferência */ } };
  return (
    <div className="flex gap-2">
      <input readOnly value={text} className="input font-mono text-xs" aria-label="Código de conexão" onFocus={(e) => e.target.select()} />
      <button type="button" className="btn-outline shrink-0" onClick={copy}>{ok ? <Check className="h-4 w-4 text-positive" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />} {ok ? 'Copiado' : 'Copiar'}</button>
    </div>
  );
}

/** Janela de conexão: um clique abre o outro sistema já conectando; ou copia o código. */
function ConnectModal({ sys, onClose, onDone }) {
  const [res, setRes] = useState(null); const [err, setErr] = useState('');
  const asked = useRef(null);
  useEffect(() => {
    if (!sys || asked.current === sys) return; // um código por abertura (o modo de desenvolvimento roda o efeito duas vezes)
    asked.current = sys;
    setRes(null); setErr('');
    api.post('/integrations/connect', { system: sys.system }).then(setRes).catch((e) => setErr(errorMessage(e)));
  }, [sys]);
  if (!sys) return null;
  const isRusten = sys.system === 'rusten';
  return (
    <Modal open={!!sys} onClose={() => { onClose(); onDone?.(); }} title={`Conectar ao ${sys.name}`} size="lg"
      subtitle={sys.connected ? 'Gerar um novo código encerra a conexão anterior.' : 'Leva menos de 1 minuto.'}
      footer={<button type="button" className="btn-primary" onClick={() => { onClose(); onDone?.(); }}>Pronto</button>}>
      {err ? <InlineError error={err} /> : !res ? <Loading /> : (
        <ol className="space-y-5">
          <li>
            <div className="mb-2 font-semibold">1. Abra o {sys.name} já conectando</div>
            {isRusten ? (
              <>
                <a className="btn-cta" href={res.connect_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" aria-hidden="true" /> Abrir o {sys.name} e conectar</a>
                <p className="mt-2 text-sm text-ink-soft">Entre no {sys.name} (se pedir) e confirme em <strong>Conectar</strong>. Pronto.</p>
              </>
            ) : <p className="text-sm text-ink-soft">O {sys.name} ainda não tem a tela de conexão com 1 clique (chega em breve). Por enquanto, entregue o código abaixo para quem for configurar a integração.</p>}
          </li>
          <li>
            <div className="mb-2 font-semibold">{isRusten ? '2. Ou copie o código e cole no RUSTEN (Configurações › CIFREN)' : '2. Código de conexão'}</div>
            <CopyBox text={res.code} />
            <p className="mt-2 text-xs text-ink-faint">O código aparece só agora. Ele já leva o endereço e a chave: ninguém precisa digitar nada. Se perder, gere outro aqui.</p>
          </li>
        </ol>
      )}
    </Modal>
  );
}

function RustenOptions({ sys, onSaved }) {
  const { toast } = useUI();
  const [f, setF] = useState(sys.settings); const [accounts, setAccounts] = useState([]); const [saving, setSaving] = useState(false);
  useEffect(() => { loadRefs(['accounts']).then((r) => setAccounts(r.accounts.filter((a) => a.active !== false))); }, []);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v && v.target ? v.target.value : v }));
  const save = async () => {
    setSaving(true);
    try { await api.put(`/integrations/${sys.key_id}/settings`, { member_fees: f.member_fees, fiado_due_days: Number(f.fiado_due_days) || 0, account_id: f.account_id || null }); toast('Opções salvas.'); onSaved?.(); }
    catch (e) { toast(errorMessage(e), 'error'); } finally { setSaving(false); }
  };
  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      <Toggle label="Associados vindos do RUSTEN pagam mensalidade" checked={f.member_fees} onChange={set('member_fees')}
        hint="Ligado: entram em Associados e a mensalidade da tabela é cobrada. Desligado: só o fiado e o crédito." />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Prazo do fiado (dias)" type="number" min={0} max={365} value={f.fiado_due_days} onChange={set('fiado_due_days')} hint="Vencimento da conta a receber criada para cada fiado." />
        <Select label="Dinheiro recebido no RUSTEN entra em" value={f.account_id || ''} onChange={set('account_id')}>
          <option value="">RUSTEN (recebimentos) — criada sozinha</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </div>
      <div className="flex justify-end"><button type="button" className="btn-primary btn-sm" onClick={save} disabled={saving}>Salvar opções</button></div>
    </div>
  );
}

function SystemCard({ sys, onConnect, onDisconnect, onChanged }) {
  const [open, setOpen] = useState(false);
  const s = sys.stats;
  return (
    <li className={cx('card p-4', sys.connected && 'border-accent/40')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><span className="text-base font-semibold">{sys.name}</span>
            <Badge tone={sys.connected ? 'positive' : 'neutral'}>{sys.connected ? 'Conectado' : 'Não conectado'}</Badge></div>
          <div className="text-xs text-ink-faint">{ABOUT[sys.system]}{sys.system !== 'rusten' && ' · conexão com 1 clique em breve'}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {sys.connected ? (
            <>
              {sys.system === 'rusten' && <button type="button" className="btn-outline btn-sm" onClick={() => setOpen((x) => !x)} aria-expanded={open}><Settings2 className="h-3.5 w-3.5" aria-hidden="true" /> Opções <ChevronDown className={cx('h-3.5 w-3.5 transition', open && 'rotate-180')} aria-hidden="true" /></button>}
              <button type="button" className="btn-outline btn-sm" onClick={() => onConnect(sys)}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Novo código</button>
              <button type="button" className="btn-ghost btn-sm text-danger" onClick={() => onDisconnect(sys)}><Unplug className="h-3.5 w-3.5" aria-hidden="true" /> Desconectar</button>
            </>
          ) : sys.system === 'rusten'
            ? <button type="button" className="btn-primary btn-sm" onClick={() => onConnect(sys)}><Link2 className="h-3.5 w-3.5" aria-hidden="true" /> Conectar</button>
            : <button type="button" className="btn-outline btn-sm" onClick={() => onConnect(sys)}><Link2 className="h-3.5 w-3.5" aria-hidden="true" /> Gerar código</button>}
        </div>
      </div>
      <ul className="mt-3 space-y-1 text-sm text-ink-soft">{sys.features.map((x) => <li key={x}>• {x}</li>)}</ul>
      {sys.connected && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-faint">
          <span>Última conversa: {ago(sys.last_used_at)}</span>
          {s && <><span>{s.members} associado(s) do RUSTEN</span><span>{s.entries} lançamento(s) de conta</span><span>Fiado em aberto: {money(s.fiado_open)}</span></>}
        </div>
      )}
      {open && sys.system === 'rusten' && <RustenOptions sys={sys} onSaved={onChanged} />}
    </li>
  );
}

export default function Integrations() {
  const { confirm, toast } = useUI();
  const { data, error, loading, reload } = useAsync(() => api.get('/integrations'), []);
  const [connecting, setConnecting] = useState(null);
  const disconnect = async (sys) => {
    const ok = await confirm({ title: `Desconectar o ${sys.name}?`, danger: true, confirmText: 'Desconectar',
      message: `O ${sys.name} para de enviar dados para o CIFREN. O que já veio continua aqui. Para voltar, é só conectar de novo.` });
    if (!ok) return;
    try { await api.del(`/integrations/${sys.key_id}`); toast(`${sys.name} desconectado.`); reload(); } catch (e) { toast(errorMessage(e), 'error'); }
  };
  return (
    <div>
      <PageHeader title="Integrações LORLER" icon={Plug} subtitle="Ligue os sistemas LORLER ao CIFREN com um clique." />
      <Notice className="mb-4" title="Como funciona">
        Clique em <strong>Conectar</strong> no sistema, depois em <strong>Abrir e conectar</strong> e confirme lá. Os dados passam a vir sozinhos.
        No RUSTEN, marque o cliente como <strong>Associado</strong>: ele aparece em Associados e mensalidades com o fiado e o crédito dele.
      </Notice>
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} className="card" /> : (
        <ul className="grid items-start gap-3 lg:grid-cols-2">
          {data.systems.map((s) => <SystemCard key={s.system} sys={s} onConnect={setConnecting} onDisconnect={disconnect} onChanged={reload} />)}
        </ul>
      )}
      <details className="mt-6 text-sm">
        <summary className="cursor-pointer text-ink-soft">Para desenvolvedores: endereço da API de integração</summary>
        <p className="mt-2 break-all font-mono text-xs text-ink-faint">{data?.endpoint}</p>
        <p className="mt-1 text-xs text-ink-faint">Contrato: movimentos (POST /movements), indicadores (GET /indicators) e, para o RUSTEN, /hello, /members, /account e /payments.</p>
      </details>
      <ConnectModal sys={connecting} onClose={() => setConnecting(null)} onDone={reload} />
    </div>
  );
}
