-- CIFREN · Integração com o RUSTEN: cliente marcado como Associado no RUSTEN vira associado no CIFREN, e a conta dele
-- (fiado, pagamento de fiado, crédito antecipado, uso de crédito, estorno, ajuste) fica espelhada e ligada ao cadastro.

alter table members add column if not exists source text;
alter table members add column if not exists external_id text;
alter table members add column if not exists charge_fees boolean not null default true;
create unique index if not exists members_external_uq on members(org_id, source, external_id) where external_id is not null;

alter table integration_keys add column if not exists settings jsonb not null default '{}'::jsonb;
alter table integration_keys add column if not exists last_sync_at timestamptz;

-- espelho da conta do cliente no sistema de origem (positivo = crédito do cliente; negativo = débito/fiado)
create table if not exists member_account (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  source text not null,
  external_id text not null,
  kind text not null check (kind in ('credito','uso_credito','fiado','pagamento_fiado','estorno','ajuste')),
  amount numeric(18,2) not null check (amount <> 0),
  reverses_external_id text,
  reason text,
  occurred_at timestamptz not null,
  title_id uuid references titles(id) on delete set null,
  settlement_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (org_id, source, external_id)
);
create index if not exists member_account_member_idx on member_account(member_id, occurred_at desc);

-- o que acontece no CIFREN e o sistema de origem precisa saber (pagamentos de fiado recebidos aqui e estornos deles)
create table if not exists integration_feed (
  id bigint generated always as identity primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  system text not null,
  type text not null check (type in ('pagamento','estorno')),
  member_id uuid references members(id) on delete set null,
  customer_external_id text,
  amount numeric(18,2) not null,
  paid_at date,
  settlement_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists integration_feed_idx on integration_feed(org_id, system, id);

do $$
declare t text;
begin
  foreach t in array array['member_account','integration_feed'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists org_isolation on %I', t);
    execute format($p$create policy org_isolation on %I using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
                    with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid)$p$, t);
  end loop;
end $$;
