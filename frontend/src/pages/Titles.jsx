import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, CheckCircle2, Eye, Pencil, Ban, ArrowUpFromLine, ArrowDownToLine, FilterX, Layers, CalendarRange } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, qs } from '../lib/api';
import { usePaged } from '../lib/useAsync';
import { P } from '../lib/permissions';
import { KIND, STATUS_TABS, statusInfo, canSettle, canCancel, titleFlags } from '../lib/titles';
import { money, date } from '../lib/format';
import { PageHeader, Tabs, Badge, Loading, ErrorState, EmptyState, LoadMore, InlineError, cx } from '../components/ui';
import { CompanyFilter } from '../components/Layout';
import ActionMenu from '../components/ActionMenu';
import { useTitleActions } from '../components/titles/useTitleActions';
import { categoryTree } from '../components/CategorySelect';
import { loadRefs } from '../lib/refData';
import { readPref, writePref } from '../lib/storage';

// Atalhos de período (contam do dia de hoje, no fuso do navegador)
const ymd = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const monthRange = (k) => { const n = new Date(); return [ymd(new Date(n.getFullYear(), n.getMonth() + k, 1)), ymd(new Date(n.getFullYear(), n.getMonth() + k + 1, 0))]; };
const PERIODS = [
  { key: 'todas', label: 'Todas' },
  { key: 'vencidas_proximo', label: 'Vencidas e próximo mês', hint: 'Tudo em aberto até o fim do próximo mês, incluindo as vencidas', range: () => ['', monthRange(1)[1]] },
  { key: 'vencidas', label: 'Vencidas', hint: 'Só o que já passou do vencimento', status: 'vencidos' },
  { key: 'mes', label: 'Este mês', hint: 'Vencimento neste mês', range: () => monthRange(0) },
  { key: 'proximo', label: 'Próximo mês', hint: 'Vencimento no mês que vem', range: () => monthRange(1) },
];
const PERIOD_KEY = 'cifren.titulos.periodo';

export default function Titles({ kind }) {
  const { can, companyId, companies } = useAuth();
  const k = KIND[kind];
  const [params, setParams] = useSearchParams();
  // período lembrado por navegador (o mesmo atalho vale para pagar e receber)
  const startPeriod = PERIODS.find((p) => p.key === readPref(PERIOD_KEY)) || PERIODS[0];
  const [period, setPeriod] = useState(startPeriod.key);
  const [status, setStatus] = useState(startPeriod.status || 'abertos');
  const [from, setFrom] = useState(() => startPeriod.range?.()[0] || '');
  const [to, setTo] = useState(() => startPeriod.range?.()[1] || '');
  const choosePeriod = (p) => {
    setPeriod(p.key); writePref(PERIOD_KEY, p.key === 'todas' ? '' : p.key);
    const [a, b] = p.range ? p.range() : ['', ''];
    setFrom(a); setTo(b);
    if (p.status) setStatus(p.status); else if (['vencidos', 'pagos', 'cancelados'].includes(status)) setStatus('abertos');
  };
  // mexeu nas datas ou na aba à mão: o atalho deixa de valer
  const manual = (fn) => (v) => { fn(v); if (period !== 'todas') { setPeriod('todas'); writePref(PERIOD_KEY, ''); } };
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);

  useEffect(() => { loadRefs(['categories']).then((r) => setCategories(r.categories)); }, []);
  const catTree = useMemo(() => categoryTree(categories, k.categoryType), [categories, k.categoryType]);

  useEffect(() => { const t = setTimeout(() => setQDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  const fetchPage = (cursor) => api.get(`/titles${qs({ kind, status, from, to, q: qDebounced, category_id: category, company_id: companyId, limit: 50, cursor })}`);
  const list = usePaged(fetchPage, [kind, status, from, to, qDebounced, category, companyId]);
  const actions = useTitleActions({ kind, onChanged: list.reload });

  // atalho vindo do painel: /pagar?novo=1
  useEffect(() => {
    if (params.get('novo') && can(P.titlesCreate)) {
      actions.openNew(kind);
      params.delete('novo');
      setParams(params, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = list.extra?.totals;
  const filtered = !!(from || to || qDebounced || category || period !== 'todas');
  const showCompany = companies.length > 1 && !companyId;
  const rowActions = (t) => [
    { label: 'Ver detalhes', icon: Eye, onClick: () => actions.openDetails(t) },
    can(P.titlesEdit) && t.status !== 'cancelado' && !t.member_credit && { label: t.installments > 1 ? 'Editar só esta parcela' : 'Editar', icon: Pencil, onClick: () => actions.openEdit(t) },
    can(P.titlesEdit) && t.group_id && t.installments > 1 && { label: 'Lançamento original (todas as parcelas)', icon: Layers, onClick: () => actions.openGroup(t) },
    can(P.titlesCancel) && canCancel(t) && { label: t.installments > 1 ? 'Cancelar só esta parcela' : 'Cancelar', icon: Ban, onClick: () => actions.cancel(t), danger: true },
  ];
  const settleBtn = (t, cls = '') => can(P.titlesSettle) && canSettle(t) && (
    <button type="button" className={cx('btn-outline btn-sm', cls)} onClick={() => actions.openSettle(t)} aria-label={`Dar baixa em ${t.description}`}>
      <CheckCircle2 className="h-3.5 w-3.5 text-positive" aria-hidden="true" /> Dar baixa
    </button>
  );

  const emptyText = useMemo(() => {
    if (filtered) return { title: 'Nada encontrado com esses filtros', body: 'Tente mudar a categoria, o período ou a busca.' };
    switch (status) {
      case 'vencidos': return { title: 'Nada vencido', body: kind === 'pagar' ? 'Ótimo! Nenhuma conta atrasada.' : 'Ótimo! Nenhum cliente em atraso.' };
      case 'pagos': return { title: kind === 'pagar' ? 'Nenhuma conta paga ainda' : 'Nenhum recebimento ainda', body: 'Quando você der baixa numa conta, ela aparece aqui.' };
      case 'cancelados': return { title: 'Nenhuma conta cancelada', body: '' };
      default: return { title: `Nenhuma ${k.one} por aqui`, body: kind === 'pagar' ? 'Lance boletos, aluguel, fornecedores e outras despesas para nunca perder um vencimento.' : 'Lance o que seus clientes vão te pagar para acompanhar quem está em dia.' };
    }
  }, [filtered, status, kind, k.one]);

  return (
    <div>
      <PageHeader title={k.title} icon={kind === 'pagar' ? ArrowUpFromLine : ArrowDownToLine}
        subtitle={kind === 'pagar' ? 'Tudo o que sua empresa precisa pagar.' : 'Tudo o que sua empresa tem para receber.'}
        actions={can(P.titlesCreate) && <button type="button" className="btn-cta" onClick={() => actions.openNew(kind)}><Plus className="h-4 w-4" aria-hidden="true" /> Novo</button>} />

      <div className="card mb-4">
        <Tabs label="Situação" tabs={STATUS_TABS} value={status} onChange={(v) => { setStatus(v); if (period === 'vencidas' && v !== 'vencidos') { setPeriod('todas'); writePref(PERIOD_KEY, ''); } }} className="px-2" />
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2" role="group" aria-label="Período">
          <CalendarRange className="h-4 w-4 text-ink-faint" aria-hidden="true" />
          {PERIODS.map((p) => (
            <button key={p.key} type="button" aria-pressed={period === p.key} title={p.hint} onClick={() => choosePeriod(p)}
              className={cx('rounded-full border px-3 py-1 text-xs font-semibold transition', period === p.key ? 'border-accent bg-accent/15 text-positive' : 'border-line text-ink-soft hover:bg-muted')}>{p.label}</button>
          ))}
        </div>
        <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_minmax(11rem,14rem)_auto_auto_auto_auto] lg:items-end">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <label htmlFor="busca-titulos" className="label">Buscar</label>
            <Search className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-ink-faint" aria-hidden="true" />
            <input id="busca-titulos" type="search" className="input pl-9" placeholder={`Descrição, ${k.party} ou nº do documento`} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div>
            <label htmlFor="categoria-titulos" className="label">Categoria</label>
            <select id="categoria-titulos" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Todas as categorias</option>
              <option value="sem">Sem categoria</option>
              {catTree.map((root) => (root.children.length ? (
                <optgroup key={root.id} label={root.name}>
                  <option value={root.id}>{root.name} (todas)</option>
                  {root.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ) : <option key={root.id} value={root.id}>{root.name}</option>))}
            </select>
          </div>
          <div><label htmlFor="de" className="label">Vencimento de</label><input id="de" type="date" className="input" value={from} onChange={(e) => manual(setFrom)(e.target.value)} /></div>
          <div><label htmlFor="ate" className="label">até</label><input id="ate" type="date" className="input" value={to} min={from || undefined} onChange={(e) => manual(setTo)(e.target.value)} /></div>
          {companies.length > 1 && <div><span className="label">Empresa</span><CompanyFilter className="[&_select]:max-w-none" /></div>}
          {filtered && <button type="button" className="btn-ghost" onClick={() => { setFrom(''); setTo(''); setQ(''); setCategory(''); setPeriod('todas'); writePref(PERIOD_KEY, ''); }}><FilterX className="h-4 w-4" aria-hidden="true" /> Limpar</button>}
        </div>
      </div>

      {list.loading ? <Loading /> : list.error && !list.items.length ? <ErrorState error={list.error} onRetry={list.reload} className="card" /> : !list.items.length ? (
        <EmptyState className="card" title={emptyText.title}
          action={!filtered && ['abertos', 'todos'].includes(status) && can(P.titlesCreate) && <button type="button" className="btn-cta" onClick={() => actions.openNew(kind)}><Plus className="h-4 w-4" aria-hidden="true" /> {k.newLabel}</button>}>
          {emptyText.body}
        </EmptyState>
      ) : (
        <>
          {/* Computador: tabela */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="table-clean">
              <caption className="sr-only">{k.title}</caption>
              <thead>
                <tr>
                  <th scope="col">Vencimento</th>
                  <th scope="col">Descrição</th>
                  <th scope="col">Categoria</th>
                  {showCompany && <th scope="col">Empresa</th>}
                  <th scope="col" className="text-right">Valor</th>
                  <th scope="col" className="text-right">Em aberto</th>
                  <th scope="col">Situação</th>
                  <th scope="col"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((t) => {
                  const st = statusInfo(t, kind);
                  return (
                    <tr key={t.id} className={cx(t.overdue && 'bg-danger-soft/50')}>
                      <td className={cx('whitespace-nowrap tabular-nums', t.overdue && 'font-semibold text-danger')}>{date(t.due_date)}</td>
                      <td className="max-w-[280px]">
                        <button type="button" className="focus-ring block max-w-full truncate rounded text-left font-medium hover:underline" onClick={() => actions.openDetails(t)}>{t.description}</button>
                        <div className="truncate text-xs text-ink-faint">
                          {t.counterparty?.name || `Sem ${k.party}`}{t.installments > 1 && ` · parcela ${t.installment}/${t.installments}`}
                        </div>
                      </td>
                      <td className="text-ink-soft">{t.category?.name || '—'}</td>
                      {showCompany && <td className="text-ink-soft">{t.company?.name}</td>}
                      <td className="whitespace-nowrap text-right tabular-nums">{money(t.amount)}</td>
                      <td className={cx('whitespace-nowrap text-right font-medium tabular-nums', t.overdue && 'text-danger')}>{money(t.open_amount)}</td>
                      <td><div className="flex flex-wrap gap-1"><Badge tone={st.tone}>{st.label}</Badge>{titleFlags(t).map((fl) => <Badge key={fl.key} tone={fl.tone}><span title={fl.title}>{fl.label}</span></Badge>)}</div></td>
                      <td className="whitespace-nowrap text-right"><div className="flex items-center justify-end gap-1">{settleBtn(t)}<ActionMenu actions={rowActions(t)} label={`Mais ações para ${t.description}`} /></div></td>
                    </tr>
                  );
                })}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="bg-muted/60 font-semibold">
                    <td colSpan={showCompany ? 4 : 3} className="px-4 py-3 text-sm">Total {list.hasMore ? 'do filtro' : ''}<span className="ml-2 text-xs font-normal text-ink-faint">{totals.paid > 0 && `${kind === 'pagar' ? 'pago' : 'recebido'}: ${money(totals.paid)}`}</span></td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums">{money(totals.amount)}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums">{money(totals.open)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Celular: cartões */}
          <ul className="space-y-3 md:hidden" aria-label={k.title}>
            {list.items.map((t) => {
              const st = statusInfo(t, kind);
              return (
                <li key={t.id} className={cx('card p-4', t.overdue && 'border-danger/40')}>
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" className="focus-ring min-w-0 rounded text-left" onClick={() => actions.openDetails(t)}>
                      <div className="truncate font-medium">{t.description}</div>
                      <div className="truncate text-xs text-ink-faint">{t.counterparty?.name || `Sem ${k.party}`}{t.installments > 1 && ` · ${t.installment}/${t.installments}`}</div>
                    </button>
                    <ActionMenu actions={rowActions(t)} label={`Mais ações para ${t.description}`} />
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div>
                      <div className={cx('text-xs', t.overdue ? 'font-semibold text-danger' : 'text-ink-faint')}>Vence {date(t.due_date)}</div>
                      <div className={cx('text-lg font-semibold tabular-nums', t.overdue && 'text-danger')}>{money(t.open_amount > 0 ? t.open_amount : t.amount)}</div>
                      <div className="mt-1 flex flex-wrap gap-1"><Badge tone={st.tone}>{st.label}</Badge>{titleFlags(t).map((fl) => <Badge key={fl.key} tone={fl.tone}>{fl.label}</Badge>)}</div>
                    </div>
                    {settleBtn(t)}
                  </div>
                </li>
              );
            })}
          </ul>
          {totals && (
            <div className="card mt-3 flex items-center justify-between p-4 text-sm md:hidden">
              <span className="text-ink-soft">Total em aberto</span><strong className="tabular-nums">{money(totals.open)}</strong>
            </div>
          )}
          {list.error && <div className="mt-3"><InlineError error={list.error} /></div>}
          <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={list.more} />
        </>
      )}
      {actions.elements}
    </div>
  );
}
