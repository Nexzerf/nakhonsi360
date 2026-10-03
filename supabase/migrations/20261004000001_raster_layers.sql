-- Raster layers whose source changes over time (latest low-cloud Sentinel-2
-- scenes, the newest SMAP day). The refresh job writes the tile URL it built
-- and the dates of what it shows; /api/imagery/:layer serves it as TileJSON.
create table if not exists raster_layers (
  layer_id     text primary key,
  source_id    text not null,
  tile_url     text not null,          -- {z}/{x}/{y} template, never containing a key
  minzoom      smallint not null default 0,
  maxzoom      smallint not null,
  tile_size    smallint not null default 256,
  data_from    timestamptz,            -- oldest scene / day shown
  data_to      timestamptz,            -- newest scene / day shown
  details      jsonb not null default '{}'::jsonb,  -- e.g. scene ids, cloud cover per tile
  refreshed_at timestamptz not null default now()
);
alter table raster_layers enable row level security;

do $$
declare api_roles text;
begin
  select string_agg(quote_ident(rolname), ', ') into api_roles from pg_roles where rolname in ('anon', 'authenticated');
  if api_roles is not null then
    execute format('revoke all on table raster_layers from %s', api_roles);
  end if;
end $$;
