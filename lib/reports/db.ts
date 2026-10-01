/**
 * SQL for citizen reports. Free of Next.js imports so the SQL test suite can
 * run it against a real PostGIS database.
 */
import type postgres from 'postgres';
import type { AdminReport, PublicReport, ReportInput, ReportUpdate, StatusId } from '@/lib/reports/schema';
import { LIMITS } from '@/lib/reports/schema';

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
  responder_note: string | null;
  subdistrict_th: string | null;
  district_th: string | null;
  has_contact: boolean;
}

// Never add contact_* or reporter_hash here: this list is served publicly.
const PUBLIC_COLUMNS = `
  r.public_id, r.created_at, r.updated_at, r.hazard, r.urgency, st_x(r.geom) as lng, st_y(r.geom) as lat,
  r.location_source, r.gps_accuracy_m, r.place_note, r.water_depth_cm, r.water_trend, r.people, r.vulnerable,
  r.needs, r.details, r.status, r.responder_note, s.name_th as subdistrict_th, d.name_th as district_th,
  (r.contact_phone is not null) as has_contact`;

const FROM = `
  from citizen_reports r
  left join admin_areas s on s.pcode = r.subdistrict_pcode
  left join admin_areas d on d.pcode = r.district_pcode`;

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
    responderNote: r.responder_note,
    subdistrictTh: r.subdistrict_th,
    districtTh: r.district_th,
    hasContact: r.has_contact,
  };
}

export type InsertResult = { ok: true; id: string } | { ok: false; reason: 'outside_study_area' | 'rate_limited' };

export async function insertReport(sql: Sql, input: ReportInput, reporterHash: string | null): Promise<InsertResult> {
  return sql.begin(async (tx) => {
    const [inside] = await tx<{ ok: boolean }[]>`select point_in_study_area(${input.lng}, ${input.lat}) as ok`;
    if (!inside?.ok) return { ok: false as const, reason: 'outside_study_area' as const };
    if (reporterHash) {
      // Serialise per reporter so parallel requests cannot pass the limit together.
      await tx`select pg_advisory_xact_lock(hashtext(${reporterHash}))`;
      const [c] = await tx<{ n: number }[]>`
        select count(*)::int as n from citizen_reports where reporter_hash = ${reporterHash} and created_at > now() - interval '1 hour'`;
      if ((c?.n ?? 0) >= LIMITS.perHour) return { ok: false as const, reason: 'rate_limited' as const };
    }
    const [row] = await tx<{ public_id: string }[]>`
      with p as (select st_setsrid(st_makepoint(${input.lng}, ${input.lat}), 4326) as g)
      insert into citizen_reports (hazard, urgency, geom, location_source, gps_accuracy_m, place_note, water_depth_cm, water_trend,
                                   people, vulnerable, needs, details, contact_name, contact_phone, reporter_hash,
                                   subdistrict_pcode, district_pcode)
      select ${input.hazard}, ${input.urgency}, p.g, ${input.locationSource}, ${input.gpsAccuracyM}, ${input.placeNote},
             ${input.waterDepthCm}, ${input.waterTrend}, ${input.people}, ${input.vulnerable}, ${input.needs}::text[], ${input.details},
             ${input.contactName}, ${input.contactPhone}, ${reporterHash},
             (select a.pcode from admin_areas a where a.level = 3 and st_covers(a.geom, p.g) limit 1),
             (select a.pcode from admin_areas a where a.level = 2 and st_covers(a.geom, p.g) limit 1)
        from p
      returning public_id`;
    return { ok: true as const, id: row!.public_id };
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
        and ($2::boolean is false or r.status in ('new', 'acknowledged', 'in_progress'))
        and ($3::text is null or r.hazard = $3)
      order by (r.urgency = 'life' and r.status in ('new', 'acknowledged', 'in_progress')) desc, r.created_at desc
      limit $4`,
    [o.hours, o.openOnly, o.hazard ?? null, Math.min(o.limit ?? 500, 1000)],
  );
  return rows.map(toPublic);
}

export async function getPublicReport(sql: Sql, id: string): Promise<{ report: PublicReport; updates: ReportUpdate[] } | null> {
  const [row] = await sql.unsafe<Row[]>(`select ${PUBLIC_COLUMNS} ${FROM} where r.public_id = $1 and not r.hidden`, [id]);
  if (!row) return null;
  const updates = await sql<{ created_at: Date; status: StatusId | null; note: string | null }[]>`
    select u.created_at, u.status, u.note
      from citizen_report_updates u join citizen_reports r on r.id = u.report_id
     where r.public_id = ${id}
     order by u.created_at`;
  return { report: toPublic(row), updates: updates.map((u) => ({ at: new Date(u.created_at).toISOString(), status: u.status, note: u.note })) };
}

/** Open reports and those updated in the last `hours`, including hidden ones and contact details. */
export async function listAdminReports(sql: Sql, hours: number): Promise<AdminReport[]> {
  const rows = await sql.unsafe<(Row & { contact_name: string | null; contact_phone: string | null; hidden: boolean })[]>(
    `select ${PUBLIC_COLUMNS}, r.contact_name, r.contact_phone, r.hidden ${FROM}
      where r.status in ('new', 'acknowledged', 'in_progress') or r.updated_at >= now() - make_interval(hours => $1)
      order by (r.status in ('new', 'acknowledged', 'in_progress')) desc, (r.urgency = 'life') desc, r.created_at desc
      limit 1000`,
    [hours],
  );
  return rows.map((r) => ({ ...toPublic(r), contactName: r.contact_name, contactPhone: r.contact_phone, hidden: r.hidden }));
}

export async function updateReport(sql: Sql, id: string, u: { status: StatusId | null; note: string | null; hidden: boolean | null }): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [r] = await tx<{ id: string }[]>`
      update citizen_reports
         set status = coalesce(${u.status}, status),
             responder_note = coalesce(${u.note}, responder_note),
             hidden = coalesce(${u.hidden}, hidden),
             updated_at = now()
       where public_id = ${id}
      returning id`;
    if (!r) return false;
    if (u.status !== null || u.note !== null) {
      await tx`insert into citizen_report_updates (report_id, status, note) values (${r.id}, ${u.status}, ${u.note})`;
    }
    return true;
  });
}
