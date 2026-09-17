# Implementer Heartbeat Prompt

Work only on the currently assigned GitHub Issue.

At every heartbeat:

1. Re-read `/AGENTS.md`, relevant architecture sections, and Issue acceptance criteria.
2. Inspect `git status`, current diff, and failing tests.
3. Implement the smallest remaining piece.
4. Run relevant tests, type check, lint, and build.
5. If something fails, diagnose before retrying.
6. Keep scope limited to the Issue.
7. When acceptance criteria are met, make the work PR-ready.
8. Set/route the work to `needs-verification`.
9. Stop implementation work for this Issue.

Do not:
- self-assign VERIFIED
- start another Issue
- merge main
- deploy
- modify secrets
- store school credentials
- do unrelated refactors

End with:

```text
DONE:
REMAINING:
TESTS:
KNOWN RISKS:
READY FOR VERIFICATION: YES | NO
```
