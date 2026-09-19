import { waitUntil } from 'cloudflare:workers';
import {
  accountView,
  database,
  hash,
  json,
  limited,
  sessionCookie,
  validOrigin,
  type AccountRow,
} from '@/lib/server/account';
import { connectSchool, SchoolError } from '@/lib/server/school';
import type { LmsSnapshot } from '@/lib/data/lms';
export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  if (Number(request.headers.get('content-length') || 0) > 4096)
    return json({ error: '입력 크기를 초과했습니다.' }, 413);
  try {
    const raw = await request.text();
    if (raw.length > 4096)
      return json({ error: '입력 크기를 초과했습니다.' }, 413);
    const input = JSON.parse(raw);
    if (!input || typeof input !== 'object')
      return json(
        { error: '학번, 비밀번호와 정보 조회·보관 동의를 확인해 주세요.' },
        400,
      );
    if (
      typeof input.studentId !== 'string' ||
      !/^\d{6,10}$/.test(input.studentId) ||
      typeof input.password !== 'string' ||
      input.password.length < 1 ||
      input.password.length > 128 ||
      input.agreed !== true
    )
      return json(
        { error: '학번, 비밀번호와 정보 조회·보관 동의를 확인해 주세요.' },
        400,
      );
    const id = await hash('hansung:' + input.studentId);
    const ip = await hash(
      'ip:' + (request.headers.get('cf-connecting-ip') || 'unknown'),
    );
    await database().batch([
      database()
        .prepare('DELETE FROM academic_sessions WHERE expires_at < ?')
        .bind(Date.now()),
      database()
        .prepare('DELETE FROM academic_login_limits WHERE expires_at < ?')
        .bind(Date.now()),
    ]);
    if ((await limited(ip, 20)) || (await limited(id, 3)))
      return json(
        { error: '로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.' },
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
    // 새 스냅샷에 lmsData가 없으면(이번 수집 실패/진행 중) 이전 수집본을
    // 보존한다 — fetchedAt이 기준 시각을 그대로 보여주므로 신선도는 유지.
    if (!snapshot.lmsData) {
      const prior = await database()
        .prepare('SELECT snapshot FROM academic_accounts WHERE id = ?')
        .bind(id)
        .first<{ snapshot: string }>();
      try {
        const old = prior?.snapshot
          ? (JSON.parse(prior.snapshot) as {
              lmsData?: LmsSnapshot;
            })
          : null;
        if (old?.lmsData) snapshot.lmsData = old.lmsData;
      } catch {
        /* 이전 스냅샷 손상은 무시 */
      }
    }
    const studentMask =
      input.studentId.slice(0, 2) +
      '•'.repeat(input.studentId.length - 4) +
      input.studentId.slice(-2);
    await database()
      .prepare(
        "INSERT INTO academic_accounts (id, student_mask, profile, snapshot, onboarded, created_at, consent_at) VALUES (?, ?, '{}', ?, 0, ?, ?) ON CONFLICT(id) DO UPDATE SET snapshot = excluded.snapshot, consent_at = excluded.consent_at",
      )
      .bind(id, studentMask, JSON.stringify(snapshot), Date.now(), Date.now())
      .run();
    await database()
      .prepare('DELETE FROM academic_login_limits WHERE key = ?')
      .bind(id)
      .run();
    const token = [...crypto.getRandomValues(new Uint8Array(32))]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
    await database()
      .prepare(
        'INSERT INTO academic_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)',
      )
      .bind(await hash(token), id, Date.now() + 86400000)
      .run();
    const row = await database()
      .prepare('SELECT * FROM academic_accounts WHERE id = ?')
      .bind(id)
      .first<AccountRow>();
    // LMS 상세 수집(과목당 4페이지)은 응답 후에 진행 — 완료되면 스냅샷의
    // lmsData만 병합. checkedAt 가드로 이전 로그인의 지연 쓰기가 새
    // 스냅샷을 덮지 않게 한다.
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
                id,
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
                  id,
                  snapshot.checkedAt,
                )
                .run();
            } catch {
              /* 마커 기록 실패도 로그인 성공에 영향을 주지 않는다 */
            }
          }
        })(),
      );
    return json(accountView(row!), 200, { 'Set-Cookie': sessionCookie(token) });
  } catch (error) {
    if (error instanceof SyntaxError)
      return json({ error: '입력 형식을 확인해 주세요.' }, 400);
    if (error instanceof SchoolError && error.code === 'credentials')
      return json(
        {
          error:
            '학교 로그인을 확인하지 못했습니다. 학번과 비밀번호를 확인해 주세요. 반복 시도는 피해주세요.',
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
