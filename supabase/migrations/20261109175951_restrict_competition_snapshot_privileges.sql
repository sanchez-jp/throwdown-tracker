revoke all on table public.competition_result_snapshots from public, anon, authenticated, service_role;
grant select, insert on table public.competition_result_snapshots to service_role;
