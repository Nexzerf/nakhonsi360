/**
 * Nearest-station rules applied to real ThaiWater stations (data/samples),
 * with geodesic distances from real station coordinates.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { thaiwaterRain24h, thaiwaterWaterlevel } from '@/lib/adapters/thaiwater';
import { buildVariableConditions } from '@/lib/inspect/conditions';
import { CONDITION_VARIABLES, isLocal, sourcesDisagree } from '@/lib/registry/stationRules';
import { haversineMeters } from '@/lib/geo/distance';
import type { NearestObservationRow } from '@/lib/db/queries';
import type { ParsedBatch } from '@/lib/ingest/types';

const sample = (f: string) => JSON.parse(readFileSync(path.resolve(__dirname, '../../data/samples', f), 'utf8'));
const FETCHED = '2026-09-29T21:17:00.000Z';
const rain = thaiwaterRain24h.parse(sample('thaiwater.rain24h/rain_24h.json'), FETCHED);
const wl = thaiwaterWaterlevel.parse(sample('thaiwater.waterlevel/waterlevel_load.json'), FETCHED);
const rule = (v: string) => CONDITION_VARIABLES.find((r) => r.variable === v)!;

/** What nearest_observations would return for a point: latest reading per station, nearest first. */
function rowsFor(batch: ParsedBatch, sourceId: string, variable: string, lng: number, lat: number): NearestObservationRow[] {
  const stations = new Map(batch.stations.map((s) => [s.stationId, s]));
  return batch.observations
    .filter((o) => o.variable === variable)
    .map((o) => {
      const s = stations.get(o.stationId!)!;
      return {
        source_id: sourceId,
        station_id: s.stationId,
        name_th: s.nameTh,
        name_en: s.nameEn,
        river_name: s.riverName ?? null,
        station_properties: s.properties ?? {},
        value: o.value,
        unit: o.unit,
        observed_at: new Date(o.observedAt),
        fetched_at: new Date(o.fetchedAt),
        official_status: o.officialStatus ?? null,
        official_level: o.officialLevel ?? null,
        official_color: o.officialColor ?? null,
        official_detail: o.officialDetail ?? null,
        distance_m: haversineMeters([lng, lat], [s.lng, s.lat]),
      };
    })
    .sort((a, b) => a.distance_m - b.distance_m);
}

describe('rain 24 h: 15 km radius', () => {
  const connected = new Set(['thaiwater.rain24h']);
  const st = rain.stations[0]!;

  it('uses the station at the clicked point', () => {
    const c = buildVariableConditions(rule('rain_24h'), rowsFor(rain, 'thaiwater.rain24h', 'rain_24h', st.lng, st.lat), connected, []);
    expect(c.readings).toHaveLength(1);
    expect(c.readings[0]!.stationId).toBe(st.stationId);
    expect(c.elsewhere).toBeNull();
    expect(c.pendingSourceIds).toEqual(['tmd.weather']);
  });

  it('shows no local value in the Gulf, 60 km offshore, but names the nearest station as elsewhere', () => {
    const lng = 100.6;
    const lat = 8.5;
    const rows = rowsFor(rain, 'thaiwater.rain24h', 'rain_24h', lng, lat);
    expect(rows[0]!.distance_m).toBeGreaterThan(15_000);
    const c = buildVariableConditions(rule('rain_24h'), rows, connected, []);
    expect(c.readings).toEqual([]);
    expect(c.elsewhere?.stationId).toBe(rows[0]!.station_id);
    expect(c.rule.radiusM).toBe(15_000);
  });
});

describe('water level: same waterway only', () => {
  const connected = new Set(['thaiwater.waterlevel']);
  const chaUat = wl.stations.find((s) => s.properties?.station_code === 'CHAU01')!;

  it('is local only when the point is on the same named waterway', () => {
    const rows = rowsFor(wl, 'thaiwater.waterlevel', 'water_level', chaUat.lng, chaUat.lat);
    const onRiver = buildVariableConditions(rule('water_level'), rows, connected, ['คลองชะอวด']);
    expect(onRiver.readings[0]?.stationId).toBe(chaUat.stationId);
    expect(onRiver.readings[0]?.officialStatus).toBeTruthy();
  });

  it('is never local without waterway names (e.g. OSM not imported)', () => {
    const rows = rowsFor(wl, 'thaiwater.waterlevel', 'water_level', chaUat.lng, chaUat.lat);
    const c = buildVariableConditions(rule('water_level'), rows, connected, []);
    expect(c.readings).toEqual([]);
    expect(c.elsewhere?.stationId).toBe(chaUat.stationId);
  });

  it('matches river names exactly (ignoring spaces), not by similarity', () => {
    const r = rule('water_level').rule;
    expect(isLocal(r, 1000, 'คลองชะอวด', ['คลอง ชะอวด'])).toBe(true);
    expect(isLocal(r, 1000, 'คลองชะอวด', ['คลองท่าเลา'])).toBe(false);
    expect(isLocal(r, 25_000, 'คลองชะอวด', ['คลองชะอวด'])).toBe(false);
  });
});

describe('source disagreement', () => {
  it('flags only differences beyond both tolerances', () => {
    const r = rule('rain_24h');
    expect(sourcesDisagree([42.5], r)).toBe(false);
    expect(sourcesDisagree([42.5, 44], r)).toBe(false);
    expect(sourcesDisagree([10, 46.5], r)).toBe(true);
  });
});
