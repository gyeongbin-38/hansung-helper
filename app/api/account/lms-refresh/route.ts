import { waitUntil } from 'cloudflare:workers';
import {
  accountView,
  authenticated,
  database,
  hash,
  json,
  limited,
  migrateLegacyStudentAccount,
  PayloadTooLargeError,
  readTextLimited,
  validOrigin,
  studentAccountId,
  type AccountRow,
} from '@/lib/server/account';
import { connectSchool, SchoolError, SchoolSession } from '@/lib/server/school';
import { saveSchoolSession } from '@/lib/server/session-vault';
import type { LmsSnapshot } from '@/lib/data/lms';
import { writeCollectedLms } from '@/lib/server/lms-write';
import type { InfoSnapshot } from '@/lib/data/info';
import { mergeInfoSnapshot } from '@/lib/data/info';
import { infoChanges } from '@/lib/data/notifs';
import {
  abandonCollectQueue,
  enterCollectQueue,
  heartbeatCollectQueue,
  leaveCollectQueue,
} from '@/lib/server/collect-queue';

// 학교 비밀번호 재인증으로 COSMOS 수집을 다시 실행한다. 비밀번호는 검증 후
// 즉시 버리며 저장하지 않는다. 세션과 계정 데이터는 유지된다.
export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  const schoolSessionIssuedAt = Date.now();
  let queueOwner: string | null = null;
  try {
    const account = await authenticated(request);
    if (!account) return json({ error: '로그인이 필요합니다.' }, 401, { 'X-Hansung-Session-Invalid': '1' });
    const raw = await readTextLimited(request, 4096);
    const input = JSON.parse(raw);
    if (!input || typeof input !== 'object')
      return json({ error: '입력 형식을 확인해 주세요.' }, 400);
    if (
      typeof input.studentId !== 'string' ||
      !/^\d{6,10}$/.test(input.studentId) ||
      typeof input.password !== 'string' ||
      input.password.length < 1 ||
      input.password.length > 128
    )
      return json({ error: '학번과 비밀번호를 확인해 주세요.' }, 400);
    // 본인 계정만 재수집 가능 — 입력 학번 해시가 세션 계정과 같아야 한다
    const id = await studentAccountId(input.studentId);
    const legacyId = await hash('hansung:' + input.studentId);
    if (id !== account.id && legacyId !== account.id)
      return json({ error: '연결된 계정의 학번을 입력해 주세요.' }, 403);
    // 학교 서버 부담을 분산하는 동시성 대기열 — queued면 클라이언트가 폴링 후
    // 같은 본문으로 다시 요청한다. cooldown이면 직전 수집 결과를 그대로 본다.
    const ticket = await enterCollectQueue(account.id);
    if (ticket.state === 'cooldown') {
      const row = await database()
        .prepare('SELECT * FROM academic_accounts WHERE id = ?')
        .bind(account.id)
        .first<AccountRow>();
      return json({ ...accountView(row!, account.session_hash), collectCooldown: true });
    }
    if (ticket.state !== 'admitted')
      return json({ queued: true, running: ticket.state === 'running', position: ticket.state === 'queued' ? ticket.position : 0 });
    // 시도 횟수는 실제 수집이 승인될 때만 소비한다 — 대기열 재요청은 차감하지 않는다.
    if (await limited('refresh:' + account.id, 3)) {
      try {
        await abandonCollectQueue(account.id);
      } catch {
        /* 티켓 회수 실패는 stale sweep이 정리한다 */
      }
      return json(
        { error: '재수집 시도가 많습니다. 15분 후 다시 시도해 주세요.' },
        429,
      );
    }
    queueOwner = account.id;
    let deferredCollect: (() => Promise<LmsSnapshot>) | undefined;
    let deferredInfo: (() => Promise<InfoSnapshot | null>) | undefined;
    const session = new SchoolSession();
    const snapshot = await connectSchool(input.studentId, input.password, {
      session,
      deferLms: (collect) => {
        deferredCollect = collect;
      },
      deferInfo: (collect) => {
        deferredInfo = collect;
      },
    });
    input.password = '';
    await migrateLegacyStudentAccount(id, legacyId, { hash: account.session_hash, accountId: account.id });
    if (session.hasCookies()) {
      try {
        await saveSchoolSession(id, session.exportCookies(), {
          sessionHash: account.session_hash,
          issuedAt: schoolSessionIssuedAt,
        });
      } catch {
        console.log('[vault] save failed');
      }
    }
    if (deferredCollect) snapshot.lmsPending = true;
    if (deferredInfo) snapshot.infoPending = true;
    // 이번 수집이 실패/진행 중이면 이전 수집본을 보존한다.
    // oldInfo는 지연 수집 완료 시 변동 지표 비교 기준으로도 쓴다.
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
    // The source snapshot is the baseline even if the account was migrated
    // while school authentication was pending. A merged or newer destination
    // must be refreshed again instead of overwritten by this older request.
    const updated = await database()
      .prepare('UPDATE academic_accounts SET snapshot = ? WHERE id = ? AND snapshot = ?' +
        ' AND EXISTS (SELECT 1 FROM academic_sessions WHERE token_hash = ? AND account_id = academic_accounts.id AND expires_at > ?)')
      .bind(JSON.stringify(snapshot), id, account.snapshot, account.session_hash, Date.now())
      .run();
    if (!updated.meta.changes) {
      const stillActive = await authenticated(request);
      if (stillActive?.id === id) {
        try {
          await abandonCollectQueue(account.id);
        } catch {
          /* 티켓 회수 실패는 stale sweep이 정리한다 */
        }
        return json({ error: '다른 수집이 먼저 저장되었습니다. 새로고침 후 다시 시도해 주세요.' }, 409);
      }
      return json({ error: '다시 로그인해 주세요.' }, 401, { 'X-Hansung-Session-Invalid': '1' });
    }
    if (session.hasCookies()) {
      try {
        await saveSchoolSession(id, session.exportCookies(), {
          sessionHash: account.session_hash,
          issuedAt: schoolSessionIssuedAt,
        });
      } catch {
        console.log('[vault] save failed');
      }
    }
    const tasks: Promise<unknown>[] = [];
    if (deferredCollect)
      tasks.push(
        (async () => {
          try {
            await heartbeatCollectQueue(account.id);
            await writeCollectedLms(database(), id, snapshot.checkedAt, account.session_hash, await deferredCollect());
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
                  id,
                  snapshot.checkedAt,
                  account.session_hash,
                  Date.now(),
                )
                .run();
            } catch {
              /* 마커 기록 실패도 재수집 성공 여부에 영향을 주지 않는다 */
            }
          }
        })(),
      );
    // 종합정보 재수집 — 로그인 라우트와 같은 waitUntil 패턴
    if (deferredInfo)
      tasks.push(
        (async () => {
          try {
            await heartbeatCollectQueue(account.id);
            const infoData = await deferredInfo();
            // 로그인 라우트와 동일 — 슬롯 실패 시 이전 값 유지 + changed 정리
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
                id,
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
                  id,
                  snapshot.checkedAt,
                  account.session_hash,
                  Date.now(),
                )
                .run();
            } catch {
              /* 마커 기록 실패도 재수집 성공 여부에 영향을 주지 않는다 */
            }
          }
        })(),
      );

    // 지연 수집이 모두 끝나면 대기열 슬롯을 비운다. 지연이 없으면 즉시 해제.
    if (tasks.length) {
      for (const task of tasks) waitUntil(task);
      waitUntil(
        Promise.allSettled(tasks).then(() =>
          leaveCollectQueue(account.id).catch(() => {}),
        ),
      );
    } else {
      try {
        await leaveCollectQueue(account.id);
      } catch {
        /* 슬롯 해제 실패는 stale sweep이 정리한다 */
      }
    }
    const row = await database()
      .prepare('SELECT * FROM academic_accounts WHERE id = ?')
      .bind(id)
      .first<AccountRow>();
    queueOwner = null;
    return json(accountView(row!, account.session_hash));
  } catch (error) {
    if (error instanceof PayloadTooLargeError)
      return json({ error: '입력 크기를 초과했습니다.' }, 413);
    if (error instanceof SyntaxError)
      return json({ error: '입력 형식을 확인해 주세요.' }, 400);
    if (error instanceof SchoolError && error.code === 'credentials')
      return json(
        {
          error:
            '학교 로그인을 확인하지 못했습니다. 학번과 비밀번호를 확인해 주세요.',
        },
        401,
      );
    return json(
      {
        error:
          '학교 연결 또는 저장 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
      },
      503,
    );
  } finally {
    if (queueOwner)
      /* 수집 스케줄이 잡힌 정상 경로는 leaveCollectQueue가 슬롯을 비운다.
       * 예외 경로에서는 아직 'running'으로 남아 있으니 회수한다. */
      await abandonCollectQueue(queueOwner).catch(() => {});
  }
}
