import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import Modal from './Modal';
import { Loading, InlineError, cx } from './ui';
import { api, qs, errorMessage } from '../lib/api';
import { money, date } from '../lib/format';
import { useAuth } from '../context/AuthContext';

/** Busca uma conta a pagar/receber para ligar a algo (linha do extrato, comprovante). */
export default function TitlePicker({ open, onClose, onPick, kind = 'pagar', status = 'abertos', title = 'Escolher conta', hint }) {
  const { companyId } = useAuth();
  const [k, setK] = useState(kind);
  const [q, setQ] = useState('');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setK(kind); setQ(''); } }, [open, kind]);
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(async () => {
      setItems(null); setError('');
      try { setItems((await api.get(`/titles${qs({ kind: k, status, q: q.trim(), company_id: companyId, limit: 30 })}`))?.items || []); } catch (e) { setError(errorMessage(e)); setItems([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [open, k, q, status, companyId]);
  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={hint}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto" aria-label="Tipo de conta" value={k} onChange={(e) => setK(e.target.value)}>
            <option value="pagar">A pagar</option><option value="receber">A receber</option>
          </select>
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
            <input type="search" className="input pl-9" placeholder="Descrição, fornecedor ou nº" aria-label="Buscar conta" value={q} onChange={(e) => setQ(e.target.value)} data-autofocus />
          </div>
        </div>
        <InlineError error={error} />
        {!items ? <Loading /> : !items.length ? <p className="py-6 text-center text-sm text-ink-faint">Nenhuma conta em aberto encontrada.</p> : (
          <ul className="divide-y divide-line rounded-app-sm border border-line">
            {items.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => onPick(t)} className={cx('focus-ring flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted')}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{t.description}</span>
                    <span className="block truncate text-xs text-ink-faint">Vence {date(t.due_date)}{t.counterparty?.name && ` · ${t.counterparty.name}`}</span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums">{money(t.open_amount ?? t.amount)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
