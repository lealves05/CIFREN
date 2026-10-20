import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialog } from './useDialog';
import { cx } from './ui';

/** Janela modal acessível. No celular abre como folha de baixo para cima. */
export default function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', onSubmit, role = 'dialog' }) {
  const { ref, uid } = useDialog(open, onClose);
  if (!open) return null;
  const w = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' }[size];
  const Body = onSubmit ? 'form' : 'div';
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4 animate-fade" onMouseDown={onClose}>
      <Body ref={ref} role={role} aria-modal="true" aria-labelledby={`${uid}-t`} aria-describedby={subtitle ? `${uid}-s` : undefined} tabIndex={-1}
        onSubmit={onSubmit ? (e) => { e.preventDefault(); onSubmit(e); } : undefined} noValidate={onSubmit ? true : undefined}
        className={cx('card animate-pop flex max-h-[92vh] w-full flex-col rounded-b-none outline-none sm:rounded-b-app', w)}
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={`${uid}-t`} className="text-base font-semibold">{title}</h2>
            {subtitle && <p id={`${uid}-s`} className="mt-0.5 text-sm text-ink-faint">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="btn-ghost btn-icon -mr-2 -mt-1" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
        <div data-dialog-body className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="pb-safe flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </Body>
    </div>,
    document.body,
  );
}
