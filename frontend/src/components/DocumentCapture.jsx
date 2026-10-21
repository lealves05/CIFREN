import { useRef, useState } from 'react';
import { Camera, Upload, QrCode, ClipboardPaste, FileUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, errorMessage, notifyCountsChanged } from '../lib/api';
import { checkFile, readAsBase64, mimeOf, DOC_ACCEPT, DOC_KINDS, MAX_DOC_BYTES, fileSize } from '../lib/files';
import { InlineError, Spinner, Select, cx } from './ui';
import QrScanner from './QrScanner';

/**
 * Entrada de documentos: arrastar/soltar, escolher arquivo, foto pela câmera do celular,
 * colar código (linha digitável, Pix copia-e-cola, link da NFC-e) ou ler QR pela câmera.
 * onCreated(doc) recebe o documento criado.
 */
export default function DocumentCapture({ onCreated, compact }) {
  const { companies, companyId } = useAuth();
  const [company, setCompany] = useState(companyId || (companies.length === 1 ? companies[0].id : ''));
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [scan, setScan] = useState(false);
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const needCompany = companies.length > 1;
  const comp = company || companyId || companies[0]?.id || '';

  const guard = () => {
    if (needCompany && !company && !companyId) { setError('Escolha de qual empresa é o documento.'); return false; }
    return true;
  };

  const sendFiles = async (list) => {
    setError('');
    const files = [...(list || [])];
    if (!files.length || !guard()) return;
    for (const f of files) {
      const problem = checkFile(f, { max: MAX_DOC_BYTES, kinds: f.type?.startsWith('image/') ? null : DOC_KINDS });
      if (problem) { setError(problem); return; }
    }
    for (const f of files) {
      setBusy(`Enviando ${f.name}…`);
      try {
        const content_base64 = await readAsBase64(f);
        const doc = await api.post('/documents', { company_id: comp, filename: f.name || 'foto.jpg', mime: mimeOf(f), content_base64, kind: 'auto' });
        notifyCountsChanged();
        onCreated?.(doc);
      } catch (e) { setError(errorMessage(e)); break; }
    }
    setBusy('');
  };

  const sendCode = async (text) => {
    setError('');
    const t = String(text || '').trim();
    if (t.length < 20) { setError('Cole a linha digitável do boleto (47 ou 48 números), o Pix copia-e-cola ou o link do QR da NFC-e.'); return; }
    if (!guard()) return;
    setBusy('Lendo o código…');
    try {
      const doc = await api.post('/documents/code', { company_id: comp, text: t });
      setCode('');
      notifyCountsChanged();
      onCreated?.(doc);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(''); }
  };

  return (
    <div className="space-y-3">
      {needCompany && !companyId && (
        <Select label="Empresa do documento" required value={company} onChange={(e) => setCompany(e.target.value)}>
          <option value="">Escolha…</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      )}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); sendFiles(e.dataTransfer.files); }}
        className={cx('rounded-app border-2 border-dashed p-4 text-center transition', drag ? 'border-accent bg-accent/10' : 'border-line', compact ? 'py-4' : 'py-6')}>
        <FileUp className="mx-auto h-7 w-7 text-accent" aria-hidden="true" />
        <p className="mt-1 text-sm font-medium">Arraste aqui a nota, o boleto ou o comprovante</p>
        <p className="text-xs text-ink-faint">XML, PDF, JPG ou PNG · até {fileSize(MAX_DOC_BYTES)}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn-primary" onClick={() => camRef.current?.click()} disabled={!!busy}><Camera className="h-4 w-4" aria-hidden="true" /> Tirar foto</button>
          <button type="button" className="btn-outline" onClick={() => fileRef.current?.click()} disabled={!!busy}><Upload className="h-4 w-4" aria-hidden="true" /> Escolher arquivo</button>
        </div>
        <input ref={fileRef} type="file" className="sr-only" tabIndex={-1} accept={DOC_ACCEPT} multiple aria-label="Escolher arquivo"
          onChange={(e) => { sendFiles(e.target.files); e.target.value = ''; }} />
        <input ref={camRef} type="file" className="sr-only" tabIndex={-1} accept="image/*" capture="environment" aria-label="Tirar foto"
          onChange={(e) => { sendFiles(e.target.files); e.target.value = ''; }} />
      </div>

      <form className="rounded-app-sm border border-line p-3" onSubmit={(e) => { e.preventDefault(); sendCode(code); }}>
        <label htmlFor="doc-code" className="label">Ou cole um código</label>
        <textarea id="doc-code" className="input font-mono text-xs" rows={2} value={code} onChange={(e) => setCode(e.target.value)}
          placeholder="Linha digitável do boleto, Pix copia-e-cola ou link do QR da NFC-e" />
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="submit" className="btn-outline btn-sm" disabled={!!busy || !code.trim()}><ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" /> Ler código</button>
          <button type="button" className="btn-outline btn-sm" onClick={() => setScan(true)} disabled={!!busy}><QrCode className="h-3.5 w-3.5" aria-hidden="true" /> Ler QR pela câmera</button>
        </div>
      </form>

      {busy && <p role="status" className="flex items-center gap-2 text-sm text-ink-soft"><Spinner /> {busy}</p>}
      <InlineError error={error} />
      <QrScanner open={scan} onClose={() => setScan(false)} onResult={(t) => { setScan(false); setCode(t); sendCode(t); }} />
    </div>
  );
}
