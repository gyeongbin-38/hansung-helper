import { waitUntil } from 'cloudflare:workers';
import {
  accountView,
  authenticated,
  database,
  hash,
  json,
  limited,
  validOrigin,
  type AccountRow,
} from '@/lib/server/account';
import { connectSchool, SchoolError } from '@/lib/server/school';
import type { LmsSnapshot } from '@/lib/data/lms';

// 학교 비밀번호 재인증으로 COSMOS 수집을 다시 실행한다. 비밀번호는 검증 후
// 즉시 버리며 저장하지 않는다. 세션과 계정 데이터는 유지된다.
export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  if (Number(request.headers.get('content-length') || 0) > 4096)
    return json({ error: '입력 크기를 초과했습니다.' }, 413);
  try {
    const account = await authenticated(request);
    if (!account) return json({ error: '로그인이 필요합니다.' }, 401);
    const raw = await request.text();
    if (raw.length > 4096)
      return json({ error: '입력 크기를 초과했습니다.' }, 413);
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
    const id = await hash('hansung:' + input.studentId);
    if (id !== account.id)
      return json({ error: '연결된 계정의 학번을 입력해 주세요.' }, 403);
    if (await limited('refresh:' + account.id, 3))
      return json(
        { error: '재수집 시도가 많습니다. 15분 후 다시 시도해 주세요.' },
        429,
      );
    let deferredCollect: (() => Promise<LmsSnapshot>) | undefined;
    const snapshot = await connectSchool(input.studentId, input.password, {
      deferLms: (collect) => {
        deferredCollect = collect;
      },
    });
    input.password = '';
    if (deferredCollect) snapshot.lmsPending = true;
    // 이번 수집이 실패/진행 중이면 이전 수집본을 보존한다
    if (!snapshot.lmsData) {
      try {
        const old = JSON.parse(account.snapshot) as {
          lmsData?: LmsSnapshot;
        };
        if (old.lmsData) snapshot.lmsData = old.lmsData;
      } catch {
        /* 이전 스냅샷 손상은 무시 */
      }
    }
    await database()
      .prepare('UPDATE academic_accounts SET snapshot = ? WHERE id = ?')
      .bind(JSON.stringify(snapshot), account.id)
      .run();
    if (deferredCollect)
      waitUntil(
        (async () => {
          try {
            const lmsData = await deferredCollect();
            await database()
              .prepare(
                "UPDATE academic_accounts SET snapshot = json_patch(snapshot, ?) WHERE id = ? AND json_extract(snapshot, '$.checkedAt') = ?",
              )
              .bind(
                JSON.stringify({ lmsData, lmsPending: null }),
                account.id,
                snapshot.checkedAt,
              )
              .run();
          } catch (e) {
            console.log(
              '[lms] deferred collect failed:',
              e instanceof Error ? e.message : String(e),
            );
            try {
              await database()
                .prepare(
                  "UPDATE academic_accounts SET snapshot = json_patch(snapshot, ?) WHERE id = ? AND json_extract(snapshot, '$.checkedAt') = ?",
                )
                .bind(
                  JSON.stringify({
                    lmsPending: null,
                    lmsFailedAt: new Date().toISOString(),
                  }),
                  account.id,
                  snapshot.checkedAt,
                )
                .run();
            } catch {
              /* 마커 기록 실패도 재수집 성공 여부에 영향을 주지 않는다 */
            }
          }
        })(),
      );
    const row = await database()
      .prepare('SELECT * FROM academic_accounts WHERE id = ?')
      .bind(account.id)
      .first<AccountRow>();
    return json(accountView(row!));
  } catch (error) {
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
  }
}
