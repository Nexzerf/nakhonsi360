/**
 * ThaiWater adapters, tested against the real responses saved in data/samples.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bankDetail, thaiwaterRain24h, thaiwaterWaterlevel, waterlevelScale } from '@/lib/adapters/thaiwater';
import { validateBatch } from '@/lib/ingest/runner';

const sample = (f: string) => JSON.parse(readFileSync(path.resolve(__dirname, '../../../data/samples', f), 'utf8'));
const wlRaw = sample('thaiwater.waterlevel/waterlevel_load.json');
const rainRaw = sample('thaiwater.rain24h/rain_24h.json');
const FETCHED = '2026-09-29T21:17:00.000Z';
const NOW = new Date(FETCHED);

describe('ThaiWater water level (real sample)', () => {
  const batch = thaiwaterWaterlevel.parse(wlRaw, FETCHED);

  it('reads every station in the sample', () => {
    expect(batch.stations).toHaveLength(wlRaw.waterlevel_data.data.length);
    expect(batch.rejections).toEqual([]);
  });

  it('keeps the source record exactly: คลองชะอวด', () => {
    const src = wlRaw.waterlevel_data.data.find((r: { station: { tele_station_oldcode: string } }) => r.station.tele_station_oldcode === 'CHAU01');
    const st = batch.stations.find((s) => s.stationId === String(src.station.id))!;
    expect(st.nameTh).toBe('คลองชะอวด');
    expect(st.lat).toBe(src.station.tele_station_lat);
    expect(st.riverName).toBe('คลองชะอวด');
    expect(st.properties?.agency_short_th).toBe('สสน.');
    const obs = batch.observations.find((o) => o.stationId === st.stationId && o.variable === 'water_level')!;
    expect(obs.value).toBe(Number(src.waterlevel_msl));
    expect(obs.unit).toBe('m MSL');
    // "2026-09-30 04:00" Thai time
    expect(obs.observedAt).toBe('2026-09-29T21:00:00.000Z');
    expect(obs.officialLevel).toBe(src.situation_level);
  });

  it('uses the official scale from the same response for status text and colour', () => {
    const scale = waterlevelScale(wlRaw);
    expect(scale.get(4)).toEqual({ situation: 'น้ำมาก', color: '#003CFA' });
    const lvl4 = batch.observations.find((o) => o.officialLevel === 4)!;
    expect(lvl4.officialStatus).toBe('น้ำมาก');
    expect(lvl4.officialColor).toBe('#003CFA');
  });

  it('leaves status empty when the source gives no level', () => {
    const noLevel = wlRaw.waterlevel_data.data.filter((r: object) => !('situation_level' in r));
    expect(noLevel.length).toBeGreaterThan(0);
    const ids = new Set(noLevel.map((r: { station: { id: number } }) => String(r.station.id)));
    for (const o of batch.observations.filter((x) => ids.has(x.stationId!))) {
      expect(o.officialStatus).toBeUndefined();
      expect(o.officialColor).toBeUndefined();
    }
  });

  it('adds the bank-capacity percentage only where the source has it', () => {
    const withPct = wlRaw.waterlevel_data.data.filter((r: { storage_percent: string | null }) => r.storage_percent !== null).length;
    expect(batch.observations.filter((o) => o.variable === 'water_level_bank_pct')).toHaveLength(withPct);
  });

  it('passes validation', () => {
    const v = validateBatch(batch, NOW);
    expect(v.rejections).toEqual([]);
    expect(v.observations).toHaveLength(batch.observations.length);
  });

  it('formats the bank text from the source wording', () => {
    expect(bankDetail('ต่ำกว่าตลิ่ง (ม.)', '1.58')).toBe('ต่ำกว่าตลิ่ง 1.58 ม.');
    expect(bankDetail('', '1.58')).toBeUndefined();
  });
});

describe('ThaiWater rain 24 h (real sample)', () => {
  const batch = thaiwaterRain24h.parse(rainRaw, FETCHED);

  it('reads every record and credits each agency', () => {
    expect(batch.observations).toHaveLength(rainRaw.data.length);
    expect(batch.rejections).toEqual([]);
    const agencies = new Set(batch.stations.map((s) => s.properties?.agency_short_th));
    expect(agencies.size).toBeGreaterThan(1);
  });

  it('keeps values and converts Thai time', () => {
    const src = rainRaw.data[0];
    const obs = batch.observations.find((o) => o.stationId === String(src.station.id))!;
    expect(obs.value).toBe(src.rain_24h);
    expect(obs.unit).toBe('mm');
    expect(new Date(obs.observedAt).getTime()).toBe(new Date(`${src.rainfall_datetime.replace(' ', 'T')}:00+07:00`).getTime());
  });

  it('passes validation (no reading in the future at fetch time)', () => {
    const v = validateBatch(batch, NOW);
    expect(v.rejections).toEqual([]);
  });
});
