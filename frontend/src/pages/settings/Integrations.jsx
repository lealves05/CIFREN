import { useState } from 'react';
import { Plug, Plus, Copy, Check, Trash2, AlertTriangle } from 'lucide-react';
import { useUI } from '../../context/UIContext';
import { api, errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { dateTime } from '../../lib/format';
import Modal from '../../components/Modal';
import { PageHeader, Loading, ErrorState, EmptyState, Input, Select, InlineError, SubmitButton, Badge } from '../../components/ui';
import { Notice, Panel } from '../../components/kit';

const SYSTEMS = { orbi: 'ORBI (salões e barbearias)', torven: 'TORVEN (assistência técnica)', rusten: 'RUSTEN (bares e restaurantes)', apolven: 'APOLVEN', cerebro: 'Cérebro LORLER (só leitura de indicadores)' };

const EXAMPLE = `POST /api/integrations/lorler/v1/movements
Authorization: Bearer ck_torven_...
Content-Type: application/json

{
  "items": [
    {
      "external_id": "OS-1234",
      "kind": "receber",
      "status": "aberto",
      "company_document": "12.345.678/0001-90",
      "description": "OS 1234 — troca de embreagem",
      "amount": 1500.00,
      "due_date": "2026-11-10",
      "competence_date": "2026-10-21",
      "document_number": "1234",
      "counterparty": { "name": "João da Silva", "document": "123.456.789-09" },
      "category_name": "Serviços",
      "paid": { "paid_at": "2026-10-21", "amount": 500.00, "account_name": "Caixa da oficina" }
    }
  ]
}`;

function CopyBtn({ text, label = 'Copiar' }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="btn-outline btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); } catch { /* copiar à mão */ } }}>
      {ok ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}{ok ? 'Copiado' : label}
    </button>
  );
}

export default function Integrations() {
  const { toast, confirm } = useUI();
  const { data, error, loading, reload } = useAsync(() => api.get('/integrations'), []);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ system: 'torven', name: '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const create = async () => {
    setSaving(true); setErr('');
    try {
      const r = await api.post('/integrations', { system: f.system, name: f.name.trim() || SYSTEMS[f.system].split(' (')[0] });
      setCreating(false); setNewKey(r?.key || ''); reload();
    } catch (e) { setErr(errorMessage(e)); } finally { setSaving(false); }
  };
  const revoke = async (k) => {
    if (!(await confirm({ title: 'Revogar esta chave?', message: `O ${SYSTEMS[k.system]?.split(' (')[0] || k.system} para de enviar movimentos com ela na hora.`, confirmText: 'Revogar', danger: true }))) return;
    try { await api.del(`/integrations/${k.id}`); toast('Chave revogada.'); reload(); } catch (e) { toast(errorMessage(e), 'error'); }
  };
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} className="card" />;
  const items = data?.items || [];
  return (
    <div className="space-y-4">
      <PageHeader title="Integrações LORLER" icon={Plug} subtitle="Receba vendas, serviços e despesas do ORBI, TORVEN, RUSTEN e APOLVEN direto no CIFREN."
        actions={<button type="button" className="btn-cta" onClick={() => { setF({ system: 'torven', name: '' }); setErr(''); setCreating(true); }}><Plus className="h-4 w-4" aria-hidden="true" /> Nova chave</button>} />
      {data?.endpoint && (
        <Panel title="Endereço para colar no sistema de origem">
          <div className="flex flex-wrap items-center gap-2"><code className="min-w-0 flex-1 break-all rounded-app-sm bg-muted px-3 py-2 font-mono text-xs">{data.endpoint}</code><CopyBtn text={data.endpoint} /></div>
        </Panel>
      )}
      {!items.length ? (
        <EmptyState className="card" icon={Plug} title="Nenhuma integração">Crie uma chave para cada sistema e cole no sistema de origem junto com o endereço acima.</EmptyState>
      ) : (
        <ul className="card divide-y divide-line">
          {items.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-medium">{k.name}<Badge tone="brand">{(k.system || '').toUpperCase()}</Badge>{!k.active && <Badge tone="danger">Revogada</Badge>}</div>
                <div className="text-xs text-ink-faint"><span className="font-mono">{k.prefix}…</span> · criada {dateTime(k.created_at)} · {k.last_used_at ? `último uso ${dateTime(k.last_used_at)}` : 'nunca usada'}</div>
              </div>
              {k.active !== false && <button type="button" className="btn-ghost btn-sm text-danger" onClick={() => revoke(k)}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Revogar</button>}
            </li>
          ))}
        </ul>
      )}
      <Panel title="Exemplo de envio (para quem programa o sistema de origem)" subtitle="POST no endereço acima + /movements, com o cabeçalho Authorization: Bearer <chave>.">
        <pre className="max-h-80 overflow-auto rounded-app-sm bg-muted p-3 font-mono text-[11px] leading-relaxed">{EXAMPLE}</pre>
        <p className="mt-2 text-xs text-ink-faint">Resposta: {'{ created, updated, cancelled, unchanged, errors, items }'}. Reenviar o mesmo <code>external_id</code> atualiza o lançamento em vez de duplicar; <code>status: "cancelado"</code> cancela; <code>paid</code> já registra a baixa.</p>
      </Panel>
      <Notice>Movimentos recebidos aparecem em Contas a pagar e a receber com a origem (ex.: “veio do TORVEN”). O Cérebro LORLER só lê indicadores, não lança nada.</Notice>

      <Modal open={creating} onClose={() => setCreating(false)} onSubmit={create} size="sm" title="Nova chave de integração"
        footer={<><button type="button" className="btn-outline" onClick={() => setCreating(false)}>Cancelar</button><SubmitButton loading={saving}>Criar chave</SubmitButton></>}>
        <div className="space-y-4">
          <InlineError error={err} />
          <Select label="Sistema" value={f.system} onChange={(e) => setF({ ...f, system: e.target.value })}>{Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Input label="Nome (para você reconhecer)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: TORVEN da oficina" maxLength={60} />
        </div>
      </Modal>
      <Modal open={newKey != null} onClose={() => setNewKey(null)} size="sm" title="Copie a chave agora" role="alertdialog"
        footer={<button type="button" className="btn-primary" onClick={() => setNewKey(null)}>Já copiei</button>}>
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-app-sm border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>Ela aparece <strong>só uma vez</strong>. Se perder, revogue e crie outra.</span></div>
          <code className="block select-all break-all rounded-app-sm bg-muted px-3 py-2 font-mono text-sm">{newKey}</code>
          <CopyBtn text={newKey || ''} label="Copiar chave" />
        </div>
      </Modal>
    </div>
  );
}
