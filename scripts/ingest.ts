/**
 * Run live ingest adapters into DATABASE_URL.
 *
 *   npm run ingest                       # every registered adapter, then retention purge
 *   npm run ingest -- --source thaiwater.rain24h
 *   npm run ingest -- --source thaiwater.rain24h --from-file data/samples/thaiwater.rain24h/rain_24h.json
 *
 * Each source runs independently: one failure is logged in ingest_runs and
 * the others continue. Exit code is non-zero only if every source failed.
 */
import { readFile } from 'node:fs/promises';
import { ADAPTERS, PENDING_ADAPTERS } from '@/lib/adapters';
import { runIngest } from '@/lib/ingest/runner';
import { connect, main, parseArgs } from './_common';

main(async () => {
  const args = parseArgs();
  const only = args.str('source');
  const fromFile = args.str('from-file');
  const ids = only ? [only] : Object.keys(ADAPTERS);
  for (const id of ids) if (!ADAPTERS[id]) throw new Error(`No adapter registered for ${id}. Registered: ${Object.keys(ADAPTERS).join(', ')}`);
  if (fromFile && ids.length !== 1) throw new Error('--from-file needs --source');

  const sql = connect();
  try {
    const results = [];
    for (const id of ids) {
      const raw = fromFile ? JSON.parse(await readFile(fromFile, 'utf8')) : undefined;
      const r = await runIngest(sql, ADAPTERS[id]!, { raw });
      results.push(r);
      console.log(
        `${r.status.padEnd(7)} ${id}: stations ${r.stations} (outside area ${r.outsideArea}), new observations ${r.observations}, hazards ${r.hazards}, rejected ${r.rejected}${r.error ? ` — ${r.error}` : ''}`,
      );
    }
    if (!only) {
      const [p] = await sql<{ observations_deleted: number; hazards_deleted: number }[]>`select * from purge_expired()`;
      console.log(`retention: deleted ${p?.observations_deleted ?? 0} old observations, ${p?.hazards_deleted ?? 0} old hazard features`);
      console.log(`not yet connected (no verified sample): ${PENDING_ADAPTERS.join(', ')}`);
    }
    if (results.length && results.every((r) => r.status === 'error')) throw new Error('all sources failed');
  } finally {
    await sql.end();
  }
});
