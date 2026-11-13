import indexJson from '@/lib/data/curriculum-index.json';
import { snapshotGet, snapshotGetOnly } from '@/lib/server/snapshots';

// 학기별 교육과정(전공별 필수·선택 과목 목록) — 학기 전체 파일은 D1 스냅샷으로만
// 게시되고, 학기·전공 색인은 번들로 서빙한다.
// GET /api/curriculum            → 색인 (학기별 전공 목록)
// GET /api/curriculum?semester=YYYY-S → 해당 학기 전체 교육과정 (D1)
export async function GET(request: Request) {
  const semester = new URL(request.url).searchParams.get('semester');
  if (!semester)
    return snapshotGet('curriculum-index', indexJson, indexJson.generatedAt ?? '',
      (payload) => !!payload && typeof payload === 'object' && 'semesters' in payload);
  if (!/^20\d{2}-[12]$/.test(semester))
    return Response.json({ ok: false, error: { code: 'INVALID_REQUEST', message: '학기 형식을 확인해 주세요.' } }, { status: 400 });
  const res = await snapshotGetOnly(
    `curriculum:${semester}`,
    (payload) => !!payload && typeof payload === 'object' && 'semester' in payload && payload.semester === semester && 'majors' in payload,
  );
  return res ?? Response.json({ ok: false, error: { code: 'NOT_FOUND', message: '해당 학기의 교육과정 자료가 없습니다.' } }, { status: 404 });
}
