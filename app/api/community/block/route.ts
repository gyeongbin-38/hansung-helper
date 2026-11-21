import { authenticated, json, validOrigin } from '@/lib/server/account';
import {
  blockCommunityAuthor,
  readCommunityBody,
  unblockCommunityAuthor,
} from '@/lib/server/community';

export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  try {
    const account = await authenticated(request);
    if (!account) return json({ error: '로그인이 필요합니다.' }, 401);
    const body = await readCommunityBody(request);
    if (!body.ok) return json({ error: body.error }, body.status);
    const result = await blockCommunityAuthor(account.id, body.data.alias);
    return result.ok
      ? json(result.data)
      : json({ error: result.error }, result.status);
  } catch {
    return json({ error: '이용자를 차단하지 못했습니다.' }, 503);
  }
}

export async function DELETE(request: Request) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  try {
    const account = await authenticated(request);
    if (!account) return json({ error: '로그인이 필요합니다.' }, 401);
    const body = await readCommunityBody(request);
    if (!body.ok) return json({ error: body.error }, body.status);
    const result = await unblockCommunityAuthor(account.id, body.data.alias);
    return result.ok
      ? json(result.data)
      : json({ error: result.error }, result.status);
  } catch {
    return json({ error: '차단을 해제하지 못했습니다.' }, 503);
  }
}
