# 한성 학사 도우미 — 운영 메모

## 로컬 실행
- `npm run dev` → vinext dev (보통 :3000/:3001). **D1 미바인딩 — 로그인·저장 불가, 체험 모드만 동작**
- `npm run build && npm run start` → wrangler dev on **http://127.0.0.1:8787** (D1 바인딩, 전체 기능 동작)

## 로컬 D1 주의
- 로컬 D1 state는 `dist/server/.wrangler/state/` 안에 생성됨 → **`dist` 삭제/재빌드 시 DB 초기화됨**
- 재빌드 후 계정 기능 사용 전에 마이그레이션 재적용:
  `npx wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --file drizzle/0000_academic_accounts.sql`
- 좀비 `workerd.exe`가 `dist`를 잠그면: `tasklist`로 PID 확인 → `taskkill /F /PID <pid>` 후 삭제

## 검증 명령
- `npx tsc --noEmit` / `npx oxlint app/ lib/` / `npm run build`
- `node --experimental-strip-types tests/catalog.test.mjs`
- `node --experimental-strip-types tests/activities.test.mjs`
- `node --experimental-transform-types tests/school.test.mjs` (parameter property 사용 — strip-types로는 실패)
- `python tests/account-db.py`, `python tests/http-check.py` (8787 서버 필요)

## 사용자 DB (D1: site-creator-d1, binding `DB`)
- 테이블: `academic_accounts` / `academic_sessions` / `academic_login_limits` (drizzle/0000_academic_accounts.sql)
- 로컬 조회: `npx wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --command "SELECT ..."`
- 리모트 조회: 동일 명령 + `--remote` (Cloudflare 계정 인증 필요 — needs-human)
- 또는 Cloudflare 대시보드 → D1 → site-creator-d1 → SQL Editor

## 데이터
- 강의 카탈로그: `scripts/import-courses.py` → `lib/data/catalog-2026-2.json` → `GET /api/courses` (로컬 데이터만, 학교 사이트 실시간 요청 없음)
- 비교과: `node --experimental-strip-types scripts/crawl-activities.mts` → `lib/data/activities.json` → `GET /api/activities` (hsportal 공개 목록)
- 학사일정: `node --experimental-strip-types scripts/crawl-schedule.mts` → `lib/data/schedule.json` → `GET /api/schedule` (hansung.ac.kr 공식 학사일정, month/year2 POST)
- 크롤러 공통: 이상 감지(급감) 시 기존 스냅샷 유지, 사용자 요청 경로에서 라이브 수집 없음
- 원본 xlsx: `data/source/` (재임포트용)
- 배포 소스: `published-personal/` (별도 git repo) — 루트 변경 후 동기화 + 독립 빌드 필요
