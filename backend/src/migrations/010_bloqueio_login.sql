-- CIFREN — 010: bloqueio de login após 5 erros de senha e desbloqueio por e-mail (uso único).
-- A tabela users não tem RLS (acesso pré-sessão). Alerta ao Master e e-mail ao titular saem pela central (hub).

alter table users
  add column if not exists failed_logins   integer     not null default 0,
  add column if not exists locked_at        timestamptz,
  add column if not exists lock_auto_until  timestamptz,
  add column if not exists login_fail_log   jsonb       not null default '[]'::jsonb;  -- [{ at, ip }] (máx. 8, mais recente primeiro)

create table if not exists user_unlock_tokens (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  ip          text,
  created_at  timestamptz not null default now()
);
create index if not exists user_unlock_tokens_user on user_unlock_tokens (user_id) where used_at is null;
