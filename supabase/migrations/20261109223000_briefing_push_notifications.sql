-- Server-side Web Push reminders for competition briefings.
-- A device receives one notification 15 minutes before each configured briefing.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.briefing_push_settings (
  id boolean primary key default true check (id is true),
  cron_secret text not null default (gen_random_uuid()::text || gen_random_uuid()::text),
  vapid_public_key text,
  vapid_private_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.briefing_push_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.briefing_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  competition_id text not null check (competition_id ~ '^[a-z0-9-]{1,80}$'),
  endpoint text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint briefing_push_subscriptions_competition_endpoint_key unique (competition_id, endpoint)
);

create table if not exists public.briefing_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.briefing_push_subscriptions(id) on delete cascade,
  event_key text not null,
  status text not null check (status in ('sending', 'sent', 'failed')),
  attempts integer not null default 1 check (attempts between 1 and 3),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (subscription_id, event_key)
);

alter table public.briefing_push_settings enable row level security;
alter table public.briefing_push_subscriptions enable row level security;
alter table public.briefing_push_deliveries enable row level security;

revoke all on public.briefing_push_settings from public, anon, authenticated;
revoke all on public.briefing_push_subscriptions from public, anon, authenticated;
revoke all on public.briefing_push_deliveries from public, anon, authenticated;

grant all on public.briefing_push_settings to service_role;
grant all on public.briefing_push_subscriptions to service_role;
grant all on public.briefing_push_deliveries to service_role;

do $$
declare
  existing_job bigint;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'throwdown-briefing-push-dispatch'
  loop
    perform cron.unschedule(existing_job);
  end loop;

  perform cron.schedule(
    'throwdown-briefing-push-dispatch',
    '* * * * *',
    $job$
      select net.http_post(
        url := 'https://wovdcffjchshmvcqyand.supabase.co/functions/v1/briefing-notifications',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select cron_secret from public.briefing_push_settings where id = true)
        ),
        body := '{"action":"dispatch"}'::jsonb,
        timeout_milliseconds := 10000
      );
    $job$
  );
end
$$;
