/// <reference types="vite/client" />
import type { Catalog } from '@/lib/data/catalog';
import { snapshotGet } from '@/lib/server/snapshots';

// 학기별 파일을 각각 번들링하며 존재하지 않는 학기는 추측해 반환하지 않는다.
const modules = import.meta.glob<Catalog>('../../../lib/data/catalog-*.json', {
  eager: true,
  import: 'default',
});
const catalogs = Object.values(modules).filter((c) => /^20\d{2}-[12]$/.test(c.semester));

export function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get('semester');
  if (requested && !/^20\d{2}-[12]$/.test(requested))
    return Response.json({ ok: false, error: { code: 'INVALID_REQUEST', message: '학기 형식을 확인해 주세요.' } }, { status: 400 });
  const semester = requested ?? catalogs.map((c) => c.semester).sort().at(-1);
  const catalog = catalogs.find((c) => c.semester === semester);
  if (!catalog)
    return Response.json({ ok: false, error: { code: 'NOT_FOUND', message: '해당 학기의 강의 자료가 없습니다.' } }, { status: 404 });
  return snapshotGet(requested ? `courses:${semester}` : 'courses', catalog, catalog.generatedAt ?? '',
    (payload) => !!payload && typeof payload === 'object' && 'semester' in payload && payload.semester === semester);
}
