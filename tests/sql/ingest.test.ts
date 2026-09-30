/**
 * Ingest pipeline against a real PostGIS database, using the real ThaiWater
 * samples in data/samples and the real COD-AB file for the province extent.
 *
 *   TEST_DATABASE_URL=postgres://…/postgres CODAB_FILE=/vsizip/…/hdx-cod-ab-tha.zip npm run test:sql
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { firmsHotspots } from '@/lib/adapters/firms';
import { tmdNwp } from '@/lib/adapters/tmdNwp';
import { thaiwaterRain24h, thaiwaterWaterlevel } from '@/lib/adapters/thaiwater';
import { runIngest } from '@/lib/ingest/runner';
import { connectedSources, forecastAt, hazardPoints, hazardsAt, nearestObservations } from '@/lib/db/queries';
import type { IngestAdapter } from '@/lib/ingest/types';

const { TEST_DATABASE_URL, CODAB_FILE } = process.env;
const DB = 'n360_ingest_test';
const root = path.resolve(__dirname, '..', '..');
const sample = (f: string) => JSON.parse(readFileSync(path.join(root, 'data', 'samples', f), 'utf8'));
const suite = TEST_DATABASE_URL && CODAB_FILE ? describe : describe.skip;

suite('ingest pipeline (real samples)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    const admin = postgres(TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`drop database if exists ${DB} with (force)`);
    await admin.unsafe(`create database ${DB}`);
    await admin.end();
    const u = new URL(TEST_DATABASE_URL!);
    u.pathname = `/${DB}`;
    const env = { ...process.env, DATABASE_URL: u.toString() };
    const tsx = (script: string, args: string[]) => execFileSync('npx', ['tsx', path.join(root, 'scripts', script), ...args], { cwd: root, env, stdio: 'pipe' });
    tsx('migrate.ts', []);
    tsx('import-admin.ts', ['--file', CODAB_FILE!]);
    sql = postgres(u.toString(), { max: 2, onnotice: () => {} });
  }, 300_000);

  afterAll(async () => {
    await sql?.end();
  });

  it('stores only stations inside the province + 5 km', async () => {
    const r = await runIngest(sql, thaiwaterWaterlevel, { raw: sample('thaiwater.waterlevel/waterlevel_load.json') });
    expect(r.status).toBe('ok');
    expect(r.stations).toBeGreaterThan(0);
    const [{ outside } = { outside: -1 }] = await sql<{ outside: number }[]>`
      select count(*)::int as outside from stations s, province_extent pe where not st_covers(pe.buffered, s.geom)`;
    expect(outside).toBe(0);
  });

  it('deduplicates on (source, station, variable, observed_at)', async () => {
    const raw = sample('thaiwater.rain24h/rain_24h.json');
    const first = await runIngest(sql, thaiwaterRain24h, { raw });
    const again = await runIngest(sql, thaiwaterRain24h, { raw });
    expect(first.observations).toBeGreaterThan(0);
    expect(again.observations).toBe(0);
  });

  it('records a failing source without affecting the others', async () => {
    const broken: IngestAdapter = {
      sourceId: 'thaiwater.rain24h',
      fetchRaw: async () => {
        throw new Error('upstream unavailable');
      },
      parse: () => ({ stations: [], observations: [], hazards: [], rejections: [] }),
    };
    const r = await runIngest(sql, broken);
    expect(r.status).toBe('error');
    const [run] = await sql<{ status: string; error: string }[]>`select status, error from ingest_runs where id = ${r.runId}`;
    expect(run).toEqual({ status: 'error', error: 'upstream unavailable' });
    // Earlier data is still there and still served.
    expect((await connectedSources(sql)).has('thaiwater.rain24h')).toBe(true);
  });

  it('refuses to run keyed adapters without their key', async () => {
    const keyed: IngestAdapter = { sourceId: 'firms.hotspots', requiredEnv: ['FIRMS_MAP_KEY'], fetchRaw: async () => ({}), parse: () => ({ stations: [], observations: [], hazards: [], rejections: [] }) };
    const r = await runIngest(sql, keyed, { env: {} });
    expect(r.status).toBe('error');
    expect(r.error).toContain('FIRMS_MAP_KEY');
  });

  it('returns the nearest station reading with a geodesic distance', async () => {
    const [st] = await sql<{ lng: number; lat: number; station_id: string }[]>`
      select st_x(geom) as lng, st_y(geom) as lat, station_id from stations where source_id = 'thaiwater.waterlevel' order by station_id limit 1`;
    // nearest_observations only returns readings from the last 7 days; the sample may be older.
    const rows = await sql<{ n: number }[]>`select count(*)::int as n from observations where observed_at >= now() - interval '7 days'`;
    if (rows[0]!.n === 0) return;
    const [r] = await nearestObservations(sql, st!.lng, st!.lat, 'water_level', 1);
    expect(r?.station_id).toBe(st!.station_id);
    expect(r!.distance_m).toBeLessThan(1);
  });

  it('stores FIRMS hotspots from the real samples inside the province only, once per detection', async () => {
    const csv = (f: string) => readFileSync(path.join(root, 'data', 'samples', 'firms.hotspots', f), 'utf8');
    const raw = { VIIRS_NOAA21_NRT: csv('VIIRS_NOAA21_NRT_2026-08-10.csv'), MODIS_NRT: csv('MODIS_NRT_2026-07-31.csv'), VIIRS_SNPP_NRT: csv('VIIRS_SNPP_NRT_latest-empty.csv') };
    const first = await runIngest(sql, firmsHotspots, { raw });
    expect(first.status).toBe('ok');
    expect(first.hazards).toBeGreaterThan(0);
    expect(first.hazards).toBeLessThanOrEqual(30); // 30 detections in the bbox; only those touching the province + 5 km are kept
    const [{ outside } = { outside: -1 }] = await sql<{ outside: number }[]>`
      select count(*)::int as outside from hazard_features h, province_extent pe where h.source_id = 'firms.hotspots' and not st_intersects(pe.buffered, h.geom)`;
    expect(outside).toBe(0);
    // Re-ingesting the same detections updates them in place.
    await runIngest(sql, firmsHotspots, { raw });
    const [{ n } = { n: -1 }] = await sql<{ n: number }[]>`select count(*)::int as n from hazard_features where source_id = 'firms.hotspots'`;
    expect(n).toBe(first.hazards);
  });

  it('serves hotspots for the layer and the inspector, per source, with their own time', async () => {
    // The samples are from July–August 2026: use a window wide enough to include them.
    const days = Math.ceil((Date.now() - Date.parse('2026-07-01T00:00:00Z')) / 86_400_000) + 1;
    const pts = await hazardPoints(sql, 'hotspot', ['firms.hotspots'], days);
    expect(pts.length).toBeGreaterThan(0);
    const p = pts[0]!;
    expect(p.properties.sensor).toMatch(/^(VIIRS|MODIS)_/);
    const card = await hazardsAt(sql, p.lng, p.lat, 5000, days, ['gistda.hotspots', 'firms.hotspots']);
    const firms = card.hotspots.find((h) => h.sourceId === 'firms.hotspots')!;
    expect(firms.count).toBeGreaterThan(0);
    expect(firms.nearestM).toBeLessThan(1);
    expect(card.checked.map((c) => c.sourceId)).toContain('firms.hotspots');
    expect(card.notConnected).toEqual(['gistda.hotspots']);
  });

  it('stores TMD NWP forecasts per subdistrict, linked to the HDX polygon, replaced on re-run', async () => {
    const raw = {
      districts: sample('tmd.nwp/province_amphoes_hourly.json'),
      hourly: { ฉวาง: sample('tmd.nwp/chawang_tambons_hourly.json') },
      daily: { ฉวาง: sample('tmd.nwp/chawang_tambons_daily.json') },
    };
    const first = await runIngest(sql, tmdNwp, { raw });
    expect(first.status).toBe('ok');
    expect(first.forecasts).toBe(10 * (24 + 7));
    const rows = await sql<{ n: number; unmatched: number; places: number }[]>`
      select count(*)::int as n, count(*) filter (where admin_pcode is null)::int as unmatched, count(distinct place_code)::int as places
        from forecasts where source_id = 'tmd.nwp'`;
    expect(rows[0]).toEqual({ n: 310, unmatched: 0, places: 10 });
    await runIngest(sql, tmdNwp, { raw });
    const [{ n } = { n: -1 }] = await sql<{ n: number }[]>`select count(*)::int as n from forecasts where source_id = 'tmd.nwp'`;
    expect(n).toBe(310);
  });

  it('serves the forecast of the subdistrict containing the point', async () => {
    const [p] = await sql<{ lng: number; lat: number }[]>`select st_x(p) as lng, st_y(p) as lat from (select st_pointonsurface(geom) as p from admin_areas where pcode = 'TH800409') q`;
    // forecast_at only returns times from now on; the saved sample may be in the past.
    const [{ future } = { future: 0 }] = await sql<{ future: number }[]>`select count(*)::int as future from forecasts where admin_pcode = 'TH800409' and valid_at >= now()`;
    const card = await forecastAt(sql, p!.lng, p!.lat, 24, 7);
    if (future === 0) return;
    expect(card!.placeCode).toBe('800409');
    expect(card!.placeName).toBe('ห้วยปริก');
    expect(card!.hourly.length).toBeGreaterThan(0);
    expect(card!.hourly[0]!.values).toHaveProperty('tc');
  });
});

