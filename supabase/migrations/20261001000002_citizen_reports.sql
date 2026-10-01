-- Citizen hazard reports. What members of the public say, kept apart from
-- agency data and labelled unverified until a responder updates it.
-- contact_* and reporter_hash are private: the public API never selects them.

create table if not exists citizen_reports (
  id                bigserial primary key,
  public_id         text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 10),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  hazard            text not null check (hazard in ('flood', 'flash_flood', 'landslide', 'storm', 'fire', 'coastal', 'drought', 'earthquake', 'smoke', 'blocked_road', 'other')),
  urgency           text not null check (urgency in ('life', 'help', 'info')),
  geom              geometry(Point, 4326) not null,
  location_source   text not null check (location_source in ('gps', 'map')),
  gps_accuracy_m    integer,
  place_note        text check (char_length(place_note) <= 200),
  water_depth_cm    integer check (water_depth_cm between 0 and 1000),
  water_trend       text check (water_trend in ('rising', 'steady', 'falling')),
  people            integer check (people between 0 and 100000),
  vulnerable        boolean not null default false,
  needs             text[] not null default '{}',
  details           text check (char_length(details) <= 1000),
  contact_name      text check (char_length(contact_name) <= 80),
  contact_phone     text check (contact_phone ~ '^0[0-9]{8,9}$'),
  status            text not null default 'new' check (status in ('new', 'acknowledged', 'in_progress', 'resolved', 'duplicate', 'unverifiable')),
  responder_note    text check (char_length(responder_note) <= 500),
  hidden            boolean not null default false,  -- spam / abuse: kept for responders, never public
  subdistrict_pcode text references admin_areas (pcode),
  district_pcode    text references admin_areas (pcode),
  reporter_hash     text
);
create index if not exists citizen_reports_geom_idx on citizen_reports using gist (geom);
create index if not exists citizen_reports_created_idx on citizen_reports (created_at desc);
create index if not exists citizen_reports_reporter_idx on citizen_reports (reporter_hash, created_at desc);

-- Every status change or responder note, shown as the report's public timeline.
create table if not exists citizen_report_updates (
  id         bigserial primary key,
  report_id  bigint not null references citizen_reports (id) on delete cascade,
  created_at timestamptz not null default now(),
  status     text,
  note       text check (char_length(note) <= 500)
);
create index if not exists citizen_report_updates_report_idx on citizen_report_updates (report_id, created_at);

alter table citizen_reports        enable row level security;
alter table citizen_report_updates enable row level security;

-- Retention: contact details are dropped 30 days after a report is closed, or
-- 90 days after it was made; reports themselves are kept for one year.
create or replace function purge_expired()
returns table (observations_deleted integer, hazards_deleted integer)
language plpgsql
as $$
declare
  o integer;
  h integer;
begin
  delete from observations where observed_at < now() - interval '90 days';
  get diagnostics o = row_count;
  delete from hazard_features
   where (kind in ('hotspot', 'earthquake') and observed_at < now() - interval '1 year')
      or (kind = 'warning' and coalesce(valid_until, observed_at) < now() - interval '30 days');
  get diagnostics h = row_count;
  update citizen_reports
     set contact_name = null, contact_phone = null, reporter_hash = null
   where (contact_name is not null or contact_phone is not null or reporter_hash is not null)
     and ((status in ('resolved', 'duplicate', 'unverifiable') and updated_at < now() - interval '30 days')
          or created_at < now() - interval '90 days');
  delete from citizen_reports where created_at < now() - interval '1 year';
  return query select o, h;
end;
$$;
