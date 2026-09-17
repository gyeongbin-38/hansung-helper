# Agent Run Log

Each autonomous session appends one entry here using the required
end-of-run format. Next session: read this + BACKLOG.md first, verify
`needs-verification` items before starting new work.

---

## 2026-09-17 — loop iteration (Devin/Paseo session)

DONE:
- Consolidated the prior session's uncommitted work into commit b304e21
  (ISSUE-1/3/4 verified code: catalog, timetable builder, graduation v0,
  dept normalization, sections/styles split).
- Verified ISSUE-4 as independent fresh session → PASS (unmatched dept
  shows "학과 매칭 확인 필요", never wrong results).
- ISSUE-7 implemented: deleted unused starter kit (components/ ~90
  files, hooks/, components.json, lib/utils.ts) in both repos; pruned
  14 starter-only deps; root tsconfig now excludes published-personal/
  (it was silently type-checking the nested repo against root paths).
- ISSUE-8 implemented: replaced 2 vacuous assertions with pinned
  outcomes (AI융합 → unresolved; 융합 → exactly 2 candidates).
- ISSUE-2 implemented (snapshot variant): hsportal public list is
  server-rendered → plain-HTTP crawler scripts/crawl-activities.mts →
  lib/data/activities.json (39 items) → GET /api/activities →
  activities.tsx rewired (real covers, status tabs, provenance).
- ISSUE-11 implemented: advisor answers from real plan/catalog/
  activity data; free-text keyword search returns routable hits.
- Fixed _sync.py: /XO /XN /XC meant it never copied modified files —
  deploy repo was silently stale. Now /MIR mirroring. Also stopped
  cloudflared.exe leaking into the deploy repo.
- Both repos committed; published-personal rebuilt independently.

IN PROGRESS: nothing — working tree clean in both repos.

NEXT:
1. Verify ISSUE-2, ISSUE-7, ISSUE-8, ISSUE-11 in a fresh session
   (verifier must not be this session).
2. ISSUE-6 (dept×year rulesets + 수강중) — blocked on official 졸업
   규정 data (needs-human input).
3. ISSUE-10 — toolchain bumps with compat verification.
4. Re-run crawler periodically to refresh activities.json.

BLOCKER: ISSUE-5 (remote D1 + deploy) and ISSUE-9 (stale root
.openai/hosting.json project_id) need human/accounts. Live-deployed
site at https://hansung-campus.gyeongbinb38.chatgpt.site predates all
of this work.

TESTS: tsc, oxlint, build (both repos), catalog 4/4, school 5/5,
graduation 4/4, ux-utils 24/24, activities 5/5, http-check PASS,
account-db PASS.

REPO SCOUT: none needed this run (plain HTTP sufficed for hsportal —
Playwright rejected; recorded in ISSUE-2).

VERIFICATION STATUS: ISSUE-2/7/8/11 await independent verification.

DEPENDENCIES/REPOS REVIEWED: none added; 14 removed (ISSUE-7).

---

## 2026-09-17 — loop iteration 2 (verification + ISSUE-12)

DONE:
- Verified ISSUE-7 (starter-kit removal) → PASS: dirs gone, no imports,
  deps minimal, gates green.
- Verified ISSUE-8 (test assertions) → PASS: pins real outcomes.
- Verified ISSUE-11 (data-driven advisor) → PASS; fixed minor nit:
  failed activities fetch no longer shows "불러오는 중" forever.
- Verified ISSUE-2 (activities pipeline) → **FAIL, then fixed**: cards
  carry extra <time> elements outside date_layer (header run-time pair
  + content duplicate), so positional extraction swapped 신청↔운영 on
  26/39 rows — and the test pinned the bad value. Parser now maps
  date_layer blocks by their 신청/운영 label; test corrected; regression
  test added; snapshot re-crawled (37 items, all sane).
- Implemented ISSUE-12: official 학사일정 ingestion —
  lib/data/schedule.ts + scripts/crawl-schedule.mts (POST month/year2,
  12 months of the academic year) → lib/data/schedule.json (73 events)
  → GET /api/schedule → calendar.tsx shows upcoming official events
  with 공식 학사일정 provenance. tests/schedule.test.mjs 4/4.
- New findings logged: ISSUE-13 (derived notifications + 홈 할일 카운트
  고정값), ISSUE-14 (_sync.py --check mode).
- Both repos committed: f5dfe0d + cf23f56 (root), 277d171 + f6a5967
  (deploy).

IN PROGRESS: nothing — working tree clean in both repos.

NEXT:
1. Re-verify ISSUE-2 date fix + verify ISSUE-12 in a fresh session.
2. ISSUE-13 (derived notifications, home task count), ISSUE-14
   (sync --check).
3. ISSUE-6 still needs official 졸업 규정 data; ISSUE-5/9 need human.

BLOCKER: unchanged — ISSUE-5 (remote D1 + deploy) and ISSUE-9 need
human/accounts.

TESTS: tsc, oxlint, build (both repos), activities 6/6, schedule 4/4,
catalog 4/4, school 5/5, graduation 4/4, ux-utils 24/24.

REPO SCOUT: hansung.ac.kr/hansung/6096/subview.do is public, server-
rendered, UTF-8 — plain HTTP POST suffices for month navigation.

VERIFICATION STATUS: ISSUE-2 fix + ISSUE-12 await independent
verification.
