import { useEffect, useState } from 'react';
import { Bot, KeyRound } from 'lucide-react';
import { useUI } from '../../context/UIContext';
import { api, errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { PageHeader, Loading, ErrorState, Input, Select, Toggle, InlineError, SubmitButton, Badge } from '../../components/ui';
import { Notice, Panel } from '../../components/kit';

export default function AiSettings() {
  const { toast } = useUI();
  const { data, error, loading, reload } = useAsync(() => api.get('/ai/settings'), []);
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (data) setF({ enabled: !!data.enabled, model: data.model || '', monthly_limit: data.monthly_limit ?? '', api_key: '' }); }, [data]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} className="card" />;
  if (!f) return null;
  const save = async (e) => {
    e.preventDefault(); setErr('');
    if (f.enabled && !data.key_set && !f.api_key.trim()) { setErr('Para ligar a IA, cole a chave da Anthropic.'); return; }
    setSaving(true);
    try {
      const body = { enabled: f.enabled, model: f.model || undefined, monthly_limit: f.monthly_limit === '' ? undefined : Number(f.monthly_limit) };
      if (f.api_key.trim()) body.api_key = f.api_key.trim();
      await api.put('/ai/settings', body);
      toast('Configuração da IA salva.');
      setF((x) => ({ ...x, api_key: '' }));
      reload();
    } catch (e2) { setErr(errorMessage(e2)); } finally { setSaving(false); }
  };
  const used = Number(data.used_this_month) || 0;
  const limit = Number(data.monthly_limit) || 0;
  return (
    <div>
      <PageHeader title="Inteligência artificial" icon={Bot} subtitle="Liga os agentes de IA (Documentos, Financeiro, Conciliação e Insights) usando o Claude, da Anthropic." />
      <form onSubmit={save} className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]" noValidate>
        <Panel title="Configuração">
          <div className="space-y-4">
            <InlineError error={err} />
            <Toggle label="IA ligada" hint="Desligada, o CIFREN continua funcionando: só a leitura automática por IA e o chat ficam parados." checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} />
            <div>
              <Input label="Chave da API Anthropic" type="password" autoComplete="off" value={f.api_key} onChange={(e) => setF({ ...f, api_key: e.target.value })}
                placeholder={data.key_set ? '•••••••• (chave já salva — cole outra para trocar)' : 'sk-ant-…'}
                hint="A chave fica guardada no servidor e nunca volta para a tela. Crie em console.anthropic.com." />
              <div className="mt-1.5">{data.key_set ? <Badge tone="positive"><KeyRound className="h-3 w-3" aria-hidden="true" />Chave salva</Badge> : <Badge tone="warn">Sem chave</Badge>}</div>
            </div>
            <Select label="Modelo" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })}>
              {!(data.models || []).length && <option value="">Padrão</option>}
              {(data.models || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
            <Input label="Limite de usos da IA por mês" type="number" min={0} max={100000} step="1" value={f.monthly_limit} onChange={(e) => setF({ ...f, monthly_limit: e.target.value })}
              hint="Cada pergunta, leitura de documento ou sugestão conta 1 uso. Ao chegar no limite, a IA pausa até o mês seguinte. O custo em dinheiro é cobrado pela Anthropic na sua conta de lá." />
            <SubmitButton loading={saving}>Salvar</SubmitButton>
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel title="Uso neste mês">
            <div className="text-2xl font-semibold tabular-nums">{used.toLocaleString('pt-BR')} {used === 1 ? 'uso' : 'usos'}</div>
            {limit > 0 && (
              <>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} /></div>
                <p className="mt-1 text-xs text-ink-faint">de {limit.toLocaleString('pt-BR')} usos de limite</p>
              </>
            )}
          </Panel>
          <Notice>Os dados enviados à IA são só os necessários para cada pergunta ou documento. Nenhuma senha ou chave é enviada.</Notice>
        </div>
      </form>
    </div>
  );
}
