import {
  database,
  hash,
  json,
  sessionCookie,
  validOrigin,
} from '@/lib/server/account';
export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  const token = request.headers
    .get('cookie')
    ?.match(/(?:^|;\s*)__Host-hansung_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (token)
    await database()
      .prepare('DELETE FROM academic_sessions WHERE token_hash = ?')
      .bind(await hash(token))
      .run();
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}
