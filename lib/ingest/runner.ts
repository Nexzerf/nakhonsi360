/**
 * Run one ingest adapter: fetch → parse → validate → clip to the province +
 * 5 km → upsert, recording the run in `ingest_runs`. A failure is recorded
 * and returned; it never throws past the runner, so one provider cannot stop
 * the others.
 */
import type postgres from 'postgres';
import { validateObservation } from '@/lib/validation/observation';
import { validateThaiPoint } from '@/lib/validation/geometry';
import type { FetchContext, IngestAdapter, ParsedBatch, Rejection } from '@/lib/ingest/types';

type Sql = postgres.Sql;

export const USER_AGENT = 'Nakhonsi360/0.1 (environmental map of Nakhon Si Thammarat; https://github.com/nexzerf/nakhonsi360)';

export interface IngestResult {
  sourceId: string;
  status: 'ok' | 'partial' | 'error';
  runId: number;
  stations: number;
  observations: number;
  hazards: number;
  forecasts: number;
  rejected: number;
  outsideArea: number;
  error?: string;
}

export async function studyAreaBBox(sql: Sql): Promise<[number, number, number, number] | null> {
  const [row] = await sql<{ b: number[] }[]>`
    select array[st_xmin(buffered_bbox), st_ymin(buffered_bbox), st_xmax(buffered_bbox), st_ymax(buffered_bbox)] as b
      from province_extent limit 1`;
  return row ? (row.b.map(Number) as [number, number, number, number]) : null;
}

/** Validate parsed records; returns what may be stored plus every rejection with its reason. */
export function validateBatch(batch: ParsedBatch, now = new Date()): ParsedBatch {
  const rejections: Rejection[] = [...batch.rejections];
  const stations = batch.stations.filter((s) => {
    const v = validateThaiPoint(s.lng, s.lat);
    if (!v.ok) rejections.push({ reason: `station_${v.reason}`, ref: s.stationId });
    return v.ok;
  });
  const known = new Set(stations.map((s) => s.stationId));
  const observations = batch.observations.filter((o) => {
    if (!o.stationId || !known.has(o.stationId)) {
      rejections.push({ reason: 'unknown_station', ref: o.stationId });
      return false;
    }
    const v = validateObservation(o, now);
    if (!v.ok) rejections.push({ reason: v.reason, ref: `${o.stationId}/${o.variable}` });
    return v.ok;
  });
  const hazards = batch.hazards.filter((h) => {
    const t = new Date(h.observedAt);
    const bad = Number.isNaN(t.getTime()) ? 'bad_timestamp' : t.getTime() - now.getTime() > 3_600_000 ? 'future_timestamp' : null;
    if (bad) rejections.push({ reason: bad, ref: h.featureKey });
    return !bad;
  });
  const forecasts = (batch.forecasts ?? []).filter((f) => {
    const t = new Date(f.validAt);
    const bad = Number.isNaN(t.getTime())
      ? 'bad_timestamp'
      : !Number.isFinite(f.lng) || !Number.isFinite(f.lat)
        ? 'bad_coordinates'
        : Object.values(f.values).some((v) => !Number.isFinite(v))
          ? 'not_a_number'
          : null;
    if (bad) rejections.push({ reason: bad, ref: `${f.placeCode}/${f.resolution}/${f.validAt}` });
    return !bad;
  });
  return { stations, observations, hazards, forecasts, rejections };
}

export async function runIngest(
  sql: Sql,
  adapter: IngestAdapter,
  opts: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch; raw?: unknown; onRaw?: (raw: unknown) => Promise<void> } = {},
): Promise<IngestResult> {
  const [run] = await sql<{ id: string }[]>`insert into ingest_runs (source_id, status) values (${adapter.sourceId}, 'running') returning id`;
  const runId = Number(run!.id);
  const base = { sourceId: adapter.sourceId, runId, stations: 0, observations: 0, hazards: 0, forecasts: 0, rejected: 0, outsideArea: 0 };

  const fail = async (error: string): Promise<IngestResult> => {
    await sql`update ingest_runs set status = 'error', finished_at = now(), error = ${error.slice(0, 2000)} where id = ${runId}`;
    return { ...base, status: 'error', error };
  };

  try {
    const env = opts.env ?? process.env;
    const missing = (adapter.requiredEnv ?? []).filter((k) => !env[k]);
    if (missing.length) return await fail(`missing environment variables: ${missing.join(', ')}`);

    let raw = opts.raw;
    if (raw === undefined) {
      const bbox = await studyAreaBBox(sql);
      if (!bbox) return await fail('province extent missing: import admin boundaries first');
      const ctx: FetchContext = { bbox, env, fetch: opts.fetchImpl ?? fetch, userAgent: USER_AGENT };
      raw = await adapter.fetchRaw(ctx);
      await opts.onRaw?.(raw);
    }
    const fetchedAt = new Date().toISOString();
    const batch = validateBatch(adapter.parse(raw, fetchedAt));
    const fetchedCount = batch.stations.length + batch.observations.length + batch.hazards.length + (batch.forecasts?.length ?? 0) + batch.rejections.length;

    const counts = await sql.begin(async (tx) => {
      // Stations inside the province + buffer only; others are not stored (not an error).
      const stationRows = batch.stations.map((s) => ({
        station_id: s.stationId,
        name_th: s.nameTh,
        name_en: s.nameEn,
        lng: s.lng,
        lat: s.lat,
        admin_text: s.adminText ?? null,
        river_name: s.riverName ?? null,
        basin_code: s.basinCode ?? null,
        properties: s.properties ?? {},
      }));
      const kept = stationRows.length
        ? await tx<{ station_id: string }[]>`
            insert into stations (source_id, station_id, name_th, name_en, geom, admin_text, river_name, basin_code, properties)
            select ${adapter.sourceId}, r.station_id, r.name_th, r.name_en, st_setsrid(st_makepoint(r.lng, r.lat), 4326),
                   r.admin_text, r.river_name, r.basin_code, r.properties
              from jsonb_to_recordset(${tx.json(stationRows as never)}::jsonb)
                as r(station_id text, name_th text, name_en text, lng float8, lat float8, admin_text text, river_name text, basin_code text, properties jsonb)
             where exists (select 1 from province_extent pe where st_covers(pe.buffered, st_setsrid(st_makepoint(r.lng, r.lat), 4326)))
            on conflict (source_id, station_id) do update
              set name_th = excluded.name_th, name_en = excluded.name_en, geom = excluded.geom, admin_text = excluded.admin_text,
                  river_name = excluded.river_name, basin_code = excluded.basin_code, properties = excluded.properties, last_seen = now()
            returning station_id`
        : [];
      const keptIds = new Set(kept.map((k) => k.station_id));

      const obsRows = batch.observations
        .filter((o) => keptIds.has(o.stationId!))
        .map((o) => ({
          station_id: o.stationId,
          variable: o.variable,
          value: o.value,
          unit: o.unit,
          observed_at: o.observedAt,
          fetched_at: o.fetchedAt,
          official_status: o.officialStatus ?? null,
          official_level: o.officialLevel ?? null,
          official_color: o.officialColor ?? null,
          official_detail: o.officialDetail ?? null,
          raw: (o.raw ?? null) as never,
        }));
      let obsInserted = 0;
      for (let i = 0; i < obsRows.length; i += 1000) {
        const r = await tx`
          insert into observations (source_id, station_id, variable, value, unit, observed_at, fetched_at,
                                    official_status, official_level, official_color, official_detail, raw)
          select ${adapter.sourceId}, r.station_id, r.variable, r.value, r.unit, r.observed_at, r.fetched_at,
                 r.official_status, r.official_level, r.official_color, r.official_detail, r.raw
            from jsonb_to_recordset(${tx.json(obsRows.slice(i, i + 1000) as never)}::jsonb)
              as r(station_id text, variable text, value float8, unit text, observed_at timestamptz, fetched_at timestamptz,
                   official_status text, official_level smallint, official_color text, official_detail text, raw jsonb)
          on conflict (source_id, station_id, variable, observed_at) do nothing`;
        obsInserted += r.count;
      }

      let hazInserted = 0;
      for (const h of batch.hazards) {
        const r = await tx`
          insert into hazard_features (source_id, feature_key, kind, observed_at, valid_until, fetched_at, properties, geom)
          select ${adapter.sourceId}, ${h.featureKey}, ${h.kind}, ${h.observedAt}, ${h.validUntil ?? null}, ${fetchedAt},
                 ${tx.json((h.properties ?? {}) as never)}, g
            from (select st_makevalid(st_setsrid(st_geomfromgeojson(${JSON.stringify(h.geometry)}), 4326)) as g) s
           where exists (select 1 from province_extent pe where st_intersects(pe.buffered, s.g))
          on conflict (source_id, feature_key) do update
            set observed_at = excluded.observed_at, valid_until = excluded.valid_until, fetched_at = excluded.fetched_at,
                properties = excluded.properties, geom = excluded.geom`;
        hazInserted += r.count;
      }
      // Forecasts: places whose reference point is inside the province + buffer; the latest run replaces earlier values.
      const fcRows = (batch.forecasts ?? []).map((f) => ({
        place_code: f.placeCode, place_name: f.placeName, resolution: f.resolution, valid_at: f.validAt, lng: f.lng, lat: f.lat, vals: f.values,
      }));
      let fcInserted = 0;
      for (let i = 0; i < fcRows.length; i += 1000) {
        const r = await tx`
          insert into forecasts (source_id, place_code, place_name, admin_pcode, resolution, valid_at, fetched_at, vals, geom)
          select ${adapter.sourceId}, r.place_code, r.place_name,
                 (select a.pcode from admin_areas a where a.pcode = 'TH' || r.place_code),
                 r.resolution, r.valid_at, ${fetchedAt}, r.vals, st_setsrid(st_makepoint(r.lng, r.lat), 4326)
            from jsonb_to_recordset(${tx.json(fcRows.slice(i, i + 1000) as never)}::jsonb)
              as r(place_code text, place_name text, resolution text, valid_at timestamptz, lng float8, lat float8, vals jsonb)
           where exists (select 1 from province_extent pe where st_covers(pe.buffered, st_setsrid(st_makepoint(r.lng, r.lat), 4326)))
          on conflict (source_id, resolution, place_code, valid_at) do update
            set place_name = excluded.place_name, admin_pcode = excluded.admin_pcode, fetched_at = excluded.fetched_at,
                vals = excluded.vals, geom = excluded.geom`;
        fcInserted += r.count;
      }
      return { stations: keptIds.size, outsideArea: stationRows.length - keptIds.size, observations: obsInserted, hazards: hazInserted, forecasts: fcInserted };
    });

    // A few bad records are normal; flag the run only when more than 10% were rejected.
    const status = fetchedCount > 0 && batch.rejections.length / fetchedCount > 0.1 ? 'partial' : 'ok';
    const reasons: Record<string, number> = {};
    for (const r of batch.rejections) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
    await sql`
      update ingest_runs
         set status = ${status}, finished_at = now(), rows = ${counts.observations + counts.hazards + counts.forecasts},
             fetched_count = ${fetchedCount}, rejected = ${batch.rejections.length},
             details = ${sql.json({ ...counts, rejectionReasons: reasons, rejectionSample: batch.rejections.slice(0, 50) } as never)}
       where id = ${runId}`;
    return { ...base, ...counts, status, rejected: batch.rejections.length };
  } catch (err) {
    return await fail(describeError(err));
  }
}

/** Error text including the network cause (e.g. "fetch failed (ECONNRESET: socket hang up)"). */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
  const detail = cause ? [cause.code, cause.message].filter(Boolean).join(': ') : '';
  return detail && !err.message.includes(detail) ? `${err.message} (${detail})` : err.message;
}

/**
 * GET with polite retries: network errors and 429/5xx are retried with
 * backoff (2 s, 6 s); other HTTP errors fail immediately.
 */
export async function fetchWithRetry(fetchImpl: typeof fetch, url: string, init: RequestInit & { timeoutMs?: number } = {}, delays = [2000, 6000]): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const r = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 60_000) });
      if (r.status !== 429 && r.status < 500) return r;
      last = new Error(`HTTP ${r.status}`);
    } catch (err) {
      last = err;
    }
    const wait = delays[attempt];
    if (wait !== undefined) await new Promise((res) => setTimeout(res, wait));
  }
  throw last instanceof Error ? last : new Error(String(last));
}
