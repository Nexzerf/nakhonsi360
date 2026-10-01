/**
 * DOPA village parsing against the real excerpt in data/samples/dopa.villages
 * (2023 release for นครศรีธรรมราช; includes every record with projected coordinates).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectVillageFields, extractRecords, parseVillages } from '@/lib/import/dopa';

const sample = JSON.parse(readFileSync(path.resolve(__dirname, '../../../data/samples/dopa.villages/excerpt.json'), 'utf8'));
const records = extractRecords(sample.records);
const keys = [...new Set(records.flatMap((r) => Object.keys(r.properties)))];

describe('DOPA villages (real excerpt)', () => {
  it('detects the verified field names without overrides', () => {
    expect(detectVillageFields(keys)).toEqual({ id: 'mcode', nameTh: 'mname', lat: 'oct_side15_lat', lng: 'oct_side15_lon', subdistrictCode: 'tcode', subdistrict: 'tname', district: 'aname' });
  });

  it('keeps names, codes and coordinates exactly as published', () => {
    const { villages } = parseVillages(records, detectVillageFields(keys));
    const first = sample.records[0];
    const v = villages.find((x) => x.id === first.mcode)!;
    expect(v.nameTh).toBe(first.mname);
    expect(v.lat).toBe(Number(first.oct_side15_lat));
    expect(v.lng).toBe(Number(first.oct_side15_lon));
    expect(v.subdistrictText).toBe(first.tname);
    expect(v.moo).toBeNull(); // the file has no หมู่ที่ field; it is not derived from the code
  });

  it('keeps villages with projected (UTM-like) coordinates, unconverted and flagged, instead of rejecting them', () => {
    const { villages, unusable, rejections } = parseVillages(records, detectVillageFields(keys));
    const projected = sample.records.filter((r: { oct_side15_lat: string }) => Math.abs(Number(r.oct_side15_lat)) > 1000);
    expect(projected).toHaveLength(7);
    expect(rejections).toHaveLength(0);
    expect(villages).toHaveLength(sample.records.length - 7);
    expect(unusable.map((u) => u.id).sort()).toEqual(projected.map((r: { mcode: string }) => r.mcode).sort());
    for (const u of unusable) {
      const src = projected.find((r: { mcode: string }) => r.mcode === u.id);
      expect(u.reason).toBe('projected_coordinates');
      // The published numbers, unmodified; the parser does not convert them.
      expect(u.latValue).toBe(Number(src.oct_side15_lat));
      expect(u.lonValue).toBe(Number(src.oct_side15_lon));
      expect(u.subdistrictCode).toBe(src.tcode);
    }
  });
});
