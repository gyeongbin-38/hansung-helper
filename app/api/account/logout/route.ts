import {
  authenticated,
  database,
  hash,
  json,
  validOrigin,
} from '@/lib/server/account';
import { deleteSchoolSession } from '@/lib/server/session-vault';
export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  try {
    const token = request.headers
      .get('cookie')
      ?.match(/(?:^|;\s*)__Host-hansung_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (token && request.headers.get('x-hansung-session-context') !== await hash(token))
      return json({ error: '계정이 변경되었습니다. 화면을 새로고침해 주세요.' }, 409);
    if (token) {
      const account = await authenticated(request);
      await database()
        .prepare('DELETE FROM academic_sessions WHERE token_hash = ?')
        .bind(await hash(token))
        .run();
      if (account)
        try {
          await deleteSchoolSession(account.id, account.session_hash);
        } catch {
          /* 볼트 삭제 실패는 로그아웃을 막지 않는다 */
        }
    }
    // Do not expire the browser cookie in this response. A delayed logout response
    // can arrive after a new login and would otherwise erase that newer session.
    // The token is already unusable because its server-side session was deleted.
    return json({ loggedOut: true });
  } catch {
    return json({ error: '로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 503);
  }
}
