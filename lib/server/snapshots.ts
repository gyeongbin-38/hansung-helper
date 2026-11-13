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
const RETRY_MS = 5_000;
const MAX_ENTRIES = 12;
const MAX_CACHE_BYTES = 12 * 1024 * 1024;
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;
const MAX_READS = 4;
class SnapshotBusyError extends Error {}
const cache = new Map<
  string,
  { payload: string; fetchedAt: string; at: number; bytes: number }
>();
const pending = new Map<string, Promise<{ payload: string; fetched_at: string } | null>>();
// Also bounds negative/stale retry entries: arbitrary missing keys cannot grow memory.
const retries = new Map<string, { until: number; unavailable: boolean }>();
let cacheBytes = 0;

function remember(kind: string, payload: string, fetchedAt: string) {
  const previous = cache.get(kind);
  if (previous) { cacheBytes -= previous.bytes; cache.delete(kind); }
  // Account conservatively for UTF-16 strings; parsed objects are not retained.
  const bytes = payload.length * 2;
  if (bytes > MAX_CACHE_BYTES) return;
  while (cache.size >= MAX_ENTRIES || cacheBytes + bytes > MAX_CACHE_BYTES) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cacheBytes -= cache.get(first)!.bytes;
    cache.delete(first);
  }
  cache.set(kind, { payload, fetchedAt, at: Date.now(), bytes });
  cacheBytes += bytes;
}

type SnapRow = { part: number; payload: string; fetched_at: string; updated_at: number };

function db(): D1Database {
  return (env as unknown as { DB: D1Database }).DB;
}

/** D1 청크 조회·재조립 — 없거나 파싱 불가면 null */
async function d1Snapshot(
  kind: string,
): Promise<{ payload: string; fetched_at: string } | null> {
  const hit = cache.get(kind);
  if (hit) { cache.delete(kind); cache.set(kind, hit); }
  const fallback = () => hit ? { payload: hit.payload, fetched_at: hit.fetchedAt } : null;
  if (hit && Date.now() - hit.at < TTL_MS) return fallback();
  const retry = retries.get(kind);
  if (retry && retry.until > Date.now()) {
    if (retry.unavailable && !hit) throw new SnapshotBusyError();
    return fallback();
  }
  const running = pending.get(kind);
  if (running) return running;
  // Shed uncached work instead of accumulating an unbounded DB wait queue.
  if (pending.size >= MAX_READS) {
    if (hit) return fallback();
    throw new SnapshotBusyError();
  }
  const read = readSnapshot(kind, fallback).finally(() => { pending.delete(kind); });
  pending.set(kind, read);
  return read;
}

async function readSnapshot(kind: string, fallback: () => { payload: string; fetched_at: string } | null) {
  let completed = false;
  let unavailable = false;
  const invalid = () => {
    unavailable = true;
    const previous = fallback();
    if (previous) return previous;
    throw new SnapshotBusyError();
  };
  try {
    const pointerResult = await db().prepare(
      'SELECT part, payload, fetched_at, updated_at FROM public_snapshots WHERE kind = ? ORDER BY part',
    ).bind(`${kind}@active`).all<SnapRow>();
    const pointer = (pointerResult.results ?? []).find((row) => row.part === -1);
    let rows: SnapRow[];
    if (pointer) {
      const manifest = JSON.parse(pointer.payload) as { kind?: unknown; parts?: unknown };
      if (typeof manifest.kind !== 'string' || !manifest.kind.startsWith(`${kind}@`) ||
          !Number.isSafeInteger(manifest.parts) || (manifest.parts as number) < 1 || (manifest.parts as number) > 10000)
        return invalid();
      const staged = await db().prepare(
        'SELECT part, payload, fetched_at, updated_at FROM public_snapshots WHERE kind = ? ORDER BY part',
      ).bind(manifest.kind).all<SnapRow>();
      rows = staged.results ?? [];
      if (rows.length !== manifest.parts || rows.some((row) => row.updated_at !== pointer.updated_at || row.fetched_at !== pointer.fetched_at))
        return invalid();
    } else {
      const legacy = await db().prepare(
        'SELECT part, payload, fetched_at, updated_at FROM public_snapshots WHERE kind = ? ORDER BY part',
      ).bind(kind).all<SnapRow>();
      rows = legacy.results ?? [];
    }
    if (!rows.length) return fallback();
    if (rows.some((row, index) => row.part !== index ||
      row.updated_at !== rows[0].updated_at || row.fetched_at !== rows[0].fetched_at))
      return invalid();
    if (rows.reduce((size, row) => size + row.payload.length * 2, 0) > MAX_PAYLOAD_BYTES) {
      return invalid();
    }
    const payload = rows.map((r) => r.payload).join('');
    JSON.parse(payload); // 깨진 페이로드는 서빙하지 않음
    const fetchedAt = rows[0].fetched_at ?? '';
    remember(kind, payload, fetchedAt);
    retries.delete(kind);
    completed = true;
    return { payload, fetched_at: fetchedAt };
  } catch (error) {
    if (error instanceof SnapshotBusyError) throw error;
    return invalid();
  } finally {
    if (!completed) {
      retries.delete(kind);
      while (retries.size >= MAX_ENTRIES) retries.delete(retries.keys().next().value!);
      retries.set(kind, { until: Date.now() + RETRY_MS, unavailable });
    }
  }
}

function snapshotResponse(body: string): Response {
  // d1Snapshot validated JSON; bundled data came from JSON.stringify. Avoid
  // allocating another complete parsed tree and serialized copy per response.
  return new Response(`{"ok":true,"data":${body}}`, {
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
  accepts?: (payload: unknown) => boolean,
): Promise<Response> {
  let row;
  try { row = await d1Snapshot(kind); } catch { return snapshotResponse(JSON.stringify(bundled)); }
  if (row && row.fetched_at >= bundledAt && (!accepts || accepts(JSON.parse(row.payload)))) return snapshotResponse(row.payload);
  return snapshotResponse(JSON.stringify(bundled));
}

/**
 * 번들 폴백 없는 D1 전용 스냅샷 — 대용량 이력 데이터(과거 시간표·교육과정)처럼
 * 워커 번들에 넣지 않는 데이터용. D1에 없으면 null 반환 (라우트가 404 처리).
 */
export async function snapshotGetOnly(
  kind: string,
  accepts?: (payload: unknown) => boolean,
): Promise<Response | null> {
  let row;
  try { row = await d1Snapshot(kind); } catch {
    return Response.json({ ok: false, error: { code: 'SERVICE_BUSY', message: '자료 조회가 많습니다. 잠시 후 다시 시도해 주세요.' } }, {
      status: 503, headers: { 'Retry-After': '2', 'Cache-Control': 'no-store' },
    });
  }
  if (!row || (accepts && !accepts(JSON.parse(row.payload)))) return null;
  return snapshotResponse(row.payload);
}
