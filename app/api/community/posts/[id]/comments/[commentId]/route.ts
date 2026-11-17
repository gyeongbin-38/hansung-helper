import { authenticated, json, validOrigin } from '@/lib/server/account';
import {
  deleteCommunityComment,
  readCommunityBody,
  updateCommunityComment,
} from '@/lib/server/community';

type RouteContext = { params: Promise<{ id: string; commentId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  try {
    const account = await authenticated(request);
    if (!account) return json({ error: '로그인이 필요합니다.' }, 401);
    const { id, commentId } = await context.params;
    const body = await readCommunityBody(request);
    if (!body.ok) return json({ error: body.error }, body.status);
    const result = await updateCommunityComment(account.id, id, commentId, {
      body: body.data.body,
    });
    return result.ok
      ? json({ post: result.data })
      : json({ error: result.error }, result.status);
  } catch {
    return json({ error: '댓글을 수정하지 못했습니다.' }, 503);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  try {
    const account = await authenticated(request);
    if (!account) return json({ error: '로그인이 필요합니다.' }, 401);
    const { id, commentId } = await context.params;
    const result = await deleteCommunityComment(account.id, id, commentId);
    return result.ok
      ? json({ post: result.data })
      : json({ error: result.error }, result.status);
  } catch {
    return json({ error: '댓글을 삭제하지 못했습니다.' }, 503);
  }
}
