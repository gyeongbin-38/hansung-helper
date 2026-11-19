import { authenticated, json, validOrigin } from '@/lib/server/account';
import {
  createCommunityPost,
  listCommunityPosts,
  readCommunityBody,
} from '@/lib/server/community';
import { isCommunitySort } from '@/lib/data/community';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sort = url.searchParams.get('sort');
    const account = await authenticated(request).catch(() => null);
    const result = await listCommunityPosts({
      q: url.searchParams.get('q') ?? '',
      sort: isCommunitySort(sort) ? sort : 'latest',
      before: url.searchParams.get('before'),
      accountId: account?.id,
    });
    return json(result);
  } catch {
    return json({ error: '커뮤니티 글을 불러오지 못했습니다.' }, 503);
  }
}

export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  try {
    const account = await authenticated(request);
    if (!account) return json({ error: '글을 쓰려면 학교 계정으로 로그인해 주세요.' }, 401);
    const body = await readCommunityBody(request);
    if (!body.ok) return json({ error: body.error }, body.status);
    const result = await createCommunityPost(account.id, body.data);
    return result.ok
      ? json({ post: result.data }, 201)
      : json({ error: result.error }, result.status);
  } catch {
    return json({ error: '글을 저장하지 못했습니다.' }, 503);
  }
}
