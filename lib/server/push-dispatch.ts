import { env } from 'cloudflare:workers';
import { currentSemesterStart, type LmsSnapshot } from '../data/lms.ts';
import { reminderTargets } from '../data/notifs.ts';
import { sendPush, type PushKeys } from './webpush.ts';

/** VAPID 서명 자격 — env.VAPID_JWK(ES JWK JSON)가 없으면 푸시 기능 전체가 꺼진다. */
export function pushCredentials(): { jwk: JsonWebKey; subject: string } | null {
  const raw = (env as { VAPID_JWK?: string; VAPID_SUBJECT?: string }).VAPID_JWK;
  if (!raw) return null;
  try {
    const jwk = JSON.parse(raw) as JsonWebKey;
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || !jwk.x || !jwk.y)
      return null;
    return {
      jwk,
      subject:
        (env as { VAPID_SUBJECT?: string }).VAPID_SUBJECT ??
        'https://hansung-helper.gyeongbin-38.workers.dev',
    };
  } catch {
    return null;
  }
}

/** 계정의 LMS 스냅샷에서 "지금 울려야 할" 마감 리마인드를 구독 기기 전부에 푸시한다.
 *  알림함과 같은 id 형식이라 같은 마감·제목·기한 조합은 계정당 1회만 간다 —
 *  기한이 바뀌면 새 id가 되어 다시 울린다. 전송에 실패하면 표시하지 않아
 *  다음 수집/크론 시점에 재시도된다. */
export async function dispatchLmsReminders(
  db: D1Database,
  accountId: string,
  lms: LmsSnapshot,
  creds: { jwk: JsonWebKey; subject: string },
  now = Date.now(),
): Promise<{ sent: number; removed: number }> {
  const subs = await db
    .prepare(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE account_id = ?',
    )
    .bind(accountId)
    .all<PushKeys>();
  if (!subs.results?.length) return { sent: 0, removed: 0 };
  const due = reminderTargets(
    lms,
    now,
    undefined,
    undefined,
    currentSemesterStart(now),
  ).filter((r) => r.fireAt <= now);
  if (!due.length) return { sent: 0, removed: 0 };
  const marks = await db
    .prepare(
      `SELECT notif_id FROM push_notified WHERE account_id = ? AND notif_id IN (${due.map(() => '?').join(',')})`,
    )
    .bind(accountId, ...due.map((t) => t.id))
    .all<{ notif_id: string }>();
  const done = new Set((marks.results ?? []).map((r) => r.notif_id));
  const dead = new Set<string>();
  let sent = 0;
  for (const t of due) {
    if (done.has(t.id)) continue;
    let delivered = false;
    for (const s of subs.results) {
      if (dead.has(s.endpoint)) continue;
      const res = await sendPush(
        s,
        { title: t.title, body: t.body, tag: t.id, url: '/#lms' },
        creds.jwk,
        creds.subject,
      ).catch(() => null);
      if (res?.ok) delivered = true;
      else if (res && (res.status === 404 || res.status === 410))
        dead.add(s.endpoint);
    }
    if (delivered) {
      await db
        .prepare(
          'INSERT OR IGNORE INTO push_notified (account_id, notif_id, sent_at) VALUES (?, ?, ?)',
        )
        .bind(accountId, t.id, now)
        .run();
      sent += 1;
    }
  }
  for (const endpoint of dead)
    await db
      .prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
      .bind(endpoint)
      .run();
  return { sent, removed: dead.size };
}

/** 주기 정리 — 만료된 발송 기록(90일)을 지운다. 디스패치의 ~10%에서만 돌려
 *  쓰기 부담을 줄인다. */
export async function cleanupPushRecords(db: D1Database): Promise<void> {
  await db
    .prepare('DELETE FROM push_notified WHERE sent_at < ?')
    .bind(Date.now() - 90 * 86400000)
    .run();
}

/** VAPID 설정이 잡힌 환경에서만 디스패치한다. 발송 실패는 로그만 남기고
 *  호출 경로(로그인·재수집·프로필 저장)를 방해하지 않는다. */
export async function dispatchLmsRemindersIfReady(
  db: D1Database,
  accountId: string,
  lms: LmsSnapshot | null | undefined,
): Promise<void> {
  if (!lms) return;
  const creds = pushCredentials();
  if (!creds) return;
  try {
    await dispatchLmsReminders(db, accountId, lms, creds);
    if (Math.random() < 0.1) await cleanupPushRecords(db);
  } catch {
    console.log('[push] dispatch failed');
  }
}
