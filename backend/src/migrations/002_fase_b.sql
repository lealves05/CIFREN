-- CIFREN · Fase B — aprovações, conciliação, recorrências (estimado × real), compras, despesas e reembolsos, documentos,
-- IA, notificações, integrações LORLER e segurança da organização. Só acrescenta; nada da Fase A é removido.

alter table organizations add column if not exists perm_version int not null default 1;
alter table organizations add column if not exists require_mfa boolean not null default false;

alter table categories add column if not exists dre_group text;
do $$ begin
  alter table categories add constraint categories_dre_group_ck check (dre_group is null or dre_group in
    ('receita_bruta','deducoes','custos','despesas_operacionais','outras_receitas','despesas_financeiras'));
exception when duplicate_object then null; end $$;

alter table titles add column if not exists approval_status text check (approval_status in ('pendente','aprovado','reprovado'));
alter table titles add column if not exists estimated boolean not null default false;
alter table titles add column if not exists recurring_occurrence_id uuid;
alter table titles add column if not exists source text;
alter table titles add column if not exists external_id text;
create unique index if not exists titles_external_uq on titles(org_id, source, external_id) where external_id is not null;
alter table settlements add column if not exists origin text not null default 'manual';

-- ---------------- aprovações ----------------
create table if not exists approval_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  entity text not null check (entity in ('title','purchase','expense')),
  company_id uuid references companies(id),
  min_amount numeric(18,2) not null default 0 check (min_amount >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  company_id uuid references companies(id),
  entity text not null check (entity in ('title','purchase','expense')),
  entity_id uuid not null,
  amount numeric(18,2) not null default 0,
  summary text,
  requested_by uuid, requested_by_name text, requested_at timestamptz not null default now(),
  status text not null default 'pendente' check (status in ('pendente','aprovado','reprovado','cancelado')),
  decided_by uuid, decided_by_name text, decided_at timestamptz, reason text
);
create index if not exists approvals_pending_idx on approvals(org_id, status, requested_at);
create unique index if not exists approvals_open_uq on approvals(org_id, entity, entity_id) where status = 'pendente';

-- ---------------- conciliação bancária ----------------
create table if not exists statement_imports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  account_id uuid not null references bank_accounts(id),
  filename text, format text not null check (format in ('ofx','csv')),
  sha256 text not null, lines int not null default 0, duplicates int not null default 0,
  period_from date, period_to date,
  created_by uuid, created_at timestamptz not null default now()
);
create unique index if not exists statement_imports_uq on statement_imports(org_id, account_id, sha256);
create table if not exists statement_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  import_id uuid not null references statement_imports(id) on delete cascade,
  account_id uuid not null references bank_accounts(id),
  date date not null, description text, amount numeric(18,2) not null, fitid text, line_hash text not null,
  status text not null default 'pendente' check (status in ('pendente','conciliada','ignorada')),
  settlement_id uuid references settlements(id), created_settlement boolean not null default false, title_id uuid references titles(id),
  decided_by uuid, decided_at timestamptz, note text
);
create unique index if not exists statement_lines_uq on statement_lines(org_id, account_id, line_hash);
create index if not exists statement_lines_status_idx on statement_lines(org_id, account_id, status, date);

-- ---------------- compromissos recorrentes ----------------
create table if not exists recurring_commitments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  company_id uuid not null references companies(id),
  kind text not null check (kind in ('pagar','receber')),
  name text not null check (char_length(name) between 1 and 120),
  counterparty_id uuid references counterparties(id), category_id uuid references categories(id), cost_center_id uuid references cost_centers(id),
  frequency text not null check (frequency in ('semanal','quinzenal','mensal','bimestral','trimestral','semestral','anual')),
  due_day int check (due_day between 1 and 31),
  start_date date not null, end_date date,
  method text not null default 'fixo' check (method in ('fixo','media','manual')),
  average_n int not null default 6 check (average_n between 2 and 24),
  estimated_amount numeric(18,2) not null check (estimated_amount >= 0),
  tolerance_pct numeric(6,2) not null default 15,
  lead_days int not null default 10 check (lead_days between 0 and 60),
  status text not null default 'ativo' check (status in ('ativo','pausado','encerrado')),
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists recurring_occurrences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  commitment_id uuid not null references recurring_commitments(id) on delete cascade,
  due_date date not null,
  estimated_amount numeric(18,2) not null, estimate_explain text, estimate_manual boolean not null default false,
  actual_amount numeric(18,2), actual_at timestamptz,
  title_id uuid references titles(id),
  status text not null default 'prevista' check (status in ('prevista','lancada','real','cancelada')),
  created_at timestamptz not null default now(),
  unique (commitment_id, due_date)
);
create index if not exists recurring_occ_due_idx on recurring_occurrences(org_id, due_date);

-- ---------------- compras ----------------
create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  number bigint generated always as identity,
  company_id uuid not null references companies(id),
  requester_id uuid, requester_name text,
  title text not null check (char_length(title) between 1 and 160),
  items jsonb not null default '[]'::jsonb,
  total numeric(18,2) not null default 0,
  needed_by date, notes text,
  category_id uuid references categories(id), cost_center_id uuid references cost_centers(id),
  supplier_id uuid references counterparties(id),
  status text not null default 'solicitada' check (status in ('solicitada','aprovada','reprovada','pedido','recebida','faturada','cancelada')),
  approval_status text check (approval_status in ('pendente','aprovado','reprovado')),
  ordered_at timestamptz, expected_at date, received_at timestamptz, title_ids uuid[] not null default '{}', cancel_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ---------------- despesas e reembolsos ----------------
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  number bigint generated always as identity,
  company_id uuid not null references companies(id),
  user_id uuid not null, user_name text,
  title text not null check (char_length(title) between 1 and 160),
  items jsonb not null default '[]'::jsonb,
  total numeric(18,2) not null default 0,
  status text not null default 'rascunho' check (status in ('rascunho','enviada','aprovada','reprovada','paga')),
  approval_status text check (approval_status in ('pendente','aprovado','reprovado')),
  title_id uuid references titles(id), paid_at date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ---------------- documentos ----------------
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  company_id uuid references companies(id),
  kind text not null default 'outro' check (kind in ('nfe','nfce','boleto','pix','comprovante','imagem','pdf','outro')),
  filename text, mime text, size int not null default 0, sha256 text,
  content bytea,
  extracted jsonb, warnings text[] not null default '{}',
  status text not null default 'recebido' check (status in ('recebido','processado','aguardando_ia','vinculado','descartado')),
  access_key text, duplicate_of uuid,
  uploaded_by uuid, uploaded_by_name text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists documents_org_idx on documents(org_id, created_at desc);
create index if not exists documents_key_idx on documents(org_id, access_key) where access_key is not null;
create index if not exists documents_sha_idx on documents(org_id, sha256);
create table if not exists document_links (
  org_id uuid not null references organizations(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  entity text not null check (entity in ('title','purchase','expense','settlement')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (document_id, entity, entity_id)
);
create index if not exists document_links_entity_idx on document_links(org_id, entity, entity_id);

-- ---------------- IA ----------------
create table if not exists ai_settings (
  org_id uuid primary key references organizations(id) on delete cascade,
  enabled boolean not null default false,
  model text not null default 'claude-haiku-5-5',
  key_sealed text,
  monthly_limit int not null default 300 check (monthly_limit between 0 and 100000),
  updated_at timestamptz not null default now()
);
create table if not exists ai_usage (
  id bigint generated always as identity primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid, agent text not null, at timestamptz not null default now(),
  input_tokens int, output_tokens int, ok boolean not null default true
);
create index if not exists ai_usage_org_idx on ai_usage(org_id, at);

-- ---------------- notificações ----------------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  kind text not null, title text not null, body text, link text,
  dedupe_key text,
  created_at timestamptz not null default now(), read_at timestamptz, emailed_at timestamptz
);
create unique index if not exists notifications_dedupe_uq on notifications(org_id, user_id, dedupe_key) where dedupe_key is not null;
create index if not exists notifications_user_idx on notifications(user_id, created_at desc);
create table if not exists user_prefs (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  email_daily boolean not null default false,
  last_digest_at timestamptz,
  primary key (org_id, user_id)
);

-- ---------------- integrações LORLER (sem RLS: a chave é procurada antes de saber a organização; toda consulta filtra org_id) ----------------
create table if not exists integration_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  system text not null check (system in ('orbi','torven','rusten','apolven','cerebro')),
  name text not null, prefix text not null, key_hash text not null unique,
  scopes text[] not null default '{}',
  created_by uuid, created_at timestamptz not null default now(), last_used_at timestamptz, revoked_at timestamptz
);

-- RLS forçada também nas tabelas novas (mesma regra da Fase A)
do $$
declare t text;
begin
  foreach t in array array['approval_rules','approvals','statement_imports','statement_lines','recurring_commitments','recurring_occurrences',
                           'purchases','expenses','documents','document_links','ai_settings','ai_usage','notifications','user_prefs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists org_isolation on %I', t);
    execute format($p$create policy org_isolation on %I using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
                    with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid)$p$, t);
  end loop;
end $$;
