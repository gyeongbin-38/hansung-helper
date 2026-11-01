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
  const db = database();
  await db.batch([
    db
      .prepare('DELETE FROM academic_sessions WHERE account_id = ?')
      .bind(account.id),
    db
      .prepare('DELETE FROM academic_accounts WHERE id = ?')
      .bind(account.id),
    db
      .prepare('DELETE FROM academic_login_limits WHERE key IN (?, ?)')
      .bind(account.id, `refresh:${account.id}`),
  ]);
  return json({ deleted: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}
