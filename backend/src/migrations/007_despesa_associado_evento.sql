-- Despesa/reembolso: nome ligado ao associado (opcional; sem vínculo, o nome fica livre) e o evento a que se refere.
alter table expenses add column if not exists member_id uuid references members(id) on delete set null;
alter table expenses add column if not exists event text check (event is null or char_length(event) <= 160);
create index if not exists expenses_member_idx on expenses(org_id, member_id) where member_id is not null;
