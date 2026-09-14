import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '한성 학사 도우미 | 나의 대학 생활, 한곳에서',
  description:
    '활동 탐색부터 시간표와 학기 계획까지. 한성대학교 학생을 위한 비공식 공개 체험 학사 워크스페이스.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
