import { useCallback, useEffect, useState } from 'react';
import { CreditCard, QrCode, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import PixPay, { MethodPicker } from '../components/PixPay';
import { PageHeader, Loading, ErrorState, Badge } from '../components/ui';

const STATUS = { TRIAL: ['Em teste', 'brand'], ACTIVE: ['Ativa', 'positive'], PAST_DUE: ['Pagamento pendente', 'warn'], PAYMENT_PENDING: ['Aguardando pagamento', 'warn'],
  SUSPENDED: ['Suspensa', 'danger'], CANCELED: ['Cancelada', 'neutral'], EXPIRED: ['Vencida', 'danger'] };
const PAY = { PENDING: 'Pendente', CONFIRMED: 'Paga', OVERDUE: 'Vencida', REFUNDED: 'Estornada', CHARGEBACK: 'Contestada', CANCELED: 'Cancelada', FAILED: 'Não aprovada' };
const date = (d) => (d ? new Date(String(d).length === 10 ? `${d}T12:00:00` : d).toLocaleDateString('pt-BR') : '—');
const price = (p, cycle) => Number(cycle === 'ANNUAL' ? p?.annual_price : p?.monthly_price) || 0;
const defaultMethod = (d) => (d?.methods?.includes('PIX') ? 'PIX' : d?.methods?.[0]);
const openCheckout = (url) => { if (url && /^https:\/\//.test(url)) window.location.assign(url); };

/** Conteúdo da assinatura (usado na página e na tela de acesso suspenso). */
export function SubscriptionPanel({ compact = false }) {
  const { refresh } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(null);
  const [pixOpen, setPixOpen] = useState(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => api.get('/billing').then((d) => { setData(d); setErr(null); }).catch(setErr), []);
  useEffect(() => { load(); }, [load]);
  const after = async () => { await load(); await refresh?.().catch(() => {}); };
  const run = async (fn) => { setBusy(true); setMsg(''); try { return await fn(); } catch (e) { setMsg(e.message); return null; } finally { setBusy(false); } };
  if (err) return <ErrorState error={err} onRetry={load} />;
  if (!data) return <Loading />;
  if (!data.hub) return <p className="text-sm text-ink-soft">A assinatura desta instalação não é cobrada pela central LORLER.</p>;
  const a = data.access || {};
  const sub = data.subscription;
  const active = sub && ['ACTIVE', 'PAST_DUE'].includes(sub.status);
  const plans = data.plans || [];
  const [label, tone] = STATUS[a.status] || [a.status || '—', 'neutral'];
  const checkout = async () => {
    const r = await run(() => api.post('/billing/checkout', { plan_id: pick.plan, cycle: pick.cycle, method: pick.method || undefined }));
    if (!r) return;
    setPick(null);
    if (r.pix) { setPixOpen(r.pix); load(); } else openCheckout(r.checkout_url);
  };
  const renew = async () => {
    const r = await run(() => api.post('/billing/renew', { method: data.methods?.includes('PIX') && (sub?.pay_method === 'PIX' || !data.methods.includes('CARD')) ? 'PIX' : undefined }));
    if (r?.pix) { setPixOpen(r.pix); load(); } else if (r) openCheckout(r.checkout_url);
  };
  const pixPaid = async () => {
    const d = await api.get('/billing');
    return !d.pix && d.access && !d.access.blocked && ['ACTIVE', 'TRIAL'].includes(d.access.status)
      && (d.payments || []).some((p) => p.status === 'CONFIRMED' && p.paid_at && Date.now() - new Date(p.paid_at).getTime() < 3600000);
  };
  return (
    <div className="space-y-4" data-subscription>
      {msg && <div role="alert" className="rounded-app-sm bg-danger-soft p-3 text-sm text-danger">{msg}</div>}
      <div className={compact ? '' : 'grid gap-4 lg:grid-cols-3'}>
        <div className={compact ? 'space-y-2 text-sm' : 'card p-5 text-sm lg:col-span-2'}>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <div><dt className="text-xs text-ink-faint">Situação</dt><dd className="mt-0.5"><Badge tone={tone}>{label}</Badge></dd></div>
            <div><dt className="text-xs text-ink-faint">Plano</dt><dd className="mt-0.5 font-medium">{a.plan?.name || sub?.plan_name || '—'}</dd></div>
            <div><dt className="text-xs text-ink-faint">Válida até</dt><dd className="mt-0.5 font-medium">{date(a.valid_until)}</dd></div>
            <div><dt className="text-xs text-ink-faint">Forma de pagamento</dt><dd className="mt-0.5 font-medium">{sub?.pay_method === 'PIX' ? 'Pix' : sub?.card_last4 ? `Cartão •••• ${sub.card_last4}` : '—'}</dd></div>
          </dl>
          {(a.notices || []).map((n, i) => <p key={i} className="mt-3 rounded-app-sm bg-warn-soft p-3 text-warn">{n.text}</p>)}
        </div>
        <div className={compact ? 'mt-4 flex flex-col gap-2' : 'card flex flex-col gap-2 p-5'}>
          {data.pix && <button type="button" className="btn-primary" onClick={() => setPixOpen(data.pix)}><QrCode className="h-4 w-4" /> Pagar com Pix ({money(data.pix.amount)})</button>}
          {!data.pix && data.pending_payment?.invoice_url && <a className="btn-primary" href={data.pending_payment.invoice_url} target="_blank" rel="noreferrer noopener"><CreditCard className="h-4 w-4" /> Pagar cobrança pendente</a>}
          {!active && !data.pix && data.gateway_configured && plans.length > 0 && (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => setPick({ plan: a.plan?.id || plans[0].id, cycle: a.cycle || 'MONTHLY', method: defaultMethod(data) })}><ShieldCheck className="h-4 w-4" /> Contratar plano</button>
          )}
          {active && sub?.cycle === 'ANNUAL' && <button type="button" className="btn-outline" disabled={busy} onClick={renew}><RefreshCw className="h-4 w-4" /> Renovar plano anual</button>}
          {active && !sub.cancel_at_period_end && !compact && (
            <button type="button" className="btn-ghost text-danger" disabled={busy} onClick={async () => { if (window.confirm('Cancelar a assinatura? Você usa até o fim do período pago. Nenhum dado é apagado.')) { await run(() => api.post('/billing/cancel', { confirm: true })); after(); } }}>
              <XCircle className="h-4 w-4" /> Cancelar assinatura</button>
          )}
          <button type="button" className="btn-ghost" onClick={after}><RefreshCw className="h-4 w-4" /> Atualizar</button>
        </div>
      </div>
      {!compact && (data.payments || []).length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-ink-faint"><th className="px-4 py-2">Vencimento</th><th className="px-4 py-2">Valor</th><th className="px-4 py-2">Situação</th><th className="px-4 py-2">Pago em</th><th /></tr></thead>
            <tbody>{data.payments.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0"><td className="px-4 py-2">{date(p.due_date)}</td><td className="px-4 py-2 tabular-nums">{money(p.amount)}</td><td className="px-4 py-2">{PAY[p.status] || p.status}</td><td className="px-4 py-2">{date(p.paid_at)}</td>
                <td className="px-4 py-2 text-right">{data.pix?.payment_id === p.id && <button type="button" className="btn-ghost" onClick={() => setPixOpen(data.pix)}>Pagar com Pix</button>}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Modal open={!!pick} onClose={() => setPick(null)} title="Contratar plano" subtitle={pick?.method === 'PIX' ? 'O QR Code do Pix aparece em seguida, aqui mesmo.' : 'Você será levado à página segura de pagamento.'}
        footer={<><button type="button" className="btn-ghost" onClick={() => setPick(null)}>Voltar</button>
          <button type="button" className="btn-primary" disabled={busy || !pick?.plan || !price(plans.find((p) => p.id === pick?.plan), pick?.cycle)} onClick={checkout}>{pick?.method === 'PIX' ? 'Gerar o Pix' : 'Ir para o pagamento'}</button></>}>
        {pick && (
          <div className="space-y-4">
            <div className="inline-flex rounded-app-sm border border-line p-1" role="tablist" aria-label="Ciclo">
              {['MONTHLY', 'ANNUAL'].map((c) => <button key={c} type="button" role="tab" aria-selected={pick.cycle === c} className={`rounded-app-sm px-3 py-1.5 text-sm ${pick.cycle === c ? 'bg-primary text-primary-fg' : ''}`} onClick={() => setPick({ ...pick, cycle: c })}>{c === 'ANNUAL' ? 'Anual' : 'Mensal'}</button>)}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {plans.filter((p) => price(p, pick.cycle) > 0).map((p) => (
                <label key={p.id} className={`flex cursor-pointer flex-col rounded-app-sm border p-3 ${pick.plan === p.id ? 'border-primary bg-primary/5' : 'border-line'}`}>
                  <span className="flex items-center gap-2"><input type="radio" name="plano" checked={pick.plan === p.id} onChange={() => setPick({ ...pick, plan: p.id })} /><b>{p.name}</b></span>
                  <span className="mt-1 text-sm tabular-nums">{money(price(p, pick.cycle))}{pick.cycle === 'ANNUAL' ? '/ano' : '/mês'}</span>
                  {p.description && <span className="mt-1 text-xs text-ink-faint">{p.description}</span>}
                </label>
              ))}
            </div>
            <MethodPicker methods={data.methods} value={pick.method} onChange={(method) => setPick({ ...pick, method })} />
          </div>
        )}
      </Modal>
      <Modal open={!!pixOpen} onClose={() => { setPixOpen(null); after(); }} title="Pagar com Pix" subtitle="Pague no app do seu banco. O acesso é liberado sozinho.">
        {pixOpen && <PixPay pix={pixOpen} check={pixPaid} onPaid={after} />}
      </Modal>
    </div>
  );
}

export default function Subscription() {
  return (
    <div>
      <PageHeader title="Assinatura" subtitle="Plano, cobranças e pagamento do CIFREN (Pix ou cartão)." />
      <SubscriptionPanel />
    </div>
  );
}
