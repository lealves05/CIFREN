import { useEffect, useState } from 'react';
import { Repeat, Plus, Pencil, Pause, Play, Square, ListOrdered, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { api, qs, errorMessage } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useApiError } from '../lib/useApiError';
import { loadRefs } from '../lib/refData';
import { P } from '../lib/permissions';
import { money, date, pct, monthShort, FREQUENCIES, frequencyLabel, today } from '../lib/format';
import Modal from '../components/Modal';
import Drawer from '../components/Drawer';
import MoneyInput from '../components/MoneyInput';
import CategorySelect from '../components/CategorySelect';
import CounterpartyPicker from '../components/CounterpartyPicker';
import ActionMenu from '../components/ActionMenu';
import { PageHeader, Tabs, Loading, ErrorState, EmptyState, Badge, Input, Select, InlineError, SubmitButton, cx } from '../components/ui';
import { Notice, Stat } from '../components/kit';

const METHOD = [
  { value: 'fixo', label: 'Valor fixo', hint: 'Sempre o mesmo valor (aluguel, mensalidade).' },
  { value: 'media', label: 'Média dos últimos meses', hint: 'Bom para contas que variam (energia, água).' },
  { value: 'manual', label: 'Eu informo todo mês', hint: 'Sem estimativa automática.' },
];
const STATUS = { ativo: { label: 'Ativo', tone: 'positive' }, pausado: { label: 'Pausado', tone: 'warn' }, encerrado: { label: 'Encerrado', tone: 'neutral' } };
const OCC = { prevista: { label: 'Prevista', tone: 'neutral' }, lancada: { label: 'Lançada (estimada)', tone: 'warn' }, real: { label: 'Valor real', tone: 'positive' } };

function CommitmentForm({ open, onClose, item, template, onSaved }) {
  const { companies, companyId } = useAuth();
  const { toast } = useUI();
  const [f, setF] = useState({});
  const [refs, setRefs] = useState({ categories: [], costCenters: [] });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError('');
    loadRefs(['categories', 'costCenters']).then((r) => {
      setRefs(r);
      if (template?.category_name) {
        const c = r.categories.find((x) => x.name.toLowerCase() === template.category_name.toLowerCase());
        if (c) setF((x) => ({ ...x, category_id: x.category_id || c.id }));
      }
    });
    const src = item || {};
    setF({
      kind: src.kind || template?.kind || 'pagar', name: src.name || template?.name || '', company_id: src.company?.id || companyId || companies[0]?.id || '',
      counterparty: src.counterparty ? { id: src.counterparty.id, name: src.counterparty.name } : null, category_id: src.category?.id || null, cost_center_id: src.cost_center?.id || null,
      frequency: src.frequency || template?.frequency || 'mensal', due_day: src.due_day || 10, start_date: src.start_date || today(), end_date: src.end_date || '',
      method: src.method || template?.method || 'fixo', average_n: src.average_n || 6, estimated_amount: src.estimated_amount ?? null,
      tolerance_pct: src.tolerance_pct ?? 15, lead_days: src.lead_days ?? 10,
    });
  }, [open, item, template]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v && v.target ? v.target.value : v }));
  const submit = async () => {
    if (!f.name?.trim()) { setError('Dê um nome (ex.: Energia — loja centro).'); return; }
    if (f.method === 'fixo' && !(f.estimated_amount > 0)) { setError('Informe o valor fixo.'); return; }
    setSaving(true); setError('');
    const body = {
      kind: f.kind, name: f.name.trim(), company_id: f.company_id, counterparty_id: f.counterparty?.id || null, category_id: f.category_id || null, cost_center_id: f.cost_center_id || null,
      frequency: f.frequency, due_day: Number(f.due_day) || 1, start_date: f.start_date, end_date: f.end_date || null, method: f.method,
      average_n: Number(f.average_n) || 6, estimated_amount: f.estimated_amount ?? null, tolerance_pct: Number(f.tolerance_pct) || 0, lead_days: Number(f.lead_days) || 0,
    };
    try {
      if (item) await api.put(`/recurring/${item.id}`, body); else await api.post('/recurring', body);
      toast(item ? 'Compromisso atualizado. Vale para as próximas ocorrências.' : 'Compromisso criado. As próximas ocorrências já entram na previsão.');
      onSaved(); onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };
  const party = f.kind === 'receber' ? 'cliente' : 'fornecedor';
  return (
    <Modal open={open} onClose={onClose} onSubmit={submit} size="lg" title={item ? 'Editar compromisso recorrente' : 'Novo compromisso recorrente'}
      subtitle="Contas que se repetem: o CIFREN prevê o valor e cria a conta alguns dias antes do vencimento."
      footer={<><button type="button" className="btn-outline" onClick={onClose}>Cancelar</button><SubmitButton loading={saving}>Salvar</SubmitButton></>}>
      <div className="space-y-4">
        <InlineError error={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Tipo" value={f.kind} onChange={set('kind')} disabled={!!item}>
            <option value="pagar">A pagar (despesa)</option><option value="receber">A receber (receita)</option>
          </Select>
          <Input label="Nome" required value={f.name} onChange={set('name')} maxLength={120} placeholder="Ex.: CPFL — loja centro" />
          {companies.length > 1 && (
            <Select label="Empresa" value={f.company_id} onChange={set('company_id')} disabled={!!item}>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
          <div className={companies.length > 1 ? '' : 'sm:col-span-2'}><CounterpartyPicker kind={party} value={f.counterparty} onChange={set('counterparty')} label={`${party === 'cliente' ? 'Cliente' : 'Fornecedor'} (opcional)`} /></div>
          <CategorySelect categories={refs.categories} type={f.kind === 'receber' ? 'receita' : 'despesa'} value={f.category_id} onChange={set('category_id')} />
          <Select label="Centro de custo" value={f.cost_center_id || ''} onChange={(e) => set('cost_center_id')(e.target.value || null)}>
            <option value="">Nenhum</option>
            {refs.costCenters.filter((c) => c.active !== false).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Repete" value={f.frequency} onChange={set('frequency')}>{FREQUENCIES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</Select>
          <Input label="Dia do vencimento" type="number" min={1} max={31} value={f.due_day} onChange={set('due_day')} hint="Se o mês não tiver o dia, vale o último dia." />
          <Input label="Começa em" type="date" value={f.start_date} onChange={set('start_date')} />
          <Input label="Termina em" type="date" value={f.end_date} onChange={set('end_date')} hint="Deixe vazio se não tem fim." />
        </div>
        <fieldset className="rounded-app-sm border border-line p-3">
          <legend className="px-1 text-xs font-medium text-ink-soft">Como estimar o valor</legend>
          <div className="space-y-2">
            {METHOD.map((m) => (
              <label key={m.value} className="flex cursor-pointer items-start gap-2 text-sm">
                <input type="radio" name="method" className="mt-1 accent-[rgb(var(--accent))]" checked={f.method === m.value} onChange={() => set('method')(m.value)} />
                <span><span className="font-medium">{m.label}</span><span className="block text-xs text-ink-faint">{m.hint}</span></span>
              </label>
            ))}
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <MoneyInput label={f.method === 'fixo' ? 'Valor fixo' : 'Valor inicial estimado'} value={f.estimated_amount} onChange={set('estimated_amount')} required={f.method === 'fixo'}
              hint={f.method === 'media' ? 'Usado até existirem valores reais para calcular a média.' : undefined} />
            {f.method === 'media' && <Input label="Média de quantos meses" type="number" min={2} max={24} value={f.average_n} onChange={set('average_n')} />}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Criar a conta quantos dias antes" type="number" min={0} max={60} value={f.lead_days} onChange={set('lead_days')} hint="A conta nasce como “valor estimado — aguardando a conta”." />
          <Input label="Avisar se o real passar da estimativa em (%)" type="number" min={0} max={200} value={f.tolerance_pct} onChange={set('tolerance_pct')} />
        </div>
      </div>
    </Modal>
  );
}

function Templates({ open, onClose, onPick }) {
  const { data, loading, error, reload } = useAsync(() => (open ? api.get('/recurring/templates') : Promise.resolve(null)), [open]);
  const list = Array.isArray(data) ? data : data?.items || [];
  return (
    <Modal open={open} onClose={onClose} title="Novo compromisso" subtitle="Escolha um modelo pronto ou comece do zero.">
      {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {list.map((t) => (
            <li key={t.key}>
              <button type="button" className="focus-ring w-full rounded-app-sm border border-line px-3 py-2.5 text-left hover:border-accent hover:bg-accent/5" onClick={() => onPick(t)}>
                <span className="block text-sm font-medium">{t.name}</span>
                <span className="block text-xs text-ink-faint">{t.kind === 'receber' ? 'A receber' : 'A pagar'} · {frequencyLabel(t.frequency)} · {METHOD.find((m) => m.value === t.method)?.label || t.method}</span>
              </button>
            </li>
          ))}
          <li className="sm:col-span-2"><button type="button" className="btn-outline w-full" onClick={() => onPick(null)}><Plus className="h-4 w-4" aria-hidden="true" /> Começar do zero</button></li>
        </ul>
      )}
    </Modal>
  );
}

function Occurrences({ item, onClose, canManage, onChanged }) {
  const { toast } = useUI();
  const onError = useApiError();
  const { data, error, loading, reload } = useAsync(() => (item ? api.get(`/recurring/${item.id}/occurrences`) : Promise.resolve(null)), [item?.id]);
  const [edit, setEdit] = useState(null); // { occ, mode: 'actual'|'estimate' }
  const [value, setValue] = useState(null);
  const [saving, setSaving] = useState(false);
  const items = data?.items || [];
  const save = async () => {
    if (!(value > 0)) return;
    setSaving(true);
    try {
      if (edit.mode === 'actual') await api.post(`/recurring/occurrences/${edit.occ.id}/actual`, { amount: value });
      else await api.put(`/recurring/occurrences/${edit.occ.id}`, { estimated_amount: value });
      toast(edit.mode === 'actual' ? 'Valor real registrado.' : 'Estimativa corrigida.');
      setEdit(null); reload(); onChanged();
    } catch (e) { onError(e); } finally { setSaving(false); }
  };
  return (
    <Drawer open={!!item} onClose={onClose} title={item?.name || ''} subtitle="Ocorrências: estimado × real">
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <div className="space-y-3">
          {item && (
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Próximo vencimento" value={date(item.next_due)} sub={item.next_estimated != null ? `estimado ${money(item.next_estimated)}` : undefined} />
              <Stat label="Erro médio da estimativa" value={item.avg_error_pct != null ? pct(item.avg_error_pct) : '—'} sub={item.last_actual != null ? `último real ${money(item.last_actual)}` : undefined} />
            </div>
          )}
          {!items.length ? <p className="py-6 text-center text-sm text-ink-faint">Nenhuma ocorrência gerada ainda.</p> : (
            <ul className="divide-y divide-line rounded-app-sm border border-line">
              {items.map((o) => {
                const s = OCC[o.status] || OCC.prevista;
                const big = o.diff_pct != null && Math.abs(o.diff_pct) > (item?.tolerance_pct ?? 15);
                return (
                  <li key={o.id} className="p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium tabular-nums">{date(o.due_date)}</span>
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </div>
                    <div className="mt-1 grid grid-cols-3 gap-2 text-sm">
                      <div><div className="text-xs text-ink-faint">Estimado</div><div className="tabular-nums">{money(o.estimated_amount)}</div></div>
                      <div><div className="text-xs text-ink-faint">Real</div><div className="tabular-nums">{o.actual_amount != null ? money(o.actual_amount) : '—'}</div></div>
                      <div><div className="text-xs text-ink-faint">Diferença</div>
                        <div className={cx('tabular-nums', big && 'font-semibold text-danger')}>{o.diff_amount != null ? `${money(o.diff_amount)} (${pct(o.diff_pct)})` : '—'}</div></div>
                    </div>
                    {o.estimate_explain && <p className="mt-1 flex items-start gap-1 text-xs text-ink-faint"><Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{o.estimate_explain}</p>}
                    {canManage && o.status !== 'real' && (
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        {o.status === 'prevista' && <button type="button" className="btn-ghost btn-sm" onClick={() => { setEdit({ occ: o, mode: 'estimate' }); setValue(o.estimated_amount); }}>Corrigir estimativa</button>}
                        <button type="button" className="btn-outline btn-sm" onClick={() => { setEdit({ occ: o, mode: 'actual' }); setValue(null); }}>Informar valor real</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} onSubmit={save} size="sm"
        title={edit?.mode === 'actual' ? 'Informar valor real' : 'Corrigir estimativa'}
        subtitle={edit && `${item?.name} · vencimento ${date(edit.occ.due_date)} · estimado ${money(edit.occ.estimated_amount)}`}
        footer={<><button type="button" className="btn-outline" onClick={() => setEdit(null)}>Cancelar</button><SubmitButton loading={saving} disabled={!(value > 0)}>Salvar</SubmitButton></>}>
        <MoneyInput label={edit?.mode === 'actual' ? 'Valor que veio na conta' : 'Nova estimativa'} required value={value} onChange={setValue} data-autofocus
          hint={edit?.mode === 'actual' ? 'Se a conta já foi lançada, o valor dela é atualizado.' : undefined} />
      </Modal>
    </Drawer>
  );
}

function YearReport() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, error, loading, reload } = useAsync(() => api.get(`/recurring/report${qs({ year })}`), [year]);
  const months = data?.months || [];
  const dev = data?.deviations || [];
  const be = data?.break_even_month;
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div><label htmlFor="rr-y" className="label">Ano</label>
          <select id="rr-y" className="input w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[0, -1, -2, 1].map((d) => new Date().getFullYear() + d).sort().map((y) => <option key={y} value={y}>{y}</option>)}
          </select></div>
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          {be?.month && <Notice title="Ponto de equilíbrio">Em {monthShort(be.month)} a empresa precisa faturar pelo menos <strong>{money(be.required_revenue)}</strong> para cobrir os compromissos fixos.</Notice>}
          <div className="overflow-x-auto rounded-app-sm border border-line">
            <table className="table-clean min-w-[560px]">
              <caption className="sr-only">Compromissos recorrentes por mês</caption>
              <thead><tr><th scope="col">Mês</th><th scope="col" className="text-right">Despesas fixas previstas</th><th scope="col" className="text-right">Realizadas</th><th scope="col" className="text-right">Receita recorrente prevista</th><th scope="col" className="text-right">Realizada</th></tr></thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month}>
                    <th scope="row" className="px-4 py-3 text-left font-medium">{monthShort(m.month)}</th>
                    <td className="text-right tabular-nums">{money(m.fixed_estimated)}</td>
                    <td className="text-right tabular-nums">{m.fixed_actual != null ? money(m.fixed_actual) : '—'}</td>
                    <td className="text-right tabular-nums">{money(m.recurring_revenue_estimated)}</td>
                    <td className="text-right tabular-nums">{m.recurring_revenue_actual != null ? money(m.recurring_revenue_actual) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Maiores diferenças entre estimado e real</h3>
            {!dev.length ? <p className="text-sm text-ink-faint">Nenhuma diferença fora da tolerância.</p> : (
              <ul className="divide-y divide-line rounded-app-sm border border-line">
                {dev.map((d, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-2.5 text-sm">
                    <span><strong>{d.commitment?.name || d.commitment}</strong> · {monthShort(d.month)}</span>
                    <span className="tabular-nums">{money(d.estimated)} → {money(d.actual)} <span className={cx('font-semibold', Math.abs(d.diff_pct) > 15 ? 'text-danger' : 'text-warn')}>({pct(d.diff_pct)})</span></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function Recurring() {
  const { can, companyId, companies } = useAuth();
  const { toast, confirm } = useUI();
  const canManage = can(P.recurringManage);
  const [tab, setTab] = useState('lista');
  const [pickTpl, setPickTpl] = useState(false);
  const [form, setForm] = useState(null); // { item?, template? }
  const [occ, setOcc] = useState(null);
  const { data, error, loading, reload } = useAsync(() => api.get('/recurring'), []);
  const items = (data?.items || []).filter((r) => !companyId || !r.company?.id || r.company.id === companyId);

  const lifecycle = async (r, what) => {
    const text = { pause: ['Pausar?', 'Não gera novas contas até retomar.'], resume: ['Retomar?', 'Volta a gerar as próximas contas.'], end: ['Encerrar este compromisso?', 'As ocorrências futuras previstas deixam de existir. As contas já lançadas continuam.'] }[what];
    if (!(await confirm({ title: text[0], message: text[1], confirmText: 'Confirmar', danger: what === 'end' }))) return;
    try { await api.post(`/recurring/${r.id}/${what}`); toast('Pronto.'); reload(); } catch (e) { toast(errorMessage(e), 'error'); }
  };

  return (
    <div>
      <PageHeader title="Recorrentes e previsão" icon={Repeat} subtitle="Contas que se repetem todo mês: o CIFREN prevê o valor e avisa quando a conta não chegou."
        actions={canManage && <button type="button" className="btn-cta" onClick={() => setPickTpl(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Novo compromisso</button>} />
      <div className="card">
        <Tabs label="Visão" value={tab} onChange={setTab} className="px-2" tabs={[{ value: 'lista', label: 'Compromissos', icon: ListOrdered }, { value: 'ano', label: 'Relatório do ano', icon: Repeat }]} />
        <div className="p-4" role="tabpanel">
          {tab === 'ano' ? <YearReport /> : loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : !items.length ? (
            <EmptyState icon={Repeat} title="Nenhum compromisso recorrente"
              action={canManage && <button type="button" className="btn-primary" onClick={() => setPickTpl(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Cadastrar o primeiro</button>}>
              Cadastre energia, aluguel, internet, salários e mensalidades. A previsão de caixa fica muito mais certa.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line rounded-app-sm border border-line">
              {items.map((r) => {
                const s = STATUS[r.status] || STATUS.ativo;
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <button type="button" className="focus-ring min-w-0 flex-1 rounded text-left" onClick={() => setOcc(r)}>
                      <div className="flex flex-wrap items-center gap-2 font-medium">{r.name}<Badge tone={r.kind === 'receber' ? 'positive' : 'brand'}>{r.kind === 'receber' ? 'A receber' : 'A pagar'}</Badge><Badge tone={s.tone}>{s.label}</Badge></div>
                      <div className="text-xs text-ink-faint">{frequencyLabel(r.frequency)} · dia {r.due_day}{r.category?.name && ` · ${r.category.name}`}{companies.length > 1 && r.company?.name && ` · ${r.company.name}`}</div>
                    </button>
                    <div className="text-right text-sm">
                      <div className="text-xs text-ink-faint">Próximo: {date(r.next_due)}</div>
                      <div className="font-semibold tabular-nums">{r.next_estimated != null ? money(r.next_estimated) : '—'}</div>
                      {r.avg_error_pct != null && <div className="text-xs text-ink-faint">erro médio {pct(r.avg_error_pct)}</div>}
                    </div>
                    <ActionMenu label={`Ações de ${r.name}`} actions={[
                      { label: 'Ver ocorrências', icon: ListOrdered, onClick: () => setOcc(r) },
                      canManage && r.status !== 'encerrado' && { label: 'Editar', icon: Pencil, onClick: () => setForm({ item: r }) },
                      canManage && r.status === 'ativo' && { label: 'Pausar', icon: Pause, onClick: () => lifecycle(r, 'pause') },
                      canManage && r.status === 'pausado' && { label: 'Retomar', icon: Play, onClick: () => lifecycle(r, 'resume') },
                      canManage && r.status !== 'encerrado' && { label: 'Encerrar', icon: Square, onClick: () => lifecycle(r, 'end'), danger: true },
                    ]} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <Templates open={pickTpl} onClose={() => setPickTpl(false)} onPick={(t) => { setPickTpl(false); setForm({ template: t }); }} />
      <CommitmentForm open={!!form} onClose={() => setForm(null)} item={form?.item} template={form?.template} onSaved={reload} />
      <Occurrences item={occ} onClose={() => setOcc(null)} canManage={canManage} onChanged={reload} />
    </div>
  );
}
