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
import { addUpdate, flagReport, getPublicReport, insertReport, listPublicReports } from '@/lib/reports/db';
import { LIMITS, validateReport, type ReportInput } from '@/lib/reports/schema';

const { TEST_DATABASE_URL, CODAB_FILE } = process.env;
const DB = 'n360_reports_test';
const root = path.resolve(__dirname, '..', '..');
const suite = TEST_DATABASE_URL && CODAB_FILE ? describe : describe.skip;

const input = (over: Record<string, unknown> = {}): ReportInput => {
  // Nakhon Si Thammarat city.
  const r = validateReport({ hazard: 'flood', urgency: 'life', lat: 8.4326, lng: 99.9633, locationSource: 'map', waterDepthCm: 100, needs: ['rescue'], contactName: 'สมชาย', contactPhone: '0812345678', ...over });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

async function created(sql: postgres.Sql, hash: string, over: Record<string, unknown> = {}) {
  const r = await insertReport(sql, input(over), hash);
  if (!r.ok) throw new Error(r.reason);
  return r;
}

suite('citizen reports (real boundaries, no sign-in)', () => {
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

  it('stores a report with its subdistrict and shows the phone only while it is open', async () => {
    const { id } = await created(sql, 'hash-a');
    const pub = await getPublicReport(sql, id);
    expect(pub?.report.subdistrictTh).toBeTruthy();
    expect(pub?.report.contactPhone).toBe('0812345678');
    const json = JSON.stringify([pub, await listPublicReports(sql, { hours: 72, openOnly: false })]);
    expect(json).not.toContain('hash-a');
    expect(json).not.toMatch(/edit_token|editToken/);

    await addUpdate(sql, id, { action: 'resolved', note: null, authorName: null, editToken: null }, 'hash-x');
    const closed = await getPublicReport(sql, id);
    expect(closed?.report.status).toBe('resolved');
    expect(closed?.report.contactPhone).toBeNull();
    expect(closed?.report.contactName).toBeNull();
  });

  it('rejects points outside the province + 5 km', async () => {
    const r = await insertReport(sql, input({ lat: 13.7563, lng: 100.5018 }), 'hash-b');
    expect(r).toEqual({ ok: false, reason: 'outside_study_area' });
  });

  it('limits reports per connection per hour', async () => {
    const results = [];
    for (let i = 0; i < LIMITS.perHour + 1; i++) results.push(await insertReport(sql, input({ urgency: 'info' }), 'hash-c'));
    expect(results.filter((r) => r.ok)).toHaveLength(LIMITS.perHour);
    expect(results.at(-1)).toEqual({ ok: false, reason: 'rate_limited' });
  });

  it('lets anyone help, keeps every update on the timeline, and lets a wrong "helped" be reversed', async () => {
    const { id, editToken } = await created(sql, 'hash-d');
    expect(await addUpdate(sql, id, { action: 'on_the_way', note: 'เรือ 2 ลำ ถึงใน 20 นาที', authorName: 'อาสาบ้านเรา', editToken: null }, 'hash-h1')).toMatchObject({ ok: true, status: 'on_the_way', byReporter: false });
    expect(await addUpdate(sql, id, { action: 'resolved', note: null, authorName: null, editToken: null }, 'hash-h2')).toMatchObject({ status: 'resolved' });
    // The reporter says they still need help: reopened, and labelled as the reporter.
    expect(await addUpdate(sql, id, { action: 'still_need', note: 'ยังติดอยู่', authorName: 'ใครก็ได้', editToken }, 'hash-d')).toMatchObject({ status: 'new', byReporter: true });
    // A wrong token is just an ordinary update.
    expect(await addUpdate(sql, id, { action: 'note', note: 'น้ำขึ้นอีก', authorName: null, editToken: '0'.repeat(32) }, 'hash-h3')).toMatchObject({ byReporter: false });

    const pub = await getPublicReport(sql, id);
    expect(pub?.report.status).toBe('new');
    expect(pub?.updates.map((u) => [u.action, u.byReporter])).toEqual([
      ['on_the_way', false],
      ['resolved', false],
      ['still_need', true],
      ['note', false],
    ]);
    expect(pub?.updates[0]).toMatchObject({ authorName: 'อาสาบ้านเรา', note: 'เรือ 2 ลำ ถึงใน 20 นาที' });
    expect(pub?.report.lastUpdate).toMatchObject({ action: 'note', note: 'น้ำขึ้นอีก' });
    expect(pub?.report.updateCount).toBe(4);
  });

  it('limits updates per connection', async () => {
    const { id } = await created(sql, 'hash-e');
    const results = [];
    for (let i = 0; i < LIMITS.updatesPerHour + 1; i++) results.push(await addUpdate(sql, id, { action: 'note', note: `n${i}`, authorName: null, editToken: null }, 'hash-spammer'));
    expect(results.at(-1)).toEqual({ ok: false, reason: 'rate_limited' });
  });

  it('hides a report once enough different connections flag it', async () => {
    const { id } = await created(sql, 'hash-f');
    for (const h of ['f1', 'f1', 'f2']) expect((await flagReport(sql, id, h)).hidden).toBe(false);
    expect((await flagReport(sql, id, 'f3')).hidden).toBe(true);
    expect(await getPublicReport(sql, id)).toBeNull();
    expect((await listPublicReports(sql, { hours: 72, openOnly: false })).some((x) => x.id === id)).toBe(false);
  });

  it('drops contact details of reports closed more than 30 days ago', async () => {
    const { id } = await created(sql, 'hash-g');
    await sql`update citizen_reports set status = 'resolved', updated_at = now() - interval '31 days' where public_id = ${id}`;
    await sql`select * from purge_expired()`;
    const [row] = await sql<{ contact_phone: string | null; reporter_hash: string | null }[]>`select contact_phone, reporter_hash from citizen_reports where public_id = ${id}`;
    expect(row).toEqual({ contact_phone: null, reporter_hash: null });
  });
});
