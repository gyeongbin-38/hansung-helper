import {
  authenticated,
  database,
  json,
  PayloadTooLargeError,
  readTextLimited,
  validOrigin,
} from '@/lib/server/account';

function readBody(raw: string) {
  const input = JSON.parse(raw) as { token?: unknown; platform?: unknown };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  // APNs 토큰은 64hex, FCM 토큰은 ~163자의 [\w:.-] — 양쪽 모두 수용
  if (
    typeof input.token !== 'string' ||
    !/^[\w:.-]{8,4096}$/.test(input.token)
  )
    return null;
  return input;
}

/** Capacitor 앱의 APNs/FCM 토큰을 계정에 연결한다. token이 기본키라 같은
 *  기기의 재등록은 덮어쓰고, 다른 계정이 같은 토큰을 보내면 소유가 이전된다 —
 *  한 기기의 계정 전환 시 올바른 동작이다. */
export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  try {
    const account = await authenticated(request);
    if (!account) return json({ error: '다시 로그인해 주세요.' }, 401);
    const input = readBody(await readTextLimited(request, 4096));
    if (
      !input ||
      (input.platform !== 'ios' && input.platform !== 'android')
    )
      return json({ error: '토큰 정보를 확인해 주세요.' }, 400);
    const now = Date.now();
    await database()
      .prepare(
        `INSERT INTO native_push_tokens (token, account_id, platform, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(token) DO UPDATE SET account_id = excluded.account_id,
           platform = excluded.platform, last_seen_at = excluded.last_seen_at`,
      )
      .bind(input.token, account.id, input.platform, now, now)
      .run();
    return json({ subscribed: true }, 201);
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return json({ error: '토큰 정보가 너무 큽니다.' }, 413);
    if (error instanceof SyntaxError)
      return json({ error: '입력 형식을 확인해 주세요.' }, 400);
    return json({ error: '토큰을 저장하지 못했습니다.' }, 503);
  }
}

/** 이 기기의 토큰 해제 — body의 token이 본인 계정 소유일 때만 지운다. */
export async function DELETE(request: Request) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  try {
    const account = await authenticated(request);
    if (!account) return json({ error: '다시 로그인해 주세요.' }, 401);
    const input = readBody(await readTextLimited(request, 4096));
    if (!input) return json({ error: '토큰 정보를 확인해 주세요.' }, 400);
    await database()
      .prepare(
        'DELETE FROM native_push_tokens WHERE token = ? AND account_id = ?',
      )
      .bind(input.token, account.id)
      .run();
    return json({ subscribed: false });
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return json({ error: '토큰 정보가 너무 큽니다.' }, 413);
    if (error instanceof SyntaxError)
      return json({ error: '입력 형식을 확인해 주세요.' }, 400);
    return json({ error: '토큰을 해제하지 못했습니다.' }, 503);
  }
}
