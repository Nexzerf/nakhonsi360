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
import { runIngest } from '@/lib/ingest/runner';
import { connectedSources, nearestObservations } from '@/lib/db/queries';
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
});
