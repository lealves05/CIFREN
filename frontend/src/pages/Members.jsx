import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users2, Plus, Search, Pencil, Eye, Mail, MessageCircle, Pause, Play, Square, Trash2, Download, Send, AlarmClock, Settings2, CheckCircle2, ExternalLink, BadgeDollarSign, History,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { api, qs, errorMessage } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { loadRefs } from '../lib/refData';
import { P } from '../lib/permissions';
import { money, date, today } from '../lib/format';
import Modal from '../components/Modal';
import Drawer from '../components/Drawer';
import MoneyInput from '../components/MoneyInput';
import CategorySelect from '../components/CategorySelect';
import ActionMenu from '../components/ActionMenu';
import SettleModal from '../components/titles/SettleModal';
import { PageHeader, Tabs, Loading, ErrorState, EmptyState, Badge, Input, Select, Textarea, Toggle, InlineError, SubmitButton, cx } from '../components/ui';
import { Link } from 'react-router-dom';
import { Notice, Stat, Panel } from '../components/kit';

const PM = { view: 'associados.visualizar', manage: 'associados.gerenciar', config: 'associados.configurar' };
const STATUS = { ativo: ['Ativo', 'positive'], suspenso: ['Suspenso', 'warn'], encerrado: ['Encerrado', 'neutral'] };
const CHANNEL = { email: 'E-mail', whatsapp: 'WhatsApp', whatsapp_link: 'WhatsApp (link)' };
const KIND = { atraso: 'atraso', antes: 'lembrete', manual: 'manual' };
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const monthLabel = (m) => (m ? `${m.slice(5, 7)}/${m.slice(0, 4)}` : '');

function situation(m) {
  if (m.overdue?.count > 0) return { label: `${m.overdue.count} em atraso`, tone: 'danger' };
  if (m.status !== 'ativo') return { label: STATUS[m.status][0], tone: STATUS[m.status][1] };
  return { label: 'Em dia', tone: 'positive' };
}

// ---------------- formulário ----------------
function MemberForm({ open, onClose, item, onSaved, feeInfo, onGoFees }) {
  const { companies, companyId } = useAuth();
  const { toast } = useUI();
  const [f, setF] = useState({});
  const [cats, setCats] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError('');
    loadRefs(['categories']).then((r) => setCats(r.categories));
    setF(item ? {
      name: item.name, document: item.document || '', email: item.email || '', whatsapp: item.whatsapp_display || '', special: item.custom_fee != null, monthly_fee: item.custom_fee, due_day: item.due_day,
      start_month: item.start_month, company_id: item.company?.id, category_id: item.category?.id || null, notify_email: item.notify_email, notify_whatsapp: item.notify_whatsapp,
      notes: item.notes || '', apply_to_open: true,
    } : { name: '', document: '', email: '', whatsapp: '', special: false, monthly_fee: null, due_day: 10, start_month: today().slice(0, 7), company_id: companyId || companies[0]?.id,
      category_id: null, notify_email: true, notify_whatsapp: true, notes: '' });
  }, [open, item]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v && v.target ? v.target.value : v }));
  const past = !item && f.start_month && f.start_month < today().slice(0, 7);
  const submit = async () => {
    setError('');
    if (!f.name?.trim()) return setError('Informe o nome do associado.');
    if (f.special && !(f.monthly_fee > 0)) return setError('Informe o valor especial ou desligue a opção.');
    if (!f.special && !feeInfo?.current && !feeInfo?.items?.length) return setError('Cadastre primeiro o valor da mensalidade na aba "Valores da mensalidade".');
    const body = { name: f.name.trim(), document: f.document.trim() || null, email: f.email.trim() || null, whatsapp: f.whatsapp.trim() || null, monthly_fee: f.special ? f.monthly_fee : null,
      due_day: Number(f.due_day), start_month: f.start_month, company_id: f.company_id, category_id: f.category_id || null, notify_email: f.notify_email, notify_whatsapp: f.notify_whatsapp,
      notes: f.notes.trim() || null };
    setSaving(true);
    try {
      if (item) {
        const r = await api.put(`/members/${item.id}`, { ...body, apply_to_open: f.apply_to_open });
        toast(r.open_updated ? `Associado salvo. ${r.open_updated} mensalidade(s) em aberto ajustada(s) a partir do próximo mês.` : 'Associado salvo.');
      } else {
        const r = await api.post('/members', body);
        toast(`Associado cadastrado. ${r.generated} mensalidade(s) gerada(s) em Contas a receber.`);
      }
      onSaved?.(); onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} size="lg" onSubmit={submit} title={item ? 'Editar associado' : 'Novo associado'}
      subtitle="A mensalidade é lançada sozinha todo mês em Contas a receber."
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving}>{item ? 'Salvar' : 'Cadastrar'}</SubmitButton></>}>
      <div className="space-y-4">
        <InlineError error={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input className="sm:col-span-2" label="Nome" required value={f.name || ''} onChange={set('name')} maxLength={160} data-autofocus />
          <Input label="WhatsApp" value={f.whatsapp || ''} onChange={set('whatsapp')} inputMode="tel" placeholder="(19) 99999-9999" hint="Com DDD. Usado para os avisos de cobrança." />
          <Input label="E-mail" type="email" value={f.email || ''} onChange={set('email')} placeholder="nome@exemplo.com" />
          <Input label="Dia do vencimento" type="number" min={1} max={31} value={f.due_day} onChange={set('due_day')} hint="Dia 29 a 31 vira o último dia nos meses mais curtos." />
          <Input label="Cobrar a partir de" type="month" required value={f.start_month || ''} onChange={set('start_month')}
            hint={past ? 'Os meses passados já entram como mensalidades a receber (e em atraso, se venceram).' : 'Primeiro mês da mensalidade.'} />
          <Input label="CPF (opcional)" value={f.document || ''} onChange={set('document')} maxLength={20} />
          {companies.length > 1 && (
            <Select label="Empresa" value={f.company_id || ''} onChange={set('company_id')}>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
          <CategorySelect categories={cats} type="receita" value={f.category_id} onChange={set('category_id')} hint="Vazio = Mensalidades." />
        </div>
        <fieldset className="rounded-app-sm border border-line p-3">
          <legend className="px-1 text-xs font-medium text-ink-soft">Valor da mensalidade</legend>
          {feeInfo?.current || feeInfo?.items?.length ? (
            <p className="text-sm">Segue a tabela: <strong>{feeInfo.current ? money(feeInfo.current) : '—'}</strong> por mês hoje
              {feeInfo.items?.some((x) => x.future) && <span className="text-ink-faint"> (já tem valor novo marcado para os próximos meses)</span>}.
              <button type="button" className="ml-1 underline" onClick={onGoFees}>Ver valores</button></p>
          ) : (
            <Notice tone="warn" title="Falta o valor da mensalidade">Cadastre o valor na aba <button type="button" className="underline" onClick={onGoFees}>Valores da mensalidade</button>; ele vale para todos os associados.</Notice>
          )}
          <Toggle label="Valor especial para este associado" checked={f.special} onChange={set('special')} hint="Ex.: desconto ou isenção parcial. Se mudar depois, vale a partir do próximo mês." />
          {f.special && <MoneyInput label="Valor especial" value={f.monthly_fee} onChange={set('monthly_fee')} />}
        </fieldset>
        <fieldset className="rounded-app-sm border border-line p-3">
          <legend className="px-1 text-xs font-medium text-ink-soft">Avisos de cobrança para este associado</legend>
          <Toggle label="Avisar por e-mail" checked={f.notify_email} onChange={set('notify_email')} hint={!f.email ? 'Cadastre o e-mail para receber.' : undefined} />
          <Toggle label="Avisar por WhatsApp" checked={f.notify_whatsapp} onChange={set('notify_whatsapp')} hint={!f.whatsapp ? 'Cadastre o WhatsApp para receber.' : undefined} />
        </fieldset>
        {item && <Toggle label="Aplicar o novo dia de vencimento e o nome nas mensalidades em aberto" checked={f.apply_to_open} onChange={set('apply_to_open')} hint="As já pagas não mudam." />}
        <Textarea label="Observações" value={f.notes || ''} onChange={set('notes')} rows={2} maxLength={1000} />
      </div>
    </Modal>
  );
}

// ---------------- cobrar ----------------
function useCharge(onDone) {
  const { toast } = useUI();
  const whatsappLink = async (m) => {
    try {
      const r = await api.post(`/members/${m.id}/whatsapp-link`, {});
      window.open(r.url, '_blank', 'noopener');
      onDone?.();
    } catch (e) { toast(errorMessage(e), 'error'); }
  };
  const send = async (m, channel) => {
    try { await api.post(`/members/${m.id}/remind`, { channel }); toast(channel === 'email' ? 'Cobrança enviada por e-mail.' : 'Cobrança enviada pelo WhatsApp.'); onDone?.(); }
    catch (e) { toast(errorMessage(e), 'error'); }
  };
  return { whatsappLink, send };
}

/** Corrigir o valor de UMA mensalidade já lançada (em aberto e sem pagamento). */
function FeeAmountModal({ fee, onClose, onSaved }) {
  const { toast } = useUI();
  const [v, setV] = useState(null); const [err, setErr] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => { if (fee) { setV(fee.amount); setErr(''); } }, [fee]);
  const save = async () => {
    if (!(v > 0)) return setErr('Informe o valor.');
    setSaving(true);
    try { await api.put(`/titles/${fee.id}`, { amount: v }); toast('Valor da mensalidade corrigido.'); onSaved?.(); onClose(); } catch (e) { setErr(errorMessage(e)); } finally { setSaving(false); }
  };
  return (
    <Modal open={!!fee} onClose={onClose} onSubmit={save} title={fee ? `Mensalidade ${monthLabel(fee.month)}` : ''} subtitle="Só esta mensalidade muda. As outras e a tabela continuam como estão."
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving}>Salvar</SubmitButton></>}>
      <InlineError error={err} />
      <MoneyInput label="Valor" value={v} onChange={setV} data-autofocus />
    </Modal>
  );
}

// ---------------- tabela de valores da mensalidade ----------------
function FeeTable({ onChanged }) {
  const { can } = useAuth();
  const { toast, confirm } = useUI();
  const { data, error, loading, reload } = useAsync(() => api.get('/members/fees'), []);
  const [form, setForm] = useState(null); // { item? }
  const [f, setF] = useState({}); const [err, setErr] = useState(''); const [saving, setSaving] = useState(false);
  const edit = can(PM.manage);
  const first = data && !data.items.length;
  useEffect(() => {
    if (!form) return;
    setErr('');
    setF(form.item ? { amount: form.item.amount, effective_month: form.item.effective_month, notes: form.item.notes || '' }
      : { amount: null, effective_month: first ? today().slice(0, 7) : data.next_month, notes: '' });
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v && v.target ? v.target.value : v }));
  const save = async () => {
    if (!(f.amount > 0)) return setErr('Informe o valor.');
    setSaving(true); setErr('');
    try {
      const body = { amount: f.amount, effective_month: f.effective_month, notes: f.notes.trim() || null };
      const r = form.item ? await api.put(`/members/fees/${form.item.id}`, body) : await api.post('/members/fees', body);
      toast(`${form.item ? 'Valor corrigido' : 'Novo valor salvo'}${r.recalculated ? `: ${r.recalculated} mensalidade(s) em aberto ajustada(s)` : ''}${r.generated ? `; ${r.generated} mensalidade(s) gerada(s)` : ''}.`);
      setForm(null); reload(); onChanged?.();
    } catch (e) { setErr(errorMessage(e)); } finally { setSaving(false); }
  };
  const remove = async (x) => {
    const ok = await confirm({ title: 'Excluir este valor?', danger: true, confirmText: 'Excluir',
      message: `As mensalidades em aberto a partir de ${monthLabel(x.effective_month)} voltam para o valor anterior da tabela. As já pagas não mudam.` });
    if (!ok) return;
    try { const r = await api.del(`/members/fees/${x.id}`); toast(`Valor excluído${r.recalculated ? `: ${r.recalculated} mensalidade(s) em aberto ajustada(s)` : ''}.`); reload(); onChanged?.(); }
    catch (e) { toast(errorMessage(e), 'error'); }
  };
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} className="card" />;
  const rows = [...data.items].reverse(); // cronológico: do mais antigo para o mais novo
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-ink-faint">Mensalidade de hoje (vale para todos sem valor especial)</div>
          <div className="text-2xl font-semibold tabular-nums">{data.current ? money(data.current) : '—'}</div>
        </div>
        {edit && <button type="button" className="btn-primary" onClick={() => setForm({})}><Plus className="h-4 w-4" aria-hidden="true" /> {first ? 'Cadastrar o valor' : 'Novo valor'}</button>}
      </div>
      <Notice title="Como funciona">
        O valor é preenchido uma vez e vale para todos os associados. Quando o valor muda, o novo vale <strong>a partir do próximo mês</strong>: as mensalidades dos meses anteriores continuam com o valor antigo.
        Errou um valor? Corrija na lista: as mensalidades em aberto (sem pagamento) desde aquele mês são recalculadas; as pagas não mudam.
      </Notice>
      {!rows.length ? <EmptyState className="card" icon={BadgeDollarSign} title="Nenhum valor cadastrado">Cadastre o valor da mensalidade para começar a gerar as cobranças.</EmptyState> : (
        <div className="card overflow-x-auto">
          <table className="table-clean">
            <caption className="sr-only">Valores da mensalidade em ordem cronológica</caption>
            <thead><tr><th scope="col">Vale de</th><th scope="col">Até</th><th scope="col" className="text-right">Valor</th><th scope="col">Observação</th><th scope="col">Lançado por</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className={cx(x.current && 'bg-accent/5')}>
                  <td className="whitespace-nowrap font-medium tabular-nums">{monthLabel(x.effective_month)}</td>
                  <td className="whitespace-nowrap tabular-nums text-ink-soft">{x.until_month ? monthLabel(addMonth(x.until_month, -1)) : 'em diante'}</td>
                  <td className="whitespace-nowrap text-right font-semibold tabular-nums">{money(x.amount)}</td>
                  <td className="max-w-[240px] truncate text-sm text-ink-soft">{x.current ? <Badge tone="positive" className="mr-1">Vigente</Badge> : x.future ? <Badge tone="brand" className="mr-1">Próximo</Badge> : null}{x.notes}</td>
                  <td className="text-xs text-ink-faint">{x.created_by_name || '—'}<div>{new Date(x.created_at).toLocaleDateString('pt-BR')}</div></td>
                  <td className="whitespace-nowrap text-right">{edit && <ActionMenu label={`Ações do valor de ${monthLabel(x.effective_month)}`} actions={[
                    { label: 'Corrigir', icon: Pencil, onClick: () => setForm({ item: x }) },
                    data.items.length > 1 && { label: 'Excluir', icon: Trash2, onClick: () => remove(x), danger: true },
                  ]} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} onSubmit={save} title={form?.item ? 'Corrigir valor' : first ? 'Valor da mensalidade' : 'Novo valor da mensalidade'}
        subtitle={form?.item ? 'Use para corrigir um valor lançado errado.' : first ? 'Vale para todos os associados.' : 'O novo valor vale a partir do próximo mês; os meses anteriores não mudam.'}
        footer={<><button type="button" className="btn-outline" onClick={() => setForm(null)}>Cancelar</button><SubmitButton loading={saving}>Salvar</SubmitButton></>}>
        <div className="space-y-4">
          <InlineError error={err} />
          <MoneyInput label="Valor da mensalidade" required value={f.amount} onChange={set('amount')} data-autofocus />
          <Input label="Vale a partir de" type="month" required value={f.effective_month || ''} onChange={set('effective_month')}
            min={form?.item || first ? undefined : data.next_month} hint={form?.item ? 'Mudar o mês recalcula as mensalidades em aberto do período.' : first ? 'Pode ser um mês passado, se os associados já pagam desde antes.' : `A partir de ${monthLabel(data.next_month)} ou depois.`} />
          <Input label="Observação (opcional)" value={f.notes || ''} onChange={set('notes')} maxLength={200} placeholder="Ex.: reajuste aprovado em assembleia" />
        </div>
      </Modal>
    </div>
  );
}
const addMonth = (ym, k) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + k, 1)); return d.toISOString().slice(0, 7); };

// ---------------- detalhes ----------------
function MemberDetails({ id, onClose, onEdit, onChanged }) {
  const { can } = useAuth();
  const { data: m, error, reload } = useAsync(() => (id ? api.get(`/members/${id}`) : null), [id]);
  const [settle, setSettle] = useState(null);
  const [editFee, setEditFee] = useState(null);
  const charge = useCharge(reload);
  const overdue = m?.fees?.filter((f) => f.overdue) || [];
  const footer = m && can(PM.manage) && (
    <>
      {m.whatsapp && <button type="button" className="btn-outline" onClick={() => charge.whatsappLink(m)}><MessageCircle className="h-4 w-4" aria-hidden="true" /> Abrir no WhatsApp</button>}
      {overdue.length > 0 && m.email && <button type="button" className="btn-outline" onClick={() => charge.send(m, 'email')}><Mail className="h-4 w-4" aria-hidden="true" /> Cobrar por e-mail</button>}
      <button type="button" className="btn-primary" onClick={() => onEdit(m)}><Pencil className="h-4 w-4" aria-hidden="true" /> Editar</button>
    </>
  );
  return (
    <Drawer open={!!id} onClose={onClose} title={m?.name || 'Associado'} subtitle={m ? `Nº ${m.number} · ${m.monthly_fee != null ? money(m.monthly_fee) : 'sem valor'}${m.custom_fee != null ? ' (especial)' : ''} todo dia ${m.due_day}` : undefined} footer={footer}>
      {error ? <ErrorState error={error} onRetry={reload} /> : !m ? <Loading /> : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-1"><Badge tone={STATUS[m.status][1]}>{STATUS[m.status][0]}</Badge>
            {overdue.length > 0 && <Badge tone="danger">{overdue.length} mensalidade(s) em atraso · {money(overdue.reduce((a, f) => a + f.open, 0))}</Badge>}</div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-ink-faint">WhatsApp</dt><dd>{m.whatsapp_display || '—'}{m.whatsapp && !m.notify_whatsapp && <span className="text-xs text-ink-faint"> (sem avisos)</span>}</dd></div>
            <div><dt className="text-xs text-ink-faint">E-mail</dt><dd className="break-all">{m.email || '—'}{m.email && !m.notify_email && <span className="text-xs text-ink-faint"> (sem avisos)</span>}</dd></div>
            <div><dt className="text-xs text-ink-faint">Desde</dt><dd>{monthLabel(m.start_month)}{m.end_month && ` até ${monthLabel(m.end_month)}`}</dd></div>
            <div><dt className="text-xs text-ink-faint">Categoria</dt><dd>{m.category?.name || '—'}</dd></div>
          </dl>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Mensalidades</h3>
            {!m.fees.length ? <p className="text-sm text-ink-soft">Nenhuma mensalidade gerada ainda.</p> : (
              <ul className="divide-y divide-line rounded-app-sm border border-line text-sm">
                {m.fees.map((f) => (
                  <li key={f.id} className={cx('flex items-center justify-between gap-2 px-3 py-2', f.status === 'cancelado' && 'opacity-60')}>
                    <div className="min-w-0">
                      <div className="font-medium tabular-nums">{monthLabel(f.month)}</div>
                      <div className={cx('text-xs', f.overdue ? 'font-semibold text-danger' : 'text-ink-faint')}>
                        {f.status === 'pago' ? `Paga em ${date(f.paid_at)}` : f.status === 'cancelado' ? 'Cancelada' : `Vence ${date(f.due_date)}`}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {f.status === 'aberto' && !f.paid && can(P.titlesEdit)
                        ? <button type="button" className="focus-ring rounded tabular-nums underline decoration-dotted underline-offset-4" title="Corrigir o valor desta mensalidade" onClick={() => setEditFee(f)}>{money(f.amount)}</button>
                        : <span className="tabular-nums">{money(f.amount)}</span>}
                      {f.status === 'pago' ? <Badge tone="positive">Paga</Badge> : f.status === 'cancelado' ? <Badge>Cancelada</Badge>
                        : can(P.titlesSettle) ? <button type="button" className="btn-outline btn-sm" onClick={() => setSettle({ id: f.id, kind: 'receber', open_amount: f.open, company_id: m.company?.id, description: `Mensalidade ${monthLabel(f.month)} — ${m.name}` })}>
                          <CheckCircle2 className="h-3.5 w-3.5 text-positive" aria-hidden="true" /> Receber</button>
                          : <Badge tone={f.overdue ? 'danger' : 'brand'}>{f.overdue ? 'Atrasada' : 'Em aberto'}</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Avisos enviados</h3>
            {!m.reminders.length ? <p className="text-sm text-ink-soft">Nenhum aviso enviado.</p> : (
              <ul className="space-y-1 text-sm">
                {m.reminders.slice(0, 20).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{CHANNEL[r.channel]} · {KIND[r.kind]}{r.step ? ` (${r.kind === 'antes' ? `${r.step} dia(s) antes` : `${r.step} dia(s)`})` : ''}{r.sent_by_name ? ` · ${r.sent_by_name}` : ' · automático'}</span>
                    <span className="flex items-center gap-2 text-xs text-ink-faint">{new Date(r.sent_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      <Badge tone={r.status === 'enviado' ? 'positive' : 'danger'}><span title={r.error || ''}>{r.status === 'enviado' ? 'Enviado' : r.status === 'sem_contato' ? 'Sem contato' : 'Falhou'}</span></Badge></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {m.notes && <section><h3 className="mb-1 text-sm font-semibold">Observações</h3><p className="whitespace-pre-wrap text-sm text-ink-soft">{m.notes}</p></section>}
        </div>
      )}
      <SettleModal open={!!settle} onClose={() => setSettle(null)} title={settle} onDone={() => { reload(); onChanged?.(); }} />
      <FeeAmountModal fee={editFee} onClose={() => setEditFee(null)} onSaved={() => { reload(); onChanged?.(); }} />
    </Drawer>
  );
}

// ---------------- lista ----------------
function MembersList({ reloadKey, onOpen, onEdit, onChanged }) {
  const { can } = useAuth();
  const { askReason, confirm, toast } = useUI();
  const [q, setQ] = useState(''); const [qd, setQd] = useState('');
  const [sit, setSit] = useState(''); const [status, setStatus] = useState('');
  useEffect(() => { const t = setTimeout(() => setQd(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const { data, error, loading, reload } = useAsync(() => api.get(`/members${qs({ q: qd, situacao: sit, status })}`), [qd, sit, status, reloadKey]);
  const charge = useCharge(reload);
  const setSt = async (m, st) => {
    if (st === 'encerrado') {
      const ok = await confirm({ title: `Encerrar ${m.name}?`, message: 'As mensalidades dos próximos meses que ainda não foram pagas são canceladas. As em atraso continuam a receber.', confirmText: 'Encerrar', danger: true });
      if (!ok) return;
    }
    try { await api.post(`/members/${m.id}/status`, { status: st }); toast(st === 'ativo' ? 'Associado reativado.' : st === 'suspenso' ? 'Associado suspenso: novas mensalidades param de ser geradas.' : 'Associado encerrado.'); reload(); onChanged?.(); }
    catch (e) { toast(errorMessage(e), 'error'); }
  };
  const remove = async (m) => {
    const r = await askReason({ title: `Excluir ${m.name}?`, label: 'Motivo (ex.: cadastrado por engano)', confirmText: 'Excluir', danger: true,
      message: 'Só para cadastro errado: o associado e as mensalidades dele saem do sistema. Se ele já pagou alguma, use "Encerrar".' });
    if (!r) return;
    try { await api.del(`/members/${m.id}`); toast('Associado excluído.'); reload(); onChanged?.(); } catch (e) { toast(errorMessage(e), 'error'); }
  };
  const actions = (m) => [
    { label: 'Ver mensalidades', icon: Eye, onClick: () => onOpen(m) },
    can(PM.manage) && { label: 'Editar', icon: Pencil, onClick: () => onEdit(m) },
    can(PM.manage) && m.whatsapp && { label: 'Cobrar pelo WhatsApp (abrir)', icon: ExternalLink, onClick: () => charge.whatsappLink(m) },
    can(PM.manage) && m.overdue.count > 0 && m.whatsapp && { label: 'Enviar pelo WhatsApp oficial', icon: MessageCircle, onClick: () => charge.send(m, 'whatsapp') },
    can(PM.manage) && m.overdue.count > 0 && m.email && { label: 'Cobrar por e-mail', icon: Mail, onClick: () => charge.send(m, 'email') },
    can(PM.manage) && m.status === 'ativo' && { label: 'Suspender', icon: Pause, onClick: () => setSt(m, 'suspenso') },
    can(PM.manage) && m.status !== 'ativo' && { label: 'Reativar', icon: Play, onClick: () => setSt(m, 'ativo') },
    can(PM.manage) && m.status !== 'encerrado' && { label: 'Encerrar', icon: Square, onClick: () => setSt(m, 'encerrado'), danger: true },
    can(PM.manage) && { label: 'Excluir (cadastro errado)', icon: Trash2, onClick: () => remove(m), danger: true },
  ];
  const items = data?.items || [];
  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div className="relative">
          <label htmlFor="busca-assoc" className="label">Buscar</label>
          <Search className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-ink-faint" aria-hidden="true" />
          <input id="busca-assoc" type="search" className="input pl-9" placeholder="Nome, e-mail ou WhatsApp" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select label="Situação" value={sit} onChange={(e) => setSit(e.target.value)}><option value="">Todas</option><option value="atraso">Em atraso</option><option value="em_dia">Em dia</option></Select>
        <Select label="Cadastro" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Ativos e suspensos</option><option value="ativo">Ativos</option><option value="suspenso">Suspensos</option><option value="encerrado">Encerrados</option><option value="todos">Todos</option></Select>
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} className="card" /> : !items.length ? (
        <EmptyState className="card" icon={Users2} title={qd || sit || status ? 'Ninguém encontrado com esses filtros' : 'Nenhum associado cadastrado'}>
          {!qd && !sit && !status && 'Cadastre quem paga mensalidade: o CIFREN lança a mensalidade todo mês e avisa quem atrasar.'}
        </EmptyState>
      ) : (
        <>
          <div className="card hidden overflow-x-auto md:block">
            <table className="table-clean">
              <thead><tr><th scope="col">Associado</th><th scope="col">Contato</th><th scope="col" className="text-right">Mensalidade</th><th scope="col">Vence</th><th scope="col">Situação</th><th scope="col" className="text-right">Em atraso</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>
                {items.map((m) => { const s = situation(m); return (
                  <tr key={m.id} className={cx(m.overdue.count > 0 && 'bg-danger-soft/40')}>
                    <td className="max-w-[240px]"><button type="button" className="focus-ring block max-w-full truncate rounded text-left font-medium hover:underline" onClick={() => onOpen(m)}>{m.name}</button>
                      <div className="text-xs text-ink-faint">Nº {m.number}{m.last_payment && ` · último pagamento ${date(m.last_payment)}`}</div></td>
                    <td className="text-xs text-ink-soft"><div>{m.whatsapp_display || <span className="text-ink-faint">sem WhatsApp</span>}</div><div className="max-w-[200px] truncate">{m.email || <span className="text-ink-faint">sem e-mail</span>}</div></td>
                    <td className="whitespace-nowrap text-right tabular-nums">{m.monthly_fee != null ? money(m.monthly_fee) : '—'}{m.custom_fee != null && <div className="text-xs text-ink-faint">especial</div>}</td>
                    <td className="whitespace-nowrap">dia {m.due_day}</td>
                    <td><div className="flex flex-wrap gap-1"><Badge tone={s.tone}>{s.label}</Badge>{m.status === 'suspenso' && m.overdue.count > 0 && <Badge tone="warn">Suspenso</Badge>}</div></td>
                    <td className={cx('whitespace-nowrap text-right tabular-nums', m.overdue.count > 0 && 'font-semibold text-danger')}>{m.overdue.count ? <>{money(m.overdue.amount)}<div className="text-xs font-normal">{m.overdue.days} dias</div></> : '—'}</td>
                    <td className="text-right"><ActionMenu actions={actions(m)} label={`Mais ações para ${m.name}`} /></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden">
            {items.map((m) => { const s = situation(m); return (
              <li key={m.id} className={cx('card p-4', m.overdue.count > 0 && 'border-danger/40')}>
                <div className="flex items-start justify-between gap-2">
                  <button type="button" className="focus-ring min-w-0 rounded text-left" onClick={() => onOpen(m)}>
                    <div className="truncate font-medium">{m.name}</div>
                    <div className="truncate text-xs text-ink-faint">{m.whatsapp_display || m.email || 'sem contato'}</div>
                  </button>
                  <ActionMenu actions={actions(m)} label={`Mais ações para ${m.name}`} />
                </div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <div className="text-sm"><span className="tabular-nums">{m.monthly_fee != null ? money(m.monthly_fee) : '—'}</span>{m.custom_fee != null && <span className="text-xs text-ink-faint"> (especial)</span>} <span className="text-xs text-ink-faint">· dia {m.due_day}</span></div>
                  <div className="text-right"><Badge tone={s.tone}>{s.label}</Badge>{m.overdue.count > 0 && <div className="mt-1 text-sm font-semibold tabular-nums text-danger">{money(m.overdue.amount)}</div>}</div>
                </div>
              </li>
            ); })}
          </ul>
        </>
      )}
    </div>
  );
}

// ---------------- em atraso ----------------
function OverdueReport({ reloadKey, onOpen }) {
  const { can } = useAuth();
  const { toast } = useUI();
  const { data, error, loading, reload } = useAsync(() => api.get('/members/overdue'), [reloadKey]);
  const charge = useCharge(reload);
  const [sending, setSending] = useState(false);
  const sendReport = async () => {
    setSending(true);
    try { const r = await api.post('/members/overdue/send-report', {}); toast(`Relatório enviado para ${r.to}.`); } catch (e) { toast(errorMessage(e), 'error'); } finally { setSending(false); }
  };
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} className="card" />;
  const t = data.totals;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">Posição de {date(data.as_of)}: <strong className="text-ink">{t.members_overdue}</strong> associado(s), {t.fees_overdue} mensalidade(s), <strong className="text-danger">{money(t.amount)}</strong>.</p>
        <div className="flex flex-wrap gap-2">
          <a className="btn-outline btn-sm" href="/api/members/overdue.xlsx"><Download className="h-3.5 w-3.5" aria-hidden="true" /> Excel</a>
          <a className="btn-outline btn-sm" href="/api/members/overdue.csv"><Download className="h-3.5 w-3.5" aria-hidden="true" /> CSV</a>
          <button type="button" className="btn-outline btn-sm" onClick={sendReport} disabled={sending}><Send className="h-3.5 w-3.5" aria-hidden="true" /> Enviar para meu e-mail</button>
        </div>
      </div>
      {!data.items.length ? <EmptyState className="card" icon={CheckCircle2} title="Nenhuma mensalidade atrasada">Todos os associados estão em dia.</EmptyState> : (
        <div className="card overflow-x-auto">
          <table className="table-clean">
            <thead><tr><th scope="col">Associado</th><th scope="col">Meses</th><th scope="col">Atraso</th><th scope="col" className="text-right">Valor</th><th scope="col">Último aviso</th><th scope="col"><span className="sr-only">Cobrar</span></th></tr></thead>
            <tbody>
              {data.items.map((x) => (
                <tr key={x.member.id}>
                  <td className="max-w-[220px]"><button type="button" className="focus-ring block max-w-full truncate rounded text-left font-medium hover:underline" onClick={() => onOpen(x.member)}>{x.member.name}</button>
                    {!x.has_contact && <div className="text-xs text-warn">sem WhatsApp nem e-mail</div>}</td>
                  <td className="text-sm"><div>{x.count} mensalidade(s)</div><div className="max-w-[220px] truncate text-xs text-ink-faint">{x.months.join(', ')}</div></td>
                  <td className="whitespace-nowrap text-sm"><span className="font-semibold text-danger">{x.days} dias</span><div className="text-xs text-ink-faint">desde {date(x.oldest_due)}</div></td>
                  <td className="whitespace-nowrap text-right font-semibold tabular-nums text-danger">{money(x.amount)}</td>
                  <td className="text-xs text-ink-soft">{x.last_reminder ? <>{CHANNEL[x.last_reminder.channel]} · {new Date(x.last_reminder.at).toLocaleDateString('pt-BR')}{x.last_reminder.status !== 'enviado' && <Badge tone="danger" className="ml-1">falhou</Badge>}</> : 'nenhum'}</td>
                  <td className="whitespace-nowrap text-right">{can(PM.manage) && x.member.whatsapp && <button type="button" className="btn-outline btn-sm" onClick={() => charge.whatsappLink(x.member)}><MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------- avisos ----------------
function ReminderSettings() {
  const { can } = useAuth();
  const { toast } = useUI();
  const { data, error, loading, reload } = useAsync(() => api.get('/members/settings'), []);
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [testTo, setTestTo] = useState('');
  useEffect(() => { if (data) setF({ ...data, remind_after: (data.remind_after_days || []).join(', '), wa_token: '' }); }, [data]);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v && v.target ? v.target.value : v }));
  const edit = can(PM.config);
  const preview = useMemo(() => f && f.message.replace('{nome}', 'Maria').replace('{descricao}', '2 mensalidades (09/2026 e 10/2026)').replace('{valor}', 'R$ 240,00')
    .replace('{empresa}', 'Sua associação').replace('{pix}', f.pix_key ? ` Chave Pix para pagamento: ${f.pix_key}.` : '').replace('{meses}', '2').replace('{vencimento}', '05/09/2026'), [f]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} className="card" />;
  if (!f) return null;
  const save = async () => {
    setErr(''); setSaving(true);
    try {
      const after = f.remind_after.split(/[^\d]+/).map(Number).filter((n) => n > 0);
      await api.put('/members/settings', {
        remind_before_days: Number(f.remind_before_days) || 0, remind_after_days: after, email_subject: f.email_subject, message: f.message, before_message: f.before_message,
        pix_key: f.pix_key || null, send_hour_from: Number(f.send_hour_from), send_hour_to: Number(f.send_hour_to), report_weekly: f.report_weekly, report_weekday: Number(f.report_weekday),
        wa_enabled: f.wa_enabled, wa_phone_number_id: f.wa_phone_number_id || '', wa_template: f.wa_template || '', wa_template_before: f.wa_template_before || '', wa_lang: f.wa_lang || 'pt_BR',
        ...(f.wa_token ? { wa_token: f.wa_token } : {}),
      });
      toast('Avisos de cobrança salvos.'); reload();
    } catch (e) { setErr(errorMessage(e)); } finally { setSaving(false); }
  };
  const test = async () => {
    try { await api.post('/members/settings/test-whatsapp', { to: testTo }); toast('Mensagem de teste enviada.'); } catch (e) { toast(errorMessage(e), 'error'); }
  };
  return (
    <form className="grid gap-4 lg:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="space-y-4">
        <InlineError error={err} />
        <Panel title="Quando avisar">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Avisar depois do vencimento (dias)" value={f.remind_after} onChange={set('remind_after')} disabled={!edit} placeholder="1, 7, 15, 30"
              hint="Um aviso em cada etapa. Quem já está muito atrasado recebe só o aviso da etapa atual." />
            <Input label="Lembrete antes do vencimento (dias)" type="number" min={0} max={15} value={f.remind_before_days} onChange={set('remind_before_days')} disabled={!edit} hint="0 = não manda lembrete antes." />
            <Input label="Enviar a partir de (hora)" type="number" min={0} max={23} value={f.send_hour_from} onChange={set('send_hour_from')} disabled={!edit} />
            <Input label="Até (hora)" type="number" min={1} max={24} value={f.send_hour_to} onChange={set('send_hour_to')} disabled={!edit} />
          </div>
        </Panel>
        <Panel title="Mensagem">
          <div className="space-y-3">
            <Input label="Assunto do e-mail" value={f.email_subject} onChange={set('email_subject')} disabled={!edit} maxLength={150} />
            <Textarea label="Mensagem de atraso" value={f.message} onChange={set('message')} rows={4} disabled={!edit} maxLength={900} hint={`Campos: ${data.placeholders.join(' ')}`} />
            <Textarea label="Lembrete antes do vencimento" value={f.before_message} onChange={set('before_message')} rows={2} disabled={!edit} maxLength={900} />
            <Input label="Chave Pix (aparece na mensagem)" value={f.pix_key || ''} onChange={set('pix_key')} disabled={!edit} maxLength={120} />
            <div className="rounded-app-sm border border-line bg-muted/50 p-3 text-sm"><div className="mb-1 text-xs font-medium text-ink-faint">Como chega</div>{preview}</div>
          </div>
        </Panel>
      </div>
      <div className="space-y-4">
        <Panel title="Canais">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between gap-2"><span><Mail className="mr-1 inline h-4 w-4" aria-hidden="true" />E-mail</span>{data.email_ready ? <Badge tone="positive">Configurado</Badge> : <Link to="/configuracoes/notificacoes" className="text-sm underline">Configurar o e-mail</Link>}</li>
            <li className="flex items-center justify-between gap-2"><span><MessageCircle className="mr-1 inline h-4 w-4" aria-hidden="true" />WhatsApp oficial (automático)</span><Badge tone={data.wa_ready ? 'positive' : 'neutral'}>{data.wa_ready ? 'Ligado' : 'Desligado'}</Badge></li>
            <li className="flex items-center justify-between gap-2"><span><ExternalLink className="mr-1 inline h-4 w-4" aria-hidden="true" />WhatsApp por link (você envia)</span><Badge tone="positive">Sempre disponível</Badge></li>
          </ul>
          <p className="mt-3 text-xs text-ink-faint">Sem o WhatsApp oficial, os avisos automáticos saem por e-mail; pelo WhatsApp você cobra com 1 clique em "Abrir no WhatsApp" (a mensagem já vai escrita).</p>
        </Panel>
        <Panel title="WhatsApp oficial (Meta)">
          <div className="space-y-3">
            <Toggle label="Enviar avisos automáticos pelo WhatsApp" checked={f.wa_enabled} onChange={set('wa_enabled')} disabled={!edit} />
            <Input label="ID do número de telefone" value={f.wa_phone_number_id || ''} onChange={set('wa_phone_number_id')} disabled={!edit} inputMode="numeric" hint="Meta for Developers › WhatsApp › Configuração da API." />
            <Input label="Token de acesso" type="password" autoComplete="off" value={f.wa_token} onChange={set('wa_token')} disabled={!edit} placeholder={data.wa_token_set ? 'Guardado (deixe vazio para manter)' : 'Cole o token permanente'} hint="Fica cifrado e nunca volta para a tela." />
            <Input label="Modelo aprovado: atraso" value={f.wa_template || ''} onChange={set('wa_template')} disabled={!edit} placeholder="cobranca_mensalidade" hint={`Texto sugerido para aprovar na Meta: “${data.wa_template_text}”`} />
            <Input label="Modelo aprovado: lembrete (opcional)" value={f.wa_template_before || ''} onChange={set('wa_template_before')} disabled={!edit} placeholder="lembrete_mensalidade" hint={`Texto sugerido: “${data.wa_template_before_text}”`} />
            {data.wa_ready && edit && (
              <div className="flex items-end gap-2"><Input className="flex-1" label="Testar envio para" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="(19) 99999-9999" />
                <button type="button" className="btn-outline" onClick={test}>Testar</button></div>
            )}
          </div>
        </Panel>
        <Panel title="Relatório dos atrasados para você">
          <Toggle label="Receber o relatório toda semana (e-mail e sino)" checked={f.report_weekly} onChange={set('report_weekly')} disabled={!edit} />
          <Select label="Dia da semana" value={f.report_weekday} onChange={set('report_weekday')} disabled={!edit || !f.report_weekly}>
            {WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}
          </Select>
          <p className="mt-2 text-xs text-ink-faint">Vai para quem tem acesso a Associados. Na aba "Em atraso" você também baixa em Excel ou envia na hora.</p>
        </Panel>
        {edit && <div className="flex justify-end"><SubmitButton loading={saving}>Salvar avisos</SubmitButton></div>}
      </div>
    </form>
  );
}

export default function Members() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('aba') || 'lista';
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState(null);
  const [rk, setRk] = useState(0);
  const { data: sum } = useAsync(() => api.get('/members'), [rk]);
  const { data: feeInfo } = useAsync(() => api.get('/members/fees'), [rk]);
  const changed = () => setRk((x) => x + 1);
  const t = sum?.totals;
  const tabs = [
    { value: 'lista', label: 'Associados', icon: Users2 },
    { value: 'valores', label: 'Valores da mensalidade', icon: History },
    { value: 'atraso', label: 'Em atraso', icon: AlarmClock, count: t?.overdue_members || undefined },
    { value: 'avisos', label: 'Avisos de cobrança', icon: Settings2 },
  ];
  return (
    <div>
      <PageHeader title="Associados e mensalidades" icon={Users2} subtitle="Quem paga mensalidade, quem está em dia e quem atrasou."
        actions={can(PM.manage) && <button type="button" className="btn-cta" onClick={() => setForm({})}><Plus className="h-4 w-4" aria-hidden="true" /> Novo associado</button>} />
      {t && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Mensalidade atual" value={feeInfo?.current ? money(feeInfo.current) : '—'} sub={feeInfo?.items?.some((x) => x.future) ? 'novo valor já marcado' : `${t.active} associado(s) ativo(s)`} />
          <Stat label="Mensalidades por mês" value={money(t.monthly_expected)} />
          <Stat label="Em atraso" value={t.overdue_members} tone={t.overdue_members ? 'danger' : undefined} sub="associado(s)" />
          <Stat label="Valor em atraso" value={money(t.overdue_amount)} tone={t.overdue_amount ? 'danger' : undefined} />
        </div>
      )}
      <Tabs label="Seções" tabs={tabs} value={tab} onChange={(v) => setParams(v === 'lista' ? {} : { aba: v }, { replace: true })} className="mb-4" />
      {tab === 'lista' && <MembersList reloadKey={rk} onOpen={(m) => setOpen(m.id)} onEdit={(m) => setForm({ item: m })} onChanged={changed} />}
      {tab === 'atraso' && <OverdueReport reloadKey={rk} onOpen={(m) => setOpen(m.id)} />}
      {tab === 'avisos' && <ReminderSettings />}
      {tab === 'valores' && <FeeTable onChanged={changed} />}
      {tab === 'lista' && !sum?.items?.length && can(PM.manage) && (
        <Notice className="mt-4" title="Como funciona">
          {!feeInfo?.items?.length && <>Comece cadastrando o valor da mensalidade em <button type="button" className="underline" onClick={() => setParams({ aba: 'valores' }, { replace: true })}>Valores da mensalidade</button> (vale para todos). </>}
          Depois cadastre o associado com o dia do vencimento. Todo mês a mensalidade aparece em Contas a receber; quando ele paga, dê baixa por lá ou aqui em "Receber".
          Quem atrasar recebe o aviso por e-mail ou WhatsApp, e você recebe o relatório dos atrasados.
        </Notice>
      )}
      <MemberForm open={!!form} onClose={() => setForm(null)} item={form?.item} onSaved={changed} feeInfo={feeInfo}
        onGoFees={() => { setForm(null); setParams({ aba: 'valores' }, { replace: true }); }} />
      <MemberDetails id={open} onClose={() => setOpen(null)} onEdit={(m) => { setOpen(null); setForm({ item: m }); }} onChanged={changed} />
    </div>
  );
}
