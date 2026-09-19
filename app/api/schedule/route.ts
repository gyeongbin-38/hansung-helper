import snapshot from '@/lib/data/schedule.json';
import { snapshotGet } from '@/lib/server/snapshots';

// 공식 학부 학사일정 스냅샷 — 학교 홈페이지 공개 페이지를 주기 수집한
// 우리 서버 데이터. 사용자 요청 경로에서 학교 사이트를 실시간 조회하지 않는다.
// D1 스냅샷이 번들보다 새로우면 D1을, 아니면 번들 JSON을 반환한다.
export function GET() {
  return snapshotGet('schedule', snapshot, snapshot.fetchedAt ?? '');
}
