import { useEffect, useState } from 'react';
import { Plus, Pencil, Archive, Landmark, Wallet, CreditCard, PiggyBank } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { money, date, today, ACCOUNT_TYPES, accountTypeLabel, round2 } from '../../lib/format';
import Modal from '../Modal';
import MoneyInput from '../MoneyInput';
import { Input, Select, InlineError, SubmitButton, Loading, ErrorState, EmptyState, cx } from '../ui';
import { useArchive } from './useArchive';

const ICON = { banco: Landmark, caixa: Wallet, cartao: CreditCard, aplicacao: PiggyBank };

function Form({ open, onClose, item, onSaved }) {
  const { companies, companyId } = useAuth();
  const { toast } = useUI();
  const [f, setF] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError(''); setTouched(false);
    setF({
      company_id: item?.company_id || companyId || companies[0]?.id || '', name: item?.name || '', type: item?.type || 'banco',
      bank_name: item?.bank_name || '', agency: item?.agency || '', number: item?.number || '',
      opening_balance: item?.opening_balance ?? null, opening_date: item?.opening_date || today(),
    });
  }, [open, item]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v && v.target ? v.target.value : v }));
  const isBank = f.type === 'banco' || f.type === 'aplicacao';
  const submit = async () => {
    setTouched(true); setError('');
    if (!f.name?.trim() || !f.company_id) return;
    setSaving(true);
    try {
      const body = {
        company_id: f.company_id, name: f.name.trim(), type: f.type,
        bank_name: isBank ? f.bank_name.trim() || null : null, agency: isBank ? f.agency.trim() || null : null, number: isBank ? f.number.trim() || null : null,
        opening_balance: round2(f.opening_balance || 0), opening_date: f.opening_date || null,
      };
      if (item) await api.put(`/accounts/${item.id}`, body); else await api.post('/accounts', body);
      toast(item ? 'Conta atualizada.' : 'Conta cadastrada.');
      onSaved(); onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} onSubmit={submit} title={item ? 'Editar conta' : 'Nova conta bancária ou caixa'}
      subtitle="É daqui que sai o dinheiro dos pagamentos e onde entra o dos recebimentos."
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving}>Salvar</SubmitButton></>}>
      <div className="space-y-4">
        <InlineError error={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Tipo" value={f.type} onChange={set('type')}>{ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>
          {companies.length > 1 ? (
            <Select label="Empresa" required value={f.company_id} onChange={set('company_id')} error={touched && !f.company_id ? 'Escolha a empresa.' : ''}>
              <option value="">Escolha…</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          ) : <div className="hidden sm:block" />}
          <Input className="sm:col-span-2" label="Nome da conta" required value={f.name} onChange={set('name')} placeholder={f.type === 'caixa' ? 'Ex.: Caixa da loja' : 'Ex.: Banco do Brasil – PJ'}
            error={touched && !f.name?.trim() ? 'Dê um nome para a conta.' : ''} maxLength={100} data-autofocus />
          {isBank && (
            <>
              <Input className="sm:col-span-2" label="Banco" value={f.bank_name} onChange={set('bank_name')} placeholder="Ex.: Itaú, Nubank, Sicoob" />
              <Input label="Agência" value={f.agency} onChange={set('agency')} inputMode="numeric" />
              <Input label="Número da conta" value={f.number} onChange={set('number')} />
            </>
          )}
          <MoneyInput label="Saldo inicial" value={f.opening_balance} onChange={set('opening_balance')} hint="Quanto tinha na conta na data abaixo." />
          <Input label="Data do saldo inicial" type="date" value={f.opening_date} onChange={set('opening_date')} />
        </div>
      </div>
    </Modal>
  );
}

export default function Accounts({ canManage }) {
  const { companies, companyId } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api.get('/accounts'), []);
  const [edit, setEdit] = useState(undefined);
  const archive = useArchive();
  const items = (data?.items || []).filter((a) => a.active !== false && (!companyId || a.company_id === companyId));
  const total = items.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const companyName = (id) => companies.find((c) => c.id === id)?.name;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-faint">{items.length ? <>Saldo somado: <strong className={cx('tabular-nums', total < 0 ? 'text-danger' : 'text-ink')}>{money(total)}</strong></> : 'Contas do banco, caixa da loja, cartões e aplicações.'}</p>
        {canManage && items.length > 0 && <button type="button" className="btn-primary" onClick={() => setEdit(null)}><Plus className="h-4 w-4" aria-hidden="true" /> Nova conta</button>}
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !items.length ? (
        <EmptyState icon={Landmark} title="Nenhuma conta cadastrada" action={canManage && <button type="button" className="btn-cta" onClick={() => setEdit(null)}><Plus className="h-4 w-4" aria-hidden="true" /> Cadastrar conta</button>}>
          Cadastre a conta do banco ou o caixa com o saldo de hoje. É o primeiro passo para ver seu dinheiro no painel.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((a) => {
            const Icon = ICON[a.type] || Landmark;
            return (
              <li key={a.id} className="rounded-app-sm border border-line p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/15 text-positive"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{a.name}</div>
                    <div className="truncate text-xs text-ink-faint">{[accountTypeLabel(a.type), a.bank_name, a.agency && `ag. ${a.agency}`, a.number && `c/c ${a.number}`].filter(Boolean).join(' · ')}</div>
                    {companies.length > 1 && <div className="truncate text-xs text-ink-faint">{companyName(a.company_id)}</div>}
                  </div>
                </div>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div>
                    <div className="text-xs text-ink-faint">Saldo</div>
                    <div className={cx('text-lg font-semibold tabular-nums', Number(a.balance) < 0 && 'text-danger')}>{money(a.balance)}</div>
                    {a.opening_date && <div className="text-[11px] text-ink-faint">Saldo inicial {money(a.opening_balance)} em {date(a.opening_date)}</div>}
                  </div>
                  {canManage && (
                    <div className="flex">
                      <button type="button" className="btn-ghost btn-icon" aria-label={`Editar ${a.name}`} onClick={() => setEdit(a)}><Pencil className="h-4 w-4" /></button>
                      <button type="button" className="btn-ghost btn-icon text-danger" aria-label={`Arquivar ${a.name}`} onClick={() => archive(`/accounts/${a.id}`, a.name, 'conta', reload)}><Archive className="h-4 w-4" /></button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Form open={edit !== undefined} item={edit} onClose={() => setEdit(undefined)} onSaved={reload} />
    </div>
  );
}
