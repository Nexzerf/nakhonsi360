import { NextResponse, type NextRequest } from 'next/server';
import { getDb, withTimeout, TimeoutError } from '@/lib/db/client';
import { memo } from '@/lib/db/memo';
import { earthquakesNear, lastSuccessfulRuns, geohazardsAt, inspectAdmin, satelliteHazardsAt, latestAtStations, latestImports, nearestFeatures, nearestObservations, nearestVillages, waterwayNamesNear } from '@/lib/db/queries';
import { CONDITION_VARIABLES } from '@/lib/registry/stationRules';
import { buildVariableConditions } from '@/lib/inspect/conditions';
import { summarizeEarthquakes } from '@/lib/inspect/hazards';
import { USGS_WINDOW_DAYS } from '@/lib/adapters/usgs';
import type { CardResult, ConditionsCard, HazardsCard, ImportRecord, InspectResponse, InspectSection, SourceRef } from '@/lib/types';

export const dynamic = 'force-dynamic';

const CARD_TIMEOUT_MS = 4000;
const CONTEXT_RADIUS_M = 30_000;
const ALL_SECTIONS: InspectSection[] = ['admin', 'village', 'context', 'conditions', 'hazards', 'satellite'];

/** Sections whose sources are built in later phases. */
const PLANNED: Record<'conditions' | 'hazards' | 'satellite', { phase: number; sourceIds: string[] }> = {
  conditions: { phase: 2, sourceIds: ['thaiwater.rain24h', 'thaiwater.waterlevel', 'tmd.weather', 'air4thai.aqi'] },
  hazards: { phase: 2, sourceIds: ['usgs.earthquakes', 'gistda.flood', 'firms.hotspots', 'dmr.landslide', 'dmcr.coast'] },
  satellite: { phase: 4, sourceIds: ['copernicus.sentinel2'] },
};

type Db = NonNullable<ReturnType<typeof getDb>>;

/** Point-independent facts every inspection needs; shared across visitors for 30 s. */
function sourceMeta(sql: Db) {
  return memo(sql, 'inspect:meta', 30_000, async () => {
    const [imports, okRuns] = await Promise.all([latestImports(sql), lastSuccessfulRuns(sql)]);
    return { imports, okRuns, connected: new Set(okRuns.keys()) };
  });
}

/** CDN cache for a complete answer; never keep one with a failed or timed-out card. */
function cacheHeaders(out: InspectResponse): Record<string, string> {
  const failed = Object.values(out.sections).some((s) => s && (s.status === 'error' || s.status === 'timeout'));
  return { 'Cache-Control': failed ? 'no-store' : 'public, max-age=0, s-maxage=60, stale-while-revalidate=240' };
}

function ref(sourceId: string, imp: ImportRecord | undefined): SourceRef {
  return { sourceId, observedAt: imp?.sourceDate ?? null, fetchedAt: imp?.importedAt ?? null };
}

async function guarded<T>(fn: () => Promise<CardResult<T>>): Promise<CardResult<T>> {
  try {
    return await withTimeout(fn(), CARD_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof TimeoutError) return { status: 'timeout' };
    console.error('[api/inspect]', err);
    return { status: 'error' };
  }
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const lat = Number(p.get('lat'));
  const lng = Number(p.get('lng'));
  if (!p.get('lat') || !p.get('lng') || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: 'lat and lng query parameters are required' }, { status: 400 });
  }
  const requested = (p.get('section') ?? '').split(',').filter(Boolean) as InspectSection[];
  const sections = requested.length ? requested.filter((s) => ALL_SECTIONS.includes(s)) : ALL_SECTIONS;

  const sql = getDb();
  const out: InspectResponse = { lat, lng, generatedAt: new Date().toISOString(), sections: {} };

  if (sections.includes('satellite')) out.sections.satellite = { status: 'not_connected', ...PLANNED.satellite };

  const wantDb = sections.filter((s) => s === 'admin' || s === 'village' || s === 'context' || s === 'conditions' || s === 'hazards');
  if (wantDb.length === 0) return NextResponse.json(out);

  if (!sql) {
    for (const s of wantDb) {
      out.sections[s] = s === 'conditions' || s === 'hazards' ? { status: 'not_connected', ...PLANNED[s] } : { status: 'unavailable', reason: 'database_not_configured' };
    }
    return NextResponse.json(out);
  }

  // Earthquakes are regional, so the hazards card does not depend on admin data or the study area.
  const hazardsTask = sections.includes('hazards')
    ? guarded(() => hazardsCard(sql, lng, lat)).then((r) => {
        out.sections.hazards = r;
      })
    : Promise.resolve();
  if (wantDb.every((s) => s === 'hazards')) {
    await hazardsTask;
    return NextResponse.json(out, { headers: cacheHeaders(out) });
  }

  let imports: Map<string, ImportRecord>;
  try {
    imports = (await withTimeout(sourceMeta(sql), CARD_TIMEOUT_MS)).imports;
  } catch (err) {
    console.error('[api/inspect] imports', err);
    for (const s of wantDb) if (s !== 'hazards') out.sections[s] = err instanceof TimeoutError ? { status: 'timeout' } : { status: 'error' };
    await hazardsTask;
    return NextResponse.json(out);
  }
  const hdx = imports.get('hdx.cod-ab-tha');
  const dopa = imports.get('dopa.villages');
  const osm = imports.get('osm.geofabrik');

  // Admin containment is shared: the other cards use it to tell "outside the province" apart from "no data".
  const adminPromise = hdx ? guarded(async () => ({ status: 'ok' as const, data: await memo(sql, `admin:${lat}:${lng}`, 60_000, () => inspectAdmin(sql, lng, lat)), sources: [ref('hdx.cod-ab-tha', hdx)] })) : null;

  const outside = async (): Promise<boolean> => {
    if (!adminPromise) return false;
    const a = await adminPromise;
    return a.status === 'ok' && !a.data.inStudyArea;
  };

  const tasks: Promise<void>[] = [hazardsTask];

  if (wantDb.includes('admin')) {
    tasks.push(
      (async () => {
        if (!adminPromise) {
          out.sections.admin = { status: 'not_imported', sourceIds: ['hdx.cod-ab-tha'] };
          return;
        }
        const a = await adminPromise;
        out.sections.admin =
          a.status === 'ok' && a.data.levels.length === 0
            ? { status: 'empty', reason: 'outside_study_area', sources: a.sources }
            : a;
      })(),
    );
  }

  if (wantDb.includes('village')) {
    tasks.push(
      (async () => {
        if (!dopa) {
          out.sections.village = { status: 'not_imported', sourceIds: ['dopa.villages'] };
          return;
        }
        out.sections.village = await guarded(async () => {
          const sources = [ref('dopa.villages', dopa)];
          if (await outside()) return { status: 'empty', reason: 'outside_study_area', sources };
          const nearest = await nearestVillages(sql, lng, lat, 3);
          return nearest.length ? { status: 'ok', data: { nearest }, sources } : { status: 'empty', reason: 'no_public_data', sources };
        });
      })(),
    );
  }

  if (wantDb.includes('context')) {
    tasks.push(
      (async () => {
        if (!osm) {
          out.sections.context = { status: 'not_imported', sourceIds: ['osm.geofabrik'] };
          return;
        }
        out.sections.context = await guarded(async () => {
          const sources = [ref('osm.geofabrik', osm)];
          if (await outside()) return { status: 'empty', reason: 'outside_study_area', sources };
          const features = await nearestFeatures(sql, lng, lat, CONTEXT_RADIUS_M);
          return features.length
            ? { status: 'ok', data: { radiusM: CONTEXT_RADIUS_M, features }, sources }
            : { status: 'empty', reason: 'no_features_in_radius', radiusM: CONTEXT_RADIUS_M, sources };
        });
      })(),
    );
  }

  if (wantDb.includes('conditions')) {
    tasks.push(
      (async () => {
        out.sections.conditions = await guarded(async () => conditionsCard(sql, lng, lat, await outside()));
      })(),
    );
  }

  await Promise.all(tasks);
  return NextResponse.json(out, { headers: cacheHeaders(out) });
}

async function conditionsCard(sql: Db, lng: number, lat: number, outsideArea: boolean): Promise<CardResult<ConditionsCard>> {
  const { connected } = await sourceMeta(sql);
  const anyConnected = CONDITION_VARIABLES.some((v) => v.sourceIds.some((id) => connected.has(id)));
  if (!anyConnected) return { status: 'not_connected', ...PLANNED.conditions };
  if (outsideArea) return { status: 'empty', reason: 'outside_study_area', sources: [] };

  const snap = Math.max(...CONDITION_VARIABLES.map((v) => (v.rule.kind === 'same_river' ? v.rule.riverSnapM : 0)));
  const pointRivers = await waterwayNamesNear(sql, lng, lat, snap);
  const variables = await Promise.all(
    CONDITION_VARIABLES.map(async (rule) => {
      const rows = rule.sourceIds.some((id) => connected.has(id)) ? await nearestObservations(sql, lng, lat, rule.variable, 10) : [];
      const bank =
        rule.variable === 'water_level'
          ? await latestAtStations(sql, 'thaiwater.waterlevel', rows.filter((r) => r.source_id === 'thaiwater.waterlevel').map((r) => r.station_id), 'water_level_bank_pct')
          : new Map<string, number>();
      return buildVariableConditions(rule, rows, connected, pointRivers, bank);
    }),
  );
  const sources: SourceRef[] = [];
  for (const v of variables) {
    for (const r of [...v.readings, ...(v.elsewhere ? [v.elsewhere] : [])]) {
      if (!sources.some((s) => s.sourceId === r.sourceId)) sources.push({ sourceId: r.sourceId, observedAt: r.observedAt, fetchedAt: r.fetchedAt });
    }
  }
  return { status: 'ok', data: { variables }, sources };
}

async function hazardsCard(sql: Db, lng: number, lat: number): Promise<CardResult<HazardsCard>> {
  const { connected, imports, okRuns } = await sourceMeta(sql);
  const dmr = imports.get('dmr.landslide');
  const shore = imports.get('dmr.shoreline');
  const has = (id: string) => connected.has(id) || imports.has(id);
  const pendingSourceIds = PLANNED.hazards.sourceIds.filter((id) => !has(id));
  const floodConnected = connected.has('gistda.flood');
  const hotspotsConnected = connected.has('firms.hotspots');
  if (!connected.has('usgs.earthquakes') && !dmr && !shore && !floodConnected && !hotspotsConnected) return { status: 'not_connected', ...PLANNED.hazards };

  const sources: SourceRef[] = [];
  let earthquakes = null;
  if (connected.has('usgs.earthquakes')) {
    earthquakes = summarizeEarthquakes(await earthquakesNear(sql, lng, lat, USGS_WINDOW_DAYS));
    // The list is the catalog as of the last successful fetch (no new event is not a delay), so that time is
    // the data time; each event shows its own origin time in the card.
    const asOf = okRuns.get('usgs.earthquakes') ?? null;
    sources.push({ sourceId: 'usgs.earthquakes', observedAt: asOf, fetchedAt: asOf });
  }
  const [geohazard, satHits] = await Promise.all([
    dmr || shore ? geohazardsAt(sql, lng, lat) : null,
    floodConnected || hotspotsConnected ? satelliteHazardsAt(sql, lng, lat) : null,
  ]);
  const satellite = satHits ? { ...satHits, floodConnected, hotspotsConnected } : null;
  for (const id of ['gistda.flood', 'firms.hotspots'] as const) {
    if (!connected.has(id)) continue;
    const at = okRuns.get(id) ?? null;
    sources.push({ sourceId: id, observedAt: at, fetchedAt: at });
  }
  // Survey data: no single observation date (each record carries its own survey year), so only the import time.
  if (dmr) sources.push(ref('dmr.landslide', { ...dmr, sourceDate: null }));
  if (shore) sources.push(ref('dmr.shoreline', { ...shore, sourceDate: null }));
  return { status: 'ok', data: { satellite, geohazard, earthquakes, pendingSourceIds }, sources };
}
