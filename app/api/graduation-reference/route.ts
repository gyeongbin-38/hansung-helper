import reference from '@/lib/data/graduation-reference.json';

/** 제공받은 조사 자료. 개인별 졸업 판정이나 학교의 실시간 원본이 아니다. */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const department = params.get('department');
  const track = params.get('track');
  if ([...params.keys()].some((key) => key !== 'department' && key !== 'track') ||
      [department, track].some((value) => value !== null && (!value.trim() || value.length > 100)) ||
      params.getAll('department').length > 1 || params.getAll('track').length > 1) {
    return Response.json({ ok: false, error: { code: 'INVALID_REQUEST', message: '학부와 트랙을 확인해 주세요.' } }, { status: 400 });
  }
  const programs = reference.sections.programs2026.filter((item) =>
    (!department || item.department === department.trim()) && (!track || item.track === track.trim()));
  return Response.json({
    ok: true,
    data: {
      asOf: reference.asOf,
      programCatalogYear: reference.programCatalogYear,
      purpose: 'reference-only',
      graduationDecision: '확인 필요',
      notice: '제공된 조사 자료이며 학교 원문과 개인의 입학연도·입학유형·트랙 적용 여부를 확인해야 합니다.',
      ...reference.sections,
      programs2026: programs,
    },
  }, { headers: { 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
}
