import snapshot from '@/lib/data/activities.json';

// 공개 비교과 프로그램 스냅샷 — hsportal 공개 목록을 주기 수집한
// 우리 서버 데이터. 사용자 요청 경로에서 학교 사이트를 실시간 조회하지 않는다.
export function GET() {
  return Response.json(snapshot, {
    headers: {
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
