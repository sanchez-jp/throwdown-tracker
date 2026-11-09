create table if not exists public.competition_result_snapshots (
  id uuid primary key default gen_random_uuid(),
  competition_id text not null,
  division_id text not null,
  team_name text not null,
  snapshot_hash text not null,
  snapshot_at timestamptz not null default now(),
  results jsonb not null,
  created_at timestamptz not null default now(),
  constraint competition_result_snapshots_unique
    unique (competition_id, division_id, team_name, snapshot_hash)
);

create index if not exists competition_result_snapshots_lookup_idx
  on public.competition_result_snapshots
  (competition_id, division_id, team_name, snapshot_at desc);

alter table public.competition_result_snapshots enable row level security;
revoke all on table public.competition_result_snapshots from anon, authenticated;
grant select, insert on table public.competition_result_snapshots to service_role;
