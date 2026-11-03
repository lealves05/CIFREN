// Barra do usuário master: mostra em que organização ele está e permite trocar. Toda entrada fica registrada como Suporter2l2.
import { useEffect, useState } from 'react';
import { Building2, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import Modal from './Modal';
import { Input, Loading, EmptyState } from './ui';

export default function EcosystemBar() {
  const { ecosystem, org, logout } = useAuth();
  const { toast } = useUI();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [reason, setReason] = useState('');
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => { api.get(`/auth/ecosystem/companies?q=${encodeURIComponent(term)}`).then(setRows).catch(() => setRows([])); }, 250);
    return () => clearTimeout(t);
  }, [open, term]);
  if (!ecosystem) return null;
  const enter = async (companyId) => {
    setBusy(true);
    try {
      await api.post('/auth/ecosystem/enter', { company_id: companyId, reason: reason.trim() || null });
      window.location.assign('/');
    } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-indigo-300 bg-indigo-50 px-4 py-2 text-xs font-medium text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-100">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span>Usuário master — {ecosystem.internal ? 'você está na organização própria' : <>você está na organização do cliente <b>{org?.name}</b>. O acesso fica registrado como Suporter2l2.</>}</span>
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-indigo-400/70 px-2.5 py-0.5 font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900">Trocar empresa</button>
          <button type="button" onClick={logout} className="rounded-full border border-indigo-400/70 px-2.5 py-0.5 font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900">Sair</button>
        </span>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Trocar empresa" subtitle="Ao entrar na organização de um cliente, o acesso fica registrado no histórico dela como Suporter2l2.">
        <div className="space-y-3">
          {!ecosystem.internal && <button type="button" disabled={busy} onClick={() => enter(null)} className="btn-ghost w-full"><Building2 className="h-4 w-4" /> Voltar à organização própria</button>}
          <Input label="Buscar organização" value={term} onChange={(e) => setTerm(e.target.value)} autoFocus />
          <Input label="Motivo do acesso (opcional)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          {rows === null ? <Loading /> : !rows.length ? <EmptyState title="Nenhuma organização encontrada" /> : (
            <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
              {rows.map((c) => (
                <li key={c.id}><button type="button" disabled={busy} onClick={() => enter(c.id)} className="w-full px-3 py-2 text-left text-sm hover:bg-muted">{c.name}</button></li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </>
  );
}
