import { useRef, useState } from 'react';
import { Paperclip, Check, X } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { checkFile, readAsBase64, mimeOf, DOC_ACCEPT, MAX_DOC_BYTES } from '../lib/files';
import { Spinner, cx } from './ui';

/**
 * Anexa um comprovante/nota: envia para /api/documents e devolve o documento (id).
 * value: { id, filename } | null
 */
export default function DocUploadButton({ companyId, value, onChange, label = 'Anexar comprovante', className, capture }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = async (file) => {
    setError('');
    const p = checkFile(file, { max: MAX_DOC_BYTES });
    if (p) { setError(p); return; }
    setBusy(true);
    try {
      const doc = await api.post('/documents', { company_id: companyId, filename: file.name || 'comprovante.jpg', mime: mimeOf(file), content_base64: await readAsBase64(file), kind: 'auto' });
      onChange({ id: doc.id, filename: doc.filename || file.name });
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className={cx('min-w-0', className)}>
      {value ? (
        <span className="inline-flex max-w-full items-center gap-1 rounded-app-sm bg-accent/10 px-2 py-1 text-xs text-positive">
          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{value.filename || 'Comprovante anexado'}</span>
          <button type="button" className="focus-ring rounded p-0.5 text-ink-faint hover:text-danger" aria-label="Tirar comprovante" onClick={() => onChange(null)}><X className="h-3 w-3" /></button>
        </span>
      ) : (
        <button type="button" className="btn-ghost btn-sm" onClick={() => ref.current?.click()} disabled={busy || !companyId}>
          {busy ? <Spinner /> : <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />} {label}
        </button>
      )}
      <input ref={ref} type="file" className="sr-only" tabIndex={-1} accept={capture ? 'image/*,application/pdf' : DOC_ACCEPT} aria-label={label}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick(f); }} />
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
