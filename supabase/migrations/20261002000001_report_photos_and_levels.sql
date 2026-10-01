-- Reports become a live record of a place: when it was seen, newer water
-- levels from anyone nearby, "I'm here and see it" confirmations, and photos.

-- When the reporter saw it (their statement); created_at stays the time it reached us.
alter table citizen_reports add column if not exists observed_at timestamptz;
update citizen_reports set observed_at = created_at where observed_at is null;
alter table citizen_reports alter column observed_at set default now();
alter table citizen_reports alter column observed_at set not null;

-- Water level readings and confirmations as updates.
alter table citizen_report_updates add column if not exists water_depth_cm integer check (water_depth_cm between 0 and 1000);
alter table citizen_report_updates add column if not exists water_trend text check (water_trend in ('rising', 'steady', 'falling'));
alter table citizen_report_updates add column if not exists observed_at timestamptz;
-- Lets the browser that posted an update attach photos to it for a short time.
alter table citizen_report_updates add column if not exists photo_token_hash text;
alter table citizen_report_updates drop constraint if exists citizen_report_updates_action_check;
alter table citizen_report_updates add constraint citizen_report_updates_action_check
  check (action in ('on_the_way', 'resolved', 'still_need', 'unverifiable', 'note', 'level', 'confirm'));

-- Photos, resized and stripped of metadata in the sender's browser. What the
-- file said is kept only as a capture time and a distance from the pin.
create table if not exists citizen_report_photos (
  id              bigserial primary key,
  public_id       text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 16),
  report_id       bigint not null references citizen_reports (id) on delete cascade,
  update_id       bigint references citizen_report_updates (id) on delete cascade,
  created_at      timestamptz not null default now(),
  mime            text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes           bytea not null check (octet_length(bytes) <= 2500000),
  width           integer check (width between 1 and 8000),
  height          integer check (height between 1 and 8000),
  exif_taken_at   timestamptz,
  exif_distance_m real,
  reporter_hash   text
);
create index if not exists citizen_report_photos_report_idx on citizen_report_photos (report_id, created_at);
create index if not exists citizen_report_photos_reporter_idx on citizen_report_photos (reporter_hash, created_at desc);
alter table citizen_report_photos enable row level security;

-- Retention: as before, plus photos for 90 days.
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
  update citizen_report_updates set reporter_hash = null, photo_token_hash = null
   where (reporter_hash is not null or photo_token_hash is not null) and created_at < now() - interval '30 days';
  update citizen_report_photos set reporter_hash = null
   where reporter_hash is not null and created_at < now() - interval '30 days';
  delete from citizen_report_photos where created_at < now() - interval '90 days';
  delete from citizen_report_flags where created_at < now() - interval '90 days';
  delete from citizen_reports where created_at < now() - interval '1 year';
  return query select o, h;
end;
$$;
