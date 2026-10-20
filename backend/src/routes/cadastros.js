// Cadastros: clientes/fornecedores, categorias, centros de custo e contas (banco, caixa, cartão, aplicação).
import { Router } from 'express';
import { z } from 'zod';
import { orgTx } from '../db.js';
import { HttpError, parse, notFound, uuidParam, isUuid, likeEsc, today } from '../util.js';
import { need, assertCompany } from '../auth.js';
import { audit } from '../audit.js';

const actor = (req) => ({ id: req.user.id, name: req.user.name });
const optText = (max) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data inválida (use AAAA-MM-DD)');
const money = z.coerce.number().finite().refine((v) => Math.abs(v) < 1e13, 'valor fora do limite').transform((v) => Math.round(v * 100) / 100);

/**
 * CRUD simples com arquivamento (DELETE = active=false). `fields` = colunas graváveis; `entity` = nome na auditoria.
 */
function simpleCrud({ table, entity, label, schema, fields, list, cols }) {
  const r = Router();
  r.get('/', need('cadastros.visualizar', 'cadastros.gerenciar', 'financeiro.titulos.visualizar'), async (req, res) => {
    const items = await orgTx(req.orgId, (db) => list(db, req.query));
    res.json({ items });
  });
  r.post('/', need('cadastros.gerenciar'), async (req, res) => {
    const d = parse(schema, req.body);
    const keys = fields.filter((k) => d[k] !== undefined);
    const row = await orgTx(req.orgId, async (db) => {
      const x = await db.one(`insert into ${table} (org_id, ${keys.join(',')}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(',')}) returning ${cols}`,
        [req.orgId, ...keys.map((k) => d[k])]);
      await audit(db, { actor: actor(req), req, action: `${entity}.criado`, entity, entityId: x.id, summary: `${label} ${x.name}` });
      return x;
    });
    res.status(201).json(row);
  });
  r.put('/:id', need('cadastros.gerenciar'), async (req, res) => {
    const id = uuidParam(req.params.id);
    const d = parse(schema.partial().extend({ active: z.boolean().optional() }), req.body);
    const keys = [...fields, 'active'].filter((k) => d[k] !== undefined);
    if (!keys.length) throw new HttpError(400, 'Nada para alterar.');
    const row = await orgTx(req.orgId, async (db) => {
      const x = await db.one(`update ${table} set ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')} where id=$1 returning ${cols}`, [id, ...keys.map((k) => d[k])]);
      if (!x) throw notFound();
      await audit(db, { actor: actor(req), req, action: `${entity}.alterado`, entity, entityId: id, summary: `${label} ${x.name}`, data: d });
      return x;
    });
    res.json(row);
  });
  r.delete('/:id', need('cadastros.gerenciar'), async (req, res) => {
    const id = uuidParam(req.params.id);
    await orgTx(req.orgId, async (db) => {
      const x = await db.one(`update ${table} set active=false where id=$1 returning name`, [id]);
      if (!x) throw notFound();
      await audit(db, { actor: actor(req), req, action: `${entity}.arquivado`, entity, entityId: id, summary: `${label} ${x.name} arquivado` });
    });
    res.json({ ok: true });
  });
  return r;
}

const activeFilter = (v) => (v === 'false' ? 'not active' : v === 'all' || v === 'todos' ? 'true' : 'active');

// ---------------- clientes e fornecedores ----------------
export const counterparties = simpleCrud({
  table: 'counterparties', entity: 'counterparty', label: 'Cadastro',
  cols: 'id, kind, name, document, email, phone, notes, active',
  fields: ['kind', 'name', 'document', 'email', 'phone', 'notes'],
  schema: z.object({
    kind: z.enum(['cliente', 'fornecedor', 'ambos']).default('ambos'),
    name: z.string().trim().min(1, 'informe o nome').max(160),
    document: optText(20), email: optText(200).refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'e-mail inválido'),
    phone: optText(30), notes: optText(1000),
  }),
  list: (db, qs) => {
    const p = []; const w = [activeFilter(qs.active)];
    if (qs.q) { p.push(`%${likeEsc(String(qs.q).slice(0, 80))}%`); w.push(`(name ilike $${p.length} or document ilike $${p.length} or email ilike $${p.length})`); }
    if (['cliente', 'fornecedor'].includes(qs.kind)) { p.push(qs.kind); w.push(`kind in ($${p.length}, 'ambos')`); }
    return db.all(`select id, kind, name, document, email, phone, notes, active from counterparties where ${w.join(' and ')} order by lower(name) limit 500`, p);
  },
});

// ---------------- categorias ----------------
const categorySchema = z.object({ name: z.string().trim().min(1, 'informe o nome').max(80), type: z.enum(['receita', 'despesa']),
  parent_id: z.string().optional().nullable().refine((v) => !v || isUuid(v), 'categoria-mãe inválida').transform((v) => v || null) });
export const categories = simpleCrud({
  table: 'categories', entity: 'category', label: 'Categoria',
  cols: 'id, name, type, parent_id, active', fields: ['name', 'type', 'parent_id'], schema: categorySchema,
  list: (db, qs) => db.all(`select id, name, type, parent_id, active from categories where ${activeFilter(qs.active)} order by type, lower(name)`),
});
// a categoria-mãe precisa existir na organização e ter o mesmo tipo (a RLS já esconde as de outras organizações)
const checkParent = async (req, _res, next) => {
  const pid = req.body?.parent_id;
  if (pid && isUuid(pid)) {
    const ok = await orgTx(req.orgId, (db) => db.one('select type from categories where id=$1', [pid]));
    if (!ok) throw new HttpError(400, 'Categoria-mãe não encontrada.');
    if (req.body.type && ok.type !== req.body.type) throw new HttpError(400, 'A categoria-mãe precisa ser do mesmo tipo (receita ou despesa).');
    if (req.params.id && req.params.id === pid) throw new HttpError(400, 'Uma categoria não pode ser mãe dela mesma.');
  }
  next();
};
export const categoriesRouter = Router();
categoriesRouter.post('/', checkParent);
categoriesRouter.put('/:id', checkParent);
categoriesRouter.use(categories);

// ---------------- centros de custo ----------------
export const costCenters = simpleCrud({
  table: 'cost_centers', entity: 'cost_center', label: 'Centro de custo',
  cols: 'id, name, active', fields: ['name'], schema: z.object({ name: z.string().trim().min(1, 'informe o nome').max(80) }),
  list: (db, qs) => db.all(`select id, name, active from cost_centers where ${activeFilter(qs.active)} order by lower(name)`),
});

// ---------------- contas ----------------
/** Saldo = saldo inicial + recebimentos − pagamentos (com juros/multa, menos desconto), baixas não estornadas. */
export const BALANCE_SQL = `a.opening_balance + coalesce((
    select sum(case when t.kind='receber' then 1 else -1 end * (s.amount + s.interest + s.fine - s.discount))
      from settlements s join titles t on t.id=s.title_id
     where s.account_id=a.id and s.reversed_at is null and s.paid_at >= a.opening_date), 0)`;
const ACCOUNT_COLS = `a.id, a.company_id, a.name, a.type, a.bank_name, a.agency, a.number, a.opening_balance, a.opening_date, a.active, round(${BALANCE_SQL}, 2) as balance`;

export const accounts = Router();
const accountSchema = z.object({
  company_id: z.string().refine(isUuid, 'empresa inválida'),
  name: z.string().trim().min(1, 'informe o nome').max(80),
  type: z.enum(['banco', 'caixa', 'cartao', 'aplicacao']).default('banco'),
  bank_name: optText(80), agency: optText(20), number: optText(30),
  opening_balance: money.optional(), opening_date: dateStr.optional(),
});
accounts.get('/', need('cadastros.visualizar', 'contas.gerenciar', 'financeiro.titulos.visualizar', 'financeiro.painel.visualizar'), async (req, res) => {
  const p = []; const w = [`a.${activeFilter(req.query.active)}`];
  if (req.companyScope) { p.push(req.companyScope); w.push(`a.company_id = any($${p.length}::uuid[])`); }
  if (isUuid(req.query.company_id)) { p.push(req.query.company_id); w.push(`a.company_id = $${p.length}`); }
  const items = await orgTx(req.orgId, (db) => db.all(`select ${ACCOUNT_COLS} from bank_accounts a where ${w.join(' and ')} order by a.type, lower(a.name)`, p));
  res.json({ items });
});
async function companyExists(db, id) {
  if (!(await db.one('select 1 from companies where id=$1 and active', [id]))) throw new HttpError(400, 'Empresa inválida.');
}
accounts.post('/', need('contas.gerenciar'), async (req, res) => {
  const d = parse(accountSchema, req.body);
  assertCompany(req, d.company_id);
  const row = await orgTx(req.orgId, async (db) => {
    await companyExists(db, d.company_id);
    const x = await db.one(`insert into bank_accounts (org_id, company_id, name, type, bank_name, agency, number, opening_balance, opening_date)
      values ($1,$2,$3,$4,$5,$6,$7,coalesce($8,0),coalesce($9::date,$10::date)) returning id`,
    [req.orgId, d.company_id, d.name, d.type, d.bank_name, d.agency, d.number, d.opening_balance ?? null, d.opening_date ?? null, today()]);
    await audit(db, { actor: actor(req), req, action: 'conta.criada', entity: 'account', entityId: x.id, summary: `Conta ${d.name}`, data: { opening_balance: d.opening_balance ?? 0 } });
    return db.one(`select ${ACCOUNT_COLS} from bank_accounts a where a.id=$1`, [x.id]);
  });
  res.status(201).json(row);
});
accounts.put('/:id', need('contas.gerenciar'), async (req, res) => {
  const id = uuidParam(req.params.id);
  const d = parse(accountSchema.partial().extend({ active: z.boolean().optional() }), req.body);
  const row = await orgTx(req.orgId, async (db) => {
    const cur = await db.one('select company_id, name, opening_balance from bank_accounts where id=$1', [id]);
    if (!cur) throw notFound('Conta não encontrada.');
    assertCompany(req, cur.company_id);
    if (d.company_id && d.company_id !== cur.company_id) {
      assertCompany(req, d.company_id);
      await companyExists(db, d.company_id);
      if (await db.one('select 1 from settlements where account_id=$1 limit 1', [id])) throw new HttpError(409, 'Esta conta já tem movimentos: não é possível trocar a empresa.');
    }
    const keys = ['company_id', 'name', 'type', 'bank_name', 'agency', 'number', 'opening_balance', 'opening_date', 'active'].filter((k) => d[k] !== undefined);
    if (keys.length) await db.query(`update bank_accounts set ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')} where id=$1`, [id, ...keys.map((k) => d[k])]);
    await audit(db, { actor: actor(req), req, action: 'conta.alterada', entity: 'account', entityId: id, summary: `Conta ${d.name || cur.name}`,
      data: { ...d, ...(d.opening_balance !== undefined ? { saldo_inicial_antes: cur.opening_balance } : {}) } });
    return db.one(`select ${ACCOUNT_COLS} from bank_accounts a where a.id=$1`, [id]);
  });
  res.json(row);
});
accounts.delete('/:id', need('contas.gerenciar'), async (req, res) => {
  const id = uuidParam(req.params.id);
  await orgTx(req.orgId, async (db) => {
    const cur = await db.one('select company_id, name from bank_accounts where id=$1', [id]);
    if (!cur) throw notFound('Conta não encontrada.');
    assertCompany(req, cur.company_id);
    await db.query('update bank_accounts set active=false where id=$1', [id]);
    await audit(db, { actor: actor(req), req, action: 'conta.arquivada', entity: 'account', entityId: id, summary: `Conta ${cur.name} arquivada` });
  });
  res.json({ ok: true });
});
