-- Nakhonsi360 never uses Supabase's REST API (PostgREST) or its anon key:
-- every read and write goes through the app's server with DATABASE_URL.
-- Supabase grants the API roles (anon, authenticated) every privilege on new
-- tables in public, including TRUNCATE, which row level security does not
-- stop, and EXECUTE on functions (callable as /rest/v1/rpc/<name>). Take all
-- of that away from our own objects. Other projects that share this database
-- are not touched.
--
-- Any new table or function must be added here (or revoked in its own
-- migration); tests/sql/ingest.test.ts fails if an API role can reach one.
do $$
declare
  tables text[] := array[
    'admin_areas', 'villages', 'osm_features', 'gazetteer', 'province_extent',
    'dataset_imports', 'ingest_runs', 'stations', 'observations',
    'hazard_features', 'hazard_zones',
    'citizen_reports', 'citizen_report_updates', 'citizen_report_photos', 'citizen_report_flags',
    'schema_migrations'];
  functions text[] := array[
    'admin_path_for', 'assign_village_subdistricts', 'earthquakes_near', 'floods_at', 'hotspots_near',
    'inspect_admin', 'latest_station_readings', 'nearest_features', 'nearest_observations',
    'nearest_villages', 'nearest_villages_superseded', 'normalize_place_name', 'point_in_study_area',
    'purge_expired', 'recent_earthquakes', 'refresh_gazetteer', 'refresh_province_extent',
    'refresh_village_shared_locations', 'search_gazetteer', 'warnings_at'];
  api_roles text;
  r record;
begin
  select string_agg(quote_ident(rolname), ', ') into api_roles
    from pg_roles where rolname in ('anon', 'authenticated');

  -- Functions are executable by PUBLIC by default; only the owner (the app) needs them.
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (functions)
  loop
    execute format('revoke execute on function %s from public', r.sig);
    if api_roles is not null then
      execute format('revoke execute on function %s from %s', r.sig, api_roles);
    end if;
  end loop;

  if api_roles is null then
    return;  -- plain Postgres (local, CI): no API roles to lock out
  end if;

  for r in
    select c.oid::regclass as rel
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') and c.relname = any (tables)
  loop
    execute format('revoke all on table %s from %s', r.rel, api_roles);
  end loop;

  -- Sequences behind identity / serial columns of those tables.
  for r in
    select distinct s.oid::regclass as seq
      from pg_class s
      join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
      join pg_class t on t.oid = d.refobjid
      join pg_namespace n on n.oid = t.relnamespace
     where s.relkind = 'S' and n.nspname = 'public' and t.relname = any (tables)
  loop
    execute format('revoke all on sequence %s from %s', r.seq, api_roles);
  end loop;

  -- PostGIS's coordinate system table is shared reference data: read-only for the API roles.
  begin
    execute format('revoke insert, update, delete, truncate, references, trigger on table spatial_ref_sys from %s', api_roles);
  exception when insufficient_privilege then
    raise notice 'spatial_ref_sys is not ours to change; left as is';
  end;
end $$;
