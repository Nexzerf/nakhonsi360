import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { latestImports, latestRuns } from '@/lib/db/queries';
import { SOURCES, IMPORTED_SOURCE_IDS } from '@/lib/registry/sources';
import { CURRENT_PHASE } from '@/lib/registry/layers';
import type { SourceHealth, SourceStatus, SourcesResponse, DataSource } from '@/lib/types';

export const dynamic = 'force-dynamic';

const imported = new Set<string>(IMPORTED_SOURCE_IDS);

function liveStatus(src: DataSource, run: SourceHealth['lastRun']): SourceStatus {
  if (!run) return 'down';
  if (run.status === 'error') return 'down';
  if (run.status === 'partial' || !run.finishedAt) return 'degraded';
  const ageMin = (Date.now() - new Date(run.finishedAt).getTime()) / 60000;
  return src.expectedUpdateMinutes !== null && ageMin > src.expectedUpdateMinutes * 2 ? 'degraded' : 'ok';
}

export async function GET() {
  const sql = getDb();
  let database: SourcesResponse['database'] = sql ? 'ok' : 'not_configured';
  let imports = new Map<string, NonNullable<SourceHealth['lastImport']>>();
  let runs = new Map<string, NonNullable<SourceHealth['lastRun']>>();

  if (sql) {
    try {
      [imports, runs] = await Promise.all([latestImports(sql), latestRuns(sql)]);
    } catch (err) {
      console.error('[api/sources]', err);
      database = 'error';
    }
  }

  const sources = SOURCES.map((src) => {
    const lastImport = imports.get(src.id) ?? null;
    const lastRun = runs.get(src.id) ?? null;
    let status: SourceStatus;
    if (src.id.startsWith('basemap.')) status = 'external';
    else if (database !== 'ok') status = src.phase > CURRENT_PHASE ? 'not_connected' : 'unknown';
    else if (imported.has(src.id)) status = lastImport ? 'ok' : 'not_imported';
    // Live sources count as connected once they have any ingest run, whatever the phase.
    else if (lastRun) status = liveStatus(src, lastRun);
    else status = 'not_connected';
    return { ...src, health: { id: src.id, status, lastImport, lastRun } };
  });

  const body: SourcesResponse = { generatedAt: new Date().toISOString(), database, sources };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } });
}
