-- Migrate the existing Badajoz-Elvas strategy notes to the competition-scoped key.
-- Safe to run more than once. Stops rather than overwriting any already-scoped note.
do $$
declare
  conflicts integer;
begin
  select count(*)
    into conflicts
    from public.wod_notes legacy
    join public.wod_notes scoped
      on scoped.wod_id = 'badajoz-elvas-2026:' || legacy.wod_id
   where legacy.wod_id in ('wod1', 'wod2', 'wod3', 'wod4', 'wod5');

  if conflicts > 0 then
    raise exception 'Migration stopped: one or more competition-scoped Badajoz-Elvas notes already exist.';
  end if;

  update public.wod_notes
     set wod_id = 'badajoz-elvas-2026:' || wod_id
   where wod_id in ('wod1', 'wod2', 'wod3', 'wod4', 'wod5');
end
$$;
