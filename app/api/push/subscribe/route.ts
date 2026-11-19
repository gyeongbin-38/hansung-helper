import {
  authenticated,
  database,
  json,
  PayloadTooLargeError,
  readTextLimited,
  validOrigin,
} from '@/lib/server/account';

function validEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validKey(value: unknown, min: number, max: number): value is string {
  if (typeof value !== 'string' || !/^[\w-]+$/.test(value)) return false;
  try {
    const decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    return decoded.length >= min && decoded.length <= max;
  } catch {
    return false;
  }
}

function readBody(raw: string) {
  const input = JSON.parse(raw) as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (!validEndpoint(input.endpoint)) return null;
  return input;
}

/** 브라우저 Push 구독을 계정에 연결한다. endpoint가 기본키라 같은 기기의
 *  재구독은 덮어쓰고, 다른 계정이 같은 endpoint를 보내면 소유가 이전된다 —
 *  한 브라우저 프로필의 계정 전환 시 올바른 동작이다. */
export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  try {
    const account = await authenticated(request);
    if (!account) return json({ error: '다시 로그인해 주세요.' }, 401);
    const input = readBody(await readTextLimited(request, 4096));
    if (
      !input ||
      !validKey(input.keys?.p256dh, 65, 88) ||
      !validKey(input.keys?.auth, 12, 24)
    )
      return json({ error: '구독 정보를 확인해 주세요.' }, 400);
    const now = Date.now();
    await database()
      .prepare(
        `INSERT INTO push_subscriptions (endpoint, account_id, p256dh, auth, user_agent, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET account_id = excluded.account_id,
           p256dh = excluded.p256dh, auth = excluded.auth,
           user_agent = excluded.user_agent, last_seen_at = excluded.last_seen_at`,
      )
      .bind(
        input.endpoint,
        account.id,
        input.keys!.p256dh,
        input.keys!.auth,
        (request.headers.get('user-agent') ?? '').slice(0, 200),
        now,
        now,
      )
      .run();
    return json({ subscribed: true }, 201);
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return json({ error: '구독 정보가 너무 큽니다.' }, 413);
    if (error instanceof SyntaxError)
      return json({ error: '입력 형식을 확인해 주세요.' }, 400);
    return json({ error: '구독을 저장하지 못했습니다.' }, 503);
  }
}

/** 이 기기의 구독 해제 — body의 endpoint가 본인 계정 소유일 때만 지운다. */
export async function DELETE(request: Request) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  try {
    const account = await authenticated(request);
    if (!account) return json({ error: '다시 로그인해 주세요.' }, 401);
    const input = readBody(await readTextLimited(request, 4096));
    if (!input) return json({ error: '구독 정보를 확인해 주세요.' }, 400);
    await database()
      .prepare(
        'DELETE FROM push_subscriptions WHERE endpoint = ? AND account_id = ?',
      )
      .bind(input.endpoint, account.id)
      .run();
    return json({ subscribed: false });
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return json({ error: '구독 정보가 너무 큽니다.' }, 413);
    if (error instanceof SyntaxError)
      return json({ error: '입력 형식을 확인해 주세요.' }, 400);
    return json({ error: '구독을 해제하지 못했습니다.' }, 503);
  }
}
