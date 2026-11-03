alter table sessions drop column if exists ecosystem;
delete from memberships where user_id in (select id from users where is_support);
delete from users where is_support;
alter table users drop column if exists is_support;
drop index if exists organizations_internal_uq;
alter table organizations drop column if exists is_internal;
