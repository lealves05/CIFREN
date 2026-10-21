-- CIFREN · Associados e mensalidades: cadastro de associados (com e-mail e WhatsApp), mensalidade gerada todo mês
-- como conta a receber, avisos de atraso (e-mail, WhatsApp oficial da Meta ou link do WhatsApp) e relatório de atrasados.

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  number bigint generated always as identity,
  company_id uuid not null references companies(id),
  counterparty_id uuid references counterparties(id),
  name text not null check (char_length(name) between 1 and 160),
  document text, email text, whatsapp text,
  monthly_fee numeric(18,2) not null check (monthly_fee > 0),
  due_day int not null default 10 check (due_day between 1 and 31),
  start_month date not null,                 -- 1º dia do primeiro mês cobrado
  end_month date,                            -- último mês cobrado (encerrado)
  status text not null default 'ativo' check (status in ('ativo','suspenso','encerrado')),
  category_id uuid references categories(id),
  notify_email boolean not null default true,
  notify_whatsapp boolean not null default true,
  notes text,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists members_org_idx on members(org_id, status, lower(name));

alter table titles add column if not exists member_id uuid references members(id);
create index if not exists titles_member_idx on titles(member_id) where member_id is not null;

create table if not exists member_settings (
  org_id uuid primary key references organizations(id) on delete cascade,
  remind_before_days int not null default 0 check (remind_before_days between 0 and 15),
  remind_after_days int[] not null default '{1,7,15,30}',
  email_subject text not null default 'Mensalidade em aberto — {empresa}',
  message text not null default 'Olá, {nome}! Consta em aberto {descricao}, no total de {valor}. Se já pagou, desconsidere esta mensagem.{pix} Qualquer dúvida, responda esta mensagem. — {empresa}',
  before_message text not null default 'Olá, {nome}! Lembrete: sua mensalidade de {valor} vence em {vencimento}.{pix} — {empresa}',
  pix_key text,
  send_hour_from int not null default 8 check (send_hour_from between 0 and 23),
  send_hour_to int not null default 20 check (send_hour_to between 1 and 24),
  wa_enabled boolean not null default false,
  wa_phone_number_id text, wa_token_sealed text,
  wa_template text, wa_template_before text, wa_lang text not null default 'pt_BR',
  report_weekly boolean not null default true,
  report_weekday int not null default 1 check (report_weekday between 0 and 6),
  report_last_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists member_reminders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  title_id uuid references titles(id) on delete set null,
  channel text not null check (channel in ('email','whatsapp','whatsapp_link')),
  kind text not null check (kind in ('antes','atraso','manual')),
  step int not null default 0,
  status text not null check (status in ('enviado','falhou','sem_contato')),
  error text, sent_by uuid, sent_by_name text,
  sent_at timestamptz not null default now()
);
create index if not exists member_reminders_member_idx on member_reminders(member_id, sent_at desc);
-- aviso automático: um por mensalidade, canal, tipo e etapa (1, 7, 15… dias)
create unique index if not exists member_reminders_auto_uq on member_reminders(title_id, channel, kind, step) where kind <> 'manual' and status = 'enviado';

do $$
declare t text;
begin
  foreach t in array array['members','member_settings','member_reminders'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists org_isolation on %I', t);
    execute format($p$create policy org_isolation on %I using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
                    with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid)$p$, t);
  end loop;
end $$;
