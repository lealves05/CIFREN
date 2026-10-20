import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialog } from './useDialog';

/** Gaveta lateral (detalhes). Ocupa a tela toda no celular. */
export default function Drawer({ open, onClose, title, subtitle, children, footer }) {
  const { ref, uid } = useDialog(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50 animate-fade" onMouseDown={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${uid}-t`} tabIndex={-1}
        className="animate-slide flex h-full w-full max-w-lg flex-col border-l border-line bg-surface shadow-2xl outline-none"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={`${uid}-t`} className="truncate text-base font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-ink-faint">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="btn-ghost btn-icon -mr-2 -mt-1" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
        <div data-dialog-body className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="pb-safe flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
