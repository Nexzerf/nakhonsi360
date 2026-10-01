import { describe, expect, it } from 'vitest';
import { normalizePhone, parseObserved, validateReport, validateUpdate, LIMITS } from '@/lib/reports/schema';
import { EMERGENCY_CONTACTS, PRIMARY_EMERGENCY_IDS, telHref } from '@/lib/registry/emergency';
import { dictionaries, leafKeys } from '@/lib/i18n';

const base = { hazard: 'flood', urgency: 'help', lat: 8.43, lng: 99.96, locationSource: 'gps', gpsAccuracyM: 12.4 };

describe('report validation', () => {
  it('accepts a minimal report and normalises it', () => {
    const r = validateReport(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ hazard: 'flood', urgency: 'help', locationSource: 'gps', gpsAccuracyM: 12, needs: [], contactPhone: null, vulnerable: false });
  });

  it('keeps water fields only for water hazards', () => {
    const flood = validateReport({ ...base, waterDepthCm: 50, waterTrend: 'rising' });
    expect(flood.ok && flood.value.waterDepthCm).toBe(50);
    expect(flood.ok && flood.value.waterTrend).toBe('rising');
    const fire = validateReport({ ...base, hazard: 'fire', waterDepthCm: 50, waterTrend: 'rising' });
    expect(fire.ok && fire.value.waterDepthCm).toBeNull();
    expect(fire.ok && fire.value.waterTrend).toBeNull();
  });

  it('reports each bad field', () => {
    const r = validateReport({ hazard: 'meteor', urgency: 'x', lat: 200, lng: 'a', needs: ['food', 'gold'], people: -1, contactPhone: '12345', details: 'x'.repeat(LIMITS.details + 1) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(['contactPhone', 'details', 'hazard', 'location', 'needs', 'people', 'urgency']);
  });

  it('dedupes needs and strips control characters', () => {
    const r = validateReport({ ...base, needs: ['food', 'food', 'drinking_water'], details: ' ติด\u0000อยู่   ชั้น 2 ' });
    expect(r.ok && r.value.needs).toEqual(['food', 'drinking_water']);
    expect(r.ok && r.value.details).toBe('ติดอยู่ ชั้น 2');
  });

  it('accepts Thai mobile and landline numbers only', () => {
    expect(normalizePhone('081-234-5678')).toBe('0812345678');
    expect(normalizePhone('+66 81 234 5678')).toBe('0812345678');
    expect(normalizePhone('075 358440')).toBe('075358440');
    expect(normalizePhone('1784')).toBeUndefined();
    expect(normalizePhone('')).toBeNull();
  });

  it('validates helper updates', () => {
    expect(validateUpdate({ action: 'on_the_way', authorName: ' อาสาบ้านเรา ' })).toMatchObject({ ok: true, value: { action: 'on_the_way', authorName: 'อาสาบ้านเรา', note: null } });
    expect(validateUpdate({ action: 'note', note: 'น้ำขึ้นถึงหน้าต่าง' }).ok).toBe(true);
    // A bare note needs text; unknown actions and bad tokens are refused or dropped.
    expect(validateUpdate({ action: 'note' }).ok).toBe(false);
    expect(validateUpdate({ action: 'delete' }).ok).toBe(false);
    const t = validateUpdate({ action: 'resolved', editToken: 'not-a-token' });
    expect(t.ok && t.value.editToken).toBeNull();
  });
});

describe('when it was seen', () => {
  const now = new Date('2026-10-02T03:00:00Z');
  it('accepts the last 72 hours and a little clock slack', () => {
    expect(parseObserved('2026-10-02T02:30:00Z', now)?.toISOString()).toBe('2026-10-02T02:30:00.000Z');
    expect(parseObserved('2026-10-02T03:04:00Z', now)).toBeInstanceOf(Date);
    expect(parseObserved(null, now)).toBeNull();
  });
  it('refuses the future, the too old and junk', () => {
    expect(parseObserved('2026-10-02T04:00:00Z', now)).toBeUndefined();
    expect(parseObserved('2026-09-28T00:00:00Z', now)).toBeUndefined();
    expect(parseObserved('yesterday', now)).toBeUndefined();
  });
  it('requires a level for a water-level update', () => {
    expect(validateUpdate({ action: 'level' }).ok).toBe(false);
    expect(validateUpdate({ action: 'level', waterDepthCm: 100, waterTrend: 'rising' })).toMatchObject({ ok: true, value: { waterDepthCm: 100, waterTrend: 'rising' } });
    expect(validateUpdate({ action: 'confirm' }).ok).toBe(true);
  });
});

describe('emergency directory', () => {
  it('has unique ids, dialable numbers and at least one source each', () => {
    expect(new Set(EMERGENCY_CONTACTS.map((c) => c.id)).size).toBe(EMERGENCY_CONTACTS.length);
    for (const c of EMERGENCY_CONTACTS) {
      expect(telHref(c.number)).toMatch(/^tel:\d{3,10}$/);
      expect(c.sources.length).toBeGreaterThan(0);
      for (const s of c.sources) expect(s.url).toMatch(/^https:\/\//);
    }
  });
  it('lists the life-threatening numbers first', () => {
    const numbers = PRIMARY_EMERGENCY_IDS.map((id) => EMERGENCY_CONTACTS.find((c) => c.id === id)?.number);
    expect(numbers).toEqual(['1669', '191', '199', '1784']);
  });
});

describe('i18n for reports', () => {
  it('has the same report, emergency and help keys in Thai and English', () => {
    const pick = (d: unknown) => leafKeys(d).filter((k) => /^(report|reports|emergency|help|actions|panel|photos|evidence)\./.test(k)).sort();
    expect(pick(dictionaries.en)).toEqual(pick(dictionaries.th));
  });
});
