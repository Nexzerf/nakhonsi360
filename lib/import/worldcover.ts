/**
 * ESA WorldCover 10 m land cover (v200, reference year 2021).
 *
 * Classes, colours and definitions from the Product User Manual v2.0
 * (Table 3, s3://esa-worldcover/v200/2021/docs/WorldCover_PUM_V2.0.pdf).
 * Note from the PUM: plantations (e.g. oil palm) are "Tree cover", and
 * perennial woody crops are never "Cropland" — in this province, rubber and
 * oil palm are therefore inside class 10. The Thai labels say so.
 */

export const WORLDCOVER_BUCKET = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com';
export const WORLDCOVER_VERSION = 'v200';
export const WORLDCOVER_YEAR = 2021;

export interface WorldCoverClass {
  code: number;
  th: string;
  en: string;
  /** RGB from the PUM. */
  color: string;
}

export const WORLDCOVER_CLASSES: readonly WorldCoverClass[] = [
  { code: 10, th: 'ต้นไม้ปกคลุม (รวมสวนไม้ยืนต้น เช่น ยางพารา ปาล์มน้ำมัน)', en: 'Tree cover (incl. tree plantations such as rubber, oil palm)', color: '#006400' },
  { code: 20, th: 'ไม้พุ่ม', en: 'Shrubland', color: '#ffbb22' },
  { code: 30, th: 'ทุ่งหญ้า', en: 'Grassland', color: '#ffff4c' },
  { code: 40, th: 'พื้นที่เพาะปลูกพืชล้มลุก', en: 'Cropland (annual crops)', color: '#f096ff' },
  { code: 50, th: 'สิ่งปลูกสร้าง', en: 'Built-up', color: '#fa0000' },
  { code: 60, th: 'พื้นที่โล่ง / พืชพรรณบางเบา', en: 'Bare / sparse vegetation', color: '#b4b4b4' },
  { code: 70, th: 'หิมะและน้ำแข็ง', en: 'Snow and ice', color: '#f0f0f0' },
  { code: 80, th: 'แหล่งน้ำถาวร', en: 'Permanent water bodies', color: '#0064c8' },
  { code: 90, th: 'พื้นที่ชุ่มน้ำ (พืชล้มลุก)', en: 'Herbaceous wetland', color: '#0096a0' },
  { code: 95, th: 'ป่าชายเลน', en: 'Mangroves', color: '#00cf75' },
  { code: 100, th: 'มอสและไลเคน', en: 'Moss and lichen', color: '#fae6a0' },
];

export const WORLDCOVER_CODES = new Set(WORLDCOVER_CLASSES.map((c) => c.code));
/** Classes traced to polygons and drawn on the map. */
export const MAPPED_CLASSES = [95] as const;

/** Names of the 3° × 3° tiles (lower-left corner) covering a bbox, e.g. N06E099. */
export function worldcoverTiles(bbox: [number, number, number, number]): string[] {
  const [w, s, e, n] = bbox;
  const fl = (v: number) => Math.floor(v / 3) * 3;
  const out: string[] = [];
  for (let lat = fl(s); lat <= fl(n - 1e-9); lat += 3) {
    for (let lon = fl(w); lon <= fl(e - 1e-9); lon += 3) {
      const ns = `${lat < 0 ? 'S' : 'N'}${String(Math.abs(lat)).padStart(2, '0')}`;
      const ew = `${lon < 0 ? 'W' : 'E'}${String(Math.abs(lon)).padStart(3, '0')}`;
      out.push(`${ns}${ew}`);
    }
  }
  return out;
}

export function worldcoverTileUrl(tile: string): string {
  return `${WORLDCOVER_BUCKET}/${WORLDCOVER_VERSION}/${WORLDCOVER_YEAR}/map/ESA_WorldCover_10m_${WORLDCOVER_YEAR}_${WORLDCOVER_VERSION}_${tile}_Map.tif`;
}

// WGS 84 ellipsoid.
const A = 6378137;
const E2 = 0.00669437999014;

/**
 * Area in m² of a pixel `res` degrees square centred at latitude `lat`, from
 * the meridional and prime-vertical radii of curvature.
 */
export function pixelAreaM2(lat: number, res: number): number {
  const phi = (lat * Math.PI) / 180;
  const s2 = Math.sin(phi) ** 2;
  const m = (A * (1 - E2)) / (1 - E2 * s2) ** 1.5; // meridional radius
  const nRad = A / Math.sqrt(1 - E2 * s2); // prime vertical radius
  const d = (res * Math.PI) / 180;
  return m * d * (nRad * Math.cos(phi) * d);
}
