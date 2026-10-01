/**
 * End-to-end test of migrations + import scripts + spatial queries, run
 * against the REAL source files only (no synthetic data). Skipped unless all
 * of these are set:
 *
 *   TEST_DATABASE_URL=postgres://…/postgres   (user may create databases; a throwaway `n360_test` is created)
 *   CODAB_FILE=data/static/<HDX COD-AB Thailand file>
 *   DOPA_FILE=data/static/<DOPA villages file for Nakhon Si Thammarat>
 *   OSM_FILE=data/static/thailand-latest.osm.pbf
 *
 * Download the files with `npm run fetch:sources` (see SETUP.md).
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inspectAdmin, latestImports, nearestFeatures, nearestVillages, renderTile, searchGazetteer } from '@/lib/db/queries';

const { TEST_DATABASE_URL, CODAB_FILE, DOPA_FILE, OSM_FILE } = process.env;
const DB = 'n360_test';
const root = path.resolve(__dirname, '..', '..');
const suite = TEST_DATABASE_URL && CODAB_FILE && DOPA_FILE && OSM_FILE ? describe : describe.skip;

suite('phase 1 database (real source files)', () => {
  let sql: postgres.Sql;
  let dbUrl: string;

  const run = (script: string, args: string[]) =>
    execFileSync('npx', ['tsx', path.join(root, 'scripts', script), ...args], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: dbUrl },
      encoding: 'utf8',
      stdio: 'pipe',
    });

  beforeAll(async () => {
    const admin = postgres(TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`drop database if exists ${DB} with (force)`);
    await admin.unsafe(`create database ${DB}`);
    await admin.end();
    const u = new URL(TEST_DATABASE_URL!);
    u.pathname = `/${DB}`;
    dbUrl = u.toString();

    run('migrate.ts', []);
    run('import-admin.ts', ['--file', CODAB_FILE!]);
    run('import-villages.ts', ['--file', DOPA_FILE!]);
    run('import-osm.ts', ['--file', OSM_FILE!]);
    sql = postgres(dbUrl, { max: 2, onnotice: () => {} });
  }, 30 * 60_000);

  afterAll(async () => {
    await sql?.end();
  });

  it('stores exactly one province (TH80) with districts and subdistricts inside it', async () => {
    const rows = await sql<{ level: number; n: number }[]>`select level, count(*)::int as n from admin_areas group by level order by level`;
    expect(rows[0]).toEqual({ level: 1, n: 1 });
    expect(rows[1]!.n).toBeGreaterThan(0);
    expect(rows[2]!.n).toBeGreaterThan(0);
    const [{ outside } = { outside: -1 }] = await sql<{ outside: number }[]>`
      select count(*)::int as outside from admin_areas a, admin_areas p
       where p.level = 1 and a.level > 1 and not st_covers(st_buffer(p.geom::geography, 50)::geometry, a.geom)`;
    expect(outside).toBe(0);
  });

  it('shows in the registry the same village count that is in the table', async () => {
    const imp = (await latestImports(sql)).get('dopa.villages')!;
    const [{ n } = { n: -1 }] = await sql<{ n: number }[]>`select count(*)::int as n from villages`;
    const [{ u } = { u: -1 }] = await sql<{ u: number }[]>`select count(*)::int as u from villages_unlocated`;
    expect(n + u).toBe(imp.importedCount);
    expect(u).toBe(imp.unlocatedCount);
    expect(imp.importedCount + imp.rejectedCount).toBe(imp.sourceRecordCount);
  });

  it('finds ท่าศาลา as a district, a subdistrict and villages', async () => {
    const hits = await searchGazetteer(sql, 'ท่าศาลา', 50);
    const types = new Set(hits.map((h) => h.type));
    expect(types.has('district')).toBe(true);
    expect(types.has('subdistrict')).toBe(true);
    expect((await searchGazetteer(sql, 'ท่าศ')).length).toBeGreaterThan(0);
  });

  it('returns the containing subdistrict/district and the nearest village for a village location', async () => {
    const [v] = await sql<{ id: string; lng: number; lat: number; subdistrict_pcode: string }[]>`
      select id, st_x(geom) as lng, st_y(geom) as lat, subdistrict_pcode from villages where subdistrict_pcode is not null order by id limit 1`;
    const a = await inspectAdmin(sql, v!.lng, v!.lat);
    expect(a.inStudyArea).toBe(true);
    expect(a.levels.find((l) => l.level === 3)?.pcode).toBe(v!.subdistrict_pcode);
    const [nearest] = await nearestVillages(sql, v!.lng, v!.lat, 1);
    expect(nearest?.id).toBe(v!.id);
    expect(nearest!.distanceM).toBeLessThan(1);
  });

  it('returns nearby OSM features with geodesic distances', async () => {
    const [v] = await sql<{ lng: number; lat: number }[]>`select st_x(geom) as lng, st_y(geom) as lat from villages order by id limit 1`;
    const f = await nearestFeatures(sql, v!.lng, v!.lat, 30_000);
    expect(f.length).toBeGreaterThan(0);
    for (const x of f) expect(x.distanceM).toBeLessThanOrEqual(30_000);
  });

  it('keeps OSM features inside the province + 5 km buffer', async () => {
    const [{ n } = { n: -1 }] = await sql<{ n: number }[]>`
      select count(*)::int as n from osm_features o, province_extent pe where not st_intersects(o.geom, pe.buffered)`;
    expect(n).toBe(0);
  });

  it('renders a vector tile over the province', async () => {
    const [c] = await sql<{ lng: number; lat: number }[]>`select st_x(st_pointonsurface(geom)) as lng, st_y(st_pointonsurface(geom)) as lat from admin_areas where level = 1`;
    const z = 8;
    const x = Math.floor(((c!.lng + 180) / 360) * 2 ** z);
    const latRad = (c!.lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z);
    expect((await renderTile(sql, 'admin-district', z, x, y)).length).toBeGreaterThan(0);
  });
});
