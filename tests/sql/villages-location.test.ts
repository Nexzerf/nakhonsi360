/**
 * Village location correction against the REAL DOPA excerpt in
 * data/samples/dopa.villages (it holds every record of the 2023 file whose
 * lat/lon are metres) and the real COD-AB boundaries.
 *
 *   TEST_DATABASE_URL=postgres://…/postgres CODAB_FILE=/vsizip/…/hdx-cod-ab-tha.zip npm run test:sql
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { latestImports, nearestVillages, unlocatedVillagesAt } from '@/lib/db/queries';

const { TEST_DATABASE_URL, CODAB_FILE } = process.env;
const DB = 'n360_villages_test';
const root = path.resolve(__dirname, '..', '..');
const sample = JSON.parse(readFileSync(path.join(root, 'data', 'samples', 'dopa.villages', 'excerpt.json'), 'utf8'));
const projected: Array<{ mcode: string; tcode: string; tname: string }> = sample.records.filter((r: { oct_side15_lat: string }) => Math.abs(Number(r.oct_side15_lat)) > 1000);
const suite = TEST_DATABASE_URL && CODAB_FILE ? describe : describe.skip;

suite('village location correction (real DOPA excerpt)', () => {
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
    // The excerpt's records array, unmodified, as the importer's input file.
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'n360-')), 'dopa-excerpt.json');
    writeFileSync(file, JSON.stringify(sample.records));
    tsx('migrate.ts', []);
    tsx('import-admin.ts', ['--file', CODAB_FILE!]);
    tsx('import-villages.ts', ['--file', file]);
    sql = postgres(u.toString(), { max: 2, onnotice: () => {} });
  }, 300_000);

  afterAll(async () => {
    await sql?.end();
  });

  it('maps every metre-coordinate village as UTM 47N only because it lands in the subdistrict DOPA names', async () => {
    const rows = await sql<{ id: string; location_method: string; location_uncertainty_m: number; subdistrict_pcode: string; tcode: string }[]>`
      select id, location_method, location_uncertainty_m, subdistrict_pcode, properties->>'tcode' as tcode
        from villages where location_method <> 'source' order by id`;
    expect(rows.map((r) => r.id)).toEqual(projected.map((r) => r.mcode).sort());
    for (const r of rows) {
      expect(r.location_method).toBe('utm47n_wgs84');
      expect(r.subdistrict_pcode).toBe(`TH${r.tcode.slice(0, 6)}`);
      // WGS 84 vs Indian 1975 differ by ~600 m here; the stored uncertainty covers it.
      expect(r.location_uncertainty_m).toBeGreaterThanOrEqual(600);
      expect(r.location_uncertainty_m).toBeLessThanOrEqual(1000);
    }
  });

  it('keeps the published values unmodified in properties', async () => {
    const [v] = await sql<{ lat: string; lon: string }[]>`select properties->>'oct_side15_lat' as lat, properties->>'oct_side15_lon' as lon from villages where id = ${projected[0]!.mcode}`;
    const src = sample.records.find((r: { mcode: string }) => r.mcode === projected[0]!.mcode);
    expect(v).toEqual({ lat: src.oct_side15_lat, lon: src.oct_side15_lon });
  });

  it('records the counts: every record imported, the corrected ones counted, nothing rejected', async () => {
    const imp = (await latestImports(sql)).get('dopa.villages')!;
    expect(imp.sourceRecordCount).toBe(sample.records.length);
    expect(imp.importedCount).toBe(sample.records.length);
    expect(imp.correctedLocationCount).toBe(projected.length);
    expect(imp.unlocatedCount).toBe(0);
    expect(imp.rejectedCount).toBe(0);
  });

  it('shows the correction method in the nearest-village result', async () => {
    const [p] = await sql<{ lng: number; lat: number }[]>`select st_x(geom) as lng, st_y(geom) as lat from villages where id = ${projected[0]!.mcode}`;
    const [hit] = await nearestVillages(sql, p!.lng, p!.lat, 1);
    expect(hit!.id).toBe(projected[0]!.mcode);
    expect(hit!.locationMethod).toBe('utm47n_wgs84');
    expect(hit!.locationUncertaintyM).toBeGreaterThan(0);
  });

  it('lists a village without a usable location under its DOPA subdistrict and in search (rolled back)', async () => {
    // Moves one real imported record into villages_unlocated inside a transaction that is rolled back,
    // to exercise the queries that serve such villages. Nothing is kept.
    await sql
      .begin(async (tx) => {
        const id = projected[0]!.mcode;
        await tx`
          insert into villages_unlocated (id, name_th, source_subdistrict, source_district, subdistrict_pcode, reason, source_lat, source_lon, properties)
          select id, name_th, source_subdistrict, source_district, subdistrict_pcode, 'outside_province', properties->>'oct_side15_lat', properties->>'oct_side15_lon', properties
            from villages where id = ${id}`;
        await tx`delete from villages where id = ${id}`;
        await tx`select refresh_gazetteer()`;
        const [inside] = await tx<{ lng: number; lat: number }[]>`select st_x(p) as lng, st_y(p) as lat from (select st_pointonsurface(geom) as p from admin_areas where pcode = ${`TH${projected[0]!.tcode.slice(0, 6)}`}) q`;
        const list = await unlocatedVillagesAt(tx as unknown as postgres.Sql, inside!.lng, inside!.lat);
        expect(list.map((v) => v.id)).toEqual([id]);
        expect(list[0]!.reason).toBe('outside_province');
        const [g] = await tx<{ ref_table: string; admin_path: string }[]>`select ref_table, admin_path from gazetteer where ref_id = ${id}`;
        expect(g!.ref_table).toBe('villages_unlocated');
        expect(g!.admin_path).toContain('ไม่มีพิกัดที่ใช้ได้');
        throw new Rollback();
      })
      .catch((e) => {
        if (!(e instanceof Rollback)) throw e;
      });
  });

  it('resolves DOPA subdistricts whose HDX Thai name is published cut to 48 bytes (TH801210, TH801214)', async () => {
    const [r] = await sql<{ hdx_w: string; hdx_e: string; w: string; e: string }[]>`
      select (select name_th from admin_areas where pcode = 'TH801210') as hdx_w, (select name_th from admin_areas where pcode = 'TH801214') as hdx_e,
             resolve_source_subdistrict('80121000', 'ปากพนังฝั่งตะวันตก', 'ปากพนัง') as w,
             resolve_source_subdistrict('80121400', 'ปากพนังฝั่งตะวันออก', 'ปากพนัง') as e`;
    // If HDX publishes the full names, this test should be updated: the workaround is no longer needed.
    expect(r!.hdx_w).toBe('ปากพนังฝั่งตะวัน');
    expect(r!.hdx_e).toBe('ปากพนังฝั่งตะวัน');
    expect([r!.w, r!.e]).toEqual(['TH801210', 'TH801214']);
  });
});

class Rollback extends Error {}
