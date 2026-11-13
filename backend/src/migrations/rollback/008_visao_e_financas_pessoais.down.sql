drop table if exists personal_audit, personal_recurring, personal_goals, personal_budgets, personal_transactions,
  personal_categories, personal_accounts, personal_invites, personal_space_members, personal_spaces cascade;
drop function if exists personal_is_member(uuid);
drop function if exists personal_role(uuid);
drop function if exists personal_audit_imutavel();
alter table memberships drop column if exists perm_add;
alter table memberships drop column if exists perm_remove;
