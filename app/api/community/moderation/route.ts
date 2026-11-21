import { env } from 'cloudflare:workers';
import { hash, json, readTextLimited } from '@/lib/server/account';
import {
  communityModerationReports,
  communityModerationSetDeleted,
} from '@/lib/server/community';

/** 운영자 전용 모더레이션 — MODERATION_KEY 비밀값과 x-moderation-key 헤더의
 *  SHA-256 해시가 같을 때만 열린다. 쿠키 인증을 쓰지 않아 CSRF 검사가 불필요하다. */
async function moderationAuthorized(request: Request) {
  const secret = (env as unknown as { MODERATION_KEY?: string }).MODERATION_KEY;
  if (typeof secret !== 'string' || secret.length < 16) return 'disabled';
  const provided = request.headers.get('x-moderation-key') ?? '';
  if (!provided) return false;
  return (await hash(provided)) === (await hash(secret));
}

export async function GET(request: Request) {
  try {
    const authorized = await moderationAuthorized(request);
    if (authorized === 'disabled')
      return json({ error: '모더레이션이 설정되어 있지 않습니다.' }, 503);
    if (!authorized) return json({ error: '권한이 없습니다.' }, 401);
    return json(await communityModerationReports());
  } catch {
    return json({ error: '신고 집계를 불러오지 못했습니다.' }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const authorized = await moderationAuthorized(request);
    if (authorized === 'disabled')
      return json({ error: '모더레이션이 설정되어 있지 않습니다.' }, 503);
    if (!authorized) return json({ error: '권한이 없습니다.' }, 401);
    let body: { targetType?: unknown; targetId?: unknown; action?: unknown };
    try {
      body = JSON.parse(await readTextLimited(request, 4 * 1024));
    } catch {
      return json({ error: '잘못된 요청입니다.' }, 400);
    }
    const action = body?.action === 'restore' ? 'restore' : 'hide';
    const result = await communityModerationSetDeleted(
      body?.targetType,
      body?.targetId,
      action === 'hide',
    );
    return result.ok
      ? json(result.data)
      : json({ error: result.error }, result.status);
  } catch {
    return json({ error: '처리하지 못했습니다.' }, 503);
  }
}
