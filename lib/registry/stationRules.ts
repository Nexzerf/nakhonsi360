/**
 * When a station's reading may be shown as the value "at" a clicked point.
 * Beyond these limits the reading belongs to somewhere else: the inspector
 * says "ไม่มีสถานีตรวจวัดในรัศมี X กม." and may show the nearest station's
 * reading clearly labelled as elsewhere.
 */
export type StationRule =
  | { kind: 'radius'; radiusM: number }
  /**
   * Water level only represents its own river: the station must be within
   * maxRadiusM AND its river name (as the source writes it) must equal the
   * name of an OSM waterway within riverSnapM of the point.
   */
  | { kind: 'same_river'; maxRadiusM: number; riverSnapM: number };

export interface VariableRule {
  variable: string;
  th: string;
  en: string;
  sourceIds: string[];
  rule: StationRule;
  /** Two sources "disagree" when their local values differ by more than this (canonical unit). */
  disagreeAbs: number;
  /** …or by more than this fraction of the larger value. */
  disagreeRel: number;
  /** Display precision. */
  decimals: number;
}

export const CONDITION_VARIABLES: readonly VariableRule[] = [
  { variable: 'rain_24h', th: 'ฝน 24 ชม.', en: '24-h rain', sourceIds: ['thaiwater.rain24h', 'tmd.weather'], rule: { kind: 'radius', radiusM: 15_000 }, disagreeAbs: 5, disagreeRel: 0.25, decimals: 1 },
  { variable: 'water_level', th: 'ระดับน้ำ', en: 'Water level', sourceIds: ['thaiwater.waterlevel'], rule: { kind: 'same_river', maxRadiusM: 20_000, riverSnapM: 2_000 }, disagreeAbs: 0.1, disagreeRel: 0.05, decimals: 2 },
  { variable: 'temperature', th: 'อุณหภูมิ', en: 'Temperature', sourceIds: ['tmd.weather'], rule: { kind: 'radius', radiusM: 30_000 }, disagreeAbs: 2, disagreeRel: 0.1, decimals: 1 },
  { variable: 'humidity', th: 'ความชื้นสัมพัทธ์', en: 'Humidity', sourceIds: ['tmd.weather'], rule: { kind: 'radius', radiusM: 30_000 }, disagreeAbs: 10, disagreeRel: 0.15, decimals: 0 },
  { variable: 'wind_speed', th: 'ความเร็วลม', en: 'Wind speed', sourceIds: ['tmd.weather'], rule: { kind: 'radius', radiusM: 30_000 }, disagreeAbs: 2, disagreeRel: 0.3, decimals: 1 },
  { variable: 'pm25', th: 'PM2.5', en: 'PM2.5', sourceIds: ['air4thai.aqi'], rule: { kind: 'radius', radiusM: 25_000 }, disagreeAbs: 10, disagreeRel: 0.25, decimals: 0 },
];

/** Compare river names ignoring spaces and case only; the names themselves must match. */
function riverKey(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase();
}

/**
 * Is a station's reading local to the point? `pointRivers` are the names of
 * named waterways within the rule's snap distance of the point (empty when
 * OSM is not imported, so water level is then never shown as local).
 */
export function isLocal(rule: StationRule, distanceM: number, stationRiver: string | null, pointRivers: readonly string[]): boolean {
  if (rule.kind === 'radius') return distanceM <= rule.radiusM;
  if (distanceM > rule.maxRadiusM || !stationRiver) return false;
  const key = riverKey(stationRiver);
  return pointRivers.some((r) => riverKey(r) === key);
}

/** Radius shown in the empty-state message. */
export function ruleRadiusM(rule: StationRule): number {
  return rule.kind === 'radius' ? rule.radiusM : rule.maxRadiusM;
}

/** True when two or more local values differ beyond the variable's tolerance. */
export function sourcesDisagree(values: number[], rule: Pick<VariableRule, 'disagreeAbs' | 'disagreeRel'>): boolean {
  if (values.length < 2) return false;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const diff = max - min;
  return diff > rule.disagreeAbs && diff > rule.disagreeRel * Math.max(Math.abs(max), Math.abs(min));
}

/** Hazard search settings used by the inspector. */
export const HAZARD_SETTINGS = { floodDays: 7, hotspotRadiusM: 5_000, hotspotDays: 7 } as const;
