import { useEffect, useId, useRef, useState } from 'react';
import { Search, Plus, X, Check } from 'lucide-react';
import { api, qs, errorMessage } from '../lib/api';
import { maskDocument, showMasked } from '../lib/masks';
import { useAuth } from '../context/AuthContext';
import { P } from '../lib/permissions';
import { cx, Spinner } from './ui';

/**
 * Escolha de fornecedor/cliente com busca e cadastro rápido.
 * kind: 'fornecedor' (contas a pagar) ou 'cliente' (contas a receber).
 * value: { id, name } | null
 */
export default function CounterpartyPicker({ kind, value, onChange, label }) {
  const { can } = useAuth();
  const canCreate = can(P.registryManage);
  const id = useId();
  const listId = `${id}-list`;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(-1);
  const [creating, setCreating] = useState(false);
  const [newDoc, setNewDoc] = useState('');
  const [saving, setSaving] = useState(false);
  const wrap = useRef(null);
  const noun = kind === 'cliente' ? 'cliente' : 'fornecedor';

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const res = await api.get(`/counterparties${qs({ q, kind, active: 'true' })}`);
        setItems((res?.items || []).slice(0, 20));
        setActive(-1);
      } catch (e) { setError(errorMessage(e)); setItems([]); } finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, kind, open]);

  useEffect(() => {
    const onDoc = (e) => { if (wrap.current && !wrap.current.contains(e.target)) { setOpen(false); setCreating(false); } };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (it) => { onChange({ id: it.id, name: it.name }); setOpen(false); setQ(''); setCreating(false); };

  const create = async () => {
    const name = q.trim();
    if (name.length < 2) { setError('Digite o nome com pelo menos 2 letras.'); return; }
    setSaving(true); setError('');
    try {
      const res = await api.post('/counterparties', { kind, name, document: newDoc || undefined });
      const newId = res?.id ?? res?.item?.id;
      if (!newId) throw new Error('Cadastro feito, mas não recebemos o identificador. Busque pelo nome.');
      pick({ id: newId, name: res?.name || res?.item?.name || name });
      setNewDoc('');
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };

  const onKey = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[active]) pick(items[active]); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
  };

  return (
    <div ref={wrap} className="relative">
      <label htmlFor={id} className="label">{label || (kind === 'cliente' ? 'Cliente' : 'Fornecedor')}</label>
      {value ? (
        <div className="input flex items-center justify-between gap-2">
          <span className="truncate">{value.name}</span>
          <button type="button" className="focus-ring rounded p-1 text-ink-faint hover:text-ink" aria-label={`Trocar ${noun}`}
            onClick={() => { onChange(null); setOpen(true); }}><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
          <input id={id} className="input pl-9" placeholder={`Buscar ${noun} pelo nome`} value={q} autoComplete="off"
            role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
            onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onKeyDown={onKey} />
        </div>
      )}
      {open && !value && (
        <div className="card absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto p-1 animate-pop">
          {loading && <div className="flex items-center gap-2 px-3 py-2 text-sm text-ink-faint"><Spinner /> Buscando…</div>}
          {!loading && (
            <ul id={listId} role="listbox" aria-label={`Lista de ${noun}es`}>
              {items.map((it, i) => (
                <li key={it.id} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}
                  onMouseDown={(e) => { e.preventDefault(); pick(it); }}
                  className={cx('cursor-pointer rounded-app-sm px-3 py-2 text-sm', i === active ? 'bg-muted' : 'hover:bg-muted')}>
                  <div className="font-medium">{it.name}</div>
                  {it.document && <div className="text-xs text-ink-faint">{showMasked(it.document, maskDocument)}</div>}
                </li>
              ))}
              {!items.length && <li className="px-3 py-2 text-sm text-ink-faint">{q ? 'Nenhum resultado.' : `Nenhum ${noun} cadastrado ainda.`}</li>}
            </ul>
          )}
          {error && <p role="alert" className="px-3 py-1 text-xs text-danger">{error}</p>}
          {canCreate && !creating && (
            <button type="button" className="btn-ghost mt-1 w-full justify-start text-positive" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Cadastrar novo {noun}{q ? `: “${q}”` : ''}
            </button>
          )}
          {canCreate && creating && (
            <div className="mt-1 space-y-2 border-t border-line p-2">
              <p className="text-xs font-medium text-ink-soft">Novo {noun}</p>
              <input className="input" placeholder="Nome" aria-label="Nome" value={q} onChange={(e) => setQ(e.target.value)} />
              <input className="input" placeholder="CPF ou CNPJ (opcional)" aria-label="CPF ou CNPJ (opcional)" inputMode="numeric"
                value={newDoc} onChange={(e) => setNewDoc(maskDocument(e.target.value))} />
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-ghost btn-sm" onClick={() => setCreating(false)}>Voltar</button>
                <button type="button" className="btn-primary btn-sm" onClick={create} disabled={saving}>
                  {saving ? <Spinner /> : <Check className="h-4 w-4" aria-hidden="true" />} Cadastrar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
