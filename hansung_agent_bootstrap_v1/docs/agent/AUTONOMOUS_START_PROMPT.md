# Autonomous Development Start Prompt

Use this prompt when starting a fresh maintainer/planner agent.

---

Read these files first:

1. `/AGENTS.md`
2. `/PROJECT_ARCHITECTURE.md`
3. `/docs/product/PRODUCT_UI_SPEC.md`

Then inspect the actual repository before modifying code.

## Phase 1 — Recon only

Do NOT modify code yet.

1. Identify the current stack, package manager, build system, directory structure, DB/migrations, tests, CI, and deployment-related folders.
2. Compare the actual repository with the architecture and product specs.
3. Classify major features as:
   - implemented
   - partially implemented
   - mock/demo only
   - not implemented
4. Inspect existing GitHub Issues and PRs.
5. Find architecture drift, duplicated code, fake/mock integrations presented as real, missing tests, and data-provenance gaps.
6. Identify generic problems where maintained open-source packages/repositories should be evaluated before custom implementation.
7. Produce a prioritized dependency-aware backlog.

Do not rewrite working architecture merely because the docs propose a different directory structure.

## Phase 2 — Issue decomposition

If the GitHub backlog is insufficient, create/propose small Issues.

Each Issue must contain:

- Objective
- Why it matters
- Scope
- Out of scope
- Expected files/areas
- Dependencies
- Acceptance criteria
- Tests required
- Verification gates
- Priority
- Area label
- Whether Repo Scout is required

Issues must be small enough for one coding agent to complete independently.

Recommended labels:

```text
agent-ready
agent-implementing
needs-verification
verification-failed
verified
needs-human

priority:p0
priority:p1
priority:p2

area:crawler
area:backend
area:frontend
area:graduation
area:auth
area:ai
area:data
```

## Phase 3 — Autonomous implementation

Select only the highest-priority `agent-ready` Issue whose dependencies are satisfied.

For generic infrastructure, perform Repo Scout first.

Implementers:
- implement only that Issue
- test their work
- prepare PR-ready output
- do NOT self-verify

After implementation, mark/route the work to `needs-verification`.

A fresh verifier agent must perform independent verification.

A verifier:
- reads the Issue and specs
- inspects the real diff
- runs tests itself
- checks edge/failure states
- checks regression
- checks architecture/security/privacy/provenance
- reports PASS/FAIL/BLOCKED
- does NOT modify product code merely to force PASS

If FAIL:
- return findings to the implementer
- fix
- rerun verification with a fresh verifier

Do not merge `main`, deploy production, or change secrets without explicit human approval.

## Work selection order

1. `verification-failed`
2. incomplete implementation already in progress
3. `needs-verification`
4. `priority:p0 + agent-ready`
5. `priority:p1 + agent-ready`
6. tests/regressions directly blocking P0/P1

Do not perform cosmetic refactors merely to keep the agent busy.

## Required report after every run

```text
DONE:
IN PROGRESS:
NEXT:
BLOCKER:
TESTS:
REPO SCOUT:
VERIFICATION STATUS:
```
