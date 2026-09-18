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
- **공개 스냅샷**: `/api/courses|activities|schedule|dept-rules`는 모두
  `lib/data/*.json` 정적 파일 서빙(`Cache-Control: public`) — 크롤러
  (`scripts/crawl-*.mts`)가 수동 실행해 갱신. **학교 사이트 실시간 요청은
  사용자 요청 경로에 없음**(로그인 제외) — 이 원칙 유지.
- **LMS 수집(현재)**: `public/lms-collect.js` — 사용자가 COSMOS 페이지
  콘솔에서 실행해 `lms-data.json` 다운로드 → 수업 현황 섹션에서 업로드.
  스냅샷 형식 `lib/data/lms.ts`의 `LmsSnapshot`. 로그인 정보는 브라우저
  밖으로 안 나감. 돋부기(hs-shell/dotbugi) 셀렉터 계약 사용.
- **Workers 제약**: `DOMParser` 없음 — 서버 파싱은 `HTMLRewriter` 또는
  정규식(`school.ts`의 `parseCourses` 참조). `crypto.subtle` 사용 가능.

## 보안 규칙 (모든 작업 공통)

- 학번/비밀번호/학교 세션 쿠키 **저장·로깅·응답 반환 금지**.
- `validOrigin`(origin+content-type 검사)와 `authenticated()`는 모든
  인증 라우트에서 재사용.
- 요청 body 한도 명시(현재 패턴: login 4KB, profile 200KB).
- 실패는 조용히 넘기지 말고 부분 실패/오류 상태로 표면화.

---

## BE-1: 로그인 시 서버 측 COSMOS 수집 (최우선)

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

## BE-2: LMS 스냅샷 재수집 경로 설계

- **배경**: 로그인 세션은 일회성 — 이후 데이터 갱신은 재로그인 필요.
  브라우저 수집 파일 업로드는 이미 있음(profile.lms). 서버 재수집을
  하려면 자격 증명이 필요한데 **비밀번호 저장은 금지** — 설계 선택지를
  정하는 게 이 작업의 핵심.
- **선택지** (택1 또는 조합, 장단 정리 후 구현):
  1. 수동 갱신만: "최신화하려면 재로그인" UX + 브라우저 수집 병행 (구현 0)
  2. 세션 수명 연장: 우리 세션 24h 내에 학교 쿠키도 유효할 때 갱신
     엔드포인트 — 학교 세션 쿠키를 서버가 보관해야 함 → **저장 금지 규칙과
     충돌, 별도 검토 필요**
  3. 리프레시 토큰: 비밀번호를 D1에 저장하는 대신 클라이언트 측(확장/
     로컬) 보관 후 갱신 시 전송 — 브라우저 저장이라 서버는 여전히 무저장
- **수용 기준**: 선택 근거 문서화 + 구현 시 보안 규칙 준수. 2번 선택 시
  반드시 암호화/만료/삭제 경로 포함.

## BE-3: 공개 스냅샷 D1 이관 + 갱신 파이프라인

- **배경**: courses/activities/schedule/dept-rules가 빌드 산출물 속 JSON —
  학교 페이지 변경 반영에 재빌드·재배포 필요.
- **작업**: `snapshots(key TEXT PK, payload TEXT, fetched_at INTEGER)`
  테이블(마이그레이션 추가) → 라우트가 D1 우선·JSON 폴백 읽기 →
  수집 결과를 받는 `PUT /api/snapshots/:key`(관리자 시크릿 헤더 인증) →
  크롤러(`scripts/crawl-*.mts`)가 로컬에서 주기 실행·POST. Workers Cron
  Trigger로 서버 측 주기 수집도 가능(학교 부하·robots 고려해 빈도 제한).
- **수용 기준**: D1 없을 때 기존 JSON으로 동일 응답; 갱신 후 즉시 반영;
  잘못된 페이로드 거부(형식 검증 재사용); Cache-Control 정책 유지.

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
