import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  metadataBase: new URL('https://hansung-helper.gyeongbin-38.workers.dev'),
  icons: { icon: '/favicon.svg', apple: '/apple-touch-icon.png' },
  manifest: '/manifest.webmanifest',
  appleWebApp: { title: '학사 도우미', statusBarStyle: 'default' },
  title: '한성 학사 도우미 | 나의 대학 생활, 한곳에서',
  description:
    '활동 탐색부터 시간표와 학기 계획까지. 한성대학교 학생을 위한 비공식 공개 체험 학사 워크스페이스.',
  openGraph: {
    siteName: '한성 학사 도우미',
    locale: 'ko_KR',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: '한성 학사 도우미 · 강의·활동·일정·시간표, 한곳에서',
      },
    ],
  },
};
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1769ff' },
    { media: '(prefers-color-scheme: dark)', color: '#0e131d' },
  ],
  viewportFit: 'cover',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        {/* 첫 페인트 전 data-theme을 심어 테마 플래시를 막는다 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('hs-theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
