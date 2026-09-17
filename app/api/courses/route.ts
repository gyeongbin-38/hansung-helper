import catalog from '@/lib/data/catalog-2026-2.json';

// 공개 개설강의 카탈로그 — 수집·정규화된 우리 서버 데이터이며
// 사용자 요청 경로에서 학교 사이트를 실시간 조회하지 않는다.
export function GET() {
  return Response.json(catalog, {
    headers: {
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
