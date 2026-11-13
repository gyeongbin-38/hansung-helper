# 한성 학사 도우미 — 운영 메모

## 로컬 실행
- 팀 공통 `npm run dev:backend` → 빌드, 로컬 전용 키 준비, 세 D1 마이그레이션 후 8787 실행. 기존 `.dev.vars` 키는 교체하지 않는다.
- `npm run dev` → vinext dev (보통 :3000/:3001). **D1 미바인딩 — 로그인·저장 불가, 체험 모드만 동작**
- `npm run build && npm run start` → wrangler dev on **http://127.0.0.1:8787** (D1 바인딩, 전체 기능 동작)
- **경로에 공백이 있으면 wrangler dev가 정적 에셋(`/_next/*`)을 404로 내고 서버 설정 해석에 실패한다** (Windows workerd 제약, 한글은 무관) — `C:\Temp`처럼 공백 없는 위치로 복사하거나 `mklink /J C:\hs-link "<워크스페이스>"` junction을 만들어 그쪽에서 실행

## 로컬 D1 주의
- 로컬 D1 state는 `dist/server/.wrangler/state/` 안에 생성됨 → **`dist` 삭제/재빌드 시 DB 초기화됨**
- 재빌드 후 계정 기능 사용 전에 마이그레이션 재적용:
  `npm run d1:migrate:local` (0000 계정 + 0001 공개 스냅샷 + 0002 학교 세션 볼트)
- 좀비 `workerd.exe`가 `dist`를 잠그면: `tasklist`로 PID 확인 → `taskkill /F /PID <pid>` 후 삭제
- `_publish_snapshots.mjs --local`은 `wrangler dev`를 멈춘 뒤 실행할 것 — dev 서버가 켜진 채 workerd를 강제 종료하면 로컬 D1의 스냅샷 행이 날아간다. 로컬 SQL 문장 한도는 ~100KB 바이트라 스크립트가 80KB 바이트 청크·kind 단위 배치 파일로 나눠 넣는다.
- 과거 학기 카탈로그·교육과정(`lib/data/history/`)은 gitignore된 D1 게시용 생성물 — API는 `snapshotGetOnly`(번들 폴백 없음)로 읽고 D1에 없으면 404

## 검증 명령
- `npx tsc --noEmit` / `npx oxlint app/ lib/` / `npm run build`
- `node --experimental-strip-types tests/catalog.test.mjs`
- `node --experimental-strip-types tests/activities.test.mjs`
- `node --experimental-transform-types tests/school.test.mjs` (parameter property 사용 — strip-types로는 실패)
- `node --experimental-transform-types tests/lms-server.test.mjs` (서버 LMS 파서)
- `node --experimental-transform-types tests/info.test.mjs` (종합정보 수집 파서)
- `node --experimental-strip-types tests/calendar.test.mjs` (캘린더 그리드·ICS)
- `python scripts/_run_tests.py` (전체 매트릭스)
- 실계정 COSMOS 검증: `node --experimental-transform-types scripts/cosmos-live.mts`
  - **종합정보는 로그인 10회 실패 시 비밀번호를 초기화한다** — 실계정 로그인 반복 시도 금지. 거부 시 `?pwrechk=N` 없이 `/`로만 302되는 경우도 있다(자격 거부로 간주하고 재시도하지 않는다)
  - 에이전트 셸은 Windows cmd — 환경변수는 `set "COSMOS_ID=..." && node ...` 형식, `;` 체이닝 불가
- 화면 QA: `npx vite dev --host 127.0.0.1 --port 4339 --strictPort`(vinext dev의 `--hostname`은 미지원) + puppeteer-core는 gitignore된 `work/` 아래에 따로 설치해 사용
- `python tests/account-db.py`, `python tests/http-check.py` (8787 서버 필요)
- 브라우저 E2E: `npm run test:e2e` (Playwright, `tests/e2e/`). 선행 조건: `npm run build && node scripts/setup-local.mjs && npm run d1:migrate:local` — 재빌드하면 `dist/server/.dev.vars`와 로컬 D1이 지워지므로 순서를 지킨다. CI는 `e2e.yml`이 같은 단계를 자동 수행

## 사용자 DB (D1: site-creator-d1, binding `DB`)
- 테이블: `academic_accounts` / `academic_sessions` / `academic_login_limits` (`drizzle/0000_academic_accounts.sql`) + `public_snapshots` (`drizzle/0001_public_snapshots.sql`) + `school_session_vault` (`drizzle/0002_school_session_vault.sql`). 세 마이그레이션은 journal에 등록되어 있으며 게시 스크립트는 테이블을 DROP하지 않는다.
- 로컬 조회: `npx wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --command "SELECT ..."`
- 리모트 조회: 동일 명령 + `--remote` (published-personal에서 실행; wrangler OAuth 로그인됨)
- 백업: `npm run d1:backup:local` 또는 소유자 승인 후 `HANSUNG_D1_DATABASE_ID` 설정 + `npm run d1:backup:remote`; 백업은 gitignore된 `.d1-backups/`에 저장
- 복구 연습: `npm run d1:restore:rehearsal -- .d1-backups/<backup>.sql` (격리된 로컬 DB만 대상)
- 또는 Cloudflare 대시보드 → D1 → site-creator-d1 → SQL Editor

## 데이터
- AI 상담·사용 안내: `#advisor`, `POST /api/advisor`. Workers AI 바인딩을 사용하며 개인 학사 요약은 선택 시에만 사용한다. 계정별·일별 호출 제한과 세션 재확인을 유지한다. `docs/ai-advisor.md` 참고.
- COSMOS 수집 경로 3개: ① 로그인 시 서버 자동 수집(`lib/server/lms.ts`) ② **`extension/` 크롬 확장**(chrome://extensions → 개발자 모드 → 압축해제된 확장 로드 — **앱 열 때 자동 수집**(background 워커가 LMS 탭에서 `__hsCollect` 실행 → postMessage) + LMS 페이지 수집 버튼 + 4h 주기 수집, 가장 견고) ③ `public/lms-collect.js` 콘솔 붙여넣기(백업)
- 확장은 LMS와 프로덕션 앱 도메인에만 접근한다. 학사 스냅샷은 브라우저 세션 메모리에만 저장되며 브라우저 종료 시 지워진다.
- 강의 카탈로그: `scripts/import-courses.py --semester YYYY-S --source <xlsx>` → `lib/data/catalog-YYYY-S.json` → `GET /api/courses?semester=YYYY-S` (로컬 데이터만, 자료 없는 학기는 404)
- 비교과: `node --experimental-strip-types scripts/crawl-activities.mts` → `lib/data/activities.json` → `GET /api/activities` (hsportal 공개 목록)
- 학사일정: `node --experimental-strip-types scripts/crawl-schedule.mts` → `lib/data/schedule.json` → `GET /api/schedule` (hansung.ac.kr 공식 학사일정, month/year2 POST)
- 크롤러 공통: 이상 감지(급감) 시 기존 스냅샷 유지, 사용자 요청 경로에서 라이브 수집 없음
- 원본 xlsx: `data/source/` (재임포트용)
- **스냅샷 게시**: `node scripts/_publish_snapshots.mjs --remote` 또는 명시적 로컬 `--local`; 원격은 `HANSUNG_D1_DATABASE_ID` 필요. 별도 세대에 청크를 적재한 뒤 활성 포인터를 교체하며 구 버전 행도 보존한다. API는 D1 우선+번들 폴백이며 `lib/server/snapshots.ts`가 60초 아이솔레이트 캐시 + fetched_at 비교로 처리. 이전 세대는 자동 삭제하지 않으므로 D1 용량을 관찰한다.
- GitHub Actions: 매일 03:30 KST 공개 스냅샷 갱신, 15분마다 API·신선도 점검. 갱신 워크플로는 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `HANSUNG_D1_DATABASE_ID` 저장소 Actions secrets가 필요하다. 실패는 중복 방지 GitHub 이슈로 알림
- 배포 소스: `published-personal/` (별도 git repo) — 루트 변경 후 동기화 + 독립 빌드 필요

## 프로덕션 (2026-09-18부터 라이브)
- **URL**: https://hansung-helper.gyeongbin-38.workers.dev (워커 `hansung-helper`)
- Cloudflare 계정·데이터베이스 식별자와 비밀값은 저장소에 기록하지 않고 소유자 대시보드에서 확인한다.
- 계정·로그인 IP 인덱스는 `ACCOUNT_INDEX_HMAC_KEY`로 HMAC 처리한다. 로컬 `.dev.vars` 또는 Worker 비밀값으로 32바이트 이상의 무작위 키를 설정하고, 계정 ID 마이그레이션 없이 키를 교체하지 않는다.
- 원격 D1 `site-creator-d1` (APAC), 마이그레이션 적용됨
- **학교 세션 볼트**: 로그인 성공 시 학교 세션 쿠키만 `SCHOOL_SESSION_KEY`(32바이트 이상, `ACCOUNT_INDEX_HMAC_KEY`와 별도)로 AES-GCM 암호화해 `school_session_vault`에 보관(기본 2시간, '자동 연결 유지' 선택 시 최대 3일, 서버 상한 `VAULT_MAX_TTL_MS`). 비밀번호는 저장하지 않는다. `POST /api/account/lms-refresh-session`이 비밀번호 없이 재수집하고, 로그아웃·계정 삭제·만료 시 삭제. 상세: `docs/session-vault.md`
- **재배포**: Worker secret `ACCOUNT_INDEX_HMAC_KEY`·`SCHOOL_SESSION_KEY`와 배포 환경의 `HANSUNG_D1_DATABASE_ID`를 먼저 설정한 뒤 `published-personal`에서 `npm run build` → `python scripts/_deploy.py`
  (생성된 wrangler.json의 placeholder DB ID·워커명을 배포 설정으로 패치 후 `wrangler deploy` 실행 — 매 빌드 후 재패치 필수)
- **프로덕션 검증**: `python scripts/_verify_prod.py` (HTTP·콘텐츠 형식·필수 데이터·응답 envelope 확인)
- `/api/health`는 계정 HMAC 키와 계정 DB 테이블 준비 상태도 확인한다. 키 누락·DB 접근 실패 시 503이며, 공개 데이터 API의 200 또는 비로그인 `/api/account`의 401만으로 로그인 정상 여부를 판단하지 않는다.
- `_deploy.py`는 기존 Worker의 `ACCOUNT_INDEX_HMAC_KEY` 이름을 확인한 뒤 배포한다. 기존 키를 교체하지 않는다. `_sync.py`는 Git에서 추적하는 `_` 접두사 운영 스크립트도 명시적으로 동기화한다.
- GitHub: `gyeongbin-38/hansung-helper` (public, master) / `hansung-helper-deploy` (private, master)

## 커밋/PR 규칙 (에이전트 포함 전원)
- **master 직접 push 금지** — `feat/` `fix/` 브랜치 → PR (머지 조건: CI 통과 + 리뷰)
- 커밋 전 로컬 검증 필수: `npx tsc --noEmit` → `npx oxlint app/ lib/` → `python scripts/_run_tests.py` → `npm run build`
- **AI 생성 커밋은 검증 실행 없이 push 금지** — 실행 결과를 PR 본문에 명시
- CI(`.github/workflows/ci.yml`)가 push/PR마다 동일 항목 재검증 → PR Checks 탭 확인
- 시크릿·lms-data.json·dist 커밋 금지, prod D1 수정·deploy는 소유자 전용 — 상세: CONTRIBUTING.md
