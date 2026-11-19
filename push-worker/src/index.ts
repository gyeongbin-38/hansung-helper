/** 학사부기 마감 푸시 크론 워커 — 메인 앱과 같은 D1을 읽어 계정별로
 *  저장된 LMS 스냅샷의 임박 마감을 푸시한다. vinext가 scheduled 핸들러를
 *  지원하지 않아 별도 워커로 분리했다. 발송·중복 방지 로직은
 *  `lib/server/push-dispatch.ts`를 공유한다. */
import { dispatchLmsReminders } from '../../lib/server/push-dispatch';
import type { LmsSnapshot } from '../../lib/data/lms';

type Env = {
  DB: D1Database;
  VAPID_JWK?: string;
  VAPID_SUBJECT?: string;
};

function creds(env: Env): { jwk: JsonWebKey; subject: string } | null {
  if (!env.VAPID_JWK) return null;
  try {
    const jwk = JSON.parse(env.VAPID_JWK) as JsonWebKey;
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d) return null;
    return {
      jwk,
      subject:
        env.VAPID_SUBJECT ??
        'https://hansung-helper.gyeongbin-38.workers.dev',
    };
  } catch {
    return null;
  }
}

/** 스냅샷/프로필 양쪽의 LMS 수집본 중 최신 것을 고른다 — 서버 수집본과
 *  확장 업로드본이 다른 시각일 수 있다. */
function latestLms(snapshot: string, profile: string): LmsSnapshot | null {
  let best: LmsSnapshot | null = null;
  for (const raw of [snapshot, profile]) {
    try {
      const parsed = JSON.parse(raw) as {
        lmsData?: LmsSnapshot;
        lms?: LmsSnapshot;
      };
      for (const lms of [parsed.lmsData, parsed.lms]) {
        if (!lms || !Array.isArray(lms.courses)) continue;
        if (
          !best ||
          Date.parse(lms.fetchedAt ?? '') > Date.parse(best.fetchedAt ?? '')
        )
          best = lms;
      }
    } catch {
      /* 손상된 행은 건너뛴다 */
    }
  }
  return best;
}

export default {
  async scheduled(_ctrl: ScheduledController, env: Env): Promise<void> {
    const auth = creds(env);
    if (!auth) {
      console.log('[push-cron] VAPID_JWK missing — skipped');
      return;
    }
    const accounts = await env.DB.prepare(
      'SELECT DISTINCT account_id FROM push_subscriptions',
    ).all<{ account_id: string }>();
    let sent = 0;
    for (const { account_id } of accounts.results ?? []) {
      try {
        const row = await env.DB.prepare(
          'SELECT snapshot, profile FROM academic_accounts WHERE id = ?',
        )
          .bind(account_id)
          .first<{ snapshot: string; profile: string }>();
        if (!row) continue;
        const lms = latestLms(row.snapshot, row.profile);
        if (!lms) continue;
        const result = await dispatchLmsReminders(
          env.DB,
          account_id,
          lms,
          auth,
        );
        sent += result.sent;
      } catch {
        console.log('[push-cron] account dispatch failed');
      }
    }
    console.log(`[push-cron] done — ${sent} notification(s) sent`);
  },
};
