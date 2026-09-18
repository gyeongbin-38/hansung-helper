import snapshot from '@/lib/data/dept-rules.json';

// 학과별 공식 졸업요건 스냅샷 — 학교 학과 홈페이지 공개 페이지를 주기 수집한
// 우리 서버 데이터. 규정 문구는 원문 그대로이며 수치 해석을 하지 않는다.
// 사용자 요청 경로에서 학교 사이트를 실시간 조회하지 않는다.
export function GET() {
  return Response.json(snapshot, {
    headers: {
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
