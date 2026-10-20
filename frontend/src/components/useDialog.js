import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const stack = [];
let seq = 0;

/**
 * Comportamento comum de janelas (modal e gaveta): foco preso dentro, Esc fecha,
 * foco devolvido ao elemento de origem e rolagem da página travada.
 */
export function useDialog(open, onClose) {
  const ref = useRef(null);
  const idRef = useRef(null);
  if (idRef.current == null) { seq += 1; idRef.current = `dlg-${seq}`; }
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const uid = idRef.current;
    const prev = document.activeElement;
    stack.push(uid);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const el = ref.current;
    requestAnimationFrame(() => {
      if (!el || el.contains(document.activeElement)) return;
      const auto = el.querySelector('[autofocus], [data-autofocus]');
      const body = el.querySelector('[data-dialog-body]');
      const first = auto || body?.querySelector(FOCUSABLE) || el.querySelector(FOCUSABLE);
      (first || el).focus({ preventScroll: true });
    });
    const onKey = (e) => {
      if (stack[stack.length - 1] !== uid) return;
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current?.(); return; }
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = stack.lastIndexOf(uid);
      if (i >= 0) stack.splice(i, 1);
      if (!stack.length) document.body.style.overflow = prevOverflow;
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, [open]);

  return { ref, uid: idRef.current };
}
