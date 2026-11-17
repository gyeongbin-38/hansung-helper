import { authenticated, json, validOrigin } from '@/lib/server/account';
import {
  deleteCommunityPost,
  getCommunityPost,
  readCommunityBody,
  updateCommunityPost,
} from '@/lib/server/community';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const account = await authenticated(request);
    const post = await getCommunityPost(id, account ? { id: account.id } : null);
    return post ? json({ post }) : json({ error: '글을 찾을 수 없습니다.' }, 404);
  } catch {
    return json({ error: '글을 불러오지 못했습니다.' }, 503);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  try {
    const account = await authenticated(request);
    if (!account) return json({ error: '로그인이 필요합니다.' }, 401);
    const { id } = await context.params;
    const body = await readCommunityBody(request);
    if (!body.ok) return json({ error: body.error }, body.status);
    const result = await updateCommunityPost(account.id, id, body.data);
    return result.ok
      ? json({ post: result.data })
      : json({ error: result.error }, result.status);
  } catch {
    return json({ error: '글을 수정하지 못했습니다.' }, 503);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  try {
    const account = await authenticated(request);
    if (!account) return json({ error: '로그인이 필요합니다.' }, 401);
    const { id } = await context.params;
    const result = await deleteCommunityPost(account.id, id);
    return result.ok
      ? json(result.data)
      : json({ error: result.error }, result.status);
  } catch {
    return json({ error: '글을 삭제하지 못했습니다.' }, 503);
  }
}
