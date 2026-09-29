import type { Metadata, Viewport } from 'next';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
import { Providers } from '@/components/Providers';
import { IBM_Plex_Sans_Thai } from 'next/font/google';

// Downloaded at build time and self-hosted (OFL licence); no runtime request to Google.
const plex = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-plex',
});

export const metadata: Metadata = {
  title: 'Nakhonsi360 — มองนครศรีฯ รอบด้าน',
  description: 'แผนที่สิ่งแวดล้อมจังหวัดนครศรีธรรมราช พร้อมแหล่งที่มาและเวลาของข้อมูลทุกค่า — Environmental map of Nakhon Si Thammarat with the source and time of every value.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1b2d' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={plex.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
