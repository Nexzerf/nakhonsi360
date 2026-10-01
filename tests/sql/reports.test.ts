/**
 * Citizen reports against a real PostGIS database with the real COD-AB
 * boundaries (for the province check and subdistrict names).
 *
 *   TEST_DATABASE_URL=postgres://…/postgres CODAB_FILE=/vsizip/…/hdx-cod-ab-tha.zip npm run test:sql
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPublicReport, insertReport, listAdminReports, listPublicReports, updateReport } from '@/lib/reports/db';
import { LIMITS, validateReport, type ReportInput } from '@/lib/reports/schema';

const { TEST_DATABASE_URL, CODAB_FILE } = process.env;
const DB = 'n360_reports_test';
const root = path.resolve(__dirname, '..', '..');
const suite = TEST_DATABASE_URL && CODAB_FILE ? describe : describe.skip;

const input = (over: Record<string, unknown> = {}): ReportInput => {
  // Nakhon Si Thammarat city (inside ต.ในเมือง).
  const r = validateReport({ hazard: 'flood', urgency: 'life', lat: 8.4326, lng: 99.9633, locationSource: 'map', waterDepthCm: 100, needs: ['rescue'], contactName: 'สมชาย', contactPhone: '0812345678', ...over });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

suite('citizen reports (real boundaries)', () => {
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

  it('stores a report with its subdistrict and never exposes contact details publicly', async () => {
    const r = await insertReport(sql, input(), 'hash-a');
    expect(r.ok).toBe(true);
    const id = r.ok ? r.id : '';
    const pub = await getPublicReport(sql, id);
    expect(pub?.report.subdistrictTh).toBeTruthy();
    expect(pub?.report.districtTh).toBeTruthy();
    expect(pub?.report.hasContact).toBe(true);
    const json = JSON.stringify([pub, await listPublicReports(sql, { hours: 72, openOnly: false })]);
    expect(json).not.toContain('0812345678');
    expect(json).not.toContain('สมชาย');
    expect(json).not.toContain('hash-a');
    const adminRows = await listAdminReports(sql, 72);
    expect(adminRows.find((x) => x.id === id)?.contactPhone).toBe('0812345678');
  });

  it('rejects points outside the province + 5 km', async () => {
    const r = await insertReport(sql, input({ lat: 13.7563, lng: 100.5018 }), 'hash-b');
    expect(r).toEqual({ ok: false, reason: 'outside_study_area' });
  });

  it('limits reports per reporter per hour', async () => {
    const results = [];
    for (let i = 0; i < LIMITS.perHour + 1; i++) results.push(await insertReport(sql, input({ urgency: 'info' }), 'hash-c'));
    expect(results.filter((r) => r.ok)).toHaveLength(LIMITS.perHour);
    expect(results.at(-1)).toEqual({ ok: false, reason: 'rate_limited' });
  });

  it('records responder updates in the public timeline and hides spam', async () => {
    const r = await insertReport(sql, input(), 'hash-d');
    const id = r.ok ? r.id : '';
    expect(await updateReport(sql, id, { status: 'in_progress', note: 'ส่งเรือแล้ว', hidden: null })).toBe(true);
    const pub = await getPublicReport(sql, id);
    expect(pub?.report.status).toBe('in_progress');
    expect(pub?.report.responderNote).toBe('ส่งเรือแล้ว');
    expect(pub?.updates).toEqual([expect.objectContaining({ status: 'in_progress', note: 'ส่งเรือแล้ว' })]);
    expect((await listPublicReports(sql, { hours: 72, openOnly: true })).some((x) => x.id === id)).toBe(true);

    await updateReport(sql, id, { status: null, note: null, hidden: true });
    expect(await getPublicReport(sql, id)).toBeNull();
    expect((await listPublicReports(sql, { hours: 72, openOnly: false })).some((x) => x.id === id)).toBe(false);
  });

  it('drops contact details of reports closed more than 30 days ago', async () => {
    const r = await insertReport(sql, input(), 'hash-e');
    const id = r.ok ? r.id : '';
    await sql`update citizen_reports set status = 'resolved', updated_at = now() - interval '31 days' where public_id = ${id}`;
    await sql`select * from purge_expired()`;
    const [row] = await sql<{ contact_phone: string | null; reporter_hash: string | null }[]>`select contact_phone, reporter_hash from citizen_reports where public_id = ${id}`;
    expect(row).toEqual({ contact_phone: null, reporter_hash: null });
  });
});
