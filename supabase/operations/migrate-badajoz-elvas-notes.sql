-- Migrate the existing Badajoz-Elvas strategy notes to competition-scoped keys.
-- The old CHECK constraint only allowed wod1..wod4, so replace it as part of the migration.
-- Safe to run more than once. Stops rather than overwriting already-scoped notes.

alter table public.wod_notes
  drop constraint if exists wod_notes_wod_id_check;

do $$
declare
  conflicts integer;
begin
  select count(*)
    into conflicts
    from public.wod_notes legacy
    join public.wod_notes scoped
      on scoped.wod_id = 'badajoz-elvas-2026:' || legacy.wod_id
   where legacy.wod_id in ('wod1', 'wod2', 'wod3', 'wod4');

  if conflicts > 0 then
    raise exception 'Migration stopped: one or more competition-scoped Badajoz-Elvas notes already exist.';
  end if;

  update public.wod_notes
     set wod_id = 'badajoz-elvas-2026:' || wod_id
   where wod_id in ('wod1', 'wod2', 'wod3', 'wod4');
end
$$;

alter table public.wod_notes
  add constraint wod_notes_wod_id_check
  check (wod_id ~ '^[a-z0-9-]{1,80}:wod([1-9]|[12][0-9]|30)$');
