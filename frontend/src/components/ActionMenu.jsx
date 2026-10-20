import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { cx } from './ui';

/** Menu "⋮" com ações da linha. actions: [{ label, icon, onClick, danger }] */
export default function ActionMenu({ actions, label = 'Mais ações' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const list = actions.filter(Boolean);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); } };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    requestAnimationFrame(() => ref.current?.querySelector('[role="menuitem"]')?.focus());
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  if (!list.length) return null;
  const onKey = (e) => {
    const items = [...ref.current.querySelectorAll('[role="menuitem"]')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
  };
  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" className="btn-ghost btn-icon" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" onKeyDown={onKey} className="card absolute right-0 top-full z-30 mt-1 w-48 p-1 text-left animate-pop">
          {list.map((a) => (
            <button key={a.label} type="button" role="menuitem" onClick={() => { setOpen(false); a.onClick(); }}
              className={cx('focus-ring flex w-full items-center gap-2 rounded-app-sm px-3 py-2 text-sm hover:bg-muted', a.danger && 'text-danger')}>
              {a.icon && <a.icon className="h-4 w-4" aria-hidden="true" />}{a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
