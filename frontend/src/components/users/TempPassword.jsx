import { useState } from 'react';
import { Copy, Check, AlertTriangle } from 'lucide-react';

/** Caixa com senha temporária para copiar (mostrada uma única vez). */
export default function TempPassword({ password, email }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(password); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* sem área de transferência: o usuário seleciona à mão */ }
  };
  return (
    <div className="space-y-3">
      <div role="alert" className="flex items-start gap-2 rounded-app-sm border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Esta senha aparece <strong>só agora</strong>. Copie e envie para a pessoa por um canal seguro. No primeiro acesso ela vai criar a própria senha.</span>
      </div>
      {email && <p className="text-sm text-ink-soft">E-mail de acesso: <strong className="text-ink">{email}</strong></p>}
      <div className="flex items-stretch gap-2">
        <output aria-label="Senha temporária" className="input flex select-all items-center font-mono text-base tracking-wider">{password}</output>
        <button type="button" className="btn-primary" onClick={copy}>{copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}{copied ? 'Copiado' : 'Copiar'}</button>
      </div>
      <span className="sr-only" aria-live="polite">{copied ? 'Senha copiada' : ''}</span>
    </div>
  );
}
