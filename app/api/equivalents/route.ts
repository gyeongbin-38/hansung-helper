import snapshot from '@/lib/data/equivalents.json';
import { snapshotGet } from '@/lib/server/snapshots';

// 동일교과목(대체 인정) 그룹표 — 폐지·개편 과목의 재수강/이수 인정 매핑.
export function GET() {
  return snapshotGet('equivalents', snapshot, snapshot.generatedAt ?? '',
    (payload) => !!payload && typeof payload === 'object' && 'groups' in payload && typeof payload.groups === 'object');
}
