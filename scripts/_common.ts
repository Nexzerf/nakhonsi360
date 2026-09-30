import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import postgres from 'postgres';

export type Sql = postgres.Sql;

/** Parse `--key value` and `--flag` arguments; repeated `--map a=b` collect into an array. */
export function parseArgs(argv = process.argv.slice(2)) {
  const out: Record<string, string | true> = {};
  const maps: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) throw new Error(`Unexpected argument: ${a}`);
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
      continue;
    }
    i++;
    if (key === 'map') maps.push(next);
    else out[key] = next;
  }
  const str = (k: string) => (typeof out[k] === 'string' ? (out[k] as string) : undefined);
  const flag = (k: string) => out[k] === true;
  const mapPairs = Object.fromEntries(
    maps.map((m) => {
      const eq = m.indexOf('=');
      if (eq < 1) throw new Error(`--map expects field=SourceField, got ${m}`);
      return [m.slice(0, eq), m.slice(eq + 1)];
    }),
  );
  return { str, flag, mapPairs };
}

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')));
  });
}

export function connect(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return postgres(url, { max: 1, onnotice: () => {}, prepare: false });
}

export interface ImportMeta {
  sourceId: string;
  sourceFile: string;
  sourceUrl?: string;
  sourceSha256: string;
  sourceVersion?: string;
  sourceDate?: string;
  sourceRecordCount: number;
  importedCount: number;
  /** Of importedCount: records whose location was corrected (and verified) by the importer. */
  correctedLocationCount?: number;
  /** Of importedCount: records kept without a usable location. */
  unlocatedCount?: number;
  rejections: Array<Record<string, unknown>>;
  notes?: string;
}

/** Insert the provenance row inside the caller's transaction and return its id. */
export async function recordImport(tx: postgres.TransactionSql, m: ImportMeta): Promise<number> {
  const [row] = await tx<{ id: string }[]>`
    insert into dataset_imports
      (source_id, source_file, source_url, source_sha256, source_version, source_date,
       source_record_count, imported_count, corrected_location_count, unlocated_count, rejected_count, rejections, notes)
    values
      (${m.sourceId}, ${m.sourceFile}, ${m.sourceUrl ?? null}, ${m.sourceSha256}, ${m.sourceVersion ?? null},
       ${m.sourceDate ?? null}, ${m.sourceRecordCount}, ${m.importedCount}, ${m.correctedLocationCount ?? 0}, ${m.unlocatedCount ?? 0}, ${m.rejections.length},
       ${tx.json(m.rejections.slice(0, 500) as postgres.JSONValue)}, ${m.notes ?? null})
    returning id`;
  return Number(row!.id);
}

export function assertIsoDate(d: string | undefined): string | undefined {
  if (d === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(new Date(d).getTime())) throw new Error(`--source-date must be YYYY-MM-DD, got ${d}`);
  return d;
}

export function summarize(rejections: Array<{ reason: string }>): string {
  const counts = new Map<string, number>();
  for (const r of rejections) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
  return [...counts].map(([k, v]) => `${k}=${v}`).join(', ') || 'none';
}

export async function main(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.error(`\nERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
