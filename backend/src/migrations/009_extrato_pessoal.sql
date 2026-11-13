-- CIFREN · 009 — Importação de extrato bancário (OFX/CSV) nas finanças pessoais, com proteção contra duplicados.
alter table personal_transactions add column if not exists import_hash text;
-- a mesma linha do extrato não entra duas vezes na mesma conta
create unique index if not exists ptx_import_uq on personal_transactions(space_id, account_id, import_hash) where import_hash is not null;
