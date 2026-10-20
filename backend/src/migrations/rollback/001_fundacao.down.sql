-- Volta da 001 (apaga TODOS os dados do CIFREN — usar só em ambiente de teste ou com backup conferido).
drop table if exists settlements, titles, bank_accounts, cost_centers, categories, counterparties, audit_events,
  companies, login_challenges, sessions, memberships, roles, organizations, users, rate_limits, _secrets cascade;
drop function if exists audit_events_imutavel();
delete from _migrations where name = '001_fundacao.sql';
