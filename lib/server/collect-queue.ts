import { database } from './account';

/**
 * 학교 수집 동시성 대기열 — D1 테이블 하나로 Worker 인스턴스 간 공유한다.
 *
 * 왜 필요한가: 학교 서버(Moodle/종합정보 JSP)는 소수 PHP 서버라 동시 수집이
 * 몰리면 피크가 생기고, 모든 요청이 같은 Cloudflare IP 대역에서 나가므로
 * 학교 측 레이트리밋/차단 리스크가 있다. 실행 중인 수집 수를 전역으로 제한해
 * 피크를 평탄화한다.
 *
 * 동작: 계정당 티켓 하나(PK). enterCollectQueue()가 티켓을 만들고 단일 UPDATE
 * 로 원자적으로 'running' 승격을 시도한다 — SQLite 쓰기 직렬화 덕분에 상한을
 * 초과 승인하지 않는다. 클라이언트는 GET으로 위치를 폴링하고 'ready'면 다시
 * POST 해 실제 수집을 시작한다. heartbeat이 오래된 waiting/running 행은 죽은
 * 클라이언트로 보고 sweep이 회수한다.
 */
export const COLLECT_CONCURRENCY = 6;
const RUNNING_STALE_MS = 150_000;
const WAITING_STALE_MS = 120_000;
const COOLDOWN_MS = 60_000;
const DONE_KEEP_MS = 86_400_000;

export type CollectTicket =
  | { state: 'admitted' }
  | { state: 'queued'; position: number }
  | { state: 'running' }
  | { state: 'cooldown'; retryAfterMs: number };

export type QueueStatus =
  | { status: 'waiting'; position: number }
  | { status: 'ready'; position: number }
  | { status: 'running' }
  | null;

type QueueRow = {
  account_id: string;
  seq: number;
  status: 'waiting' | 'running' | 'done';
  heartbeat: number;
  finished_at: number | null;
};

async function sweep(now: number) {
  await database()
    .prepare(
      "DELETE FROM collect_queue WHERE (status = 'waiting' AND heartbeat < ?)" +
        " OR (status = 'running' AND heartbeat < ?)" +
        " OR (status = 'done' AND finished_at < ?)",
    )
    .bind(now - WAITING_STALE_MS, now - RUNNING_STALE_MS, now - DONE_KEEP_MS)
    .run();
}

async function ticketRow(accountId: string) {
  return database()
    .prepare('SELECT * FROM collect_queue WHERE account_id = ?')
    .bind(accountId)
    .first<QueueRow>();
}

async function freshRunning(now: number) {
  const row = await database()
    .prepare("SELECT COUNT(*) AS n FROM collect_queue WHERE status = 'running' AND heartbeat > ?")
    .bind(now - RUNNING_STALE_MS)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function aheadOf(seq: number, now: number) {
  const row = await database()
    .prepare(
      "SELECT COUNT(*) AS n FROM collect_queue WHERE status = 'waiting' AND heartbeat > ? AND seq < ?",
    )
    .bind(now - WAITING_STALE_MS, seq)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** 단일 UPDATE = 원자적 승인. 빈 슬롯 내에서 대기 순번이 도는 계정만 running으로 올린다. */
async function tryAdmit(accountId: string, now: number): Promise<boolean> {
  const updated = await database()
    .prepare(
      "UPDATE collect_queue SET status = 'running', heartbeat = ?" +
        ' WHERE account_id = ? AND status = \'waiting\'' +
        ' AND (SELECT COUNT(*) FROM collect_queue AS w WHERE w.status = \'waiting\' AND w.heartbeat > ? AND w.seq < collect_queue.seq)' +
        ' + (SELECT COUNT(*) FROM collect_queue AS x WHERE x.status = \'running\' AND x.heartbeat > ?) < ?',
    )
    .bind(now, accountId, now - WAITING_STALE_MS, now - RUNNING_STALE_MS, COLLECT_CONCURRENCY)
    .run();
  return updated.meta.changes === 1;
}

/**
 * 수집 진입점 — cooldown이면 그대로 반환, 이미 다른 탭이 수집 중이면 'running',
 * 슬롯이 비면 'admitted', 아니면 'queued'+위치.
 */
export async function enterCollectQueue(accountId: string): Promise<CollectTicket> {
  const now = Date.now();
  await sweep(now);
  const mine = await ticketRow(accountId);
  if (mine?.status === 'running' && mine.heartbeat > now - RUNNING_STALE_MS)
    return { state: 'running' };
  if (mine?.status === 'done' && mine.finished_at !== null && mine.finished_at > now - COOLDOWN_MS)
    return { state: 'cooldown', retryAfterMs: mine.finished_at + COOLDOWN_MS - now };
  if (mine)
    await database()
      .prepare(
        "UPDATE collect_queue SET status = 'waiting', heartbeat = ?, finished_at = NULL WHERE account_id = ?",
      )
      .bind(now, accountId)
      .run();
  else
    await database()
      .prepare(
        "INSERT INTO collect_queue (account_id, seq, status, heartbeat) VALUES (?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM collect_queue), 'waiting', ?)",
      )
      .bind(accountId, now)
      .run();
  if (await tryAdmit(accountId, now)) return { state: 'admitted' };
  const status = await queuePosition(accountId);
  return { state: 'queued', position: status?.status === 'ready' || status?.status === 'waiting' ? status.position : 1 };
}

/**
 * GET 폴링용 — waiting 티켓의 heartbeat을 갱신해 폴링 중인 클라이언트가
 * 죽은 것으로 간주되지 않게 한다. 'ready'는 빈 슬롯 내 순번이 돌아온 상태로
 * 클라이언트가 POST를 다시 보내면 된다는 신호다.
 */
export async function queuePosition(accountId: string): Promise<QueueStatus> {
  const now = Date.now();
  const mine = await ticketRow(accountId);
  if (!mine || mine.status === 'done') return null;
  if (mine.status === 'running')
    return mine.heartbeat > now - RUNNING_STALE_MS ? { status: 'running' } : null;
  await database()
    .prepare("UPDATE collect_queue SET heartbeat = ? WHERE account_id = ? AND status = 'waiting'")
    .bind(now, accountId)
    .run();
  const ahead = await aheadOf(mine.seq, now);
  const position = ahead + 1;
  const free = COLLECT_CONCURRENCY - (await freshRunning(now));
  return ahead < free ? { status: 'ready', position } : { status: 'waiting', position };
}

/** 수집 구간 사이에 호출해 running 티켓이 stale로 회수되지 않게 한다. */
export async function heartbeatCollectQueue(accountId: string) {
  const now = Date.now();
  await database()
    .prepare("UPDATE collect_queue SET heartbeat = ? WHERE account_id = ? AND status = 'running'")
    .bind(now, accountId)
    .run();
}

/** 수집 완료 — 슬롯을 비우고 직후 재수집 스팸을 막는 cooldown 기록을 남긴다. */
export async function leaveCollectQueue(accountId: string) {
  const now = Date.now();
  await database()
    .prepare("UPDATE collect_queue SET status = 'done', heartbeat = ?, finished_at = ? WHERE account_id = ?")
    .bind(now, now, accountId)
    .run();
}

/** 수집을 시작하지 못한 채 실패(세션 만료 등) — cooldown 없이 티켓만 회수한다. */
export async function abandonCollectQueue(accountId: string) {
  await database()
    .prepare('DELETE FROM collect_queue WHERE account_id = ?')
    .bind(accountId)
    .run();
}
