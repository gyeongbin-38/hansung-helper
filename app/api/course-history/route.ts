import { snapshotGetOnly } from '@/lib/server/snapshots';

// 과목별 개설 이력 인덱스 — 이력 카탈로그에서 생성되고 D1 스냅샷으로만 게시된다.
// 필수 과목의 개설 학기 패턴(1학기 전용 등)을 보여 주는 데 사용.
export async function GET() {
  const res = await snapshotGetOnly(
    'course-history',
    (payload) =>
      !!payload &&
      typeof payload === 'object' &&
      'courses' in payload &&
      typeof payload.courses === 'object',
  );
  return res ?? Response.json(
    { ok: false, error: { code: 'NOT_FOUND', message: '개설 이력 자료가 없습니다.' } },
    { status: 404 },
  );
}
