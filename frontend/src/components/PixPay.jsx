import { useEffect, useRef, useState } from 'react';
import { Copy, Check, QrCode, ExternalLink, Loader2 } from 'lucide-react';

const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const when = (iso) => { try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

/**
 * Pagamento da assinatura por Pix (QR Code e copia e cola gerados no Mercado Pago).
 * `check` é chamado a cada 5 s enquanto a janela está aberta; quando devolve true, o pagamento foi confirmado.
 */
export default function PixPay({ pix, check, onPaid }) {
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    if (!check || paid) return undefined;
    const t = setInterval(async () => {
      if (busy.current) return;
      busy.current = true;
      try { if (await check()) { setPaid(true); onPaid?.(); } } catch { /* tenta de novo */ } finally { busy.current = false; }
    }, 5000);
    return () => clearInterval(t);
  }, [check, paid, onPaid]);
  if (!pix) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(pix.qr_code); } catch {
      const ta = document.createElement('textarea'); ta.value = pix.qr_code; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  };
  if (paid) {
    return (
      <div className="rounded-app-sm bg-emerald-500/10 p-5 text-center text-emerald-800 dark:text-emerald-200" data-pix-paid>
        <Check className="mx-auto mb-2 h-8 w-8" />
        <p className="font-semibold">Pagamento confirmado!</p>
        <p className="text-sm">Seu acesso foi liberado. Obrigado.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4" data-pix>
      <div className="text-center">
        <p className="text-sm text-ink-soft">Valor</p>
        <p className="text-2xl font-semibold tabular-nums">{brl(pix.amount)}</p>
        {pix.expires_at && <p className="text-xs text-ink-faint">Este Pix vale até {when(pix.expires_at)}</p>}
      </div>
      {pix.qr_base64
        ? <img src={`data:image/png;base64,${pix.qr_base64}`} alt="QR Code do Pix" className="mx-auto h-56 w-56 rounded-app-sm border border-line bg-white p-2" />
        : <div className="mx-auto grid h-40 w-40 place-items-center rounded-app-sm border border-dashed border-line text-ink-faint"><QrCode className="h-10 w-10" /></div>}
      <ol className="space-y-1 text-sm text-ink-soft">
        <li>1. Abra o app do seu banco e escolha <b>Pix</b>.</li>
        <li>2. Leia o QR Code com a câmera, ou escolha <b>Pix copia e cola</b> e cole o código abaixo.</li>
        <li>3. Confira o valor e confirme. O acesso é liberado sozinho em instantes.</li>
      </ol>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-soft" htmlFor="pix-code">Pix copia e cola</label>
        <div className="flex gap-2">
          <input id="pix-code" readOnly value={pix.qr_code} className="input min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.target.select()} />
          <button type="button" className="btn-primary shrink-0" onClick={copy}>{copied ? <><Check className="h-4 w-4" /> Copiado</> : <><Copy className="h-4 w-4" /> Copiar</>}</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-faint">
        <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Aguardando o pagamento…</span>
        {pix.ticket_url && /^https:\/\//.test(pix.ticket_url) && <a className="inline-flex items-center gap-1 text-primary hover:underline" href={pix.ticket_url} target="_blank" rel="noreferrer noopener">Abrir no Mercado Pago <ExternalLink className="h-3 w-3" /></a>}
      </div>
    </div>
  );
}

/** Escolha da forma de pagamento na contratação. */
export function MethodPicker({ methods, value, onChange }) {
  if (!methods || methods.length < 2) return null;
  const opt = (v, title, text) => (
    <label key={v} className={`flex cursor-pointer gap-3 rounded-app-sm border p-3 ${value === v ? 'border-primary bg-primary/5' : 'border-line'}`}>
      <input type="radio" name="pay-method" className="mt-1 accent-[rgb(var(--primary))]" checked={value === v} onChange={() => onChange(v)} />
      <span><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-ink-faint">{text}</span></span>
    </label>
  );
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Forma de pagamento">
      {methods.includes('PIX') && opt('PIX', 'Pix', 'QR Code ou copia e cola. A cada vencimento chega um Pix novo, e o acesso é renovado assim que você paga.')}
      {methods.includes('CARD') && opt('CARD', 'Cartão de crédito', 'Cobrança automática todo mês no cartão, na página segura do Mercado Pago.')}
    </div>
  );
}
