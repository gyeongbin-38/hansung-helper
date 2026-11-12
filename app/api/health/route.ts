import { accountAuthConfigured, database } from '@/lib/server/account';

// Public data has bundle fallbacks, so it can work while all logins fail.
// Check the account dependencies without reading any account records.
export async function GET() {
  const accountAuth = accountAuthConfigured();
  let accountDatabase = false;
  try {
    const schema = await database()
      .prepare(
        "SELECT COUNT(*) AS tables FROM sqlite_master WHERE type = 'table' AND name IN ('academic_accounts', 'academic_sessions', 'academic_login_limits')",
      )
      .first<{ tables: number }>();
    accountDatabase = schema?.tables === 3;
  } catch {
    // Health responses must not expose database errors or configuration values.
  }
  const ok = accountAuth && accountDatabase;
  return Response.json(
    { ok, now: Date.now(), checks: { accountAuth, accountDatabase } },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
