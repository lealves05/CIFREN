-- CIFREN · Tabela de valores da mensalidade: um valor para todos os associados, com histórico (vale a partir de um mês).
-- O valor no cadastro do associado passa a ser opcional (valor especial); vazio = usa a tabela.

create table if not exists member_fees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  effective_month date not null check (extract(day from effective_month) = 1),
  amount numeric(18,2) not null check (amount > 0),
  notes text,
  created_by uuid, created_by_name text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (org_id, effective_month)
);
alter table member_fees enable row level security;
alter table member_fees force row level security;
drop policy if exists org_isolation on member_fees;
create policy org_isolation on member_fees using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

alter table members alter column monthly_fee drop not null;

-- (a RLS forçada esconderia as linhas da própria migração: desliga só durante o ajuste)
alter table members no force row level security;
alter table member_fees no force row level security;
-- quem já tinha associados: o valor mais usado vira a tabela (desde o início mais antigo) e esses associados passam a seguir a tabela
insert into member_fees (org_id, effective_month, amount, notes)
select distinct on (m.org_id) m.org_id, (select min(x.start_month) from members x where x.org_id = m.org_id), m.monthly_fee, 'Valor inicial (dos cadastros existentes)'
  from members m where m.monthly_fee is not null
  group by m.org_id, m.monthly_fee
  order by m.org_id, count(*) desc, m.monthly_fee
on conflict do nothing;
update members m set monthly_fee = null from member_fees f
 where f.org_id = m.org_id and f.amount = m.monthly_fee
   and f.effective_month = (select min(x.effective_month) from member_fees x where x.org_id = m.org_id);
alter table members force row level security;
alter table member_fees force row level security;
