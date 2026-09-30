import { NextResponse, type NextRequest } from 'next/server';
import { getDb, withTimeout, TimeoutError } from '@/lib/db/client';
import { connectedSources, forecastAt, hazardsAt, inspectAdmin, latestAtStations, latestImports, nearestFeatures, nearestObservations, nearestVillages, unlocatedVillagesAt, waterwayNamesNear } from '@/lib/db/queries';
import { CONDITION_VARIABLES } from '@/lib/registry/stationRules';
import { buildVariableConditions } from '@/lib/inspect/conditions';
import type { CardResult, ConditionsCard, HazardsCard, ImportRecord, InspectResponse, InspectSection, SourceRef } from '@/lib/types';

export const dynamic = 'force-dynamic';

const CARD_TIMEOUT_MS = 4000;
const CONTEXT_RADIUS_M = 30_000;
const ALL_SECTIONS: InspectSection[] = ['admin', 'village', 'context', 'conditions', 'forecast', 'hazards', 'satellite'];

/** Sections whose sources are built in later phases. */
const PLANNED: Record<'conditions' | 'forecast' | 'hazards' | 'satellite', { phase: number; sourceIds: string[] }> = {
  forecast: { phase: 2, sourceIds: ['tmd.nwp'] },
  conditions: { phase: 2, sourceIds: ['thaiwater.rain24h', 'thaiwater.waterlevel', 'tmd.weather', 'air4thai.aqi'] },
  hazards: { phase: 2, sourceIds: ['gistda.flood', 'gistda.hotspots', 'firms.hotspots', 'dmr.landslide', 'dmcr.coast'] },
  satellite: { phase: 4, sourceIds: ['copernicus.sentinel2'] },
};

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

  const wantDb = sections.filter((s) => s !== 'satellite');
  if (wantDb.length === 0) return NextResponse.json(out);

  if (!sql) {
    for (const s of wantDb) {
      out.sections[s] = s === 'conditions' || s === 'forecast' || s === 'hazards' ? { status: 'not_connected', ...PLANNED[s] } : { status: 'unavailable', reason: 'database_not_configured' };
    }
    return NextResponse.json(out);
  }

  let imports: Map<string, ImportRecord>;
  try {
    imports = await withTimeout(latestImports(sql), CARD_TIMEOUT_MS);
  } catch (err) {
    console.error('[api/inspect] imports', err);
    for (const s of wantDb) out.sections[s] = err instanceof TimeoutError ? { status: 'timeout' } : { status: 'error' };
    return NextResponse.json(out);
  }
  const hdx = imports.get('hdx.cod-ab-tha');
  const dopa = imports.get('dopa.villages');
  const osm = imports.get('osm.geofabrik');

  // Admin containment is shared: the other cards use it to tell "outside the province" apart from "no data".
  const adminPromise = hdx ? guarded(async () => ({ status: 'ok' as const, data: await inspectAdmin(sql, lng, lat), sources: [ref('hdx.cod-ab-tha', hdx)] })) : null;

  const outside = async (): Promise<boolean> => {
    if (!adminPromise) return false;
    const a = await adminPromise;
    return a.status === 'ok' && !a.data.inStudyArea;
  };

  const tasks: Promise<void>[] = [];

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
          const [nearest, unlocated] = await Promise.all([nearestVillages(sql, lng, lat, 3), unlocatedVillagesAt(sql, lng, lat)]);
          return nearest.length || unlocated.length ? { status: 'ok', data: { nearest, unlocated }, sources } : { status: 'empty', reason: 'no_public_data', sources };
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

  if (wantDb.includes('forecast')) {
    tasks.push(
      (async () => {
        out.sections.forecast = await guarded(async () => {
          const connected = await connectedSources(sql);
          if (!PLANNED.forecast.sourceIds.some((id) => connected.has(id))) return { status: 'not_connected', ...PLANNED.forecast };
          if (await outside()) return { status: 'empty', reason: 'outside_study_area', sources: [] };
          const data = await forecastAt(sql, lng, lat, FORECAST_HOURS, FORECAST_DAYS);
          if (!data) return { status: 'empty', reason: 'no_public_data', sources: [] };
          return { status: 'ok', data, sources: [{ sourceId: data.sourceId, observedAt: null, fetchedAt: data.fetchedAt }] };
        });
      })(),
    );
  }

  if (wantDb.includes('hazards')) {
    tasks.push(
      (async () => {
        out.sections.hazards = await guarded(async () => hazardsCard(sql, lng, lat, await outside()));
      })(),
    );
  }

  await Promise.all(tasks);
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}

const FORECAST_HOURS = 24;
const FORECAST_DAYS = 7;
const HOTSPOT_RADIUS_M = 5_000;
const HOTSPOT_DAYS = 7;

async function hazardsCard(sql: NonNullable<ReturnType<typeof getDb>>, lng: number, lat: number, outsideArea: boolean): Promise<CardResult<HazardsCard>> {
  const connected = await connectedSources(sql);
  if (!PLANNED.hazards.sourceIds.some((id) => connected.has(id))) return { status: 'not_connected', ...PLANNED.hazards };
  if (outsideArea) return { status: 'empty', reason: 'outside_study_area', sources: [] };
  const data = await hazardsAt(sql, lng, lat, HOTSPOT_RADIUS_M, HOTSPOT_DAYS, PLANNED.hazards.sourceIds);
  // Provenance: every checked source, with its latest detection here if any, else its last successful check.
  const sources: SourceRef[] = data.checked.map((c) => {
    const latest = data.hotspots.find((h) => h.sourceId === c.sourceId)?.latestObservedAt ?? null;
    return { sourceId: c.sourceId, observedAt: latest, fetchedAt: c.lastSuccessAt, checkedNothingFound: latest === null };
  });
  return { status: 'ok', data, sources };
}

async function conditionsCard(sql: NonNullable<ReturnType<typeof getDb>>, lng: number, lat: number, outsideArea: boolean): Promise<CardResult<ConditionsCard>> {
  const connected = await connectedSources(sql);
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
