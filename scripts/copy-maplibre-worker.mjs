/**
 * MapLibre GL 6 runs its tile parsing in a module worker loaded by URL, which
 * the Next.js bundle cannot provide. Copy the worker (and the code it shares
 * with the main thread) into public/ under the installed version, so a new
 * version never meets an old cached worker. Runs before dev and build.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'node_modules', 'maplibre-gl', 'dist');
const { version } = JSON.parse(readFileSync(path.join(root, 'node_modules', 'maplibre-gl', 'package.json'), 'utf8'));
const base = path.join(root, 'public', 'vendor');
const out = path.join(base, `maplibre-${version}`);

mkdirSync(base, { recursive: true });
for (const d of readdirSync(base)) if (d.startsWith('maplibre-') && d !== `maplibre-${version}`) rmSync(path.join(base, d), { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) copyFileSync(path.join(dist, f), path.join(out, f));
console.log(`MapLibre ${version} worker → public/vendor/maplibre-${version}/`);
