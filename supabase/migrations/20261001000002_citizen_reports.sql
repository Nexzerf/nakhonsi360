-- Citizen hazard reports, open to everyone: anyone can report, anyone can
-- help (and say so), with no sign-in. What people say is kept apart from
-- agency data and is labelled as reported by the public.
--
-- Abuse controls without accounts: per-connection rate limits (hashed IP),
-- a public timeline of every update, the reporter's own browser token for
-- authoritative updates, and auto-hiding after flags from 3 connections.

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
  -- Shown publicly while the report is open (the form says so), so helpers can call.
  contact_name      text check (char_length(contact_name) <= 80),
  contact_phone     text check (contact_phone ~ '^0[0-9]{8,9}$'),
  status            text not null default 'new' check (status in ('new', 'on_the_way', 'resolved', 'unverifiable')),
  hidden            boolean not null default false,  -- set automatically by flags
  flag_count        integer not null default 0,
  subdistrict_pcode text references admin_areas (pcode),
  district_pcode    text references admin_areas (pcode),
  reporter_hash     text,                             -- private: rate limit only
  edit_token_hash   text                              -- private: sha256 of the token kept in the reporter's browser
);
create index if not exists citizen_reports_geom_idx on citizen_reports using gist (geom);
create index if not exists citizen_reports_updated_idx on citizen_reports (updated_at desc);
create index if not exists citizen_reports_reporter_idx on citizen_reports (reporter_hash, created_at desc);

-- Every "on my way", "helped", "still need help", "nothing found" and note.
create table if not exists citizen_report_updates (
  id            bigserial primary key,
  report_id     bigint not null references citizen_reports (id) on delete cascade,
  created_at    timestamptz not null default now(),
  action        text not null check (action in ('on_the_way', 'resolved', 'still_need', 'unverifiable', 'note')),
  note          text check (char_length(note) <= 500),
  author_name   text check (char_length(author_name) <= 60),
  by_reporter   boolean not null default false,
  reporter_hash text                                  -- private: rate limit only
);
create index if not exists citizen_report_updates_report_idx on citizen_report_updates (report_id, created_at);
create index if not exists citizen_report_updates_reporter_idx on citizen_report_updates (reporter_hash, created_at desc);

-- One flag per connection per report.
create table if not exists citizen_report_flags (
  report_id     bigint not null references citizen_reports (id) on delete cascade,
  reporter_hash text not null,
  created_at    timestamptz not null default now(),
  primary key (report_id, reporter_hash)
);

alter table citizen_reports        enable row level security;
alter table citizen_report_updates enable row level security;
alter table citizen_report_flags   enable row level security;

-- Retention: contact details and connection hashes are dropped 30 days after
-- a report is closed, or 90 days after it was made; reports are kept one year.
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
     and ((status in ('resolved', 'unverifiable') and updated_at < now() - interval '30 days')
          or created_at < now() - interval '90 days');
  update citizen_report_updates set reporter_hash = null
   where reporter_hash is not null and created_at < now() - interval '30 days';
  delete from citizen_report_flags where created_at < now() - interval '90 days';
  delete from citizen_reports where created_at < now() - interval '1 year';
  return query select o, h;
end;
$$;
