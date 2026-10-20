-- CIFREN · Fase A — fundação: identidade, organizações, empresas, perfis, sessões, auditoria e financeiro base.
-- Isolamento: toda tabela de negócio tem org_id e RLS forçada (vale também para o dono das tabelas); a API define
-- app.org_id em cada transação. O papel do banco na VPS não é superusuário, então a RLS sempre se aplica.
-- gen_random_uuid() é nativo do PostgreSQL 13+ (sem extensão).

create table if not exists _secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

create table if not exists rate_limits (
  key text primary key,
  count int not null default 0,
  reset_at timestamptz not null
);

-- ---------------- identidade (sem RLS: usadas antes de existir uma organização na sessão) ----------------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 200),
  password_hash text not null,
  must_change_password boolean not null default false,
  mfa_enabled boolean not null default false,
  mfa_secret text,                 -- cifrado (secretbox)
  mfa_pending_secret text,         -- cifrado, durante a ativação
  recovery_codes text[] not null default '{}', -- sha256 dos códigos de recuperação
  auth_version int not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index if not exists users_email_uq on users (lower(email));

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  is_demo boolean not null default false,
  platform_access jsonb,
  platform_access_at timestamptz,
  platform_registered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  system boolean not null default false,
  permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (org_id, key)
);

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role_id uuid not null references roles(id),
  company_ids uuid[],               -- null = todas as empresas da organização
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  unique (org_id, user_id)
);
create index if not exists memberships_user_idx on memberships(user_id);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  org_id uuid references organizations(id) on delete set null,
  token_hash text not null unique,
  auth_version int not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ip text,
  user_agent text,
  revoked_at timestamptz
);
create index if not exists sessions_user_idx on sessions(user_id) where revoked_at is null;

create table if not exists login_challenges (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  attempts int not null default 0
);

-- ---------------- negócio (RLS forçada por organização) ----------------
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  trade_name text,
  document text,
  timezone text not null default 'America/Sao_Paulo',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists companies_org_idx on companies(org_id);

create table if not exists audit_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid,
  user_name text,
  action text not null,
  entity text not null,
  entity_id text,
  summary text,
  data jsonb,
  ip text,
  at timestamptz not null default now(),
  prev_hash text,
  hash text not null
);
create index if not exists audit_org_at_idx on audit_events(org_id, id desc);

create table if not exists counterparties (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null default 'ambos' check (kind in ('cliente','fornecedor','ambos')),
  name text not null check (char_length(name) between 1 and 160),
  document text,
  email text,
  phone text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists counterparties_org_idx on counterparties(org_id, lower(name));

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  type text not null check (type in ('receita','despesa')),
  parent_id uuid references categories(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists categories_org_idx on categories(org_id);

create table if not exists cost_centers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists bank_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  company_id uuid not null references companies(id),
  name text not null check (char_length(name) between 1 and 80),
  type text not null default 'banco' check (type in ('banco','caixa','cartao','aplicacao')),
  bank_name text,
  agency text,
  number text,
  opening_balance numeric(18,2) not null default 0,
  opening_date date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists bank_accounts_org_idx on bank_accounts(org_id);

create table if not exists titles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  company_id uuid not null references companies(id),
  kind text not null check (kind in ('pagar','receber')),
  description text not null check (char_length(description) between 1 and 200),
  counterparty_id uuid references counterparties(id),
  category_id uuid references categories(id),
  cost_center_id uuid references cost_centers(id),
  document_number text,
  issue_date date,
  competence_date date,
  due_date date not null,
  amount numeric(18,2) not null check (amount > 0),
  status text not null default 'aberto' check (status in ('aberto','parcial','pago','cancelado')),
  group_id uuid,
  installment int not null default 1,
  installments int not null default 1,
  notes text,
  cancel_reason text,
  cancelled_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1
);
create index if not exists titles_org_due_idx on titles(org_id, kind, due_date, id);
create index if not exists titles_org_status_idx on titles(org_id, kind, status);

create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title_id uuid not null references titles(id),
  account_id uuid not null references bank_accounts(id),
  paid_at date not null,
  amount numeric(18,2) not null check (amount > 0),
  interest numeric(18,2) not null default 0 check (interest >= 0),
  fine numeric(18,2) not null default 0 check (fine >= 0),
  discount numeric(18,2) not null default 0 check (discount >= 0),
  method text not null default 'outro' check (method in ('pix','boleto','dinheiro','cartao','transferencia','outro')),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid,
  reverse_reason text
);
create index if not exists settlements_title_idx on settlements(title_id);
create index if not exists settlements_account_idx on settlements(org_id, account_id, paid_at) where reversed_at is null;

-- RLS: a organização da transação (app.org_id) é a única visível. Sem app.org_id definido, nada aparece.
do $$
declare t text;
begin
  foreach t in array array['companies','audit_events','counterparties','categories','cost_centers','bank_accounts','titles','settlements'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists org_isolation on %I', t);
    execute format($p$create policy org_isolation on %I using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
                    with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid)$p$, t);
  end loop;
end $$;

-- auditoria só de inclusão: nem a API altera ou apaga eventos
create or replace function audit_events_imutavel() returns trigger language plpgsql as $$
begin raise exception 'auditoria é somente inclusão'; end $$;
drop trigger if exists audit_events_no_change on audit_events;
create trigger audit_events_no_change before update or delete on audit_events
  for each row when (current_setting('app.allow_org_delete', true) is distinct from 'on') execute function audit_events_imutavel();
