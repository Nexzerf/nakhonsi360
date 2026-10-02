import type { Metadata, Viewport } from 'next';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
import { Providers } from '@/components/Providers';
import localFont from 'next/font/local';

// LINE Seed Sans TH (SIL OFL 1.1, © LINE; see app/fonts/LICENSE-OFL.txt), self-hosted.
const lineSeed = localFont({
  src: [
    { path: './fonts/LINESeedSansTH-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/LINESeedSansTH-Bold.woff2', weight: '700', style: 'normal' },
    { path: './fonts/LINESeedSansTH-ExtraBold.woff2', weight: '800', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-line-seed',
  fallback: ['Noto Sans Thai', 'system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: 'Nakhonsi360 — มองนครศรีฯ รอบด้าน',
  description: 'แผนที่สิ่งแวดล้อมจังหวัดนครศรีธรรมราช พร้อมแหล่งที่มาและเวลาของข้อมูลทุกค่า — Environmental map of Nakhon Si Thammarat with the source and time of every value.',
  icons: { icon: '/icon.svg', apple: '/icons/apple-touch-icon.png' },
  applicationName: 'Nakhonsi360',
  appleWebApp: { capable: true, title: 'Nakhonsi360', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1d1912' },
    { media: '(prefers-color-scheme: dark)', color: '#1d1912' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={lineSeed.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
