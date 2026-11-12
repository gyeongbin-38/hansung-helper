import {
  database,
  hash,
  json,
  sessionCookie,
  validOrigin,
} from '@/lib/server/account';
export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  try {
    const token = request.headers
      .get('cookie')
      ?.match(/(?:^|;\s*)__Host-hansung_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (token && request.headers.get('x-hansung-session-context') !== await hash(token))
      return json({ error: '계정이 변경되었습니다. 화면을 새로고침해 주세요.' }, 409);
    if (token)
      await database()
        .prepare('DELETE FROM academic_sessions WHERE token_hash = ?')
        .bind(await hash(token))
        .run();
    return json({ loggedOut: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
  } catch {
    return json({ error: '로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 503);
  }
}
