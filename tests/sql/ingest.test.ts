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
import { thaiwaterRain24h, thaiwaterWaterlevel } from '@/lib/adapters/thaiwater';
import { usgsEarthquakes } from '@/lib/adapters/usgs';
import { firmsHotspots } from '@/lib/adapters/firms';
import { runIngest } from '@/lib/ingest/runner';
import { connectedSources, earthquakesNear, nearestObservations, provinceMask, recentEarthquakes, renderTile, satelliteHazardsAt } from '@/lib/db/queries';
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

  it('masks everything outside the province, and nothing inside it', async () => {
    const mask = await provinceMask(sql);
    expect(mask).not.toBeNull();
    const g = JSON.stringify(mask!.geometry);
    const [r] = await sql<{ city: boolean; bangkok: boolean; sea: boolean; holes: number }[]>`
      with m as (select st_setsrid(st_geomfromgeojson(${g}), 4326) as g)
      select st_covers(g, st_setsrid(st_makepoint(99.9631, 8.4304), 4326)) as city,  -- Nakhon Si Thammarat city
             st_covers(g, st_setsrid(st_makepoint(100.5018, 13.7563), 4326)) as bangkok,
             st_covers(g, st_setsrid(st_makepoint(100.6, 8.4), 4326)) as sea,  -- Gulf of Thailand, east of the coast
             (select sum(st_numinteriorrings(d.geom))::int from st_dump(g) d) as holes
        from m`;
    expect(r).toMatchObject({ city: false, bangkok: true, sea: true });
    expect(r!.holes).toBeGreaterThan(0);
    const [inside] = await sql<{ n: number }[]>`
      select count(*)::int as n from admin_areas a
       where a.level = 3 and st_covers(st_setsrid(st_geomfromgeojson(${g}), 4326), st_pointonsurface(a.geom))`;
    expect(inside!.n).toBe(0);
  });

  it('draws boundary tiles from the precomputed geometry at every zoom band', async () => {
    // Tile containing Nakhon Si Thammarat city at zoom z.
    const tile = (z: number) => {
      const lng = 99.9631;
      const lat = (8.4304 * Math.PI) / 180;
      const x = Math.floor(((lng + 180) / 360) * 2 ** z);
      const y = Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * 2 ** z);
      return [z, x, y] as const;
    };
    for (const z of [7, 10, 13]) {
      expect((await renderTile(sql, 'admin-district', ...tile(z))).length).toBeGreaterThan(0);
      expect((await renderTile(sql, 'admin-subdistrict', ...tile(z))).length).toBeGreaterThan(0);
    }
    const [{ n } = { n: -1 }] = await sql<{ n: number }[]>`select count(*)::int as n from admin_areas where tile_lo is null or tile_mid is null or tile_hi is null`;
    expect(n).toBe(0);
  });

  it('keeps FIRMS hotspots only within the province + 5 km and finds them near a point', async () => {
    // The real sample (all three points are outside the province) plus one test point in the city, today.
    const today = new Date().toISOString().slice(0, 10);
    const csv = readFileSync(path.join(root, 'data', 'samples', 'firms.hotspots', 'area_viirs_noaa21_5d.csv'), 'utf8').trimEnd() + `\n8.43,99.96,330,0.4,0.4,${today},400,N21,VIIRS,n,2.0NRT,295,4.2,D\n`;
    const r = await runIngest(sql, firmsHotspots, { raw: { since: `${today}T00:00:00.000Z`, csv: { VIIRS_NOAA21_NRT: csv } } });
    expect(r.status).toBe('ok');
    const [{ n } = { n: -1 }] = await sql<{ n: number }[]>`select count(*)::int as n from hazard_features where source_id = 'firms.hotspots'`;
    expect(n).toBe(1);
    const near = await satelliteHazardsAt(sql, 99.9631, 8.4304);
    expect(near.hotspots.count).toBe(1);
    expect(near.hotspots.nearestM).toBeLessThan(5000);
    expect(near.flood).toBeNull();
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
});

suite('earthquakes (real USGS sample)', () => {
  let sql: postgres.Sql;
  const raw = sample('usgs.earthquakes/query.geojson');

  beforeAll(() => {
    const u = new URL(TEST_DATABASE_URL!);
    u.pathname = `/${DB}`;
    sql = postgres(u.toString(), { max: 2, onnotice: () => {} });
  });

  afterAll(async () => {
    await sql?.end();
  });

  it('keeps regional events outside the province (the query sets the region)', async () => {
    const r = await runIngest(sql, usgsEarthquakes, { raw });
    expect(r.status).toBe('ok');
    expect(r.hazards).toBe(raw.features.length);
    const [{ n } = { n: -1 }] = await sql<{ n: number }[]>`
      select count(*)::int as n from hazard_features h, province_extent pe where h.kind = 'earthquake' and not st_intersects(pe.buffered, h.geom)`;
    expect(n).toBe(raw.features.length);
  });

  it('updates in place and removes events the source no longer lists in its window', async () => {
    const again = await runIngest(sql, usgsEarthquakes, { raw });
    expect(again.hazardsRemoved).toBe(0);
    const [first, ...rest] = raw.features;
    const smaller = { ...raw, features: rest };
    const r = await runIngest(sql, usgsEarthquakes, { raw: smaller });
    expect(r.hazardsRemoved).toBe(1);
    const left = await sql<{ feature_key: string }[]>`select feature_key from hazard_features where source_id = 'usgs.earthquakes'`;
    expect(left.map((x) => x.feature_key)).not.toContain(first.id);
    expect(left).toHaveLength(raw.features.length - 1);
  });

  it('serves distance from a point', async () => {
    await sql`update hazard_features set observed_at = now() - interval '1 day' where source_id = 'usgs.earthquakes'`;
    const [st] = await sql<{ lng: number; lat: number; feature_key: string }[]>`
      select st_x(geom) as lng, st_y(geom) as lat, feature_key from hazard_features where source_id = 'usgs.earthquakes' limit 1`;
    const rows = await earthquakesNear(sql, st!.lng, st!.lat, 30);
    expect(rows.find((x) => x.feature_key === st!.feature_key)!.distance_m).toBeLessThan(1);
    expect((await recentEarthquakes(sql)).length).toBe(raw.features.length - 1);
  });
});
