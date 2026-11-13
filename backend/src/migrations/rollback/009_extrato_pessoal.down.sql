drop index if exists ptx_import_uq;
alter table personal_transactions drop column if exists import_hash;
