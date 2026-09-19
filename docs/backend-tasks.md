# BE 업무 패키지 — 팀원 핸드오프

한성 학사 도우미 백엔드 작업 목록. 우선순위순, 각 작업은 독립 커밋/PR 가능.

## 프로젝트 컨텍스트

- **스택**: Cloudflare Workers + D1(SQLite), Vinext/Vite + React 19 + TS.
  백엔드 코드 = `app/api/**/route.ts`(라우트) + `lib/server/`(공유 로직) +
  `drizzle/*.sql`(마이그레이션).
- **로컬 검증**: `npm run build && npm run start` → `http://127.0.0.1:8787`
  (D1 바인딩). `dist` 삭제 시 로컬 DB 초기화 → 마이그레이션 재적용:
  `npx wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --file drizzle/0000_academic_accounts.sql`
- **게이트**: `npx tsc --noEmit` · `npx oxlint app/ lib/` ·
  `python tests/http-check.py` · `python tests/account-db.py` · `npm run build`
- **Windows 주의**: 경로에 한글(학사 도우미) 있음 — cmd/PowerShell 인라인
  명령이 한글 경로에서 깨짐. 파일 작업은 도구/스크립트 파일로.
  좀비 `workerd.exe`가 `dist` 잠그면 `taskkill /F /PID <pid>`.

## 아키텍처 사실 (작업 전 필독)

- **학교 인증**: `app/api/account/login/route.ts` → `connectSchool()`
  (`lib/server/school.ts`). 학번+비밀번호로 info.hansung.ac.kr 로그인 후
  **같은 세션으로 learn.hansung.ac.kr(COSMOS)도 로그인** — 쿠키 jar는
  `SchoolSession` 안에서만 존재하고 응답 후 폐기. 비밀번호는
  `input.password = ''`로 즉시 지우며 **절대 저장 금지**.
- **D1**: `academic_accounts(id, student_mask, profile, snapshot, onboarded,
  created_at, consent_at)` / `academic_sessions(token_hash, account_id,
  expires_at)` / `academic_login_limits(key, attempts, expires_at)`.
  - `snapshot` 컬럼: `connectSchool` 결과(SchoolSnapshot — LMS 과목 목록,
    lms connected/unavailable, checkedAt)를 통째로 JSON 저장.
  - `profile` 컬럼: 사용자 데이터 JSON blob — PUT /api/account/profile이
    필드 화이트리스트+검증(200KB 한도) 후 통째 덮어씀.
- **공개 스냅샷**: `/api/courses|activities|schedule|dept-rules`는 D1
  `public_snapshots` 우선 읽기 + `lib/data/*.json` 폴백(60초 아이솔레이트
  캐시, `lib/server/snapshots.ts`). 게시는
  `scripts/_publish_snapshots.mjs`로 remote D1에 직접 — 재배포 없이 갱신.
  D1보다 번들이 새로우면 번들 우선. **학교 사이트 실시간 요청은 사용자
  요청 경로에 없음**(로그인·재수집 제외) — 이 원칙 유지.
- **LMS 수집**: 로그인·재수집 시 서버가 COSMOS를 직접 수집
  (`lib/server/lms.ts`, `waitUntil` 지연 수집 → D1 json_patch). 결과는
  `SchoolSnapshot.lmsData`에 저장. 진행 상태는 `lmsPending`(수집 중)과
  `lmsFailedAt`(실패 시각) 마커로 표현 — 클라이언트는 이 마커로 폴링
  종료/실패 표시를 결정. 수동 경로 `public/lms-collect.js`(콘솔 스크립트
  → JSON 업로드)는 폴백으로 유지. 퀴즈 응시 확인 실패는 `submitted:false`
  가 아니라 `uncertain`+`errors:['quiz-check']`로 표현 — 미응시 단정 금지.
- **Workers 제약**: `DOMParser` 없음 — 서버 파싱은 `HTMLRewriter` 또는
  정규식(`school.ts`의 `parseCourses` 참조). `crypto.subtle` 사용 가능.

## 보안 규칙 (모든 작업 공통)

- 학번/비밀번호/학교 세션 쿠키 **저장·로깅·응답 반환 금지**.
- `validOrigin`(origin+content-type 검사)와 `authenticated()`는 모든
  인증 라우트에서 재사용.
- 요청 body 한도 명시(현재 패턴: login 4KB, profile 200KB).
- 실패는 조용히 넘기지 말고 부분 실패/오류 상태로 표면화.

---

## BE-1: 로그인 시 서버 측 COSMOS 수집 (최우선) ✅ 완료 (2026-09-18, 검증 09-19)

- **구현 상태**: `lib/server/lms.ts` + `school.ts`의 `connectSchool` 연동
  완료 (정규식 파서 방식 선택, 수집 예산 24s, 부분 실패 errors[] 보존).
  `SchoolSnapshot.lmsData` → 클라이언트가 최신 fetchedAt 기준 `data.lms`
  승격. 실계정 end-to-end 검증 완료(7개 과목 수집·매칭 확인).
- **수집 상태 마커(추가)**: 지연 수집 시작 시 `lmsPending=true`, 성공 시
  `lmsData` 기록+해제, 실패 시 `lmsFailedAt` 기록 — 실패 시에도 영구
  "수집 중"으로 남지 않음. checkedAt 가드로 이전 지연 쓰기가 새
  스냅샷을 덮지 않음. 비밀번호 재인증 재수집:
  `POST /api/account/lms-refresh`(세션 유지, 학번 해시 일치 검증,
  3회/15분 레이트리밋). 새 수집 실패 시 이전 lmsData 보존.
- **배경**: ISSUE-23은 브라우저 수동 수집 — 사용자가 콘솔에 스크립트를
  붙여넣어야 함. 그런데 `connectSchool`은 이미 COSMOS 세션을 로그인 시점에
  확보하고 대시보드 HTML에서 과목 목록까지 파싱함. 같은 세션으로 나머지
  페이지도 가져오면 **로그인 한 번으로 수업 현황 자동 완성** — 수동
  스크립트 경로는 백업으로 유지.
- **작업**:
  - `lib/server/school.ts`의 `SchoolSession`으로 과목별 페이지 수집:
    `/mod/assign/index.php?id=`, `/mod/quiz/index.php?id=`(+
    `quizattemptsummary` 제출 판정), `/report/ubcompletion/user_progress[_a].php?id=`,
    `/course/view.php?id=` (수강기간/VOD 링크).
  - `lib/data/lms.ts`의 `LmsSnapshot`/`LmsCourse` 형식으로 `SchoolSnapshot`
    확장 (`lmsData?: LmsSnapshot` 필드) → snapshot 컬럼에 같이 저장.
  - DOM 파싱은 Workers 호환으로: `HTMLRewriter` 스트리밍 파서 또는
    제한된 정규식 — 셀렉터 계약은 `public/lms-collect.js` 참조 (동일
    페이지 구조).
  - 로그인 지연 제어: 과목×4페이지를 bounded-parallel로, 전체 수집
    타임박스(예: 20초) — 초과 시 부분 결과 + `errors` 기록. 또는 응답 후
    `ctx.waitUntil`로 비동기 수집→D1 갱신(세션이 살아있는 동안만 가능 —
    `SchoolSession`은 요청 스코프라 즉시 수집이 단순·안전).
  - `Promise.allSettled`로 부분 실패 보존.
- **수용 기준**: 로그인 응답의 snapshot에 과목별 vods/assigns/quizzes
  포함; 수집 실패 항목은 errors로 표기, 로그인 자체는 유지; 수업 현황
  UI가 `account.snapshot.lmsData`를 우선 사용(파일 가져오기는 보강 수단).
- **주의**: 학교 서버 부하 — 한 로그인당 수십 요청. 병렬도 제한(예: 4),
  타임아웃(요청당 15초 기존 패턴) 유지. 반복 로그인 유도하지 않기
  (레이트리밋과 충돌 주의).

## BE-2: LMS 스냅샷 재수집 경로 설계 ✅ 1차 구현 (비밀번호 재인증 방식)

- **결정**: 선택지 1+α — 비밀번호를 저장하지 않고 **사용자가 재입력한
  비밀번호로 즉시 재인증**해 수집. `POST /api/account/lms-refresh`:
  세션 인증 → 입력 학번 해시가 계정 id와 일치 확인(타인 계정 재수집
  불가) → `refresh:` 레이트리밋(3회/15분) → `connectSchool` 재실행 →
  지연 수집·마커·이전 lmsData 보존은 로그인 경로와 동일. 학교 세션
  쿠키/비밀번호 저장 없음 — 보안 규칙 유지하면서 "재로그인 말고
  갱신" UX 확보.
- **남은 선택지(미구현)**: 클라이언트 측 자격증명 보관(확장/로컬) 후
  자동 갱신 — UX는 더 좋지만 브라우저 저장 설계가 별도 필요. 현재는
  수동 재인증만.
- **주의**: 재수집 남용은 Moodle 부하 — 레이트리밋으로 억제. 재수집
  폼은 `LmsSection`의 `RefreshForm`(연결된 계정의 마스킹 학번 힌트 표시).

## BE-3: 공개 스냅샷 D1 이관 + 갱신 파이프라인 ✅ 완료

- **구현**: `public_snapshots(kind, part, payload, fetched_at, updated_at)`
  — 단일 INSERT가 D1 문장 크기 제한(약 100KB)을 넘어 60K자 part 청크로
  분할 저장·재조립. `lib/server/snapshots.ts`가 D1 우선 읽기(60초
  아이솔레이트 캐시) + 번들 JSON 폴백 + D1이 더 오래됐으면 번들 우선.
  라우트 4개(`courses|activities|schedule|dept-rules`) 모두 경유.
- **게시 경로**: `python` → `node scripts/_publish_snapshots.mjs` —
  JSON 형식 검증 후 remote D1 INSERT. **재배포 없이 데이터 갱신 가능**.
  크롤러(`scripts/crawl-*.mts`)로 로컬 JSON 갱신 후 게시 2단계.
- **남은 것**: Workers Cron Trigger 자동 수집 — Worker→학교 서버
  도달성이 미검증(hsportal이 CF 데이터센터 IP를 차단할 수 있음).
  확인되면 주기 자동 갱신 추가.

## BE-4: 프로필 검증 모듈화

- **배경**: `profile/route.ts`의 필드별 수동 검증이 비대(140줄) — `lms`
  추가로 더 커짐. `validateLms` 패턴을 전 필드로 확장해
  `lib/data/profile-schema.ts`로 추출 → 라우트·클라이언트·테스트 공유.
- **수용 기준**: 동작 동일(기존 거부 케이스 유지), 필드 추가 시 한 곳만
  수정, fixture 테스트 추가.

## BE-5: 보안/운영 하드닝

- 세션: 만료 세션 정리 주기화(현재 로그인 시 삭제에 의존 — Cron 또는
  정리 쿼리), 세션 회전(장기 사용 시 재발급), 계정 삭제 시 연관 데이터
  정리 검증(account-db 테스트 확장).
- 헤더: 라우트별 수동 지정 중 — 공통 미들웨어로 CSP/Referrer-Policy/
  Permissions-Policy 일괄 적용 검토(정적 에셋/외부 링크와 충돌 주의).
- `validOrigin`: Origin 없는 same-origin 요청(일부 브라우저/도구) 거부
  정책 재검토 + Referer 폴백 여부 결정.
- http-check에 위 항목 회귀 테스트 추가.

## BE-6: 배포/원격 D1 ✅ 완료 (2026-09-18)

- **라이브**: `https://hansung-helper.gyeongbin-38.workers.dev`
  (워커 `hansung-helper`, 버전 `02bc60c9-afa2-438d-8b81-f34f2ab77177`)
- 원격 D1 `site-creator-d1` 생성됨 — database_id
  `27aa326b-5433-4bcb-bc38-1b63bd66f67b` (APAC), 마이그레이션 적용 완료.
- workers.dev 서브도메인: `gyeongbin-38` (계정 등록됨).
- **재배포 절차**: `published-personal`에서 `npm run build` →
  `python scripts/_deploy.py` (생성 wrangler.json의 placeholder DB ID와
  워커명을 실값으로 패치 후 `wrangler deploy` 실행).
- 검증: `/`, `/lms-collect.js`, `/api/courses|schedule|dept-rules|activities`
  전부 200 (`scripts/_verify_prod.py`).
- 잔여 수동 검증: 원격에서 실제 회원가입→프로필 저장→재로그인 한 바퀴.

---

## 추천 진행 순서

BE-1 → BE-3 → BE-5 순이 사용자 가치 대비 효율적. BE-2는 설계 결정이
선행 필요(보안 트레이드오프). BE-4/BE-6은 독립적 — 언제든.

작업 중 발견한 사항은 `docs/agent/BACKLOG.md`에 기록 (에이전트 루프가
추적). 질문: repo 루트의 `AGENTS.md` 운영 메모 + `docs/agent/RUNLOG.md`
이력 참조.
