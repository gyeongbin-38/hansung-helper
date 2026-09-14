import {
  authenticated,
  accountView,
  database,
  json,
  sessionCookie,
  validOrigin,
} from '@/lib/server/account';
export async function GET(request: Request) {
  try {
    const row = await authenticated(request);
    return row
      ? json(accountView(row))
      : json({ error: '로그인이 필요합니다.' }, 401);
  } catch {
    return json({ error: '계정 정보를 불러오지 못했습니다.' }, 503);
  }
}
export async function DELETE(request: Request) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  const account = await authenticated(request);
  if (!account) return json({ error: '로그인이 필요합니다.' }, 401);
  await database().batch([
    database()
      .prepare('DELETE FROM academic_sessions WHERE account_id = ?')
      .bind(account.id),
    database()
      .prepare('DELETE FROM academic_accounts WHERE id = ?')
      .bind(account.id),
  ]);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}
