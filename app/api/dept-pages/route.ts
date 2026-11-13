import snapshot from '@/lib/data/dept-pages.json';
import { snapshotGet } from '@/lib/server/snapshots';

// 학과 공식 사이트 수집본 — 트랙소개·교육과정·로드맵·졸업요건 페이지 원문.
// 졸업 사정 데이터가 아니라 학과 공식 안내다.
export function GET() {
  return snapshotGet('dept-pages', snapshot, snapshot.fetchedAt ?? '',
    (payload) => !!payload && typeof payload === 'object' && 'pages' in payload && Array.isArray(payload.pages));
}
