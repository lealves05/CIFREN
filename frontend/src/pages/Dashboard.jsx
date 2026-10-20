import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Wallet, AlertTriangle, CalendarClock, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Circle, Plus, Landmark, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, qs } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { P } from '../lib/permissions';
import { money, moneyCompact, date, dayMonth, plural } from '../lib/format';
import { statusInfo, canSettle } from '../lib/titles';
import { PageHeader, Loading, ErrorState, Badge, cx } from '../components/ui';
import { useTitleActions } from '../components/titles/useTitleActions';

function Kpi({ label, value, sub, icon: Icon, tone = 'neutral', to }) {
  const tones = {
    neutral: 'text-ink',
    positive: 'text-positive',
    danger: 'text-danger',
  };
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-faint">{label}</span>
        <Icon className={cx('h-4 w-4', tones[tone])} aria-hidden="true" />
      </div>
      <div className={cx('mt-2 text-xl font-semibold tabular-nums sm:text-2xl', tones[tone])}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-faint">{sub}</div>}
    </>
  );
  return to
    ? <Link to={to} className="card block p-4 transition hover:border-accent/60">{body}</Link>
    : <div className="card p-4">{body}</div>;
}

function FlowTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="card px-3 py-2 text-xs">
      <div className="font-semibold">{date(p.date)}</div>
      <div className="mt-1 tabular-nums">Saldo previsto: <strong>{money(p.balance)}</strong></div>
      {p.in > 0 && <div className="tabular-nums text-positive">Entradas: {money(p.in)}</div>}
      {p.out > 0 && <div className="tabular-nums text-danger">Saídas: {money(p.out)}</div>}
    </div>
  );
}

function FlowChart({ flow }) {
  const min = Math.min(0, ...flow.map((f) => f.balance));
  const goesNegative = min < 0;
  const firstNeg = flow.find((f) => f.balance < 0);
  return (
    <section className="card p-4 lg:col-span-2" aria-labelledby="fluxo-t">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="fluxo-t" className="text-sm font-semibold">Saldo previsto nos próximos 30 dias</h2>
        {goesNegative
          ? <span className="text-xs font-medium text-danger">Atenção: o saldo fica negativo em {date(firstNeg.date)}</span>
          : <span className="text-xs text-ink-faint">Considera o caixa de hoje e as contas em aberto</span>}
      </div>
      <p className="sr-only">
        Saldo hoje {money(flow[0]?.balance)}; em {date(flow[flow.length - 1]?.date)} {money(flow[flow.length - 1]?.balance)}; menor saldo {money(Math.min(...flow.map((f) => f.balance)))}.
      </p>
      <div className="h-56 text-ink-faint" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={flow} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="saldo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#14a3a3" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#14a3a3" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} vertical={false} />
            <XAxis dataKey="date" tickFormatter={dayMonth} tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tickFormatter={moneyCompact} tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} width={72} />
            <Tooltip content={<FlowTooltip />} />
            {goesNegative && <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="4 4" />}
            <Area type="monotone" dataKey="balance" stroke="#14a3a3" strokeWidth={2} fill="url(#saldo)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function CategoryBars({ items }) {
  const max = Math.max(...items.map((i) => i.amount), 1);
  const top = items.slice(0, 7);
  return (
    <section className="card p-4" aria-labelledby="cat-t">
      <h2 id="cat-t" className="mb-3 text-sm font-semibold">Para onde vai o dinheiro (mês)</h2>
      {!top.length ? <p className="py-6 text-center text-sm text-ink-faint">Sem despesas lançadas neste mês.</p> : (
        <ul className="space-y-3">
          {top.map((c) => (
            <li key={c.name}>
              <div className="flex justify-between gap-2 text-sm"><span className="truncate">{c.name}</span><span className="tabular-nums text-ink-soft">{money(c.amount)}</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-cta" style={{ width: `${Math.max(2, (c.amount / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Onboarding({ hasAccount, hasTitle, canAccounts, canTitles }) {
  const steps = [
    { done: hasAccount, title: 'Cadastre uma conta bancária', text: 'A conta do banco ou o caixa da loja, com o saldo de hoje.', to: '/cadastros?aba=contas', cta: 'Cadastrar conta', icon: Landmark, allowed: canAccounts },
    { done: hasTitle, title: 'Lance sua primeira conta a pagar', text: 'Aluguel, luz, fornecedor… o CIFREN avisa quando estiver perto de vencer.', to: '/pagar?novo=1', cta: 'Lançar conta', icon: Plus, allowed: canTitles },
  ];
  return (
    <section className="card mb-5 overflow-hidden" aria-labelledby="comecar-t">
      <div className="bg-brand px-5 py-4 text-brand-fg">
        <h2 id="comecar-t" className="text-base font-semibold">Vamos começar? São só 2 passos.</h2>
        <p className="text-sm text-brand-fg/75">Depois disso, este painel mostra seu caixa e o que vem pela frente.</p>
      </div>
      <ol className="divide-y divide-line">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-wrap items-center gap-3 px-5 py-4">
            {s.done ? <CheckCircle2 className="h-6 w-6 shrink-0 text-positive" aria-hidden="true" /> : <Circle className="h-6 w-6 shrink-0 text-ink-faint" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              <div className={cx('text-sm font-semibold', s.done && 'text-ink-faint line-through')}>{i + 1}) {s.title}<span className="sr-only">{s.done ? ' — feito' : ' — a fazer'}</span></div>
              <div className="text-sm text-ink-faint">{s.text}</div>
            </div>
            {!s.done && s.allowed && <Link to={s.to} className={i === 0 || steps[0].done ? 'btn-cta' : 'btn-outline'}><s.icon className="h-4 w-4" aria-hidden="true" />{s.cta}</Link>}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Dashboard() {
  const { companyId, can, user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api.get(`/dashboard${qs({ company_id: companyId })}`), [companyId]);
  const actions = useTitleActions({ kind: 'pagar', onChanged: reload });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} className="card" />;
  const d = data || {};
  const cash = d.cash || { total: 0, accounts: [] };
  const pay = d.payables || {};
  const rec = d.receivables || {};
  const upcoming = d.upcoming || [];
  const flow = d.flow || [];
  const hasAccount = (cash.accounts || []).length > 0;
  const hasTitle = upcoming.length > 0 || (pay.overdue?.n || 0) + (rec.overdue?.n || 0) + (pay.next7?.n || 0) + (rec.next7?.n || 0) > 0
    || (pay.month?.amount || 0) + (rec.month?.amount || 0) > 0;
  const fresh = !hasAccount || !hasTitle;
  const first = (user?.name || '').split(' ')[0];

  return (
    <div>
      <PageHeader title={first ? `Olá, ${first}` : 'Início'} icon={LayoutDashboard} subtitle="Resumo do seu dinheiro hoje." />
      {fresh && <Onboarding hasAccount={hasAccount} hasTitle={hasTitle} canAccounts={can(P.accountsManage)} canTitles={can(P.titlesCreate)} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 lg:col-span-1">
          <Kpi label="Saldo em caixa" value={money(cash.total)} icon={Wallet} tone={cash.total < 0 ? 'danger' : 'neutral'}
            sub={hasAccount ? plural(cash.accounts.length, 'conta', 'contas') : 'Nenhuma conta cadastrada'} />
        </div>
        <Kpi label="A pagar vencido" value={money(pay.overdue?.amount)} icon={AlertTriangle} tone={pay.overdue?.amount > 0 ? 'danger' : 'neutral'}
          sub={pay.overdue?.n ? plural(pay.overdue.n, 'conta atrasada', 'contas atrasadas') : 'Nada atrasado'} to="/pagar" />
        <Kpi label="A receber vencido" value={money(rec.overdue?.amount)} icon={AlertTriangle} tone={rec.overdue?.amount > 0 ? 'danger' : 'neutral'}
          sub={rec.overdue?.n ? plural(rec.overdue.n, 'conta atrasada', 'contas atrasadas') : 'Nada atrasado'} to="/receber" />
        <div className="card col-span-2 grid grid-cols-2 divide-x divide-line lg:col-span-1">
          <div className="p-4">
            <div className="flex items-center gap-1 text-xs font-medium text-ink-faint"><ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden="true" /> Pagar em 7 dias</div>
            <div className="mt-2 text-lg font-semibold tabular-nums">{money(pay.next7?.amount)}</div>
            <div className="text-xs text-ink-faint">{plural(pay.next7?.n || 0, 'conta', 'contas')}</div>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-1 text-xs font-medium text-ink-faint"><ArrowDownToLine className="h-3.5 w-3.5" aria-hidden="true" /> Receber em 7 dias</div>
            <div className="mt-2 text-lg font-semibold tabular-nums text-positive">{money(rec.next7?.amount)}</div>
            <div className="text-xs text-ink-faint">{plural(rec.next7?.n || 0, 'conta', 'contas')}</div>
          </div>
        </div>
      </div>

      {!fresh && (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {flow.length > 0 && <FlowChart flow={flow} />}
          <CategoryBars items={d.expenses_by_category || []} />
        </div>
      )}

      <section className="card mt-4" aria-labelledby="prox-t">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 id="prox-t" className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-accent" aria-hidden="true" /> Próximos vencimentos</h2>
          {can(P.titlesView) && <Link to="/pagar" className="text-sm font-medium text-positive hover:underline">Ver todas</Link>}
        </div>
        {!upcoming.length ? (
          <p className="px-4 py-8 text-center text-sm text-ink-faint">Nenhuma conta em aberto. Quando você lançar contas, as próximas aparecem aqui.</p>
        ) : (
          <ul className="divide-y divide-line">
            {upcoming.map((t) => {
              const st = statusInfo(t, t.kind);
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-full', t.kind === 'receber' ? 'bg-accent/15 text-positive' : 'bg-cta/15 text-warn')}
                    title={t.kind === 'receber' ? 'A receber' : 'A pagar'}>
                    {t.kind === 'receber' ? <ArrowDownToLine className="h-4 w-4" aria-hidden="true" /> : <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />}
                    <span className="sr-only">{t.kind === 'receber' ? 'A receber' : 'A pagar'}</span>
                  </span>
                  <button type="button" className="focus-ring min-w-0 flex-1 rounded text-left" onClick={() => actions.openDetails(t)}>
                    <div className="truncate text-sm font-medium">{t.description}</div>
                    <div className={cx('text-xs', t.overdue ? 'font-semibold text-danger' : 'text-ink-faint')}>
                      {t.overdue ? 'Venceu' : 'Vence'} {date(t.due_date)}{t.counterparty?.name && ` · ${t.counterparty.name}`}
                    </div>
                  </button>
                  <div className="text-right">
                    <div className={cx('text-sm font-semibold tabular-nums', t.overdue && 'text-danger')}>{money(t.open_amount)}</div>
                    {t.overdue && <Badge tone={st.tone}>{st.label}</Badge>}
                  </div>
                  {can(P.titlesSettle) && canSettle(t) && (
                    <button type="button" className="btn-outline btn-sm" onClick={() => actions.openSettle(t)} aria-label={`Dar baixa em ${t.description}`}>
                      <CheckCircle2 className="h-3.5 w-3.5 text-positive" aria-hidden="true" /> Dar baixa
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {actions.elements}
    </div>
  );
}
