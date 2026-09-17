# AGENTS.md

## Purpose

This repository is developed by humans and coding agents working in parallel.

Before modifying code, every agent MUST read:

1. `/PROJECT_ARCHITECTURE.md`
2. `/docs/product/PRODUCT_UI_SPEC.md`
3. The assigned GitHub Issue
4. Existing implementation and tests related to the Issue

If documentation conflicts with the actual repository, do not silently rewrite the project.
Report the conflict and prefer the smallest safe change.

---

## Source of Truth Priority

1. Current explicit user/team decision
2. Actual repository code, schema, migrations, tests
3. Assigned GitHub Issue acceptance criteria
4. `/PROJECT_ARCHITECTURE.md`
5. `/docs/product/PRODUCT_UI_SPEC.md`
6. Older wireframes / ideation notes

---

## Work Unit

- One implementation agent works on ONE GitHub Issue at a time.
- Do not start unrelated work after finishing the Issue.
- Keep the diff as small as reasonably possible.
- Do not perform unrelated refactors.
- Do not redesign architecture without a dedicated ADR/Issue.

---

## Implementer / Verifier Separation

The implementation agent MAY:

- implement code
- add migrations
- add tests
- run tests, type checks, lint, and build
- prepare a PR
- report known limitations

The implementation agent MUST NOT:

- mark its own work as independently verified
- apply the `verified` label to its own PR
- treat its own passing tests as final approval

Independent verification MUST be performed by a different fresh agent/session.

Verification flow:

`Ready → Implementing → PR Ready → Verification → PASS/FAIL → Verified → Human Merge`

If verification fails:

`FAIL → Changes Requested → Implementer fixes → Fresh verification`

---

## Verification Rules

A verifier must independently inspect:

- Issue acceptance criteria
- actual diff
- tests and build output
- regression risk
- architecture compliance
- data provenance
- security/privacy impact
- loading / empty / error states when relevant
- responsive / keyboard / focus behavior for UI work
- idempotency / fixture / last-known-good behavior for crawlers

The verifier should NOT fix product code just to make the verification pass.
Report reproducible findings back to the implementer.

---

## Reuse-First Rule

Before building generic infrastructure from scratch, check whether a maintained open-source project or official package already solves it.

Prefer established solutions for generic concerns such as:

- crawling framework
- browser automation
- server-state caching
- calendar UI
- schema/form validation
- observability
- vector search
- notification infrastructure

Prefer custom implementation for Hansung-specific domain logic such as:

- Hansung source parsers/normalizers
- graduation rule engine
- student academic-state model
- timetable constraints
- course recommendation logic
- product-specific UX

When adding a significant external dependency, verify:

- official repository/package
- license
- maintenance activity
- security posture
- stack compatibility
- runtime/bundle cost
- vendor lock-in
- replacement/exit path

For important dependencies, write an ADR under `/docs/adr/`.

---

## Security / Privacy Non-Negotiables

Never:

- store Hansung school passwords
- store hashes of Hansung school passwords
- commit real school credentials
- commit access tokens, cookies, session secrets, or `.env`
- place personal student data in fixtures
- log raw passwords/tokens/session cookies
- claim real school verification works when only a demo adapter exists
- bypass CAPTCHA, MFA, or access-control protections

Service passwords must use a proper password hash.

Student verification must stay behind the `StudentVerificationAdapter` boundary.

---

## Data Provenance

Important academic data must preserve provenance.

Use these meanings consistently:

- `OFFICIAL_CRAWLED` — collected from an official public source
- `USER_REPORTED` — entered or selected by the user
- `DERIVED` — computed from other data
- `DEMO` — seed/demo data only

Never silently convert unknown data into official data.

Never convert missing information into `0`, `false`, or “completed” when the correct state is unknown.

---

## Graduation Logic

Graduation evaluation must be deterministic and rule-based.

Do NOT let an LLM determine graduation eligibility.

Keep separate:

- planned
- in progress
- user-reported completed
- official/verified information when available

AI may explain results, not replace the rule engine.

---

## Crawling Rules

Crawler changes should include:

- idempotent upsert
- stable `source_system + source_key`
- parser fixture test
- source metadata
- sensible retry behavior
- last-known-good retention
- anomaly handling for suspicious item-count drops

Prefer plain HTTP parsing first.
Use Playwright only when JavaScript rendering is truly required.

Do not scrape on user page requests.
Normal users read from our DB/API.

---

## UI Rules

Follow `/docs/product/PRODUCT_UI_SPEC.md`.

Especially:

- no side accent bars
- no side-tab cards
- preserve provenance/status labels
- loading / empty / error states are required
- breadcrumb on detail pages
- notification and toast have different purposes
- graduation progress must show its basis
- do not fabricate statistics

---

## Git / PR Rules

Recommended branches:

- `feat/<issue>-<slug>`
- `fix/<issue>-<slug>`
- `chore/<issue>-<slug>`

Before finishing:

1. run relevant tests
2. run type check
3. run lint
4. run build when applicable
5. inspect `git diff`
6. confirm no secret or personal data is included
7. explain migrations and risks in the PR

Do NOT:

- auto-merge `main`
- deploy production without explicit approval
- change secrets/credentials without explicit approval

---

## Autonomous Agent Behavior

When working autonomously:

1. Finish current in-progress work first.
2. Prefer `verification-failed` work before new implementation.
3. Then handle `needs-verification`.
4. Then select `priority:p0 + agent-ready`.
5. Then `priority:p1 + agent-ready`.

If no Issue exists:

- compare code against architecture/product specs
- propose small agent-ready Issues
- do not invent new product direction
- do not keep refactoring just to stay busy

Stop and request human judgment when:

- product/architecture choice is genuinely ambiguous
- security/privacy decision is required
- production access is required
- two valid implementations have meaningful tradeoffs
- a school integration cannot be verified safely

---

## End-of-Run Report

Every autonomous run should end with:

```text
DONE:
IN PROGRESS:
NEXT:
BLOCKER:
TESTS:
DEPENDENCIES/REPOS REVIEWED:
```
