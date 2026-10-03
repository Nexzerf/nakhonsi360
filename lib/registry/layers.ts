/**
 * Map layer registry. Each overlay knows its group, source(s), zoom range,
 * icon and legend symbol. Layers whose phase is later than the current build
 * are listed (so users see what is planned) but cannot be switched on.
 */

export type LayerGroupId = 'community' | 'cctv' | 'admin' | 'water' | 'reference' | 'weather' | 'air' | 'hazards' | 'coast' | 'environment' | 'satellite';

export interface LayerGroup {
  id: LayerGroupId;
  th: string;
  en: string;
}

export const LAYER_GROUPS: readonly LayerGroup[] = [
  { id: 'community', th: 'รายงานจากประชาชน', en: 'Public reports' },
  { id: 'cctv', th: 'กล้อง CCTV', en: 'CCTV cameras' },
  { id: 'admin', th: 'เขตปกครอง', en: 'Administrative' },
  { id: 'water', th: 'น้ำ', en: 'Water' },
  { id: 'reference', th: 'ถนนและชายฝั่ง', en: 'Roads & coastline' },
  { id: 'weather', th: 'อากาศ', en: 'Weather' },
  { id: 'air', th: 'คุณภาพอากาศ', en: 'Air quality' },
  { id: 'hazards', th: 'ภัยพิบัติ', en: 'Hazards' },
  { id: 'coast', th: 'ชายฝั่ง', en: 'Coast' },
  { id: 'environment', th: 'สิ่งแวดล้อม', en: 'Environment' },
  { id: 'satellite', th: 'ดาวเทียม', en: 'Satellite' },
];

export type IconId =
  | 'province' | 'district' | 'subdistrict' | 'village'
  | 'river' | 'stream' | 'canal' | 'reservoir' | 'water' | 'station'
  | 'road' | 'coastline'
  | 'rain' | 'temperature' | 'wind' | 'warning' | 'air'
  | 'flood' | 'drought' | 'fire' | 'landslide' | 'earthquake'
  | 'erosion' | 'mangrove' | 'landuse' | 'forest' | 'agriculture' | 'wetland'
  | 'satellite' | 'ndvi' | 'cctv';

/** How the legend draws the layer's symbol. */
export type LegendSymbol =
  | { type: 'line'; color: string; width: number; dash?: number[] }
  | { type: 'fill'; color: string; outline: string; pattern?: 'hatch' | 'dots' }
  | { type: 'circle'; color: string; stroke: string; radius: number };

export interface RasterDef {
  /** XYZ tile URL templates ({z}/{x}/{y}), or… */
  tiles?: string[];
  /** …a TileJSON URL served by /api/imagery/:layerId. */
  tilejson?: string;
  tileSize: number;
  minzoom?: number;
  maxzoom: number;
  opacity: number;
  /** 'linear' smooths coarse grids (e.g. 9 km soil moisture) instead of showing blocks. */
  resampling?: 'linear' | 'nearest';
  attribution: string;
}

export interface LayerDef {
  id: string;
  group: LayerGroupId;
  th: string;
  en: string;
  icon: IconId;
  sourceIds: string[];
  phase: 1 | 2 | 3 | 4;
  defaultOn: boolean;
  /** Zoom from which the layer draws. */
  minzoom: number;
  legend: LegendSymbol;
  /** For vector layers: name of the layer inside the MVT/PMTiles tile. */
  sourceLayer?: string;
  /** Live station layers: the observation variable served by /api/layers/:id as GeoJSON. */
  variable?: string;
  /** Live hazard-event layers: the hazard_features kind served by /api/layers/:id as GeoJSON. */
  hazardKind?: 'earthquake' | 'flood' | 'hotspot';
  /** Citizen reports, served by /api/reports?format=geojson. */
  reports?: true;
  /** City CCTV cameras, served by /api/cctv?format=geojson. */
  cctv?: true;
  /** Not drawn on the map: shown as a banner while the layer is on (TMD announcements). */
  banner?: 'warnings';
  /** Raster overlay: fixed tile URLs, or a TileJSON our server builds (imagery whose scenes change). */
  raster?: RasterDef;
  /** Colour key shown in the legend, as the source defines it. */
  legendItems?: { color: string; th: string; en: string }[];
  /** Continuous colour ramp shown in the legend (low → high). */
  legendRamp?: { colors: string[]; lowTh: string; lowEn: string; highTh: string; highEn: string };
  /** Short note on zoom behaviour for the ⓘ panel. */
  zoomNoteTh?: string;
  zoomNoteEn?: string;
}

/** Landslide susceptibility grades 1 (very low) … 5 (very high), as coded by the Department of Mineral Resources. */
export const LANDSLIDE_GRADE_COLORS: Record<number, string> = { 1: '#fef9c3', 2: '#fde68a', 3: '#fdba74', 4: '#f87171', 5: '#b91c1c' };

/** Shoreline / coastal area status as published (Thai text) → colour. */
export function shorelineColor(status: string | null | undefined): string {
  const s = status ?? '';
  if (s.includes('รุนแรง')) return '#b91c1c';
  if (s.includes('กัดเซาะ')) return '#f97316';
  if (s.includes('สะสม')) return '#2563eb';
  if (s.includes('คงสภาพ')) return '#64748b';
  return '#9ca3af';
}

export const COLORS = {
  province: '#1f2937',
  district: '#4b5563',
  subdistrict: '#9ca3af',
  village: '#7c2d12',
  river: '#1d6fb8',
  stream: '#4f93cf',
  canal: '#2a9d8f',
  water: '#9cc9ea',
  waterOutline: '#1d6fb8',
  road: '#8a8f98',
  coastline: '#6d28d9',
  flood: '#0891b2',
  drought: '#ea580c',
  fire: '#dc2626',
  erosion: '#c026d3',
  forest: '#2f7d32',
  agriculture: '#a3a33a',
  urban: '#6b7280',
  warning: '#d97706',
  danger: '#b91c1c',
} as const;

export const LAYERS: readonly LayerDef[] = [
  // Public reports — not official data
  {
    id: 'citizen-reports', group: 'community', th: 'รายงานเหตุจากประชาชน', en: 'Reports from the public', icon: 'warning',
    sourceIds: ['community.reports'], phase: 2, defaultOn: true, minzoom: 0, reports: true,
    zoomNoteTh: 'รายงาน 72 ชั่วโมงล่าสุด สีตามความเร่งด่วนที่ผู้แจ้งเลือก ยังไม่ยืนยันจนกว่าเจ้าหน้าที่อัปเดตสถานะ',
    zoomNoteEn: 'Reports from the last 72 hours, coloured by the urgency the reporter chose; unverified until a responder updates them.',
    legend: { type: 'circle', color: '#ea580c', stroke: '#fff', radius: 6 },
  },

  // CCTV — Nakhon Si Thammarat City Municipality
  {
    id: 'cctv', group: 'cctv', th: 'กล้อง CCTV เทศบาลนคร', en: 'City CCTV cameras', icon: 'cctv',
    sourceIds: ['nst.cctv'], phase: 2, defaultOn: false, minzoom: 0, cctv: true,
    zoomNoteTh: 'กล้องของเทศบาลนครนครศรีธรรมราช (เขตเมือง) แตะที่กล้องเพื่อดูภาพสดจากระบบของเทศบาล สีตามประเภท: จราจร หน้าโรงเรียน ระดับน้ำ Safety Zone',
    zoomNoteEn: 'Cameras of Nakhon Si Thammarat City Municipality (city area). Tap a camera for its live view from the municipality\'s system. Colour by type: traffic, school, water level, safety zone.',
    legend: { type: 'circle', color: '#1d6fb8', stroke: '#fff', radius: 6 },
  },

  // Administrative — HDX COD-AB + DOPA
  {
    id: 'admin-province', group: 'admin', th: 'จังหวัด', en: 'Province', icon: 'province',
    sourceIds: ['hdx.cod-ab-tha'], phase: 1, defaultOn: true, minzoom: 0, sourceLayer: 'admin_province',
    legend: { type: 'line', color: COLORS.province, width: 2.5 },
  },
  {
    id: 'admin-district', group: 'admin', th: 'อำเภอ', en: 'District', icon: 'district',
    sourceIds: ['hdx.cod-ab-tha'], phase: 1, defaultOn: true, minzoom: 0, sourceLayer: 'admin_district',
    legend: { type: 'line', color: COLORS.district, width: 1.5, dash: [4, 2] },
  },
  {
    id: 'admin-subdistrict', group: 'admin', th: 'ตำบล', en: 'Subdistrict', icon: 'subdistrict',
    sourceIds: ['hdx.cod-ab-tha'], phase: 1, defaultOn: false, minzoom: 10, sourceLayer: 'admin_subdistrict',
    legend: { type: 'line', color: COLORS.subdistrict, width: 1, dash: [2, 2] },
    zoomNoteTh: 'แสดงเมื่อซูมระดับ 10 ขึ้นไป', zoomNoteEn: 'Shown from zoom 10',
  },
  {
    id: 'villages', group: 'admin', th: 'หมู่บ้าน (จุดที่ตั้ง)', en: 'Villages (points)', icon: 'village',
    sourceIds: ['dopa.villages'], phase: 1, defaultOn: false, minzoom: 12, sourceLayer: 'villages',
    legend: { type: 'circle', color: COLORS.village, stroke: '#ffffff', radius: 4 },
    zoomNoteTh: 'แสดงเมื่อซูมระดับ 12 ขึ้นไป หมู่บ้านเป็นจุดที่ตั้ง ไม่มีขอบเขต', zoomNoteEn: 'Shown from zoom 12. Villages are points; they have no official boundary.',
  },

  // Water — OSM
  {
    id: 'water-rivers', group: 'water', th: 'แม่น้ำ', en: 'Rivers', icon: 'river',
    sourceIds: ['osm.geofabrik'], phase: 1, defaultOn: true, minzoom: 0, sourceLayer: 'rivers',
    legend: { type: 'line', color: COLORS.river, width: 2.5 },
  },
  {
    id: 'water-streams', group: 'water', th: 'ลำธาร', en: 'Streams', icon: 'stream',
    sourceIds: ['osm.geofabrik'], phase: 1, defaultOn: false, minzoom: 12, sourceLayer: 'streams',
    legend: { type: 'line', color: COLORS.stream, width: 1 },
    zoomNoteTh: 'แสดงเมื่อซูมระดับ 12 ขึ้นไป', zoomNoteEn: 'Shown from zoom 12',
  },
  {
    id: 'water-canals', group: 'water', th: 'คลอง', en: 'Canals', icon: 'canal',
    sourceIds: ['osm.geofabrik'], phase: 1, defaultOn: false, minzoom: 12, sourceLayer: 'canals',
    legend: { type: 'line', color: COLORS.canal, width: 1.5 },
    zoomNoteTh: 'แสดงเมื่อซูมระดับ 12 ขึ้นไป', zoomNoteEn: 'Shown from zoom 12',
  },
  {
    id: 'water-reservoirs', group: 'water', th: 'อ่างเก็บน้ำ', en: 'Reservoirs', icon: 'reservoir',
    sourceIds: ['osm.geofabrik'], phase: 1, defaultOn: false, minzoom: 0, sourceLayer: 'reservoirs',
    legend: { type: 'fill', color: '#7fb3e0', outline: COLORS.waterOutline },
  },
  {
    id: 'water-bodies', group: 'water', th: 'แหล่งน้ำ', en: 'Water bodies', icon: 'water',
    sourceIds: ['osm.geofabrik'], phase: 1, defaultOn: false, minzoom: 12, sourceLayer: 'water_bodies',
    legend: { type: 'fill', color: COLORS.water, outline: COLORS.waterOutline },
    zoomNoteTh: 'แสดงเมื่อซูมระดับ 12 ขึ้นไป', zoomNoteEn: 'Shown from zoom 12',
  },
  {
    id: 'water-stations', group: 'water', th: 'สถานีวัดระดับน้ำ', en: 'Water-level stations', icon: 'station',
    sourceIds: ['thaiwater.waterlevel'], phase: 2, defaultOn: true, minzoom: 0, variable: 'water_level',
    zoomNoteTh: 'รวมกลุ่มสถานีเมื่อซูมน้อยกว่า 10 สีสถานะตามเกณฑ์ของ ThaiWater', zoomNoteEn: 'Clustered below zoom 10; status colours are ThaiWater\'s official scale',
    // Neutral grey: stations are coloured by ThaiWater's own status scale (see legend); grey = no status published.
    legend: { type: 'circle', color: '#64748b', stroke: '#ffffff', radius: 5 },
  },

  // Roads & coastline — OSM
  {
    id: 'roads', group: 'reference', th: 'ถนน', en: 'Roads', icon: 'road',
    sourceIds: ['osm.geofabrik'], phase: 1, defaultOn: false, minzoom: 10, sourceLayer: 'roads',
    legend: { type: 'line', color: COLORS.road, width: 1.5 },
    zoomNoteTh: 'ถนนสายหลักตั้งแต่ซูม 10 ถนนรองตั้งแต่ซูม 14', zoomNoteEn: 'Main roads from zoom 10, minor roads from zoom 14',
  },
  {
    id: 'coastline', group: 'reference', th: 'แนวชายฝั่ง (OSM)', en: 'Coastline (OSM)', icon: 'coastline',
    sourceIds: ['osm.geofabrik'], phase: 1, defaultOn: false, minzoom: 0, sourceLayer: 'coastline',
    legend: { type: 'line', color: COLORS.coastline, width: 1.5 },
  },

  // Weather — Phase 2
  { id: 'weather-stations', group: 'weather', th: 'สถานีอากาศ', en: 'Weather stations', icon: 'station', sourceIds: ['tmd.weather'], phase: 2, defaultOn: false, minzoom: 0, variable: 'temperature', zoomNoteTh: 'สถานีตรวจอากาศของกรมอุตุนิยมวิทยา รายงานทุก 3 ชั่วโมง แตะสถานีเพื่อดูค่าล่าสุด', zoomNoteEn: 'Thai Meteorological Department weather stations, reporting every 3 hours. Tap one for its latest values.', legend: { type: 'circle', color: '#374151', stroke: '#fff', radius: 5 } },
  { id: 'rain-24h', group: 'weather', th: 'ฝน 24 ชม.', en: '24-h rain', icon: 'rain', sourceIds: ['thaiwater.rain24h', 'tmd.weather'], phase: 2, defaultOn: false, minzoom: 0, variable: 'rain_24h', zoomNoteTh: 'รวมกลุ่มสถานีเมื่อซูมน้อยกว่า 10', zoomNoteEn: 'Clustered below zoom 10', legend: { type: 'circle', color: '#2563eb', stroke: '#fff', radius: 5 } },
  { id: 'temperature', group: 'weather', th: 'อุณหภูมิ', en: 'Temperature', icon: 'temperature', sourceIds: ['tmd.weather'], phase: 2, defaultOn: false, minzoom: 0, variable: 'temperature', zoomNoteTh: 'อุณหภูมิอากาศล่าสุดจากสถานีกรมอุตุนิยมวิทยา (ทุก 3 ชั่วโมง) ค่าเป็นของจุดที่ตั้งสถานี', zoomNoteEn: 'Latest air temperature at Thai Meteorological Department stations (every 3 hours), as measured at the station.', legend: { type: 'circle', color: '#9a3412', stroke: '#fff', radius: 5 } },
  { id: 'wind', group: 'weather', th: 'ลม', en: 'Wind', icon: 'wind', sourceIds: ['tmd.weather'], phase: 2, defaultOn: false, minzoom: 0, variable: 'wind_speed', zoomNoteTh: 'ความเร็วลม (กม./ชม.) และทิศทางที่ลมพัดไป จากสถานีกรมอุตุนิยมวิทยา ไม่มีลูกศรเมื่อสถานีรายงานลมสงบหรือทิศไม่แน่นอน', zoomNoteEn: 'Wind speed (km/h) and the direction it blows towards, from Thai Meteorological Department stations. No arrow when calm or variable.', legend: { type: 'circle', color: '#475569', stroke: '#fff', radius: 5 } },
  { id: 'weather-warnings', group: 'weather', th: 'คำเตือนภัย', en: 'Warnings', icon: 'warning', sourceIds: ['tmd.warnings'], phase: 2, defaultOn: false, minzoom: 0, banner: 'warnings', zoomNoteTh: 'ประกาศเตือนภัยของกรมอุตุนิยมวิทยาที่ยังมีผลอยู่ แสดงเป็นแถบด้านบนของแผนที่ (ไม่ได้วาดเป็นพื้นที่ เพราะประกาศระบุเป็นภูมิภาค)', zoomNoteEn: 'Thai Meteorological Department announcements in effect, shown as a banner above the map (not drawn as areas: they name regions).', legend: { type: 'fill', color: '#fde68a', outline: COLORS.warning } },

  // Air — Phase 2
  { id: 'pm25', group: 'air', th: 'PM2.5', en: 'PM2.5', icon: 'air', sourceIds: ['air4thai.aqi', 'gistda.pm25'], phase: 2, defaultOn: false, minzoom: 0, variable: 'pm25', zoomNoteTh: 'PM2.5 (µg/m³) จากสถานีตรวจวัดของกรมควบคุมมลพิษ (สีตามระดับที่ คพ. ประกาศ) และค่าประมาณรายอำเภอจากดาวเทียมของ GISTDA (จุดชื่อ "อ.…" สีเทา เพราะไม่ใช่ค่าตรวจวัด)', zoomNoteEn: 'PM2.5 (µg/m³) at Pollution Control Department monitors (coloured by the level PCD publishes) and GISTDA district estimates from satellite data (points named "อ.…", grey because they are estimates, not measurements).', legend: { type: 'circle', color: '#6b7280', stroke: '#fff', radius: 5 } },
  { id: 'aqi', group: 'air', th: 'AQI', en: 'AQI', icon: 'air', sourceIds: ['air4thai.aqi'], phase: 2, defaultOn: false, minzoom: 0, variable: 'aqi', zoomNoteTh: 'ดัชนีคุณภาพอากาศ (AQI) ของประเทศไทยจากสถานีกรมควบคุมมลพิษ สีและระดับตามที่ คพ. ประกาศ ในจังหวัดมีสถานีเดียว (อ.เมือง)', zoomNoteEn: 'Thai Air Quality Index from Pollution Control Department monitors, coloured by the level PCD publishes. The province has one monitor (Mueang).', legend: { type: 'circle', color: '#6b7280', stroke: '#fff', radius: 5 } },

  // Hazards
  {
    id: 'flood', group: 'hazards', th: 'น้ำท่วมจากดาวเทียม (7 วัน)', en: 'Flooding seen by satellite (7 days)', icon: 'flood',
    sourceIds: ['gistda.flood'], phase: 2, defaultOn: false, minzoom: 0, hazardKind: 'flood',
    zoomNoteTh: 'พื้นที่น้ำท่วมที่ GISTDA ตรวจพบจากภาพดาวเทียมในช่วง 7 วันล่าสุด (เป็นช่องหกเหลี่ยม) ไม่มีสีแปลว่าดาวเทียมไม่พบน้ำท่วม ไม่ได้รับประกันว่าไม่มีน้ำท่วม (เช่น ใต้เมฆหรือในเมือง)',
    zoomNoteEn: 'Flood water GISTDA detected in satellite images over the last 7 days (hexagon cells). No colour means none was detected, not a guarantee (e.g. under cloud or in built-up areas).',
    legend: { type: 'fill', color: '#38bdf8', outline: COLORS.flood },
  },
  {
    id: 'flood-recurrent', group: 'hazards', th: 'น้ำท่วมซ้ำซาก (2554–2563)', en: 'Recurrent flooding (2011–2020)', icon: 'flood',
    sourceIds: ['gistda.flood-recurrent'], phase: 2, defaultOn: false, minzoom: 0,
    raster: { tiles: ['https://gistdaportal.gistda.or.th/data/rest/services/FL_Flood/flood_freq11_20/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, opacity: 0.75, resampling: 'nearest', attribution: 'น้ำท่วมซ้ำซาก 2554–2563: GISTDA' },
    zoomNoteTh: 'จำนวนปีที่ GISTDA ตรวจพบน้ำท่วมจากภาพดาวเทียมในช่วง 10 ปี (2554–2563) สีตามที่ GISTDA กำหนด พื้นที่ไม่มีสีคือไม่พบน้ำท่วมในช่วงนั้น ไม่ได้แปลว่าน้ำไม่ท่วม แตะบนแผนที่เพื่อดูจำนวนปีของจุดนั้น',
    zoomNoteEn: 'Number of years GISTDA detected flooding from satellite images over 2011–2020, in GISTDA\'s colours. No colour means none was detected then, not that it never floods. Tap the map for the count at a point.',
    legend: { type: 'fill', color: '#fcc44c', outline: COLORS.flood },
    legendRamp: { colors: ['#2892c7', '#6da9b3', '#a0c29b', '#cede81', '#fafa64', '#fcc44c', '#fa8d34', '#f25922', '#e81014'], lowTh: '1 ปี', lowEn: '1 year', highTh: '9 ปี', highEn: '9 years' },
  },
  {
    id: 'soil-moisture', group: 'hazards', th: 'ความชื้นในดิน (ดาวเทียม SMAP)', en: 'Soil moisture (SMAP satellite)', icon: 'drought',
    sourceIds: ['gistda.soilmoisture'], phase: 3, defaultOn: false, minzoom: 0,
    raster: { tilejson: '/api/imagery/soil-moisture', tileSize: 256, maxzoom: 6, opacity: 0.6, resampling: 'linear', attribution: 'ความชื้นในดิน: NASA SMAP L4 (GIBS)' },
    zoomNoteTh: 'ความชื้นดินผิวหน้ารายวันจากดาวเทียม SMAP ของ NASA (ข้อมูลช่องละ 9 กม. แผนที่จึงปรับให้เรียบ ไม่ได้ละเอียดระดับแปลง) สีตามชุดสีของ NASA GIBS ใช้ดูแนวโน้มแห้ง/ชื้นของพื้นที่กว้าง วันที่ของข้อมูลแสดงในรายการชั้นข้อมูล',
    zoomNoteEn: 'Daily surface soil moisture from NASA\'s SMAP satellite (9 km cells, smoothed for display; not field-level), in NASA GIBS colours. For broad dry/wet patterns; the data day is shown in the layer list.',
    legend: { type: 'fill', color: '#fed7aa', outline: COLORS.drought },
  },
  {
    id: 'hotspots', group: 'hazards', th: 'จุดความร้อน/ไฟ (3 วัน)', en: 'Fire hotspots (3 days)', icon: 'fire',
    sourceIds: ['firms.hotspots'], phase: 2, defaultOn: false, minzoom: 0, hazardKind: 'hotspot',
    zoomNoteTh: 'จุดความร้อนจากดาวเทียม VIIRS และ MODIS ของ NASA FIRMS ช่วง 3 วันล่าสุด อาจเป็นไฟป่า การเผาในที่โล่ง หรือแหล่งความร้อนอื่น ยังไม่ได้ยืนยันในพื้นที่',
    zoomNoteEn: 'Thermal hotspots from NASA FIRMS (VIIRS and MODIS) over the last 3 days: wildfire, open burning or another heat source; not confirmed on the ground.',
    legend: { type: 'circle', color: COLORS.fire, stroke: '#fff', radius: 4 },
  },
  {
    id: 'landslide', group: 'hazards', th: 'ความอ่อนไหวต่อดินถล่ม', en: 'Landslide susceptibility', icon: 'landslide',
    sourceIds: ['dmr.landslide'], phase: 3, defaultOn: false, minzoom: 0, sourceLayer: 'landslide_susceptibility',
    zoomNoteTh: 'ระดับความอ่อนไหวต่อการเกิดดินถล่ม 5 ระดับ (ต่ำมาก–สูงมาก) ตามการประเมินของกรมทรัพยากรธรณี ข้อมูลต้นทางเป็นช่องกริดขนาด 1 กม. แผนที่นี้ปรับขอบให้เรียบและตัดตามเขตจังหวัดเพื่อให้อ่านง่าย แตะบนแผนที่เพื่อดูระดับของช่องกริดจริง เป็นแผนที่ประเมินศักยภาพ ไม่ใช่การแจ้งเตือนสถานการณ์ปัจจุบัน พื้นที่ที่ไม่มีสีคือยังไม่ได้ประเมิน ไม่ได้แปลว่าปลอดภัย',
    zoomNoteEn: 'Five landslide susceptibility levels (very low to very high) assessed by the Department of Mineral Resources. The source is a 1 km grid; edges are smoothed and clipped to the province for display, and tapping the map shows the level of the actual grid cell. A susceptibility map, not a current warning; uncoloured areas were not assessed, which does not mean safe.',
    legend: { type: 'fill', color: '#f87171', outline: COLORS.danger },
  },
  {
    id: 'flash-flood', group: 'hazards', th: 'พื้นที่น้ำป่าไหลหลาก/ดินถล่ม', en: 'Flash flood & debris flow areas', icon: 'flood',
    sourceIds: ['dmr.landslide'], phase: 3, defaultOn: false, minzoom: 0, sourceLayer: 'flash_flood',
    zoomNoteTh: 'พื้นที่ที่ได้รับผลกระทบจากดินถล่ม น้ำป่าไหลหลาก และน้ำท่วมฉับพลัน ตามข้อมูลกรมทรัพยากรธรณี',
    zoomNoteEn: 'Areas affected by debris flows, flash floods and landslides, from the Department of Mineral Resources.',
    legend: { type: 'fill', color: '#fb923c', outline: '#c2410c' },
  },
  {
    id: 'landslide-villages', group: 'hazards', th: 'หมู่บ้านเสี่ยงดินถล่ม/น้ำป่า', en: 'Villages at landslide/flash-flood risk', icon: 'village',
    sourceIds: ['dmr.landslide'], phase: 3, defaultOn: false, minzoom: 0, sourceLayer: 'landslide_villages',
    zoomNoteTh: 'หมู่บ้านที่กรมทรัพยากรธรณีจัดเป็นพื้นที่เสี่ยงภัยระดับชุมชน พร้อมประเภทภัยและปีที่สำรวจ',
    zoomNoteEn: 'Villages the Department of Mineral Resources mapped as at risk at community level, with the hazard type and survey year.',
    legend: { type: 'circle', color: '#dc2626', stroke: '#fff', radius: 5 },
  },
  {
    id: 'landslide-safe', group: 'hazards', th: 'จุดปลอดภัยชั่วคราว (ดินถล่ม)', en: 'Temporary safe points (landslide)', icon: 'village',
    sourceIds: ['dmr.landslide'], phase: 3, defaultOn: false, minzoom: 0, sourceLayer: 'landslide_safe',
    zoomNoteTh: 'จุดปลอดภัยชั่วคราวจากแผ่นดินถล่มที่กรมทรัพยากรธรณีกำหนดร่วมกับชุมชน เช่น วัด โรงเรียน ควรตรวจสอบกับผู้นำชุมชนก่อนใช้จริง',
    zoomNoteEn: 'Temporary landslide safe points set by the Department of Mineral Resources with communities (temples, schools). Check with local leaders before relying on them.',
    legend: { type: 'circle', color: '#15803d', stroke: '#fff', radius: 5 },
  },
  {
    id: 'earthquake', group: 'hazards', th: 'แผ่นดินไหว', en: 'Earthquakes', icon: 'earthquake',
    sourceIds: ['usgs.earthquakes', 'tmd.earthquake'], phase: 2, defaultOn: false, minzoom: 0, hazardKind: 'earthquake',
    zoomNoteTh: 'แผ่นดินไหว M4 ขึ้นไปในรัศมี 2,000 กม. ช่วง 30 วัน ส่วนใหญ่อยู่นอกจังหวัด ซูมออกเพื่อดู ขนาดวงกลมตามขนาดแผ่นดินไหว',
    zoomNoteEn: 'M4+ earthquakes within 2,000 km in the last 30 days; most are outside the province, zoom out to see them. Circle size follows magnitude.',
    legend: { type: 'circle', color: '#7c3aed', stroke: '#fff', radius: 5 },
  },

  // Coast — Phase 3
  {
    id: 'shoreline-change', group: 'coast', th: 'การเปลี่ยนแปลงแนวชายฝั่ง', en: 'Shoreline change', icon: 'coastline',
    sourceIds: ['dmr.shoreline'], phase: 3, defaultOn: false, minzoom: 0, sourceLayer: 'shoreline_change',
    zoomNoteTh: 'สถานภาพแนวชายฝั่ง (กัดเซาะรุนแรง / กัดเซาะปานกลาง / คงสภาพ / สะสมตัว) จากการเปรียบเทียบของกรมทรัพยากรธรณี ปีข้อมูล 2015–2019 ไม่ใช่สภาพปัจจุบัน',
    zoomNoteEn: 'Shoreline status (severe erosion / moderate erosion / stable / accretion) compared by the Department of Mineral Resources; data years 2015–2019, not current conditions.',
    legend: { type: 'line', color: '#f97316', width: 3 },
  },
  {
    id: 'erosion', group: 'coast', th: 'พื้นที่กัดเซาะ/สะสมตัวชายฝั่ง', en: 'Coastal erosion & accretion areas', icon: 'erosion',
    sourceIds: ['dmr.shoreline'], phase: 3, defaultOn: false, minzoom: 0, sourceLayer: 'coastal_area_change',
    zoomNoteTh: 'พื้นที่ชายฝั่งที่ถูกกัดเซาะหรือสะสมตัว ตามกรมทรัพยากรธรณี ปีข้อมูล 2015–2019',
    zoomNoteEn: 'Coastal areas lost to erosion or gained by accretion, from the Department of Mineral Resources; data years 2015–2019.',
    legend: { type: 'fill', color: '#fdba74', outline: '#c2410c' },
  },
  {
    id: 'mangroves', group: 'coast', th: 'ป่าชายเลน', en: 'Mangroves', icon: 'mangrove', sourceIds: ['dmcr.coast'], phase: 3, defaultOn: false, minzoom: 0, sourceLayer: 'mangroves',
    zoomNoteTh: 'แนวป่าชายเลนของกรมทรัพยากรทางทะเลและชายฝั่ง (เผยแพร่ผ่าน GISTDA) บริการไม่ระบุปีข้อมูล แตะเพื่อดูพื้นที่ (ไร่)',
    zoomNoteEn: 'Mangrove forest zones of the Department of Marine and Coastal Resources (published via GISTDA); the service states no data year. Tap for the area (rai).',
    legend: { type: 'fill', color: '#4ade80', outline: COLORS.forest },
  },

  // Environment — Phase 3
  {
    id: 'landuse', group: 'environment', th: 'การใช้ที่ดิน', en: 'Land use', icon: 'landuse', sourceIds: ['ldd.landuse'], phase: 3, defaultOn: false, minzoom: 0,
    raster: { tiles: ['/api/proxy/ldd-landuse/{z}/{x}/{y}'], tileSize: 256, maxzoom: 19, opacity: 0.65, resampling: 'linear', attribution: 'การใช้ที่ดิน: กรมพัฒนาที่ดิน' },
    zoomNoteTh: 'แผนที่การใช้ที่ดินของกรมพัฒนาที่ดิน (แคชแผนที่) บริการไม่ได้ระบุปีข้อมูลและคำอธิบายสี ซูมเข้าเพื่อดูรายละเอียดระดับแปลง',
    zoomNoteEn: 'Land Development Department land-use map (cached tiles). The service states no data year and no colour key; zoom in for parcel detail.',
    legend: { type: 'fill', color: '#fde68a', outline: COLORS.urban },
  },
  {
    id: 'wetlands', group: 'environment', th: 'พื้นที่ชุ่มน้ำสำคัญ', en: 'Registered wetlands', icon: 'wetland', sourceIds: ['dwr.wetlands'], phase: 3, defaultOn: false, minzoom: 0, sourceLayer: 'wetlands',
    zoomNoteTh: 'พื้นที่ชุ่มน้ำที่มีความสำคัญระดับนานาชาติและระดับชาติ ตามทะเบียนของ สผ. (ปรับปรุง 1 ต.ค. 2563) เผยแพร่โดยกรมทรัพยากรน้ำ เช่น อ่าวปากพนัง',
    zoomNoteEn: 'Wetlands of international and national importance from ONEP\'s register (revised 1 Oct 2020), published by the Department of Water Resources — e.g. Pak Phanang Bay.',
    legend: { type: 'fill', color: '#7dd3fc', outline: COLORS.river, pattern: 'hatch' },
  },

  // Satellite — Phase 4
  {
    id: 'sentinel2', group: 'satellite', th: 'ภาพดาวเทียม Sentinel-2 ล่าสุด', en: 'Latest Sentinel-2 imagery', icon: 'satellite', sourceIds: ['copernicus.sentinel2'], phase: 4, defaultOn: false, minzoom: 8,
    raster: { tilejson: '/api/imagery/sentinel2', tileSize: 256, minzoom: 8, maxzoom: 16, opacity: 1, resampling: 'linear', attribution: 'Contains modified Copernicus Sentinel data (Planetary Computer)' },
    zoomNoteTh: 'ภาพสีธรรมชาติความละเอียด 10 ม. จากดาวเทียม Sentinel-2 เลือกภาพที่เมฆน้อยที่สุดในช่วง 120 วันล่าสุดของแต่ละช่องกริด ใช้เปรียบเทียบกับภาพพื้นฐาน (ซึ่งอาจเก่ากว่า) วันที่ของภาพแสดงในรายการชั้นข้อมูล อาจมีเมฆบางส่วน',
    zoomNoteEn: 'True-colour 10 m Sentinel-2 imagery: the least cloudy scene of the last 120 days for each grid tile — newer than the basemap imagery. Scene dates are shown in the layer list; some cloud may remain.',
    legend: { type: 'fill', color: '#d1d5db', outline: '#4b5563' },
  },
  {
    id: 'ndvi', group: 'satellite', th: 'พืชพรรณ (NDVI)', en: 'Vegetation (NDVI)', icon: 'ndvi', sourceIds: ['copernicus.sentinel2'], phase: 4, defaultOn: false, minzoom: 8,
    raster: { tilejson: '/api/imagery/ndvi', tileSize: 256, minzoom: 8, maxzoom: 16, opacity: 0.8, resampling: 'linear', attribution: 'Contains modified Copernicus Sentinel data (Planetary Computer)' },
    zoomNoteTh: 'ดัชนีพืชพรรณ NDVI = (อินฟราเรดใกล้ − แดง) / (อินฟราเรดใกล้ + แดง) คำนวณจากภาพ Sentinel-2 ชุดเดียวกับชั้นภาพดาวเทียม เขียวเข้ม = พืชหนาแน่น แดง = ดินเปล่า/สิ่งปลูกสร้าง/น้ำ เมฆจะทำให้ค่าต่ำผิดปกติ',
    zoomNoteEn: 'NDVI = (NIR − red) / (NIR + red) from the same Sentinel-2 scenes as the imagery layer. Dark green = dense vegetation, red = bare soil, built-up or water. Cloud lowers the value.',
    legend: { type: 'fill', color: '#4ade80', outline: COLORS.forest },
    legendRamp: { colors: ['#a50026', '#f46d43', '#fee08b', '#d9ef8b', '#66bd63', '#006837'], lowTh: 'ไม่มีพืช (−0.2)', lowEn: 'No vegetation (−0.2)', highTh: 'พืชหนาแน่น (0.9)', highEn: 'Dense vegetation (0.9)' },
  },
];

/** The phase this build implements. Layers from later phases are listed but disabled. */
export const CURRENT_PHASE = 1;

export const MAX_VISIBLE_OVERLAYS = 6;

const layerById = new Map(LAYERS.map((l) => [l.id, l]));

export function getLayer(id: string): LayerDef | undefined {
  return layerById.get(id);
}

export function isLayerAvailable(l: LayerDef): boolean {
  return l.phase <= CURRENT_PHASE;
}

/** Default overlays (spec §7). Live layers only draw once their source has data. */
export const DEFAULT_LAYER_IDS: readonly string[] = LAYERS.filter((l) => l.defaultOn).map((l) => l.id);

/**
 * One-tap "what do you want to see?" sets for people who don't know which
 * layers to pick. Each replaces the visible layers; the full list stays below.
 */
export interface LayerScenario {
  id: 'basic' | 'flood' | 'landslide' | 'coast';
  th: string;
  en: string;
  descTh: string;
  descEn: string;
  icon: IconId;
  layers: readonly string[];
}

const BOUNDARIES = ['admin-province', 'admin-district'];

export const LAYER_SCENARIOS: readonly LayerScenario[] = [
  { id: 'basic', th: 'ภาพรวม', en: 'Overview', descTh: 'รายงานเหตุ ระดับน้ำ แม่น้ำ', descEn: 'Reports, water levels, rivers', icon: 'province', layers: DEFAULT_LAYER_IDS },
  { id: 'flood', th: 'น้ำท่วม', en: 'Floods', descTh: 'น้ำท่วมจากดาวเทียม ระดับน้ำ ฝน', descEn: 'Satellite flooding, water levels, rain', icon: 'flood', layers: ['citizen-reports', 'flood', 'water-stations', 'rain-24h', 'water-rivers', 'flash-flood', ...BOUNDARIES] },
  { id: 'landslide', th: 'ดินถล่ม', en: 'Landslides', descTh: 'พื้นที่เสี่ยง จุดปลอดภัย', descEn: 'Risk areas, safe points', icon: 'landslide', layers: ['citizen-reports', 'landslide', 'landslide-safe', 'landslide-villages', ...BOUNDARIES] },
  { id: 'coast', th: 'ชายฝั่ง', en: 'Coast', descTh: 'การกัดเซาะชายฝั่ง', descEn: 'Coastal erosion', icon: 'coastline', layers: ['citizen-reports', 'shoreline-change', 'erosion', ...BOUNDARIES] },
];

/** Vector layers served as MVT/PMTiles. */
export const VECTOR_LAYER_IDS: readonly string[] = LAYERS.filter((l) => l.sourceLayer && isLayerAvailable(l)).map((l) => l.id);

// ---------------------------------------------------------------- Basemaps

export type BasemapId = 'light' | 'dark' | 'satellite' | 'terrain';

export interface BasemapDef {
  id: BasemapId;
  th: string;
  en: string;
  sourceId: string;
}

export const BASEMAPS: readonly BasemapDef[] = [
  { id: 'light', th: 'สว่าง', en: 'Light', sourceId: 'basemap.openfreemap' },
  { id: 'dark', th: 'มืด', en: 'Dark', sourceId: 'basemap.openfreemap' },
  { id: 'satellite', th: 'ดาวเทียม', en: 'Satellite', sourceId: 'basemap.esri-imagery' },
  { id: 'terrain', th: 'ภูมิประเทศ', en: 'Terrain', sourceId: 'basemap.opentopomap' },
];
