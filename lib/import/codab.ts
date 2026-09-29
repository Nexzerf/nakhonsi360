/**
 * OCHA COD-AB field detection. The published schema has changed over time
 * (e.g. ADM2_TH / ADM2_EN / ADM2_PCODE in older releases; lower-case
 * adm2_name / adm2_name1 / adm2_pcode in newer ones), so fields are detected
 * from the file and the Thai-name field is checked to actually contain Thai.
 * Unresolvable files fail loudly with the list of available fields.
 */
import { fieldKey } from '@/lib/import/text';

export interface CodabFieldMap {
  level: 1 | 2 | 3;
  pcode: string;
  nameTh: string;
  nameEn: string | null;
  parentPcode: string | null;
  adm1Pcode: string | null;
}

function find(fields: string[], candidates: string[]): string | null {
  const byKey = new Map(fields.map((f) => [fieldKey(f), f]));
  for (const c of candidates) {
    const hit = byKey.get(fieldKey(c));
    if (hit) return hit;
  }
  return null;
}

/** Candidate Thai-name fields, most specific first. `name1` is the alternate-language name in newer CODs. */
export function thNameCandidates(n: number): string[] {
  return [`ADM${n}_TH`, `ADM${n}_NAME_TH`, `adm${n}_th`, `adm${n}_name1`, `ADM${n}ALT1TH`];
}

export function enNameCandidates(n: number): string[] {
  return [`ADM${n}_EN`, `ADM${n}_NAME_EN`, `adm${n}_en`, `adm${n}_name`];
}

/**
 * Detect the admin level of a layer (the deepest ADMn_PCODE present, n ≤ 3)
 * and its fields. Returns null for layers that are not ADM1–ADM3 polygons.
 * `overrides` lets the operator name fields explicitly, e.g. { nameTh: 'ADM3_TH' }.
 */
export function detectCodabFields(
  fields: string[],
  overrides: Partial<Omit<CodabFieldMap, 'level'>> = {},
): CodabFieldMap | { level: 1 | 2 | 3; missing: Array<'pcode' | 'nameTh'> } | null {
  let level: 1 | 2 | 3 | null = null;
  for (const n of [3, 2, 1] as const) {
    if (find(fields, [`ADM${n}_PCODE`, `adm${n}_pcode`, `ADM${n}_CODE`])) {
      level = n;
      break;
    }
  }
  // An ADM4 layer also carries ADM3_PCODE; skip it.
  if (level === null || find(fields, ['ADM4_PCODE', 'adm4_pcode'])) return null;

  const pcode = overrides.pcode ?? find(fields, [`ADM${level}_PCODE`, `adm${level}_pcode`, `ADM${level}_CODE`]);
  const nameTh = overrides.nameTh ?? find(fields, thNameCandidates(level));
  const nameEn = overrides.nameEn ?? find(fields, enNameCandidates(level));
  const parentPcode = level > 1 ? (overrides.parentPcode ?? find(fields, [`ADM${level - 1}_PCODE`, `adm${level - 1}_pcode`])) : null;
  const adm1Pcode = overrides.adm1Pcode ?? find(fields, ['ADM1_PCODE', 'adm1_pcode']);
  if (!pcode || !nameTh) {
    const missing: Array<'pcode' | 'nameTh'> = [];
    if (!pcode) missing.push('pcode');
    if (!nameTh) missing.push('nameTh');
    return { level, missing };
  }
  return { level, pcode, nameTh, nameEn, parentPcode, adm1Pcode };
}
