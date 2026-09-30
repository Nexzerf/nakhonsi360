/**
 * Decide, per variable, which station readings describe the clicked point.
 * Sources are never merged: at most one local reading per source is kept,
 * and differing sources are flagged ("แหล่งข้อมูลไม่ตรงกัน"), not averaged.
 */
import { isLocal, ruleRadiusM, sourcesDisagree, type VariableRule } from '@/lib/registry/stationRules';
import type { ConditionReading, VariableConditions } from '@/lib/types';
import type { NearestObservationRow } from '@/lib/db/queries';

export function toReading(r: NearestObservationRow, bankPercent: number | null): ConditionReading {
  const props = r.station_properties ?? {};
  return {
    sourceId: r.source_id,
    stationId: r.station_id,
    stationNameTh: r.name_th,
    stationNameEn: r.name_en,
    agencyTh: typeof props.agency_th === 'string' ? props.agency_th : null,
    riverName: r.river_name,
    value: r.value,
    unit: r.unit,
    observedAt: new Date(r.observed_at).toISOString(),
    fetchedAt: new Date(r.fetched_at).toISOString(),
    distanceM: r.distance_m,
    officialStatus: r.official_status,
    officialLevel: r.official_level,
    officialColor: r.official_color,
    officialDetail: r.official_detail,
    bankPercent,
  };
}

/**
 * @param rows nearest latest readings for the variable, nearest first (any source)
 * @param connected sources that have delivered data at least once
 * @param pointRivers named waterways near the point (for the same-river rule)
 * @param bank ThaiWater bank % per station id (water level only)
 */
export function buildVariableConditions(
  rule: VariableRule,
  rows: NearestObservationRow[],
  connected: ReadonlySet<string>,
  pointRivers: readonly string[],
  bank: ReadonlyMap<string, number> = new Map(),
): VariableConditions {
  const connectedSourceIds = rule.sourceIds.filter((id) => connected.has(id));
  const pendingSourceIds = rule.sourceIds.filter((id) => !connected.has(id));
  const mine = rows.filter((r) => rule.sourceIds.includes(r.source_id)).sort((a, b) => a.distance_m - b.distance_m);

  const readings: ConditionReading[] = [];
  for (const sourceId of connectedSourceIds) {
    const local = mine.find((r) => r.source_id === sourceId && isLocal(rule.rule, r.distance_m, r.river_name, pointRivers));
    if (local) readings.push(toReading(local, bank.get(local.station_id) ?? null));
  }
  const nearest = mine[0];
  const elsewhere = readings.length === 0 && nearest ? toReading(nearest, bank.get(nearest.station_id) ?? null) : null;

  return {
    variable: rule.variable,
    rule: { kind: rule.rule.kind, radiusM: ruleRadiusM(rule.rule) },
    connectedSourceIds,
    pendingSourceIds,
    readings,
    elsewhere,
    disagree: sourcesDisagree(
      readings.map((r) => r.value),
      rule,
    ),
  };
}
