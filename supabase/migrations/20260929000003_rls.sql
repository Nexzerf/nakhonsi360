-- The app reads through server-side route handlers using DATABASE_URL, never
-- through PostgREST with the anon key. Enable RLS without policies so the
-- public API roles cannot read or write these tables directly.
alter table dataset_imports  enable row level security;
alter table ingest_runs      enable row level security;
alter table admin_areas      enable row level security;
alter table province_extent  enable row level security;
alter table villages         enable row level security;
alter table osm_features     enable row level security;
alter table gazetteer        enable row level security;
