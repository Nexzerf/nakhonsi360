/**
 * SQL for citizen reports. Free of Next.js imports so the SQL test suite can
 * run it against a real PostGIS database.
 */
import { createHash, randomBytes } from 'node:crypto';
import type postgres from 'postgres';
import type { PublicReport, ReportInput, ReportPhoto, ReportUpdate, StatusId, UpdateInput } from '@/lib/reports/schema';
import { LIMITS, UPDATE_ACTIONS } from '@/lib/reports/schema';

type Sql = postgres.Sql;

interface Row {
  public_id: string;
  created_at: Date;
  updated_at: Date;
  hazard: PublicReport['hazard'];
  urgency: PublicReport['urgency'];
  lng: number;
  lat: number;
  location_source: 'gps' | 'map';
  gps_accuracy_m: number | null;
  place_note: string | null;
  water_depth_cm: number | null;
  water_trend: PublicReport['waterTrend'];
  people: number | null;
  vulnerable: boolean;
  needs: PublicReport['needs'];
  details: string | null;
  status: StatusId;
  observed_at: Date;
  confirm_count: number;
  photo_count: number;
  latest_depth_cm: number | null;
  latest_depth_at: Date | null;
  contact_name: string | null;
  contact_phone: string | null;
  subdistrict_th: string | null;
  district_th: string | null;
  update_count: number;
  last_id: string | null;
  last_at: Date | null;
  last_depth: number | null;
  last_trend: ReportUpdate['waterTrend'];
  last_observed: Date | null;
  last_action: ReportUpdate['action'] | null;
  last_note: string | null;
  last_author: string | null;
  last_by_reporter: boolean | null;
}

// Never add reporter_hash or edit_token_hash here: this list is served publicly.
// Contact details only while the report is open.
const PUBLIC_COLUMNS = `
  r.public_id, r.created_at, r.updated_at, r.hazard, r.urgency, st_x(r.geom) as lng, st_y(r.geom) as lat,
  r.location_source, r.gps_accuracy_m, r.place_note, r.water_depth_cm, r.water_trend, r.people, r.vulnerable,
  r.needs, r.details, r.status, r.observed_at,
  (select count(distinct coalesce(u.reporter_hash, u.id::text))::int from citizen_report_updates u
    where u.report_id = r.id and u.action = 'confirm' and not u.by_reporter) as confirm_count,
  (select count(*)::int from citizen_report_photos ph where ph.report_id = r.id) as photo_count,
  ld.depth as latest_depth_cm, ld.at as latest_depth_at,
  case when r.status in ('new', 'on_the_way') then r.contact_name end as contact_name,
  case when r.status in ('new', 'on_the_way') then r.contact_phone end as contact_phone,
  s.name_th as subdistrict_th, d.name_th as district_th,
  (select count(*)::int from citizen_report_updates u where u.report_id = r.id) as update_count,
  lu.id::text as last_id, lu.created_at as last_at, lu.action as last_action, lu.note as last_note, lu.author_name as last_author,
  lu.by_reporter as last_by_reporter, lu.water_depth_cm as last_depth, lu.water_trend as last_trend, lu.observed_at as last_observed`;

const FROM = `
  from citizen_reports r
  left join admin_areas s on s.pcode = r.subdistrict_pcode
  left join admin_areas d on d.pcode = r.district_pcode
  left join lateral (
    select u.id, u.created_at, u.action, u.note, u.author_name, u.by_reporter, u.water_depth_cm, u.water_trend, u.observed_at
      from citizen_report_updates u where u.report_id = r.id order by u.created_at desc limit 1
  ) lu on true
  left join lateral (
    select x.depth, x.at from (
      select r.water_depth_cm as depth, r.observed_at as at where r.water_depth_cm is not null
      union all
      select u.water_depth_cm, coalesce(u.observed_at, u.created_at)
        from citizen_report_updates u where u.report_id = r.id and u.water_depth_cm is not null
    ) x order by x.at desc limit 1
  ) ld on true`;

function toPublic(r: Row): PublicReport {
  return {
    id: r.public_id,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    hazard: r.hazard,
    urgency: r.urgency,
    lat: r.lat,
    lng: r.lng,
    locationSource: r.location_source,
    gpsAccuracyM: r.gps_accuracy_m,
    placeNote: r.place_note,
    waterDepthCm: r.water_depth_cm,
    waterTrend: r.water_trend,
    people: r.people,
    vulnerable: r.vulnerable,
    needs: r.needs ?? [],
    details: r.details,
    status: r.status,
    observedAt: new Date(r.observed_at).toISOString(),
    confirmCount: r.confirm_count,
    photoCount: r.photo_count,
    latestDepthCm: r.latest_depth_cm,
    latestDepthAt: r.latest_depth_at ? new Date(r.latest_depth_at).toISOString() : null,
    contactName: r.contact_name,
    contactPhone: r.contact_phone,
    lastUpdate: r.last_at
      ? {
          id: r.last_id!,
          at: new Date(r.last_at).toISOString(),
          action: r.last_action!,
          note: r.last_note,
          authorName: r.last_author,
          byReporter: r.last_by_reporter === true,
          waterDepthCm: r.last_depth,
          waterTrend: r.last_trend,
          observedAt: r.last_observed ? new Date(r.last_observed).toISOString() : null,
        }
      : null,
    updateCount: r.update_count,
    subdistrictTh: r.subdistrict_th,
    districtTh: r.district_th,
  };
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export type InsertResult = { ok: true; id: string; editToken: string } | { ok: false; reason: 'outside_study_area' | 'rate_limited' };

export async function insertReport(sql: Sql, input: ReportInput, reporterHash: string | null): Promise<InsertResult> {
  const editToken = randomBytes(16).toString('hex');
  return sql.begin(async (tx) => {
    const [inside] = await tx<{ ok: boolean }[]>`select point_in_study_area(${input.lng}, ${input.lat}) as ok`;
    if (!inside?.ok) return { ok: false as const, reason: 'outside_study_area' as const };
    if (reporterHash) {
      // Serialise per connection so parallel requests cannot pass the limit together.
      await tx`select pg_advisory_xact_lock(hashtext(${reporterHash}))`;
      const [c] = await tx<{ n: number }[]>`
        select count(*)::int as n from citizen_reports where reporter_hash = ${reporterHash} and created_at > now() - interval '1 hour'`;
      if ((c?.n ?? 0) >= LIMITS.perHour) return { ok: false as const, reason: 'rate_limited' as const };
    }
    const [row] = await tx<{ public_id: string }[]>`
      with p as (select st_setsrid(st_makepoint(${input.lng}, ${input.lat}), 4326) as g)
      insert into citizen_reports (hazard, urgency, geom, location_source, gps_accuracy_m, place_note, water_depth_cm, water_trend,
                                   people, vulnerable, needs, details, contact_name, contact_phone, reporter_hash, edit_token_hash,
                                   observed_at, subdistrict_pcode, district_pcode)
      select ${input.hazard}, ${input.urgency}, p.g, ${input.locationSource}, ${input.gpsAccuracyM}, ${input.placeNote},
             ${input.waterDepthCm}, ${input.waterTrend}, ${input.people}, ${input.vulnerable}, ${input.needs}::text[], ${input.details},
             ${input.contactName}, ${input.contactPhone}, ${reporterHash}, ${sha256(editToken)},
             coalesce(${input.observedAt}::timestamptz, now()),
             (select a.pcode from admin_areas a where a.level = 3 and st_covers(a.geom, p.g) limit 1),
             (select a.pcode from admin_areas a where a.level = 2 and st_covers(a.geom, p.g) limit 1)
        from p
      returning public_id`;
    return { ok: true as const, id: row!.public_id, editToken };
  });
}

export interface ListOptions {
  /** Only reports created or updated within this many hours. */
  hours: number;
  openOnly: boolean;
  hazard?: string | null;
  limit?: number;
}

export async function listPublicReports(sql: Sql, o: ListOptions): Promise<PublicReport[]> {
  const rows = await sql.unsafe<Row[]>(
    `select ${PUBLIC_COLUMNS} ${FROM}
      where not r.hidden
        and r.updated_at >= now() - make_interval(hours => $1)
        and ($2::boolean is false or r.status in ('new', 'on_the_way'))
        and ($3::text is null or r.hazard = $3)
      order by (r.urgency = 'life' and r.status in ('new', 'on_the_way')) desc, (r.status = 'new') desc, r.created_at desc
      limit $4`,
    [o.hours, o.openOnly, o.hazard ?? null, Math.min(o.limit ?? 500, 1000)],
  );
  return rows.map(toPublic);
}

interface UpdateRow {
  id: string;
  created_at: Date;
  action: ReportUpdate['action'];
  note: string | null;
  author_name: string | null;
  by_reporter: boolean;
  water_depth_cm: number | null;
  water_trend: ReportUpdate['waterTrend'];
  observed_at: Date | null;
}

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

export async function getPublicReport(sql: Sql, id: string): Promise<{ report: PublicReport; updates: ReportUpdate[]; photos: ReportPhoto[] } | null> {
  const [row] = await sql.unsafe<Row[]>(`select ${PUBLIC_COLUMNS} ${FROM} where r.public_id = $1 and not r.hidden`, [id]);
  if (!row) return null;
  const updates = await sql<UpdateRow[]>`
    select u.id::text as id, u.created_at, u.action, u.note, u.author_name, u.by_reporter, u.water_depth_cm, u.water_trend, u.observed_at
      from citizen_report_updates u join citizen_reports r on r.id = u.report_id
     where r.public_id = ${id}
     order by u.created_at`;
  const photos = await sql<{ public_id: string; created_at: Date; width: number | null; height: number | null; update_id: string | null; exif_taken_at: Date | null; exif_distance_m: number | null }[]>`
    select p.public_id, p.created_at, p.width, p.height, p.update_id::text as update_id, p.exif_taken_at, p.exif_distance_m
      from citizen_report_photos p join citizen_reports r on r.id = p.report_id
     where r.public_id = ${id}
     order by p.created_at`;
  return {
    report: toPublic(row),
    updates: updates.map((u) => ({
      id: u.id,
      at: new Date(u.created_at).toISOString(),
      action: u.action,
      note: u.note,
      authorName: u.author_name,
      byReporter: u.by_reporter,
      waterDepthCm: u.water_depth_cm,
      waterTrend: u.water_trend,
      observedAt: iso(u.observed_at),
    })),
    photos: photos.map((p) => ({
      id: p.public_id,
      url: `/api/reports/photos/${p.public_id}`,
      width: p.width,
      height: p.height,
      createdAt: new Date(p.created_at).toISOString(),
      updateId: p.update_id,
      exifTakenAt: iso(p.exif_taken_at),
      exifDistanceM: p.exif_distance_m === null ? null : Math.round(p.exif_distance_m),
    })),
  };
}

export type UpdateResult =
  | { ok: true; updateId: string; photoToken: string; status: StatusId; byReporter: boolean }
  | { ok: false; reason: 'not_found' | 'rate_limited' | 'cannot_confirm' };

/**
 * Anyone can post an update. The status follows the latest status-changing
 * update; the timeline keeps all of them, so a wrong "resolved" can be seen
 * and reversed with "still needs help". A confirmation counts once per
 * connection and never from the reporter.
 */
export async function addUpdate(sql: Sql, id: string, u: UpdateInput, reporterHash: string | null): Promise<UpdateResult> {
  const photoToken = randomBytes(16).toString('hex');
  return sql.begin(async (tx) => {
    const [r] = await tx<{ id: string; status: StatusId; edit_token_hash: string | null; reporter_hash: string | null }[]>`
      select id, status, edit_token_hash, reporter_hash from citizen_reports where public_id = ${id} and not hidden for update`;
    if (!r) return { ok: false as const, reason: 'not_found' as const };
    if (reporterHash) {
      await tx`select pg_advisory_xact_lock(hashtext(${`u:${reporterHash}`}))`;
      const [c] = await tx<{ n: number }[]>`
        select count(*)::int as n from citizen_report_updates where reporter_hash = ${reporterHash} and created_at > now() - interval '1 hour'`;
      if ((c?.n ?? 0) >= LIMITS.updatesPerHour) return { ok: false as const, reason: 'rate_limited' as const };
    }
    const byReporter = u.editToken !== null && r.edit_token_hash !== null && sha256(u.editToken) === r.edit_token_hash;
    if (u.action === 'confirm') {
      if (byReporter || !reporterHash || reporterHash === r.reporter_hash) return { ok: false as const, reason: 'cannot_confirm' as const };
      const [dup] = await tx<{ n: number }[]>`
        select count(*)::int as n from citizen_report_updates where report_id = ${r.id} and action = 'confirm' and reporter_hash = ${reporterHash}`;
      if ((dup?.n ?? 0) > 0) return { ok: false as const, reason: 'cannot_confirm' as const };
    }
    const next = (UPDATE_ACTIONS.find((a) => a.id === u.action)?.status ?? null) as StatusId | null;
    const [ins] = await tx<{ id: string }[]>`
      insert into citizen_report_updates (report_id, action, note, author_name, by_reporter, reporter_hash,
                                          water_depth_cm, water_trend, observed_at, photo_token_hash)
      values (${r.id}, ${u.action}, ${u.note}, ${u.authorName}, ${byReporter}, ${reporterHash},
              ${u.waterDepthCm}, ${u.waterTrend}, ${u.observedAt ?? (u.waterDepthCm !== null ? new Date().toISOString() : null)}, ${sha256(photoToken)})
      returning id::text as id`;
    const [after] = await tx<{ status: StatusId }[]>`
      update citizen_reports set status = coalesce(${next}, status), updated_at = now() where id = ${r.id} returning status`;
    return { ok: true as const, updateId: ins!.id, photoToken, status: after!.status, byReporter };
  });
}

// ---------------------------------------------------------------- photos

export interface PhotoInput {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  bytes: Buffer;
  width: number | null;
  height: number | null;
  exifTakenAt: string | null;
  exifLat: number | null;
  exifLng: number | null;
}

export type PhotoResult = { ok: true; id: string } | { ok: false; reason: 'not_found' | 'forbidden' | 'too_many' | 'rate_limited' };

/**
 * Attach a photo to the report (needs the reporter's edit token) or to an
 * update (needs that update's photo token, valid for one hour). The file's
 * coordinates are turned into a distance from the pin and dropped.
 */
export async function addPhoto(
  sql: Sql,
  reportId: string,
  target: { editToken: string } | { updateId: string; photoToken: string },
  p: PhotoInput,
  reporterHash: string | null,
): Promise<PhotoResult> {
  return sql.begin(async (tx) => {
    const [r] = await tx<{ id: string; edit_token_hash: string | null }[]>`
      select id, edit_token_hash from citizen_reports where public_id = ${reportId} and not hidden for update`;
    if (!r) return { ok: false as const, reason: 'not_found' as const };
    let updateId: string | null = null;
    if ('editToken' in target) {
      if (!r.edit_token_hash || sha256(target.editToken) !== r.edit_token_hash) return { ok: false as const, reason: 'forbidden' as const };
    } else {
      const [u] = await tx<{ id: string }[]>`
        select id::text as id from citizen_report_updates
         where id = ${target.updateId}::bigint and report_id = ${r.id} and photo_token_hash = ${sha256(target.photoToken)}
           and created_at > now() - interval '1 hour'`;
      if (!u) return { ok: false as const, reason: 'forbidden' as const };
      updateId = u.id;
    }
    const [n] = await tx<{ n: number }[]>`
      select count(*)::int as n from citizen_report_photos
       where report_id = ${r.id} and update_id is not distinct from ${updateId}::bigint`;
    if ((n?.n ?? 0) >= LIMITS.photosPerItem) return { ok: false as const, reason: 'too_many' as const };
    if (reporterHash) {
      await tx`select pg_advisory_xact_lock(hashtext(${`p:${reporterHash}`}))`;
      const [c] = await tx<{ n: number }[]>`
        select count(*)::int as n from citizen_report_photos where reporter_hash = ${reporterHash} and created_at > now() - interval '1 hour'`;
      if ((c?.n ?? 0) >= LIMITS.photosPerHour) return { ok: false as const, reason: 'rate_limited' as const };
    }
    const hasGps = p.exifLat !== null && p.exifLng !== null;
    const [row] = await tx<{ public_id: string }[]>`
      insert into citizen_report_photos (report_id, update_id, mime, bytes, width, height, exif_taken_at, exif_distance_m, reporter_hash)
      select ${r.id}, ${updateId}::bigint, ${p.mime}, ${p.bytes}, ${p.width}, ${p.height}, ${p.exifTakenAt}::timestamptz,
             ${hasGps ? tx`st_distance(r.geom::geography, st_setsrid(st_makepoint(${p.exifLng}, ${p.exifLat}), 4326)::geography)` : tx`null`},
             ${reporterHash}
        from citizen_reports r where r.id = ${r.id}
      returning public_id`;
    return { ok: true as const, id: row!.public_id };
  });
}

/** Photo bytes for display; nothing for hidden reports. */
export async function getPhoto(sql: Sql, publicId: string): Promise<{ mime: string; bytes: Buffer } | null> {
  const [row] = await sql<{ mime: string; bytes: Buffer }[]>`
    select p.mime, p.bytes from citizen_report_photos p join citizen_reports r on r.id = p.report_id
     where p.public_id = ${publicId} and not r.hidden`;
  return row ?? null;
}

/** One flag per connection; the report is hidden once LIMITS.flagsToHide connections flag it. */
export async function flagReport(sql: Sql, id: string, reporterHash: string): Promise<{ ok: boolean; hidden: boolean }> {
  return sql.begin(async (tx) => {
    const [r] = await tx<{ id: string }[]>`select id from citizen_reports where public_id = ${id} for update`;
    if (!r) return { ok: false, hidden: false };
    await tx`insert into citizen_report_flags (report_id, reporter_hash) values (${r.id}, ${reporterHash}) on conflict do nothing`;
    const [after] = await tx<{ hidden: boolean }[]>`
      update citizen_reports
         set flag_count = (select count(*) from citizen_report_flags f where f.report_id = ${r.id}),
             hidden = hidden or (select count(*) from citizen_report_flags f where f.report_id = ${r.id}) >= ${LIMITS.flagsToHide}
       where id = ${r.id}
      returning hidden`;
    return { ok: true, hidden: after!.hidden };
  });
}
