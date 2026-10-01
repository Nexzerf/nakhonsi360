/**
 * SQL for citizen reports. Free of Next.js imports so the SQL test suite can
 * run it against a real PostGIS database.
 */
import { createHash, randomBytes } from 'node:crypto';
import type postgres from 'postgres';
import type { PublicReport, ReportInput, ReportUpdate, StatusId, UpdateInput } from '@/lib/reports/schema';
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
  contact_name: string | null;
  contact_phone: string | null;
  subdistrict_th: string | null;
  district_th: string | null;
  update_count: number;
  last_at: Date | null;
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
  r.needs, r.details, r.status,
  case when r.status in ('new', 'on_the_way') then r.contact_name end as contact_name,
  case when r.status in ('new', 'on_the_way') then r.contact_phone end as contact_phone,
  s.name_th as subdistrict_th, d.name_th as district_th,
  (select count(*)::int from citizen_report_updates u where u.report_id = r.id) as update_count,
  lu.created_at as last_at, lu.action as last_action, lu.note as last_note, lu.author_name as last_author, lu.by_reporter as last_by_reporter`;

const FROM = `
  from citizen_reports r
  left join admin_areas s on s.pcode = r.subdistrict_pcode
  left join admin_areas d on d.pcode = r.district_pcode
  left join lateral (
    select u.created_at, u.action, u.note, u.author_name, u.by_reporter
      from citizen_report_updates u where u.report_id = r.id order by u.created_at desc limit 1
  ) lu on true`;

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
    contactName: r.contact_name,
    contactPhone: r.contact_phone,
    lastUpdate: r.last_at
      ? { at: new Date(r.last_at).toISOString(), action: r.last_action!, note: r.last_note, authorName: r.last_author, byReporter: r.last_by_reporter === true }
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
                                   subdistrict_pcode, district_pcode)
      select ${input.hazard}, ${input.urgency}, p.g, ${input.locationSource}, ${input.gpsAccuracyM}, ${input.placeNote},
             ${input.waterDepthCm}, ${input.waterTrend}, ${input.people}, ${input.vulnerable}, ${input.needs}::text[], ${input.details},
             ${input.contactName}, ${input.contactPhone}, ${reporterHash}, ${sha256(editToken)},
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

export async function getPublicReport(sql: Sql, id: string): Promise<{ report: PublicReport; updates: ReportUpdate[] } | null> {
  const [row] = await sql.unsafe<Row[]>(`select ${PUBLIC_COLUMNS} ${FROM} where r.public_id = $1 and not r.hidden`, [id]);
  if (!row) return null;
  const updates = await sql<{ created_at: Date; action: ReportUpdate['action']; note: string | null; author_name: string | null; by_reporter: boolean }[]>`
    select u.created_at, u.action, u.note, u.author_name, u.by_reporter
      from citizen_report_updates u join citizen_reports r on r.id = u.report_id
     where r.public_id = ${id}
     order by u.created_at`;
  return {
    report: toPublic(row),
    updates: updates.map((u) => ({ at: new Date(u.created_at).toISOString(), action: u.action, note: u.note, authorName: u.author_name, byReporter: u.by_reporter })),
  };
}

export type UpdateResult = { ok: true; status: StatusId; byReporter: boolean } | { ok: false; reason: 'not_found' | 'rate_limited' };

/**
 * Anyone can post an update. The status follows the latest status-changing
 * update; the timeline keeps all of them, so a wrong "resolved" can be seen
 * and reversed with "still needs help".
 */
export async function addUpdate(sql: Sql, id: string, u: UpdateInput, reporterHash: string | null): Promise<UpdateResult> {
  return sql.begin(async (tx) => {
    const [r] = await tx<{ id: string; status: StatusId; edit_token_hash: string | null }[]>`
      select id, status, edit_token_hash from citizen_reports where public_id = ${id} and not hidden for update`;
    if (!r) return { ok: false as const, reason: 'not_found' as const };
    if (reporterHash) {
      await tx`select pg_advisory_xact_lock(hashtext(${`u:${reporterHash}`}))`;
      const [c] = await tx<{ n: number }[]>`
        select count(*)::int as n from citizen_report_updates where reporter_hash = ${reporterHash} and created_at > now() - interval '1 hour'`;
      if ((c?.n ?? 0) >= LIMITS.updatesPerHour) return { ok: false as const, reason: 'rate_limited' as const };
    }
    const byReporter = u.editToken !== null && r.edit_token_hash !== null && sha256(u.editToken) === r.edit_token_hash;
    const next = (UPDATE_ACTIONS.find((a) => a.id === u.action)?.status ?? null) as StatusId | null;
    await tx`
      insert into citizen_report_updates (report_id, action, note, author_name, by_reporter, reporter_hash)
      values (${r.id}, ${u.action}, ${u.note}, ${u.authorName}, ${byReporter}, ${reporterHash})`;
    const [after] = await tx<{ status: StatusId }[]>`
      update citizen_reports set status = coalesce(${next}, status), updated_at = now() where id = ${r.id} returning status`;
    return { ok: true as const, status: after!.status, byReporter };
  });
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
