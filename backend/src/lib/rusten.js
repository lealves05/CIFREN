// Integração RUSTEN → CIFREN (contrato em docs/integracao-rusten-cifren.md).
// Cliente marcado como Associado no RUSTEN vira associado aqui; cada lançamento da conta dele (fiado, crédito…) vira
// conta a receber / baixa / saldo de crédito ligado ao cadastro. Tudo idempotente pelo id do RUSTEN.
import { HttpError, today, round2, toCents, fromCents } from '../util.js';
import { refreshStatus, PAID } from '../routes/titles.js';
import { audit } from '../audit.js';
import { generateFor, feeCategory, normPhone, fmtPhone } from './members.js';

const SRC = 'rusten';
const cents = (c) => round2(Number(c) / 100);
const dayOf = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? today() : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d); };
const fmtCpf = (c) => (c && /^\d{11}$/.test(c) ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c || null);

export const DEFAULTS = { member_fees: true, fiado_due_days: 30, account_id: null, company_id: null };
export const settingsOf = (key) => ({ ...DEFAULTS, ...(key.settings || {}) });

async function companyFor(db, s) {
  if (s.company_id) { const c = await db.one('select id from companies where id=$1 and active', [s.company_id]); if (c) return c.id; }
  const c = await db.one('select id from companies where active order by created_at limit 1');
  if (!c) throw new HttpError(409, 'Nenhuma empresa ativa no CIFREN.');
  return c.id;
}
async function category(db, name, group) {
  const c = await db.one("select id from categories where lower(name)=lower($1) and type='receita' and active limit 1", [name]);
  if (c) return c.id;
  const parent = await db.one("select id from categories where name='Vendas' and type='receita' and parent_id is null limit 1");
  return (await db.one("insert into categories (org_id, name, type, parent_id, dre_group) values ($1,$2,'receita',$3,$4) returning id", [db.orgId, name, parent?.id || null, group])).id;
}
/** Conta onde entra o dinheiro recebido no RUSTEN (a escolhida na integração, ou "RUSTEN (recebimentos)" criada sozinha). */
async function cashAccount(db, s, companyId) {
  if (s.account_id) { const a = await db.one('select id from bank_accounts where id=$1 and active and company_id=$2', [s.account_id, companyId]); if (a) return a.id; }
  const a = await db.one("select id from bank_accounts where company_id=$1 and active and name='RUSTEN (recebimentos)' limit 1", [companyId]);
  if (a) return a.id;
  return (await db.one("insert into bank_accounts (org_id, company_id, name, type, opening_balance, opening_date) values ($1,$2,'RUSTEN (recebimentos)','caixa',0,'2000-01-01') returning id", [db.orgId, companyId])).id;
}

// ---------------- associados ----------------
export async function upsertMember(db, key, it) {
  const s = settingsOf(key);
  const cpf = it.cpf && /^\d{11}$/.test(it.cpf) ? it.cpf : null;
  const phone = it.phone ? normPhone(it.phone) : null;
  let m = await db.one('select * from members where source=$1 and external_id=$2 for update', [SRC, it.external_id]);
  // mesmo CPF já cadastrado à mão no CIFREN: liga em vez de duplicar
  if (!m && cpf) {
    m = await db.one("select * from members where external_id is null and regexp_replace(coalesce(document,''),'\\D','','g')=$1 limit 1 for update", [cpf]);
    if (m) await db.query('update members set source=$2, external_id=$3, updated_at=now() where id=$1', [m.id, SRC, it.external_id]);
  }
  if (!m) {
    if (!it.active) return { result: 'unchanged', member_id: null };
    const companyId = await companyFor(db, s);
    const cp = await db.one("insert into counterparties (org_id, kind, name, document, email, phone, notes) values ($1,'cliente',$2,$3,$4,$5,'Associado (vindo do RUSTEN)') returning id",
      [db.orgId, it.name, fmtCpf(cpf), it.email || null, phone ? fmtPhone(phone) : null]);
    const r = await db.one(`insert into members (org_id, company_id, counterparty_id, name, document, email, whatsapp, monthly_fee, due_day, start_month, category_id,
        notes, source, external_id, charge_fees) values ($1,$2,$3,$4,$5,$6,$7,null,10,$8,$9,'Cadastrado automaticamente pelo RUSTEN (etiqueta Associado).',$10,$11,$12) returning *`,
    [db.orgId, companyId, cp.id, it.name, fmtCpf(cpf), it.email || null, phone, `${today().slice(0, 7)}-01`, await feeCategory(db), SRC, it.external_id, !!s.member_fees]);
    await generateFor(db, r);
    return { result: 'created', member_id: r.id };
  }
  const changes = [];
  const next = { name: it.name || m.name, document: fmtCpf(cpf) || m.document, email: it.email || m.email, whatsapp: phone || m.whatsapp };
  for (const k of Object.keys(next)) if ((next[k] || null) !== (m[k] || null)) changes.push(k);
  let status = m.status; let result = 'unchanged';
  if (!it.active && m.status === 'ativo') { status = 'suspenso'; result = 'suspended'; }
  if (it.active && m.status === 'suspenso') { status = 'ativo'; result = 'reactivated'; }
  if (changes.length || status !== m.status) {
    await db.query('update members set name=$2, document=$3, email=$4, whatsapp=$5, status=$6, updated_at=now() where id=$1', [m.id, next.name, next.document, next.email, next.whatsapp, status]);
    if (m.counterparty_id && changes.length) await db.query('update counterparties set name=$2, document=$3, email=$4, phone=$5 where id=$1', [m.counterparty_id, next.name, next.document, next.email, next.whatsapp ? fmtPhone(next.whatsapp) : null]);
    if (result === 'unchanged') result = 'updated';
    if (status === 'ativo') await generateFor(db, { ...m, ...next, status });
  }
  return { result, member_id: m.id };
}

// ---------------- conta (fiado e crédito) ----------------
async function newReceivable(db, m, { description, amount, due, competence, externalId, categoryId }) {
  return db.one(`insert into titles (org_id, company_id, kind, description, counterparty_id, category_id, competence_date, due_date, amount, source, external_id, member_id, notes)
      values ($1,$2,'receber',$3,$4,$5,$6,$7,$8,'rusten',$9,$10,'Lançado pelo RUSTEN (conta do cliente).') returning *`,
  [db.orgId, m.company_id, description.slice(0, 200), m.counterparty_id, categoryId, competence, due, amount, externalId, m.id]);
}
async function settle(db, t, accountId, amount, paidAt, note) {
  const s = await db.one(`insert into settlements (org_id, title_id, account_id, paid_at, amount, interest, fine, discount, method, notes, origin)
      values ($1,$2,$3,$4,$5,0,0,0,'outro',$6,'integracao') returning id`, [db.orgId, t.id, accountId, paidAt > today() ? today() : paidAt, amount, note]);
  await refreshStatus(db, t.id);
  return s.id;
}
/** Contas de fiado em aberto do associado (as mais antigas primeiro). */
const openFiado = (db, memberId) => db.all(`select t.*, round(t.amount - ${PAID},2) as open from titles t
    where t.member_id=$1 and t.source='rusten' and t.external_id like 'acc:%' and t.status in ('aberto','parcial') order by t.due_date, t.created_at for update`, [memberId]);
/** Reduz o débito sem dinheiro (perdão, estorno de fiado): diminui o valor das contas em aberto; sem pagamento nenhum, cancela. */
async function forgive(db, titles, value, reason) {
  let rest = toCents(value);
  for (const t of titles) {
    if (rest <= 0) break;
    const open = toCents(t.open); if (open <= 0) continue;
    const take = Math.min(open, rest); rest -= take;
    const paid = toCents(t.amount) - open;
    if (paid === 0 && take === open) await db.query("update titles set status='cancelado', cancel_reason=$2, cancelled_at=now(), updated_at=now(), version=version+1 where id=$1", [t.id, reason]);
    else { await db.query('update titles set amount=$2, updated_at=now(), version=version+1 where id=$1', [t.id, fromCents(toCents(t.amount) - take)]); await refreshStatus(db, t.id); }
  }
  return fromCents(rest);
}

export async function applyEntry(db, key, it) {
  const s = settingsOf(key);
  if (await db.one('select 1 from member_account where source=$1 and external_id=$2', [SRC, it.external_id])) return { result: 'duplicate' };
  const m = await db.one('select * from members where source=$1 and external_id=$2 for update', [SRC, it.customer_external_id]);
  if (!m) return { result: 'error', error: { code: 'member_not_linked', message: 'Envie o associado antes da conta.' } };
  const amount = cents(it.amount_cents); const abs = Math.abs(amount);
  const day = dayOf(it.created_at);
  const reason = (it.reason || '').slice(0, 200);
  let titleId = null; let settlements = [];
  const fiadoCat = () => category(db, 'Consumo no fiado (RUSTEN)', 'receita_bruta');
  // saldo da conta antes deste lançamento (positivo = crédito do cliente)
  const before = Number((await db.one('select coalesce(sum(amount),0) as b from member_account where member_id=$1', [m.id])).b);
  // débito novo: a parte coberta pelo crédito do cliente já foi recebida (no crédito); só o que passa vira conta a receber
  const addDebt = async (label, value = abs) => {
    const debt = fromCents(toCents(value) - Math.min(toCents(value), Math.max(0, toCents(before))));
    if (debt <= 0) return;
    const t = await newReceivable(db, m, { description: `${label} — ${m.name}${reason ? ` (${reason})` : ''}`, amount: debt, due: new Date(Date.parse(`${day}T12:00:00Z`) + Number(s.fiado_due_days || 0) * 86400000).toISOString().slice(0, 10),
      competence: `${day.slice(0, 7)}-01`, externalId: `acc:${it.external_id}`, categoryId: await fiadoCat() });
    titleId = t.id;
  };
  const addCredit = async (value, label) => {
    const acc = await cashAccount(db, s, m.company_id);
    const t = await newReceivable(db, m, { description: `${label} — ${m.name}`, amount: value, due: day, competence: `${day.slice(0, 7)}-01`,
      externalId: `cred:${it.external_id}`, categoryId: await category(db, 'Crédito antecipado de clientes (RUSTEN)', 'outras_receitas') });
    titleId = t.id; settlements.push(await settle(db, t, acc, value, day, 'Crédito recebido no RUSTEN'));
  };
  const pay = async (value, excessLabel = 'Pagamento acima do fiado (vira crédito)') => {
    const acc = await cashAccount(db, s, m.company_id);
    let rest = toCents(value);
    for (const t of await openFiado(db, m.id)) {
      if (rest <= 0) break;
      const take = Math.min(toCents(t.open), rest); if (take <= 0) continue;
      settlements.push(await settle(db, t, acc, fromCents(take), day, 'Pagamento de fiado recebido no RUSTEN')); rest -= take;
    }
    if (rest > 0) await addCredit(fromCents(rest), excessLabel);
  };

  switch (it.kind) {
    case 'fiado': if (amount < 0) await addDebt('Fiado RUSTEN'); break;
    case 'pagamento_fiado': if (amount > 0) await pay(abs); break;
    // crédito com fiado em aberto quita o fiado (como no RUSTEN, que soma tudo num saldo só); a sobra fica como crédito
    case 'credito': if (amount > 0) await pay(abs, 'Crédito antecipado RUSTEN'); break;
    case 'uso_credito': break; // o dinheiro já entrou no crédito; só o saldo muda
    case 'ajuste':
      if (amount < 0) await addDebt('Ajuste de débito RUSTEN');
      else await forgive(db, await openFiado(db, m.id), abs, `Ajuste no RUSTEN${reason ? `: ${reason}` : ''}`);
      break;
    case 'estorno': {
      const orig = it.reverses_external_id ? await db.one('select * from member_account where source=$1 and external_id=$2', [SRC, it.reverses_external_id]) : null;
      if (!orig) break; // estorno de lançamento que não veio para cá: só registra no espelho
      for (const sid of orig.settlement_ids || []) {
        const st = await db.one('select title_id, reversed_at from settlements where id=$1 for update', [sid]);
        if (st && !st.reversed_at) { await db.query("update settlements set reversed_at=now(), reverse_reason='Estornado no RUSTEN' where id=$1", [sid]); await refreshStatus(db, st.title_id); }
      }
      // crédito estornado (ou a sobra de pagamento que virou crédito): a conta "recebida" some
      if (orig.title_id && ['credito', 'pagamento_fiado'].includes(orig.kind)) {
        await db.query("update titles set status='cancelado', cancel_reason='Estornado no RUSTEN', cancelled_at=now(), updated_at=now(), version=version+1 where id=$1 and external_id like 'cred:%'", [orig.title_id]);
      }
      if (orig.title_id && (orig.kind === 'fiado' || (orig.kind === 'ajuste' && Number(orig.amount) < 0))) {
        const t = await db.one(`select t.*, round(t.amount - ${PAID},2) as open from titles t where t.id=$1 for update`, [orig.title_id]);
        if (t && t.status !== 'cancelado') await forgive(db, [t], Number(t.open), 'Estornado no RUSTEN');
      }
      if (orig.kind === 'ajuste' && Number(orig.amount) > 0) await addDebt('Estorno de ajuste RUSTEN');
      break;
    }
    default: return { result: 'error', error: { code: 'invalid', message: 'Tipo de lançamento desconhecido.' } };
  }
  // pagamentos que o RUSTEN mandou não voltam para ele
  await db.query(`insert into member_account (org_id, member_id, source, external_id, kind, amount, reverses_external_id, reason, occurred_at, title_id, settlement_ids)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
  [db.orgId, m.id, SRC, it.external_id, it.kind, amount, it.reverses_external_id || null, reason || null, it.created_at || new Date().toISOString(), titleId, settlements]);
  await rebalance(db, m, fromCents(toCents(before) + toCents(amount)), it.external_id, day, s);
  return { result: 'applied' };
}

/**
 * Garante a regra de ouro: o fiado em aberto no CIFREN é igual ao débito do cliente no RUSTEN (que soma tudo num saldo só).
 * Sobrou conta em aberto (ex.: crédito cobriu um fiado estornado) → reduz as mais antigas; faltou → conta "Ajuste de saldo RUSTEN".
 */
async function rebalance(db, m, balance, ref, day, s) {
  const target = Math.max(0, -toCents(balance));
  const open = await openFiado(db, m.id);
  const total = open.reduce((a, t) => a + toCents(t.open), 0);
  if (total > target) await forgive(db, open, fromCents(total - target), 'Acerto com o saldo do RUSTEN (crédito do cliente)');
  else if (total < target) {
    await newReceivable(db, m, { description: `Ajuste de saldo RUSTEN — ${m.name}`, amount: fromCents(target - total),
      due: new Date(Date.parse(`${day}T12:00:00Z`) + Number(s.fiado_due_days || 0) * 86400000).toISOString().slice(0, 10), competence: `${day.slice(0, 7)}-01`,
      externalId: `acc:ajuste:${ref}`, categoryId: await category(db, 'Consumo no fiado (RUSTEN)', 'receita_bruta') });
  }
  await syncCreditPayable(db, m, balance, day);
}

/**
 * Crédito do associado em Contas a pagar: uma conta só por associado ("Crédito do associado (RUSTEN) — nome") com o saldo de crédito
 * que ele tem no RUSTEN. Diminui quando ele consome; some quando zera. Não é dinheiro a sair: é o que a empresa deve em consumo.
 */
export async function syncCreditPayable(db, m, balance, day = today()) {
  const credit = Math.max(0, toCents(balance));
  const ext = `credito:${m.id}`;
  const t = await db.one("select * from titles where source='rusten' and external_id=$1 for update", [ext]);
  const due = new Date(Date.parse(`${day}T12:00:00Z`) + 365 * 86400000).toISOString().slice(0, 10);
  if (!t) {
    if (!credit) return;
    const cat = await db.one("select id from categories where lower(name)=lower('Crédito de associados (RUSTEN)') and type='despesa' and active limit 1")
      || await db.one("insert into categories (org_id, name, type, dre_group) values ($1,'Crédito de associados (RUSTEN)','despesa',null) returning id", [db.orgId]);
    await db.query(`insert into titles (org_id, company_id, kind, description, counterparty_id, category_id, competence_date, due_date, amount, source, external_id, member_id, notes)
        values ($1,$2,'pagar',$3,$4,$5,$6,$7,$8,'rusten',$9,$10,$11)`,
    [db.orgId, m.company_id, `Crédito do associado (RUSTEN) — ${m.name}`.slice(0, 200), m.counterparty_id, cat.id, `${day.slice(0, 7)}-01`, due, fromCents(credit), ext, m.id,
      'Saldo de crédito que o associado tem no RUSTEN (pagou antes de consumir). Não é um pagamento a fazer: diminui sozinho quando ele consome e some quando zera. Para devolver dinheiro, lance no RUSTEN.']);
    return;
  }
  if (!credit) {
    if (t.status !== 'cancelado') await db.query("update titles set status='cancelado', cancel_reason='Crédito do associado zerado no RUSTEN', cancelled_at=now(), updated_at=now(), version=version+1 where id=$1", [t.id]);
    return;
  }
  if (toCents(t.amount) !== credit || t.status !== 'aberto') {
    await db.query("update titles set amount=$2, status='aberto', cancel_reason=null, cancelled_at=null, due_date=$3, updated_at=now(), version=version+1 where id=$1", [t.id, fromCents(credit), due]);
  }
}

/** Saldo da conta espelhada (positivo = crédito do cliente; negativo = fiado). */
export async function accountOf(db, memberId) {
  const r = await db.one('select coalesce(sum(amount),0) as balance, count(*)::int as n, max(occurred_at) as last from member_account where member_id=$1', [memberId]);
  const entries = await db.all('select external_id, kind, amount, reason, occurred_at, title_id from member_account where member_id=$1 order by occurred_at desc, created_at desc limit 100', [memberId]);
  const b = Number(r.balance);
  return { balance: b, credit: Math.max(0, b), debt: Math.max(0, -b), entries: entries.map((e) => ({ ...e, amount: Number(e.amount) })), last: r.last };
}

/** Pagamento/estorno feito NO CIFREN numa conta de fiado do RUSTEN: avisa o RUSTEN (ele busca em /payments). */
export async function feedFromSettlement(db, settlementId, type) {
  const s = await db.one(`select s.id, s.amount, s.paid_at, s.origin, t.source, t.external_id, t.member_id, m.external_id as cust
      from settlements s join titles t on t.id=s.title_id left join members m on m.id=t.member_id where s.id=$1`, [settlementId]);
  if (!s || s.source !== 'rusten' || !String(s.external_id || '').startsWith('acc:') || s.origin === 'integracao' || !s.cust) return;
  const f = await db.one(`insert into integration_feed (org_id, system, type, member_id, customer_external_id, amount, paid_at, settlement_id, note)
      values ($1,'rusten',$2,$3,$4,$5,$6,$7,$8) returning id`,
  [db.orgId, type, s.member_id, s.cust, s.amount, s.paid_at, s.id, type === 'pagamento' ? 'Recebido no CIFREN' : 'Estorno de recebimento no CIFREN']);
  // o espelho da conta já reflete o que o RUSTEN vai lançar
  await db.query(`insert into member_account (org_id, member_id, source, external_id, kind, amount, reason, occurred_at, settlement_ids)
      values ($1,$2,'rusten',$3,$4,$5,$6,now(),$7)`,
  [db.orgId, s.member_id, `cifren:${f.id}`, type === 'pagamento' ? 'pagamento_fiado' : 'estorno', type === 'pagamento' ? Number(s.amount) : -Number(s.amount),
    type === 'pagamento' ? 'Recebido no CIFREN' : 'Estorno de recebimento no CIFREN', [s.id]]);
  const mm = await db.one('select * from members where id=$1', [s.member_id]);
  const b = Number((await db.one('select coalesce(sum(amount),0) as b from member_account where member_id=$1', [s.member_id])).b);
  if (mm) await syncCreditPayable(db, mm, b);
}

// ---------------- pagar com o crédito do RUSTEN ----------------
/** Associado ligado ao RUSTEN (com a integração ativa) e o crédito que ele tem lá agora. */
export async function rustenCredit(db, memberId) {
  if (!memberId) return null;
  const m = await db.one("select * from members where id=$1 and source='rusten'", [memberId]);
  if (!m) return null;
  const key = await db.one("select * from integration_keys where org_id=$1 and system='rusten' and revoked_at is null order by created_at desc limit 1", [db.orgId]);
  if (!key) return null;
  const { credit } = await accountOf(db, m.id);
  return { member: m, key, credit };
}

async function offsetCategory(db) {
  const c = await db.one("select id from categories where lower(name)=lower('Uso de crédito de associados (RUSTEN)') and type='despesa' and active limit 1");
  if (c) return c.id;
  return (await db.one("insert into categories (org_id, name, type, dre_group) values ($1,'Uso de crédito de associados (RUSTEN)','despesa','outras_receitas') returning id", [db.orgId])).id;
}

/** Espelho + retorno ao RUSTEN de um uso (ou estorno de uso) de crédito feito aqui. */
async function feedCredit(db, m, settlementId, type, amount, paidAt, note) {
  const f = await db.one(`insert into integration_feed (org_id, system, type, member_id, customer_external_id, amount, paid_at, settlement_id, note)
      values ($1,'rusten',$2,$3,$4,$5,$6,$7,$8) returning id`, [db.orgId, type, m.id, m.external_id, amount, paidAt, settlementId, note.slice(0, 300)]);
  await db.query(`insert into member_account (org_id, member_id, source, external_id, kind, amount, reason, occurred_at, settlement_ids)
      values ($1,$2,'rusten',$3,$4,$5,$6,now(),$7)`,
  [db.orgId, m.id, `cifren:${f.id}`, type === 'uso_credito' ? 'uso_credito' : 'estorno', type === 'uso_credito' ? -amount : amount, note.slice(0, 200), [settlementId]]);
  const b = Number((await db.one('select coalesce(sum(amount),0) as b from member_account where member_id=$1', [m.id])).b);
  await syncCreditPayable(db, m, b);
}

/**
 * Baixa de uma conta a receber do associado com o crédito dele no RUSTEN.
 * O dinheiro já entrou quando o crédito foi lançado no RUSTEN; por isso a baixa entra na conta do RUSTEN e, na mesma conta e dia,
 * sai o "uso do crédito" (saldo do banco não muda; no DRE o uso abate a receita do crédito antecipado e a mensalidade fica como receita).
 */
export async function payWithCredit(db, req, t, d) {
  if (t.kind !== 'receber') throw new HttpError(400, 'O crédito do RUSTEN só paga contas a receber do associado.');
  const rc = await rustenCredit(db, t.member_id);
  if (!rc) throw new HttpError(409, 'Esta conta não é de um associado ligado ao RUSTEN (ou a integração está desconectada).');
  if (toCents(d.interest) || toCents(d.fine) || toCents(d.discount)) throw new HttpError(400, 'Com o crédito do RUSTEN, pague só o valor da conta (sem juros, multa ou desconto).');
  if (d.paid_at > today()) throw new HttpError(400, 'A data da baixa não pode ser futura.');
  const paid = (await db.one('select coalesce(sum(amount),0) as v from settlements where title_id=$1 and reversed_at is null', [t.id])).v;
  const open = toCents(t.amount) - toCents(paid);
  if (toCents(d.amount) > open) throw new HttpError(400, `O valor baixado passa do saldo em aberto (R$ ${fromCents(open).toFixed(2)}).`);
  if (toCents(d.amount) > toCents(rc.credit)) throw new HttpError(409, `${rc.member.name} tem só R$ ${rc.credit.toFixed(2).replace('.', ',')} de crédito no RUSTEN.`, { code: 'CREDIT_LOW' });
  const acc = await cashAccount(db, settingsOf(rc.key), t.company_id);
  const note = `Pago com o crédito do associado no RUSTEN${d.notes ? ` — ${d.notes}` : ''}`;
  const s = await db.one(`insert into settlements (org_id, title_id, account_id, paid_at, amount, interest, fine, discount, method, notes, created_by, origin)
      values ($1,$2,$3,$4,$5,0,0,0,'credito_rusten',$6,$7,'manual') returning id`, [db.orgId, t.id, acc, d.paid_at, d.amount, note.slice(0, 500), req?.user?.id || null]);
  const status = await refreshStatus(db, t.id);
  // saída que equilibra o caixa: o crédito usado
  const off = await db.one(`insert into titles (org_id, company_id, kind, description, counterparty_id, category_id, competence_date, due_date, amount, source, external_id, member_id, notes)
      values ($1,$2,'pagar',$3,$4,$5,$6,$7,$8,'rusten',$9,$10,$11) returning id`,
  [db.orgId, t.company_id, `Uso do crédito do associado (RUSTEN) — ${t.description}`.slice(0, 200), rc.member.counterparty_id, await offsetCategory(db), `${d.paid_at.slice(0, 7)}-01`, d.paid_at, d.amount,
    `usocred:${s.id}`, rc.member.id, 'Crédito que o associado já tinha pago no RUSTEN, usado para quitar a conta. Não é dinheiro saindo do banco: equilibra a entrada da conta paga com o crédito.']);
  await db.query(`insert into settlements (org_id, title_id, account_id, paid_at, amount, interest, fine, discount, method, notes, created_by, origin)
      values ($1,$2,$3,$4,$5,0,0,0,'credito_rusten','Uso do crédito do associado no RUSTEN',$6,'integracao')`, [db.orgId, off.id, acc, d.paid_at, d.amount, req?.user?.id || null]);
  await refreshStatus(db, off.id);
  await feedCredit(db, rc.member, s.id, 'uso_credito', Number(d.amount), d.paid_at, `Pago no CIFREN: ${t.description}`);
  await audit(db, { actor: req?.user ? { id: req.user.id, name: req.user.name } : { id: null, name: 'Sistema' }, req, action: 'titulo.baixado', entity: 'title', entityId: t.id,
    summary: `${t.description}: R$ ${Number(d.amount).toFixed(2)} pago com o crédito do RUSTEN (${status})`, data: { settlement_id: s.id, method: 'credito_rusten' } });
  return { ok: true, status, settlement_id: s.id };
}

/** Estorno de uma baixa paga com crédito: estorna a saída que equilibrava, cancela essa conta e devolve o crédito no RUSTEN. */
export async function reverseCreditUse(db, settlementId, reason) {
  const off = await db.one("select * from titles where source='rusten' and external_id=$1 for update", [`usocred:${settlementId}`]);
  if (off) {
    await db.query("update settlements set reversed_at=now(), reverse_reason=$2 where title_id=$1 and reversed_at is null", [off.id, reason]);
    await db.query("update titles set status='cancelado', cancel_reason=$2, cancelled_at=now(), updated_at=now(), version=version+1 where id=$1", [off.id, `Estorno: ${reason}`.slice(0, 300)]);
  }
  const s = await db.one('select s.amount, s.paid_at, t.member_id, t.description from settlements s join titles t on t.id=s.title_id where s.id=$1', [settlementId]);
  const m = s?.member_id ? await db.one("select * from members where id=$1 and source='rusten'", [s.member_id]) : null;
  if (m) await feedCredit(db, m, settlementId, 'estorno_uso_credito', Number(s.amount), today(), `Estorno no CIFREN: ${s.description}`);
}
