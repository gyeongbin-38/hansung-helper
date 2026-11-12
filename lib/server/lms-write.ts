import { combineLmsSnapshots, type LmsSnapshot } from '../data/lms.ts';

/** 프로필 저장과 경합하면 최신 프로필을 다시 읽고 병합한다. */
export async function writeCollectedLms(db: D1Database, id: string, checkedAt: string,
  sessionHash: string, collected: LmsSnapshot): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await db.prepare('SELECT profile, snapshot FROM academic_accounts WHERE id = ?')
      .bind(id).first<{ profile: string; snapshot: string }>();
    if (!row) return;
    const profile = JSON.parse(row.profile) as { lms?: unknown };
    const snapshot = JSON.parse(row.snapshot) as { lmsData?: unknown; checkedAt?: string };
    if (snapshot.checkedAt !== checkedAt) return;
    const lmsData = combineLmsSnapshots(snapshot.lmsData, profile.lms, collected);
    if (!lmsData) throw new Error('invalid LMS collection');
    const written = await db.prepare(
      "UPDATE academic_accounts SET snapshot = json_patch(snapshot, ?) WHERE id = ? AND json_extract(snapshot, '$.checkedAt') = ? AND profile = ? AND snapshot = ? AND EXISTS (SELECT 1 FROM academic_sessions WHERE token_hash = ? AND account_id = academic_accounts.id AND expires_at > ?)",
    ).bind(JSON.stringify({ lmsData, lmsPending: null }), id, checkedAt, row.profile, row.snapshot, sessionHash, Date.now()).run();
    if (written.meta.changes) return;
  }
  throw new Error('LMS snapshot write conflicted or session ended');
}
