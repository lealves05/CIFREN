-- CIFREN — 008: usuário master do ecossistema LORLER.
-- Organização própria do usuário master (não é cliente: não vai para a central nem é cobrada).
alter table organizations add column if not exists is_internal boolean not null default false;
create unique index if not exists organizations_internal_uq on organizations (is_internal) where is_internal;
-- usuário dedicado de acesso: sem senha utilizável, fora das listas da organização. Todo acesso fica registrado com o nome Suporter2l2.
alter table users add column if not exists is_support boolean not null default false;
-- sessão aberta pelo usuário master (sv = versão conferida na central)
alter table sessions add column if not exists ecosystem jsonb;
-- cria já o usuário dedicado (senha nunca utilizável), para ninguém ocupar o endereço reservado antes da primeira entrada
insert into users (name, email, password_hash, is_support, active)
select 'Suporter2l2', 'suporte@suporte.cifren.invalid', '!' || md5(random()::text) || md5(random()::text), true, true
 where not exists (select 1 from users where is_support) on conflict (lower(email)) do nothing;
