-- CIFREN · 008 — Visão por usuário (ajustes de permissão sobre o perfil) e módulo de Finanças pessoais
-- (espaços pessoais compartilháveis entre usuários, fora do isolamento por organização).

-- ---------------- visão por usuário: ajustes sobre o perfil ----------------
-- perm_add: libera permissões além do perfil; perm_remove: bloqueia permissões do perfil. O efetivo é (perfil ∪ add) − remove.
alter table memberships add column if not exists perm_add text[] not null default '{}';
alter table memberships add column if not exists perm_remove text[] not null default '{}';

-- ---------------- finanças pessoais (por usuário, não por organização) ----------------
-- Estas tabelas NÃO usam app.org_id. O isolamento é por participação no espaço (personal_space_members),
-- aplicado na API e reforçado por RLS via a função personal_is_member (security definer, não recursiva).
create table if not exists personal_spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  color text,
  created_by uuid not null references users(id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists personal_space_members (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references personal_spaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'editor' check (role in ('dono','editor','visualizador')),
  pending boolean not null default false,
  invited_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  unique (space_id, user_id)
);
create index if not exists psm_user_idx on personal_space_members(user_id) where not pending;
create index if not exists psm_space_idx on personal_space_members(space_id);

-- convites por e-mail (a pessoa pode ainda não ter conta; aceita quando entrar). Sem RLS: dado não-financeiro, protegido na API.
create table if not exists personal_invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references personal_spaces(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 200),
  role text not null default 'editor' check (role in ('editor','visualizador')),
  token_hash text not null,
  invited_by uuid references users(id) on delete set null,
  invited_by_name text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  unique (space_id, email)
);
create index if not exists pinv_email_idx on personal_invites(lower(email)) where accepted_at is null;

create table if not exists personal_accounts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references personal_spaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'conta' check (kind in ('conta','carteira','cartao','poupanca','investimento')),
  opening_balance_cents bigint not null default 0,
  credit_limit_cents bigint,
  closing_day int check (closing_day between 1 and 31),
  due_day int check (due_day between 1 and 31),
  color text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists pacc_space_idx on personal_accounts(space_id);

create table if not exists personal_categories (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references personal_spaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  type text not null check (type in ('receita','despesa')),
  parent_id uuid references personal_categories(id) on delete set null,
  color text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists pcat_space_idx on personal_categories(space_id);

create table if not exists personal_transactions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references personal_spaces(id) on delete cascade,
  account_id uuid not null references personal_accounts(id) on delete restrict,
  transfer_account_id uuid references personal_accounts(id) on delete restrict,
  type text not null check (type in ('receita','despesa','transferencia')),
  amount_cents bigint not null check (amount_cents > 0),
  date date not null,
  category_id uuid references personal_categories(id) on delete set null,
  description text check (description is null or char_length(description) <= 200),
  notes text check (notes is null or char_length(notes) <= 1000),
  paid boolean not null default true,
  goal_id uuid,
  recurring_id uuid,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (type <> 'transferencia' or (transfer_account_id is not null and transfer_account_id <> account_id)),
  check (type = 'transferencia' or transfer_account_id is null)
);
create index if not exists ptx_space_date_idx on personal_transactions(space_id, date desc, id desc);
create index if not exists ptx_account_idx on personal_transactions(account_id);

create table if not exists personal_budgets (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references personal_spaces(id) on delete cascade,
  category_id uuid not null references personal_categories(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$' or month = 'sempre'),
  amount_cents bigint not null check (amount_cents >= 0),
  unique (space_id, category_id, month)
);
create index if not exists pbud_space_idx on personal_budgets(space_id);

create table if not exists personal_goals (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references personal_spaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  target_cents bigint not null check (target_cents > 0),
  saved_cents bigint not null default 0,
  due_date date,
  account_id uuid references personal_accounts(id) on delete set null,
  color text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists pgoal_space_idx on personal_goals(space_id);

create table if not exists personal_recurring (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references personal_spaces(id) on delete cascade,
  account_id uuid not null references personal_accounts(id) on delete cascade,
  type text not null check (type in ('receita','despesa')),
  amount_cents bigint not null check (amount_cents > 0),
  category_id uuid references personal_categories(id) on delete set null,
  description text check (description is null or char_length(description) <= 200),
  interval text not null check (interval in ('semanal','quinzenal','mensal','bimestral','trimestral','semestral','anual')),
  next_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists prec_space_idx on personal_recurring(space_id);

-- auditoria dos espaços pessoais (somente inclusão, por espaço)
create table if not exists personal_audit (
  id bigint generated always as identity primary key,
  space_id uuid not null references personal_spaces(id) on delete cascade,
  user_id uuid,
  user_name text,
  action text not null,
  summary text,
  at timestamptz not null default now()
);
create index if not exists paudit_space_idx on personal_audit(space_id, id desc);

-- quem é membro ativo de um espaço (security definer: as policies usam sem recursão de RLS)
create or replace function personal_is_member(sid uuid) returns boolean language sql security definer stable as $$
  select exists (
    select 1 from personal_space_members
     where space_id = sid and not pending
       and user_id = nullif(current_setting('app.user_id', true), '')::uuid
  );
$$;
create or replace function personal_role(sid uuid) returns text language sql security definer stable as $$
  select role from personal_space_members
   where space_id = sid and not pending
     and user_id = nullif(current_setting('app.user_id', true), '')::uuid;
$$;
-- convidado (ainda não é membro ativo): pode enxergar só o NOME do espaço (a tabela personal_spaces), nunca o financeiro.
create or replace function personal_is_invited(sid uuid) returns boolean language sql security definer stable as $$
  select exists (select 1 from personal_space_members
                  where space_id = sid and pending
                    and user_id = nullif(current_setting('app.user_id', true), '')::uuid)
      or exists (select 1 from personal_invites
                  where space_id = sid and accepted_at is null and expires_at > now()
                    and lower(email) = nullif(current_setting('app.user_email', true), ''));
$$;

do $$
declare t text;
begin
  foreach t in array array['personal_spaces','personal_accounts','personal_categories','personal_transactions',
                           'personal_budgets','personal_goals','personal_recurring','personal_audit'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists personal_isolation on %I', t);
  end loop;
  -- espaços: visível/alterável a quem é membro; a criação é permitida ao próprio dono (a associação é criada logo depois, na mesma transação)
  execute $p$create policy personal_isolation on personal_spaces using (personal_is_member(id) or personal_is_invited(id)) with check (personal_is_member(id))$p$;
  execute $p$create policy personal_spaces_insert on personal_spaces for insert with check (created_by = nullif(current_setting('app.user_id', true), '')::uuid)$p$;
  -- demais tabelas: pela coluna space_id
  foreach t in array array['personal_accounts','personal_categories','personal_transactions',
                           'personal_budgets','personal_goals','personal_recurring','personal_audit'] loop
    execute format($p$create policy personal_isolation on %I using (personal_is_member(space_id)) with check (personal_is_member(space_id))$p$, t);
  end loop;
  -- personal_space_members e personal_invites NÃO têm RLS (como a tabela memberships das organizações): não guardam
  -- dado financeiro e são a própria base do controle de acesso. A API sempre filtra por espaço/usuário, e o acesso a
  -- qualquer dado financeiro passa por personal_is_member (a função lê os membros sem recursão de RLS).
end $$;

-- auditoria pessoal é somente inclusão
create or replace function personal_audit_imutavel() returns trigger language plpgsql as $$
begin raise exception 'auditoria pessoal é somente inclusão'; end $$;
drop trigger if exists personal_audit_no_change on personal_audit;
create trigger personal_audit_no_change before update or delete on personal_audit
  for each row execute function personal_audit_imutavel();
