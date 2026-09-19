import { env } from 'cloudflare:workers';

/**
 * 공개 스냅샷 저장소 — D1 public_snapshots 테이블을 우선 읽고,
 * 테이블이 비었거나 더 오래됐거나 D1에 접근할 수 없으면 배포 번들
 * JSON으로 폴백한다. 응답 경로에서 학교 사이트를 조회하지 않는다.
 *
 * D1 문장 크기 제한 때문에 페이로드는 part 단위 청크로 나뉘어
 * 저장되며, 읽을 때 part 순서대로 이어 붙인다.
 * 아이솔레이트 내 TTL 캐시로 D1 읽기를 최소화한다(60초).
 */

const TTL_MS = 60_000;
const cache = new Map<
  string,
  { payload: string; fetchedAt: string; at: number }
>();

type SnapRow = { payload: string; fetched_at: string };

function db(): D1Database {
  return (env as unknown as { DB: D1Database }).DB;
}

/** D1 청크 조회·재조립 — 없거나 파싱 불가면 null */
async function d1Snapshot(
  kind: string,
): Promise<{ payload: string; fetched_at: string } | null> {
  try {
    const hit = cache.get(kind);
    if (hit && Date.now() - hit.at < TTL_MS)
      return { payload: hit.payload, fetched_at: hit.fetchedAt };
    const res = await db()
      .prepare(
        'SELECT payload, fetched_at FROM public_snapshots WHERE kind = ? ORDER BY part',
      )
      .bind(kind)
      .all<SnapRow>();
    const rows = res.results ?? [];
    if (!rows.length) return null;
    const payload = rows.map((r) => r.payload).join('');
    JSON.parse(payload); // 깨진 페이로드는 서빙하지 않음
    const fetchedAt = rows[0].fetched_at ?? '';
    cache.set(kind, { payload, fetchedAt, at: Date.now() });
    return { payload, fetched_at: fetchedAt };
  } catch {
    return null;
  }
}

function snapshotResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * 스냅샷 GET 공통 처리 — D1 페이로드가 번들보다 새롭거나 같으면 D1,
 * 그렇지 않으면 번들 JSON을 그대로 반환.
 * bundledAt: 번들 JSON의 수집 시각(fetchedAt/generatedAt, ISO 문자열).
 */
export async function snapshotGet(
  kind: string,
  bundled: unknown,
  bundledAt = '',
): Promise<Response> {
  const row = await d1Snapshot(kind);
  if (row && row.fetched_at >= bundledAt) return snapshotResponse(row.payload);
  return snapshotResponse(JSON.stringify(bundled));
}
