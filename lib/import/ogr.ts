/**
 * Thin wrappers around GDAL's command-line tools. Features are streamed out of
 * ogr2ogr as GeoJSON Sequence so validation happens in TypeScript.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type * as GeoJSON from 'geojson';
import type { BBox } from '@/lib/types';

export interface OgrLayerInfo {
  name: string;
  featureCount: number | null;
  fields: string[];
  geometryType: string | null;
}

/** Run a GDAL command-line tool and return its stdout. */
export function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.trim()}`))));
  });
}

/** List layers and their fields (requires GDAL ≥ 3.7 for `ogrinfo -json`). */
export async function listLayers(file: string, extraArgs: string[] = []): Promise<OgrLayerInfo[]> {
  const out = await run('ogrinfo', ['-json', '-so', '-al', ...extraArgs, file]);
  const info = JSON.parse(out) as {
    layers?: Array<{ name: string; featureCount?: number; fields?: Array<{ name: string }>; geometryFields?: Array<{ type?: string }> }>;
  };
  return (info.layers ?? []).map((l) => ({
    name: l.name,
    featureCount: typeof l.featureCount === 'number' && l.featureCount >= 0 ? l.featureCount : null,
    fields: (l.fields ?? []).map((f) => f.name),
    geometryType: l.geometryFields?.[0]?.type ?? null,
  }));
}

export interface StreamOptions {
  where?: string;
  spat?: BBox;
  /** Extra args before the source, e.g. ['--config', 'OSM_CONFIG_FILE', 'scripts/osmconf.ini']. */
  extraArgs?: string[];
}

/** Stream a layer as GeoJSON features in EPSG:4326. */
export async function* streamFeatures(file: string, layer: string, opts: StreamOptions = {}): AsyncGenerator<GeoJSON.Feature> {
  const args = [...(opts.extraArgs ?? []), '-f', 'GeoJSONSeq', '/vsistdout/', file, layer, '-t_srs', 'EPSG:4326', '-lco', 'RS=NO'];
  if (opts.where) args.push('-where', opts.where);
  if (opts.spat) args.push('-spat', ...opts.spat.map(String));
  const p = spawn('ogr2ogr', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => (err += d));
  const done = new Promise<number>((resolve, reject) => {
    p.on('error', reject);
    p.on('close', (code) => resolve(code ?? 1));
  });
  const rl = createInterface({ input: p.stdout, crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    yield JSON.parse(t) as GeoJSON.Feature;
  }
  const code = await done;
  if (code !== 0) throw new Error(`ogr2ogr exited ${code}: ${err.trim()}`);
}
