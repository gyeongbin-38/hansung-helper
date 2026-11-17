import { authenticated, json, validOrigin } from '@/lib/server/account';
import {
  readCommunityBody,
  reportCommunityTarget,
} from '@/lib/server/community';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  try {
    const account = await authenticated(request);
    if (!account) return json({ error: '신고하려면 로그인이 필요합니다.' }, 401);
    const { id } = await context.params;
    const body = await readCommunityBody(request);
    if (!body.ok) return json({ error: body.error }, body.status);
    const result = await reportCommunityTarget(account.id, id, body.data);
    return result.ok
      ? json(result.data)
      : json({ error: result.error }, result.status);
  } catch {
    return json({ error: '신고를 접수하지 못했습니다.' }, 503);
  }
}
