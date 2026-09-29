/**
 * Run migrations and all Phase 1 imports from data/static/manifest.json
 * (written by `npm run fetch:sources`). Order matters: admin boundaries first
 * (they define the province extent used to clip villages and OSM).
 *
 *   DATABASE_URL=… npm run import:all
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { main } from './_common';
import type { ManifestEntry } from './fetch-sources';

const STEPS: Array<[string, string]> = [
  ['hdx.cod-ab-tha', 'import-admin.ts'],
  ['dopa.villages', 'import-villages.ts'],
  ['osm.geofabrik', 'import-osm.ts'],
];

main(async () => {
  const manifest = JSON.parse(await readFile(path.join(process.cwd(), 'data', 'static', 'manifest.json'), 'utf8')) as Record<string, ManifestEntry>;
  const tsx = (script: string, args: string[]) => execFileSync('npx', ['tsx', path.join('scripts', script), ...args], { stdio: 'inherit' });
  tsx('migrate.ts', []);
  for (const [sourceId, script] of STEPS) {
    const e = manifest[sourceId];
    if (!e) {
      console.warn(`\nSkipping ${sourceId}: not in manifest (run fetch:sources).`);
      continue;
    }
    console.log(`\n=== ${sourceId} ===`);
    const args = ['--file', e.file, '--url', e.url];
    if (e.sourceVersion) args.push('--source-version', e.sourceVersion);
    if (e.sourceDate) args.push('--source-date', e.sourceDate);
    tsx(script, args);
  }
});
