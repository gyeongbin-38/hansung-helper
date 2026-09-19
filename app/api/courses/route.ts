import catalog from '@/lib/data/catalog-2026-2.json';
import { snapshotGet } from '@/lib/server/snapshots';

// 공개 개설강의 카탈로그 — 수집·정규화된 우리 서버 데이터이며
// 사용자 요청 경로에서 학교 사이트를 실시간 조회하지 않는다.
// D1 스냅샷이 번들보다 새로우면 D1을, 아니면 번들 JSON을 반환한다.
export function GET() {
  return snapshotGet('courses', catalog, catalog.generatedAt ?? '');
}
