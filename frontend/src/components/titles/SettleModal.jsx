import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import Modal from '../Modal';
import MoneyInput from '../MoneyInput';
import { Input, Select, Textarea, InlineError, Loading, SubmitButton, EmptyState, cx } from '../ui';
import { api, errorMessage } from '../../lib/api';
import { loadRefs } from '../../lib/refData';
import { KIND } from '../../lib/titles';
import { money, round2, today, date, METHODS, accountTypeLabel } from '../../lib/format';
import { useUI } from '../../context/UIContext';
import { Landmark } from 'lucide-react';

/** Dar baixa (registrar pagamento ou recebimento), total ou parcial. */
export default function SettleModal({ open, onClose, title, onDone }) {
  const { toast } = useUI();
  const kind = title?.kind || 'pagar';
  const k = KIND[kind];
  const [accounts, setAccounts] = useState(null);
  const [f, setF] = useState({});
  const [extras, setExtras] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const [credit, setCredit] = useState(null); // crédito do associado no RUSTEN (só contas a receber de associado ligado)

  useEffect(() => {
    if (!open || !title) return;
    setError(''); setTouched(false); setExtras(false); setAccounts(null); setCredit(null);
    if (title.kind === 'receber') api.get(`/titles/${title.id}`).then((t) => setCredit(t?.rusten_credit ?? null)).catch(() => {});
    setF({ account_id: '', paid_at: today(), amount: Number(title.open_amount) || 0, interest: null, fine: null, discount: null, method: 'pix', notes: '' });
    loadRefs(['accounts']).then(({ accounts: list }) => {
      const companyId = title.company?.id || title.company_id;
      const act = list.filter((a) => a.active !== false);
      const same = act.filter((a) => !companyId || !a.company_id || a.company_id === companyId);
      const usable = same.length ? same : act;
      setAccounts(usable);
      if (usable.length === 1) setF((x) => ({ ...x, account_id: usable[0].id }));
    });
  }, [open, title]);

  const set = (key) => (v) => setF((x) => ({ ...x, [key]: v && v.target ? v.target.value : v }));
  const open_ = Number(title?.open_amount) || 0;
  const useCredit = f.method === 'credito_rusten';
  const total = useCredit ? round2(f.amount || 0) : round2((f.amount || 0) + (f.interest || 0) + (f.fine || 0) - (f.discount || 0));
  const methods = credit > 0 ? [...METHODS, { value: 'credito_rusten', label: `Crédito do RUSTEN (saldo ${money(credit)})` }] : METHODS;
  const errs = {
    account_id: !useCredit && !f.account_id ? 'Escolha de qual conta saiu (ou entrou) o dinheiro.' : '',
    paid_at: !f.paid_at ? 'Informe a data.' : '',
    amount: !(f.amount > 0) ? 'Informe o valor.' : f.amount > open_ + 0.004 ? `O valor passa do que está em aberto (${money(open_)}).`
      : useCredit && f.amount > credit + 0.004 ? `O crédito no RUSTEN é de ${money(credit)}. Pague o resto de outra forma, numa segunda baixa.` : '',
  };
  const chooseMethod = (e) => {
    const v = e.target.value;
    // com o crédito, já sugere o que dá para pagar com ele
    setF((x) => ({ ...x, method: v, ...(v === 'credito_rusten' ? { amount: round2(Math.min(open_, credit)), interest: null, fine: null, discount: null } : {}) }));
    if (v === 'credito_rusten') setExtras(false);
  };
  const show = (key) => (touched ? errs[key] : '');

  const submit = async () => {
    setTouched(true); setError('');
    if (Object.values(errs).some(Boolean)) return;
    setSaving(true);
    try {
      const res = await api.post(`/titles/${title.id}/settle`, {
        account_id: useCredit ? undefined : f.account_id, paid_at: f.paid_at, amount: round2(f.amount),
        interest: f.interest ? round2(f.interest) : undefined, fine: f.fine ? round2(f.fine) : undefined,
        discount: f.discount ? round2(f.discount) : undefined, method: f.method || undefined, notes: f.notes.trim() || undefined,
      });
      toast(useCredit ? (res?.status === 'parcial' ? 'Pago em parte com o crédito do RUSTEN. O restante continua em aberto.' : 'Pago com o crédito do RUSTEN. O saldo dele lá diminui na próxima sincronização.')
        : res?.status === 'parcial' ? 'Baixa parcial registrada. O restante continua em aberto.' : `${k.settleVerb} registrado.`);
      onDone?.();
      onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} onSubmit={submit} title={`Dar baixa: ${kind === 'pagar' ? 'registrar pagamento' : 'registrar recebimento'}`}
      subtitle={title ? `${title.description} · vence ${date(title.due_date)} · em aberto ${money(open_)}` : undefined}
      footer={accounts && accounts.length > 0 && (
        <><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving}>Confirmar baixa</SubmitButton></>
      )}>
      {!accounts ? <Loading /> : !accounts.length ? (
        <EmptyState icon={Landmark} title="Nenhuma conta cadastrada"
          action={<Link to="/cadastros?aba=contas" className="btn-primary" onClick={onClose}>Cadastrar conta</Link>}>
          Para dar baixa, primeiro cadastre a conta do banco ou o caixa de onde o dinheiro sai ou entra.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <InlineError error={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            {useCredit ? (
              <div className="rounded-app-sm border border-accent/40 bg-accent/10 p-3 text-sm sm:col-span-2" role="note">
                <strong>Pago com o crédito que o associado tem no RUSTEN ({money(credit)}).</strong> Não entra dinheiro no banco agora: ele entrou quando o crédito foi lançado.
                O saldo de crédito dele no RUSTEN diminui sozinho; se precisar desfazer, estorne a baixa e o crédito volta.
              </div>
            ) : (
              <Select className="sm:col-span-2" label={kind === 'pagar' ? 'Pago com a conta' : 'Recebido na conta'} required value={f.account_id} onChange={set('account_id')} error={show('account_id')}>
                <option value="">Escolha…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {accountTypeLabel(a.type)}</option>)}
              </Select>
            )}
            <Input label="Data" type="date" required value={f.paid_at} onChange={set('paid_at')} error={show('paid_at')} max={today(1)} />
            <MoneyInput label="Valor" required value={f.amount} onChange={set('amount')} error={show('amount')}
              hint={f.amount > 0 && f.amount < open_ ? `Baixa parcial: ficam ${money(open_ - f.amount)} em aberto.` : undefined} />
            <Select label="Forma de pagamento" value={f.method} onChange={chooseMethod}
              hint={credit > 0 && !useCredit ? `Este associado tem ${money(credit)} de crédito no RUSTEN.` : undefined}>
              {methods.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </div>

          {!useCredit && <div>
            <button type="button" className="btn-ghost -ml-2" aria-expanded={extras} onClick={() => setExtras((x) => !x)}>
              <ChevronDown className={cx('h-4 w-4 transition', extras && 'rotate-180')} aria-hidden="true" /> Juros, multa ou desconto
            </button>
            {extras && (
              <div className="mt-2 grid gap-4 sm:grid-cols-3">
                <MoneyInput label="Juros" value={f.interest} onChange={set('interest')} />
                <MoneyInput label="Multa" value={f.fine} onChange={set('fine')} />
                <MoneyInput label="Desconto" value={f.discount} onChange={set('discount')} />
              </div>
            )}
          </div>}

          <Textarea label="Observação" value={f.notes} onChange={set('notes')} rows={2} maxLength={500} />

          <div className="flex items-center justify-between rounded-app-sm bg-muted px-4 py-3 text-sm">
            <span className="text-ink-soft">{useCredit ? 'Total pago com o crédito' : kind === 'pagar' ? 'Total que sai da conta' : 'Total que entra na conta'}</span>
            <strong className="text-base tabular-nums">{money(total)}</strong>
          </div>
        </div>
      )}
    </Modal>
  );
}
