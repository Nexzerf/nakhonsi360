import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Nakhonsi360 — มองนครศรีฯ รอบด้าน',
    short_name: 'Nakhonsi360',
    description: 'แผนที่สิ่งแวดล้อมและภัยพิบัติจังหวัดนครศรีธรรมราช แจ้งเหตุ ติดตามระดับน้ำ และเบอร์ฉุกเฉิน',
    lang: 'th',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#1d1912',
    theme_color: '#1d1912',
    categories: ['weather', 'navigation', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'แจ้งเหตุ', short_name: 'แจ้งเหตุ', url: '/?panel=report', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'รายงานล่าสุด', short_name: 'รายงาน', url: '/?panel=reports', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'เบอร์ฉุกเฉิน', short_name: 'เบอร์ฉุกเฉิน', url: '/emergency', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
