import { waitUntil } from 'cloudflare:workers';
import {
  accountView,
  authenticated,
  database,
  json,
  limited,
  readTextLimited,
  validOrigin,
  type AccountRow,
} from '@/lib/server/account';
import { resumeSchool, SchoolError, SchoolSession } from '@/lib/server/school';
import {
  deleteSchoolSession,
  loadSchoolSession,
  saveSchoolSession,
} from '@/lib/server/session-vault';
import type { LmsSnapshot } from '@/lib/data/lms';
import { writeCollectedLms } from '@/lib/server/lms-write';
import type { InfoSnapshot } from '@/lib/data/info';
import { mergeInfoSnapshot } from '@/lib/data/info';
import { infoChanges } from '@/lib/data/notifs';

// 저장된 학교 세션 쿠키로 비밀번호 없이 COSMOS·종합정보를 재수집한다.
// 비밀번호는 요청하지 않으며 볼트의 쿠키만 사용한다. 볼트가 없거나 만료면
// 앱 세션은 유지한 채 학교 재연결 안내를 반환한다.
export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  try {
    const account = await authenticated(request);
    if (!account) return json({ error: '로그인이 필요합니다.' }, 401, { 'X-Hansung-Session-Invalid': '1' });
    await readTextLimited(request, 1024);
    if (await limited('session-refresh:' + account.id, 12))
      return json({ error: '새로고침 시도가 많습니다. 잠시 후 다시 시도해 주세요.' }, 429);

    const cookies = await loadSchoolSession(account.id);
    if (!cookies)
      return json(
        { error: '저장된 학교 세션이 없거나 만료되었습니다. 비밀번호로 다시 연결해 주세요.' },
        401,
        { 'X-Hansung-School-Session': 'expired' },
      );

    let deferredCollect: (() => Promise<LmsSnapshot>) | undefined;
    let deferredInfo: (() => Promise<InfoSnapshot | null>) | undefined;
    const session = new SchoolSession(cookies);
    let snapshot;
    try {
      snapshot = await resumeSchool(session, '', {
        deferLms: (collect) => {
          deferredCollect = collect;
        },
        deferInfo: (collect) => {
          deferredInfo = collect;
        },
      });
    } catch (error) {
      if (error instanceof SchoolError && error.code === 'session') {
        try {
          await deleteSchoolSession(account.id);
        } catch {
          /* 볼트 삭제 실패는 무시 */
        }
        return json(
          { error: '학교 세션이 만료되었습니다. 비밀번호로 다시 연결해 주세요.' },
          401,
          { 'X-Hansung-School-Session': 'expired' },
        );
      }
      throw error;
    }

    if (session.hasCookies()) {
      try {
        await saveSchoolSession(account.id, session.exportCookies());
      } catch {
        console.log('[vault] save failed');
      }
    }
    if (deferredCollect) snapshot.lmsPending = true;
    if (deferredInfo) snapshot.infoPending = true;

    // 부분 수집 보존 — 이번에 못 가져온 슬롯은 이전 스냅샷 값을 유지한다.
    let oldInfo: InfoSnapshot | undefined;
    if (!snapshot.lmsData || !snapshot.infoData) {
      try {
        const old = JSON.parse(account.snapshot) as {
          lmsData?: LmsSnapshot;
          infoData?: InfoSnapshot;
        };
        if (!snapshot.lmsData && old.lmsData) snapshot.lmsData = old.lmsData;
        oldInfo = old.infoData;
        if (!snapshot.infoData && oldInfo) snapshot.infoData = oldInfo;
      } catch {
        /* 이전 스냅샷 손상은 무시 */
      }
    }

    const updated = await database()
      .prepare(
        'UPDATE academic_accounts SET snapshot = ? WHERE id = ? AND snapshot = ?' +
          ' AND EXISTS (SELECT 1 FROM academic_sessions WHERE token_hash = ? AND account_id = academic_accounts.id AND expires_at > ?)',
      )
      .bind(JSON.stringify(snapshot), account.id, account.snapshot, account.session_hash, Date.now())
      .run();
    if (!updated.meta.changes) {
      const stillActive = await authenticated(request);
      if (stillActive?.id === account.id)
        return json({ error: '다른 수집이 먼저 저장되었습니다. 새로고침 후 다시 시도해 주세요.' }, 409);
      return json({ error: '다시 로그인해 주세요.' }, 401, { 'X-Hansung-Session-Invalid': '1' });
    }

    if (deferredCollect)
      waitUntil(
        (async () => {
          try {
            await writeCollectedLms(database(), account.id, snapshot.checkedAt, account.session_hash, await deferredCollect());
          } catch {
            console.log('[lms] deferred collect failed');
            try {
              await database()
                .prepare(
                  "UPDATE academic_accounts SET snapshot = json_patch(snapshot, ?) WHERE id = ? AND json_extract(snapshot, '$.checkedAt') = ? AND EXISTS (SELECT 1 FROM academic_sessions WHERE token_hash = ? AND account_id = academic_accounts.id AND expires_at > ?)",
                )
                .bind(
                  JSON.stringify({
                    lmsPending: null,
                    lmsFailedAt: new Date().toISOString(),
                  }),
                  account.id,
                  snapshot.checkedAt,
                  account.session_hash,
                  Date.now(),
                )
                .run();
            } catch {
              /* 마커 기록 실패도 수집 성공에 영향을 주지 않는다 */
            }
          }
        })(),
      );
    if (deferredInfo)
      waitUntil(
        (async () => {
          try {
            const infoData = await deferredInfo();
            const patchInfo = infoData
              ? (() => {
                  const stored = mergeInfoSnapshot(oldInfo, infoData);
                  const changed = infoChanges(oldInfo, stored);
                  return { ...stored, changed: changed.length ? changed : null };
                })()
              : null;
            await database()
              .prepare(
                "UPDATE academic_accounts SET snapshot = json_patch(snapshot, ?) WHERE id = ? AND json_extract(snapshot, '$.checkedAt') = ? AND EXISTS (SELECT 1 FROM academic_sessions WHERE token_hash = ? AND account_id = academic_accounts.id AND expires_at > ?)",
              )
              .bind(
                JSON.stringify(
                  patchInfo
                    ? { infoData: patchInfo, infoPending: null }
                    : {
                        infoPending: null,
                        infoFailedAt: new Date().toISOString(),
                      },
                ),
                account.id,
                snapshot.checkedAt,
                account.session_hash,
                Date.now(),
              )
              .run();
          } catch {
            console.log('[info] deferred collect failed');
            try {
              await database()
                .prepare(
                  "UPDATE academic_accounts SET snapshot = json_patch(snapshot, ?) WHERE id = ? AND json_extract(snapshot, '$.checkedAt') = ? AND EXISTS (SELECT 1 FROM academic_sessions WHERE token_hash = ? AND account_id = academic_accounts.id AND expires_at > ?)",
                )
                .bind(
                  JSON.stringify({
                    infoPending: null,
                    infoFailedAt: new Date().toISOString(),
                  }),
                  account.id,
                  snapshot.checkedAt,
                  account.session_hash,
                  Date.now(),
                )
                .run();
            } catch {
              /* 마커 기록 실패도 수집 성공에 영향을 주지 않는다 */
            }
          }
        })(),
      );

    const row = await database()
      .prepare('SELECT * FROM academic_accounts WHERE id = ?')
      .bind(account.id)
      .first<AccountRow>();
    return json(accountView(row!, account.session_hash));
  } catch {
    console.log('[lms-refresh-session] failed');
    return json(
      { error: '학교 연결 또는 저장 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
      503,
    );
  }
}
