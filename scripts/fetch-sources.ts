/**
 * Download the real Phase 1 source files and save raw samples + metadata.
 *
 *   npm run fetch:sources            # all three
 *   npm run fetch:sources -- --only hdx,dopa,osm
 *
 * Writes:
 *   data/static/<files>                      (git-ignored, large)
 *   data/static/manifest.json                (paths, URLs, versions — read by import:all)
 *   data/samples/<sourceId>/…                (metadata + small raw excerpts, committed)
 *
 * Resources are resolved through the publishers' CKAN APIs (HDX, GD Catalog),
 * never by scraping HTML. Nothing is modified: files are saved byte-for-byte.
 */
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { main, parseArgs } from './_common';

const UA = 'Nakhonsi360/0.1 (environmental map of Nakhon Si Thammarat; https://github.com/nexzerf/nakhonsi360)';
const STATIC = path.join(process.cwd(), 'data', 'static');
const SAMPLES = path.join(process.cwd(), 'data', 'samples');
/** Unmodified copies of official files whose hosts some networks cannot reach (see data/vendor/README.md). */
const VENDOR = path.join(process.cwd(), 'data', 'vendor');

interface CkanResource {
  id: string;
  name?: string;
  description?: string;
  format?: string;
  url: string;
  last_modified?: string;
  created?: string;
}
interface CkanPackage {
  name: string;
  title?: string;
  dataset_date?: string;
  last_modified?: string;
  metadata_modified?: string;
  license_title?: string;
  license_id?: string;
  resources: CkanResource[];
}

export interface ManifestEntry {
  sourceId: string;
  file: string;
  url: string;
  sourceVersion: string | null;
  sourceDate: string | null;
  sha256: string;
  fetchedAt: string;
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`GET ${url} → HTTP ${r.status}`);
  return (await r.json()) as T;
}

async function ckanPackage(base: string, id: string): Promise<CkanPackage> {
  const body = await getJson<{ success: boolean; result: CkanPackage }>(`${base}/api/3/action/package_show?id=${encodeURIComponent(id)}`);
  if (!body.success) throw new Error(`CKAN package_show failed for ${id}`);
  return body.result;
}

async function download(url: string, dest: string): Promise<string> {
  const r = await fetch(url, { headers: { 'User-Agent': UA } }).catch((err: unknown) => {
    // undici only says "fetch failed"; the cause names the real problem (DNS, TLS, reset…).
    const cause = err instanceof Error && err.cause instanceof Error ? `${(err.cause as NodeJS.ErrnoException).code ?? ''} ${err.cause.message}`.trim() : '';
    throw new Error(`GET ${url} → ${err instanceof Error ? err.message : String(err)}${cause ? ` (${cause})` : ''}`);
  });
  if (!r.ok || !r.body) throw new Error(`GET ${url} → HTTP ${r.status}`);
  const hash = createHash('sha256');
  const src = Readable.fromWeb(r.body as never);
  src.on('data', (d: Buffer) => hash.update(d));
  await pipeline(src, createWriteStream(dest));
  return hash.digest('hex');
}

function extFor(format: string | undefined, url: string): string {
  const fromUrl = path.extname(new URL(url).pathname).toLowerCase();
  if (fromUrl) return fromUrl;
  const f = (format ?? '').toLowerCase();
  if (f.includes('geopackage') || f === 'gpkg') return '.gpkg';
  if (f.includes('geojson')) return '.geojson';
  if (f.includes('json')) return '.json';
  if (f.includes('csv')) return '.csv';
  if (f.includes('shp') || f.includes('zip')) return '.zip';
  return '.bin';
}


async function saveSample(sourceId: string, name: string, content: string) {
  const dir = path.join(SAMPLES, sourceId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), content);
}

async function fetchHdx(): Promise<ManifestEntry> {
  const pkg = await ckanPackage('https://data.humdata.org', 'cod-ab-tha');
  await saveSample('hdx.cod-ab-tha', 'package_show.json', JSON.stringify(pkg, null, 2));
  const rank = (r: CkanResource) => {
    const f = `${r.format ?? ''} ${r.name ?? ''}`.toLowerCase();
    if (f.includes('geopackage') || f.includes('gpkg')) return 0;
    if (f.includes('shp') || f.includes('shapefile')) return 1;
    if (f.includes('geojson')) return 2;
    return 9;
  };
  const res = [...pkg.resources].sort((a, b) => rank(a) - rank(b))[0];
  if (!res || rank(res) === 9) throw new Error(`No GeoPackage/Shapefile/GeoJSON resource in HDX cod-ab-tha. Resources: ${pkg.resources.map((r) => `${r.name} [${r.format}]`).join('; ')}`);
  const file = path.join(STATIC, `hdx-cod-ab-tha${extFor(res.format, res.url)}`);
  console.log(`HDX: ${res.name} [${res.format}] → ${file}`);
  const sha256 = await download(res.url, file);
  return {
    sourceId: 'hdx.cod-ab-tha',
    file: file.endsWith('.zip') ? `/vsizip/${file}` : file,
    url: res.url,
    sourceVersion: `${res.last_modified ?? pkg.last_modified ?? ''} (dataset_date ${pkg.dataset_date ?? 'not stated'})`.trim(),
    // The boundary validity date is read from the file itself (valid_on) by import-admin.
    sourceDate: null,
    sha256,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchDopa(): Promise<ManifestEntry> {
  const pkg = await ckanPackage('https://gdcatalog.go.th', 'gdpublish-gis-01');
  await saveSample('dopa.villages', 'package_show.json', JSON.stringify(pkg, null, 2));
  const matches = pkg.resources.filter((r) => `${r.name ?? ''} ${r.description ?? ''} ${r.url}`.includes('นครศรีธรรมราช'));
  if (matches.length === 0) {
    throw new Error(`No resource mentioning นครศรีธรรมราช in gdpublish-gis-01. Resources: ${pkg.resources.map((r) => r.name).join('; ')}`);
  }
  const prefer = (r: CkanResource) => (/json/i.test(r.format ?? '') ? 0 : /csv/i.test(r.format ?? '') ? 1 : 2);
  const res = matches.sort((a, b) => prefer(a) - prefer(b))[0]!;
  const file = path.join(STATIC, `dopa-villages-nakhon-si-thammarat${extFor(res.format, res.url)}`);
  console.log(`DOPA: ${res.name} [${res.format}] → ${file}`);
  let sha256: string;
  let copyNote = '';
  try {
    sha256 = await download(res.url, file);
  } catch (err) {
    // opendata_tst.dopa.go.th is unreachable from many networks (GitHub's runners
    // included). Use a supplied copy only if it is byte-identical to the file
    // already verified from the official URL.
    const copy = await vendoredDopa(err);
    await copyFile(copy.path, file);
    sha256 = copy.sha256;
    copyNote = ` — official file supplied as ${path.relative(process.cwd(), copy.path)} (host unreachable)`;
    console.log(`  download failed (${err instanceof Error ? err.message : err}); using ${path.relative(process.cwd(), copy.path)}, sha256 matches the verified official file`);
  }

  // Raw excerpt (first 20 records, unmodified) for writing/checking the adapter.
  // Skipped for a supplied copy: the committed excerpt already describes that
  // exact file, and its _sample.fullFileSha256 is what the copy was checked against.
  if (!copyNote) {
    const bytes = await readFile(file);
    const text = bytes.toString('utf8');
    let excerpt: string;
    if (/\.csv$/i.test(file)) excerpt = text.split(/\r?\n/).slice(0, 21).join('\n');
    else {
      const json = JSON.parse(text.replace(/^\uFEFF/, '')) as unknown;
      const list = Array.isArray(json) ? json : ((json as Record<string, unknown>).features ?? (json as Record<string, unknown>).data ?? (json as Record<string, unknown>).records);
      const _sample = { url: res.url, catalog: `https://gdcatalog.go.th/dataset/gdpublish-gis-01 (resource ${res.id})`, obtained: new Date().toISOString(), fullFileSha256: sha256, fullFileBytes: bytes.length };
      excerpt = JSON.stringify({ _sample, records: Array.isArray(list) ? list.slice(0, 20) : json }, null, 2).slice(0, 200_000);
    }
    await saveSample('dopa.villages', `excerpt${/\.csv$/i.test(file) ? '.csv' : '.json'}`, excerpt);
  }
  return {
    sourceId: 'dopa.villages',
    file,
    url: res.url,
    sourceVersion: copyNote ? `${res.last_modified ?? res.created ?? pkg.metadata_modified ?? 'not stated'}${copyNote}` : (res.last_modified ?? res.created ?? pkg.metadata_modified ?? null),
    sourceDate: null,
    sha256,
    fetchedAt: new Date().toISOString(),
  };
}

/** A copy of the DOPA file in data/vendor/dopa/ whose SHA-256 equals the verified official file's. */
async function vendoredDopa(downloadError: unknown): Promise<{ path: string; sha256: string }> {
  const excerpt = JSON.parse(await readFile(path.join(SAMPLES, 'dopa.villages', 'excerpt.json'), 'utf8')) as { _sample?: { fullFileSha256?: string } };
  const expected = excerpt._sample?.fullFileSha256;
  const dir = path.join(VENDOR, 'dopa');
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => /\.json$/i.test(f));
  const why = downloadError instanceof Error ? downloadError.message : String(downloadError);
  if (!expected) throw new Error(`${why}; no verified SHA-256 in data/samples/dopa.villages/excerpt.json to check a supplied copy against`);
  if (files.length === 0) throw new Error(`${why}; no supplied copy in data/vendor/dopa/ either (see data/vendor/README.md)`);
  const seen: string[] = [];
  for (const f of files) {
    const p = path.join(dir, f);
    const sha256 = createHash('sha256').update(await readFile(p)).digest('hex');
    if (sha256 === expected) return { path: p, sha256 };
    seen.push(`${f} sha256=${sha256.slice(0, 12)}…`);
  }
  throw new Error(`${why}; data/vendor/dopa/ has no copy matching the verified official file (expected sha256=${expected.slice(0, 12)}…, found ${seen.join(', ')})`);
}

async function fetchOsm(): Promise<ManifestEntry> {
  const base = 'https://download.geofabrik.de/asia';
  const url = `${base}/thailand-latest.osm.pbf`;
  const stateR = await fetch(`${base}/thailand-updates/state.txt`, { headers: { 'User-Agent': UA } });
  const state = stateR.ok ? await stateR.text() : '';
  if (state) await saveSample('osm.geofabrik', 'state.txt', state);
  const md5R = await fetch(`${url}.md5`, { headers: { 'User-Agent': UA } });
  const md5 = md5R.ok ? (await md5R.text()).trim() : '';
  if (md5) await saveSample('osm.geofabrik', 'thailand-latest.osm.pbf.md5', md5 + '\n');

  const file = path.join(STATIC, 'thailand-latest.osm.pbf');
  console.log(`OSM: ${url} → ${file}`);
  const sha256 = await download(url, file);
  if (md5) {
    const got = createHash('md5').update(await readFile(file)).digest('hex');
    if (!md5.startsWith(got)) throw new Error(`MD5 mismatch for ${file}: expected ${md5.split(/\s+/)[0]}, got ${got}`);
  }
  // Replication timestamp, e.g. "timestamp=2026-09-28T20\:21\:30Z"
  const ts = /timestamp=([^\n]+)/.exec(state)?.[1]?.replace(/\\/g, '') ?? null;
  return { sourceId: 'osm.geofabrik', file, url, sourceVersion: ts, sourceDate: ts ? ts.slice(0, 10) : null, sha256, fetchedAt: new Date().toISOString() };
}

main(async () => {
  const args = parseArgs();
  const only = new Set((args.str('only') ?? 'hdx,dopa,osm').split(','));
  await mkdir(STATIC, { recursive: true });
  const manifestPath = path.join(STATIC, 'manifest.json');
  let manifest: Record<string, ManifestEntry> = {};
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    // first run
  }

  const jobs: Array<[string, () => Promise<ManifestEntry>]> = [
    ['hdx', fetchHdx],
    ['dopa', fetchDopa],
    ['osm', fetchOsm],
  ];
  const failures: string[] = [];
  for (const [key, fn] of jobs) {
    if (!only.has(key)) continue;
    try {
      const e = await fn();
      manifest[e.sourceId] = e;
      console.log(`  ok  sha256=${e.sha256.slice(0, 12)}… version=${e.sourceVersion ?? '—'} date=${e.sourceDate ?? '—'}`);
    } catch (err) {
      // One source failing must not stop the others.
      failures.push(`${key}: ${err instanceof Error ? err.message : String(err)}`);
      console.error(`  FAILED ${key}: ${err instanceof Error ? err.message : err}`);
    }
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest: ${manifestPath}`);
  if (failures.length) throw new Error(`Some sources failed:\n${failures.join('\n')}`);
});
