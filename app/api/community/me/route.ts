import { authenticated, json } from '@/lib/server/account';
import { communityMe } from '@/lib/server/community';

export async function GET(request: Request) {
  try {
    const account = await authenticated(request);
    if (!account) return json({ error: '로그인이 필요합니다.' }, 401);
    return json(await communityMe(account.id));
  } catch {
    return json({ error: '내 커뮤니티 활동을 불러오지 못했습니다.' }, 503);
  }
}
