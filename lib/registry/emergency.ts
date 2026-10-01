/**
 * Emergency and public-service phone numbers, national and for Nakhon Si
 * Thammarat.
 *
 * Only numbers that several independent publications list identically are
 * included, each with where it was checked. The agencies' own websites were
 * not reachable from the build environment on 2026-10-01 (proxy), so every
 * entry says how it was checked; `confirmedByAgency` turns true only after
 * the number is confirmed on the agency's own site or by phone.
 *
 * To correct an entry: change it here, update `checkedAt` and the source.
 */

export type EmergencyCategory = 'emergency' | 'disaster' | 'medical' | 'utility' | 'road' | 'social' | 'info';

export interface SourceLink {
  title: string;
  url: string;
}

export interface EmergencyContact {
  id: string;
  /** Dialable number exactly as published (short code or full number). */
  number: string;
  nameTh: string;
  nameEn: string;
  /** What to call it for. */
  forTh: string;
  forEn: string;
  category: EmergencyCategory;
  scope: 'national' | 'province';
  hours24: boolean;
  checkedAt: string;
  sources: SourceLink[];
  confirmedByAgency: boolean;
}

const PRD_SOUTH_FLOOD: SourceLink = {
  title: 'กรมประชาสัมพันธ์: รวมเบอร์โทรศัพท์สำคัญ ช่วยเหลือเหตุอุทกภัยภาคใต้',
  url: 'https://www.prd.go.th/th/content/category/detail/id/33/iid/447299',
};
const PRD_1669: SourceLink = {
  title: 'กรมประชาสัมพันธ์: สพฉ. แนะข้อควรรู้ก่อนโทรแจ้งสายด่วน 1669',
  url: 'https://www.prd.go.th/th/content/category/detail/id/35/iid/244285',
};
const OFM_HOTLINES: SourceLink = { title: 'OFM: Thailand emergency hotlines', url: 'https://www.ofm.co.th/blog/thailand-emergency-hotlines/' };
const CHUBB_HOTLINES: SourceLink = {
  title: 'Chubb: รวมเบอร์ฉุกเฉินที่ควรมีติดเครื่อง',
  url: 'https://www.chubb.com/th-th/articles/personal/complete-emergency-numbers-thailand.html',
};
const NST_NATION: SourceLink = { title: 'Nation TV: รวมเบอร์โทรฉุกเฉิน-ศูนย์อพยพ น้ำท่วมนครศรีธรรมราช', url: 'https://www.nationtv.tv/news/378808753' };
const NST_PRACHACHAT: SourceLink = { title: 'ประชาชาติธุรกิจ: รวมเบอร์โทร สายด่วน-ตำรวจ-ศูนย์อพยพ น้ำท่วมนครศรีธรรมราช', url: 'https://www.prachachat.net/general/news-567158' };
const NST_THANSETTAKIJ: SourceLink = { title: 'ฐานเศรษฐกิจ: น้ำท่วมนครศรีธรรมราช', url: 'https://www.thansettakij.com/general-news/458981' };
const NST_KAOHOON: SourceLink = { title: 'ข่าวหุ้น: ปภ. เกาะติดน้ำท่วม นครศรีธรรมราช-ชุมพร', url: 'https://www.kaohoon.com/news/720008' };

const CHECKED = '2026-10-01';

export const EMERGENCY_CONTACTS: readonly EmergencyContact[] = [
  // ---------------------------------------------------------------- life-threatening
  {
    id: 'ems-1669', number: '1669', nameTh: 'การแพทย์ฉุกเฉิน (สพฉ.)', nameEn: 'Emergency medical service (NIEM)',
    forTh: 'เจ็บป่วยฉุกเฉิน บาดเจ็บ ต้องการรถพยาบาล', forEn: 'Medical emergency, injury, ambulance',
    category: 'medical', scope: 'national', hours24: true, checkedAt: CHECKED, sources: [PRD_1669, PRD_SOUTH_FLOOD, CHUBB_HOTLINES], confirmedByAgency: false,
  },
  {
    id: 'police-191', number: '191', nameTh: 'เหตุด่วนเหตุร้าย (ตำรวจ)', nameEn: 'Police emergency',
    forTh: 'อาชญากรรม อุบัติเหตุ เหตุร้ายทุกประเภท', forEn: 'Crime, accidents, any urgent danger',
    category: 'emergency', scope: 'national', hours24: true, checkedAt: CHECKED, sources: [CHUBB_HOTLINES, OFM_HOTLINES], confirmedByAgency: false,
  },
  {
    id: 'fire-199', number: '199', nameTh: 'ดับเพลิงและกู้ภัย', nameEn: 'Fire and rescue',
    forTh: 'ไฟไหม้ ติดอยู่ในอาคาร สัตว์มีพิษ', forEn: 'Fire, trapped people, dangerous animals',
    category: 'emergency', scope: 'national', hours24: true, checkedAt: CHECKED, sources: [CHUBB_HOTLINES, OFM_HOTLINES], confirmedByAgency: false,
  },
  {
    id: 'ddpm-1784', number: '1784', nameTh: 'กรมป้องกันและบรรเทาสาธารณภัย (ปภ.)', nameEn: 'Dept. of Disaster Prevention and Mitigation (DDPM)',
    forTh: 'แจ้งสาธารณภัย น้ำท่วม ดินถล่ม พายุ ขอความช่วยเหลือ', forEn: 'Report disasters (flood, landslide, storm), request help',
    category: 'disaster', scope: 'national', hours24: true, checkedAt: CHECKED, sources: [PRD_SOUTH_FLOOD, NST_THANSETTAKIJ, CHUBB_HOTLINES], confirmedByAgency: false,
  },
  {
    id: 'navy-1696', number: '1696', nameTh: 'ศูนย์บรรเทาสาธารณภัย กองทัพเรือ', nameEn: 'Royal Thai Navy disaster relief centre',
    forTh: 'อพยพจากพื้นที่เสี่ยง', forEn: 'Evacuation from areas at risk',
    category: 'disaster', scope: 'national', hours24: false, checkedAt: CHECKED, sources: [PRD_SOUTH_FLOOD], confirmedByAgency: false,
  },
  {
    id: 'pm-1111', number: '1111', nameTh: 'ศูนย์บริการประชาชน สำนักนายกรัฐมนตรี', nameEn: "Prime Minister's Office public service centre",
    forTh: 'ร้องเรียน ขอความช่วยเหลือจากรัฐ (ช่วงน้ำท่วมภาคใต้เปิดกด 5)', forEn: 'Requests to the government (option 5 during southern floods)',
    category: 'social', scope: 'national', hours24: false, checkedAt: CHECKED, sources: [PRD_SOUTH_FLOOD], confirmedByAgency: false,
  },
  {
    id: 'social-1300', number: '1300', nameTh: 'ศูนย์ช่วยเหลือสังคม (พม.)', nameEn: 'Social Assistance Centre (MSDHS)',
    forTh: 'ผู้เปราะบาง เด็ก ผู้สูงอายุ คนพิการ ถูกทอดทิ้ง ความรุนแรง', forEn: 'Vulnerable people, abuse, abandonment',
    category: 'social', scope: 'national', hours24: true, checkedAt: CHECKED, sources: [CHUBB_HOTLINES, OFM_HOTLINES], confirmedByAgency: false,
  },
  // ---------------------------------------------------------------- information and utilities
  {
    id: 'tmd-1182', number: '1182', nameTh: 'กรมอุตุนิยมวิทยา', nameEn: 'Thai Meteorological Department',
    forTh: 'สภาพอากาศ พายุ คำเตือน', forEn: 'Weather, storms, warnings',
    category: 'info', scope: 'national', hours24: true, checkedAt: CHECKED, sources: [PRD_SOUTH_FLOOD], confirmedByAgency: false,
  },
  {
    id: 'rid-1460', number: '1460', nameTh: 'กรมชลประทาน', nameEn: 'Royal Irrigation Department',
    forTh: 'น้ำในเขื่อน คลองชลประทาน ประตูระบายน้ำ', forEn: 'Dams, irrigation canals, sluice gates',
    category: 'info', scope: 'national', hours24: false, checkedAt: CHECKED, sources: [PRD_SOUTH_FLOOD], confirmedByAgency: false,
  },
  {
    id: 'pea-1129', number: '1129', nameTh: 'การไฟฟ้าส่วนภูมิภาค (กฟภ.)', nameEn: 'Provincial Electricity Authority (PEA)',
    forTh: 'ไฟดับ สายไฟขาด เสาไฟล้ม', forEn: 'Power cuts, fallen lines or poles',
    category: 'utility', scope: 'national', hours24: true, checkedAt: CHECKED, sources: [PRD_SOUTH_FLOOD, CHUBB_HOTLINES], confirmedByAgency: false,
  },
  {
    id: 'pwa-1662', number: '1662', nameTh: 'การประปาส่วนภูมิภาค (กปภ.)', nameEn: 'Provincial Waterworks Authority (PWA)',
    forTh: 'น้ำประปาไม่ไหล ท่อแตก', forEn: 'No tap water, burst pipes',
    category: 'utility', scope: 'national', hours24: true, checkedAt: CHECKED, sources: [PRD_SOUTH_FLOOD], confirmedByAgency: false,
  },
  // ---------------------------------------------------------------- roads
  {
    id: 'doh-1586', number: '1586', nameTh: 'กรมทางหลวง', nameEn: 'Department of Highways',
    forTh: 'สภาพถนนทางหลวง ถนนขาด', forEn: 'Highway conditions, road cuts',
    category: 'road', scope: 'national', hours24: true, checkedAt: CHECKED, sources: [PRD_SOUTH_FLOOD, OFM_HOTLINES], confirmedByAgency: false,
  },
  {
    id: 'drr-1146', number: '1146', nameTh: 'กรมทางหลวงชนบท', nameEn: 'Department of Rural Roads',
    forTh: 'ถนนชนบท สะพาน', forEn: 'Rural roads and bridges',
    category: 'road', scope: 'national', hours24: true, checkedAt: CHECKED, sources: [PRD_SOUTH_FLOOD, OFM_HOTLINES], confirmedByAgency: false,
  },
  {
    id: 'hwpolice-1193', number: '1193', nameTh: 'ตำรวจทางหลวง', nameEn: 'Highway police',
    forTh: 'อุบัติเหตุบนทางหลวง', forEn: 'Accidents on highways',
    category: 'road', scope: 'national', hours24: true, checkedAt: CHECKED, sources: [PRD_SOUTH_FLOOD, OFM_HOTLINES], confirmedByAgency: false,
  },
  {
    id: 'tourist-1155', number: '1155', nameTh: 'ตำรวจท่องเที่ยว', nameEn: 'Tourist police',
    forTh: 'นักท่องเที่ยวต้องการความช่วยเหลือ (มีภาษาอังกฤษ)', forEn: 'Help for tourists (English spoken)',
    category: 'emergency', scope: 'national', hours24: true, checkedAt: CHECKED, sources: [OFM_HOTLINES, CHUBB_HOTLINES], confirmedByAgency: false,
  },
  {
    id: 'srt-1690', number: '1690', nameTh: 'การรถไฟแห่งประเทศไทย', nameEn: 'State Railway of Thailand',
    forTh: 'ตรวจสอบขบวนรถไฟ', forEn: 'Train service status',
    category: 'road', scope: 'national', hours24: true, checkedAt: CHECKED, sources: [PRD_SOUTH_FLOOD], confirmedByAgency: false,
  },

  // ---------------------------------------------------------------- Nakhon Si Thammarat
  {
    id: 'nst-ddpm', number: '075-358440', nameTh: 'สำนักงาน ปภ. จังหวัดนครศรีธรรมราช', nameEn: 'DDPM Nakhon Si Thammarat provincial office',
    forTh: 'สาธารณภัยในจังหวัด ขอความช่วยเหลือ', forEn: 'Disasters in the province, requests for help',
    category: 'disaster', scope: 'province', hours24: true, checkedAt: CHECKED, sources: [NST_KAOHOON, NST_NATION, NST_THANSETTAKIJ], confirmedByAgency: false,
  },
  {
    id: 'nst-army4', number: '075-383405', nameTh: 'ศูนย์บรรเทาสาธารณภัย กองทัพภาคที่ 4', nameEn: '4th Army Area disaster relief centre',
    forTh: 'ขอกำลังพล เรือ รถยกสูง อพยพ', forEn: 'Troops, boats, high-clearance trucks, evacuation',
    category: 'disaster', scope: 'province', hours24: true, checkedAt: CHECKED, sources: [NST_THANSETTAKIJ, NST_PRACHACHAT, NST_NATION], confirmedByAgency: false,
  },
];

/** Dial string for a tel: link (digits only, keeps short codes). */
export function telHref(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, '')}`;
}

/** The numbers shown first, for life-threatening situations. */
export const PRIMARY_EMERGENCY_IDS = ['ems-1669', 'police-191', 'fire-199', 'ddpm-1784'] as const;
