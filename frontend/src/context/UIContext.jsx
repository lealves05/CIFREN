import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import Modal from '../components/Modal';
import { Textarea, cx } from '../components/ui';

const UICtx = createContext(null);

/**
 * Avisos rápidos (toasts) e confirmações:
 *  - toast('Salvo!') / toast('Erro', 'error')
 *  - await confirm({ title, message, confirmText, danger }) → true/false
 *  - await askReason({ title, message, label, confirmText }) → texto ou null
 */
export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const resolver = useRef(null);

  const toast = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 7000 : 4000);
  }, []);

  const open = useCallback((cfg) => new Promise((resolve) => {
    resolver.current = resolve;
    setReason('');
    setReasonError('');
    setDialog(cfg);
  }), []);

  const confirm = useCallback((cfg) => open({ ...cfg, kind: 'confirm' }), [open]);
  const askReason = useCallback((cfg) => open({ ...cfg, kind: 'reason' }), [open]);

  const finish = (value) => {
    resolver.current?.(value);
    resolver.current = null;
    setDialog(null);
  };
  const cancel = () => finish(dialog?.kind === 'reason' ? null : false);
  const accept = () => {
    if (dialog?.kind === 'reason') {
      if (reason.trim().length < 3) { setReasonError('Escreva o motivo (pelo menos 3 letras).'); return; }
      finish(reason.trim());
    } else finish(true);
  };

  const value = useMemo(() => ({ toast, confirm, askReason }), [toast, confirm, askReason]);

  return (
    <UICtx.Provider value={value}>
      {children}
      <Modal open={!!dialog} onClose={cancel} title={dialog?.title} size="sm" role="alertdialog" onSubmit={accept}
        footer={(
          <>
            <button type="button" className="btn-outline" onClick={cancel}>{dialog?.cancelText || 'Voltar'}</button>
            <button type="submit" className={dialog?.danger ? 'btn-danger' : 'btn-primary'}>{dialog?.confirmText || 'Confirmar'}</button>
          </>
        )}>
        {dialog?.message && <p className="text-sm text-ink-soft">{dialog.message}</p>}
        {dialog?.kind === 'reason' && (
          <Textarea className="mt-3" label={dialog.label || 'Motivo'} required value={reason} error={reasonError} data-autofocus
            onChange={(e) => { setReason(e.target.value); setReasonError(''); }} rows={3} maxLength={500} />
        )}
      </Modal>
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end">
        {toasts.map((t) => (
          <div key={t.id} role={t.type === 'error' ? 'alert' : 'status'}
            className={cx('pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-app-sm border px-3.5 py-2.5 text-sm shadow-lg animate-pop',
              t.type === 'error' ? 'border-danger/30 bg-danger-soft text-danger' : 'border-line bg-surface text-ink')}>
            {t.type === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" aria-hidden="true" />}
            <span className="flex-1">{t.message}</span>
            <button type="button" className="focus-ring -mr-1 rounded p-0.5 opacity-70 hover:opacity-100" aria-label="Fechar aviso"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
    </UICtx.Provider>
  );
}

export const useUI = () => useContext(UICtx);
