"""Local SQL checks for account isolation, relogin, and deletion cleanup."""
import json
import pathlib
import sqlite3


db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript(
    pathlib.Path("drizzle/0000_academic_accounts.sql").read_text(encoding="utf-8")
)
db.executescript(
    pathlib.Path("drizzle/0001_public_snapshots.sql").read_text(encoding="utf-8")
)
db.execute(
    "INSERT INTO public_snapshots(kind, part, payload, fetched_at, updated_at) "
    "VALUES('fixture', 0, '{\"items\":[]}', '2026-10-26T00:00:00Z', 1)"
)
# Reapplying the migration files must preserve all existing tables and rows.
db.executescript(
    pathlib.Path("drizzle/0000_academic_accounts.sql").read_text(encoding="utf-8")
)
db.executescript(
    pathlib.Path("drizzle/0001_public_snapshots.sql").read_text(encoding="utf-8")
)
assert db.execute(
    "SELECT payload FROM public_snapshots WHERE kind='fixture'"
).fetchone() == ('{"items":[]}',)

for account_id in ("a", "b"):
    profile = json.dumps({"privateNote": f"profile-{account_id}"})
    snapshot = json.dumps({"lmsData": {"privateCourse": f"course-{account_id}"}})
    db.execute(
        "INSERT INTO academic_accounts(id, student_mask, profile, snapshot, created_at, consent_at) "
        "VALUES(?, ?, ?, ?, 0, 0)",
        (account_id, f"mask-{account_id}", profile, snapshot),
    )
    db.execute(
        "INSERT INTO academic_sessions VALUES(?, ?, ?)",
        (f"session-{account_id}", account_id, 999),
    )

query = (
    "SELECT a.id, a.profile, a.snapshot FROM academic_accounts a "
    "JOIN academic_sessions s ON s.account_id=a.id "
    "WHERE s.token_hash=? AND s.expires_at>?"
)
assert db.execute(query, ("session-a", 1)).fetchone()[0] == "a"
assert db.execute(query, ("session-b", 1)).fetchone()[0] == "b"
assert db.execute(query, ("missing", 1)).fetchone() is None
assert db.execute(query, ("session-a", 1000)).fetchone() is None

# A second login creates an independent valid session for the same account.
db.execute("INSERT INTO academic_sessions VALUES(?, ?, ?)", ("session-a2", "a", 999))
assert db.execute(query, ("session-a2", 1)).fetchone()[0] == "a"

# Deletion removes all A sessions, the account's profile/LMS snapshot, and its
# account-scoped login/refresh throttles without affecting B.
db.execute("INSERT INTO academic_login_limits VALUES('a', 1, 999)")
db.execute("INSERT INTO academic_login_limits VALUES('refresh:a', 1, 999)")
db.execute("DELETE FROM academic_sessions WHERE account_id=?", ("a",))
db.execute("DELETE FROM academic_accounts WHERE id=?", ("a",))
db.execute(
    "DELETE FROM academic_login_limits WHERE key IN (?, ?)",
    ("a", "refresh:a"),
)
assert db.execute(query, ("session-a", 1)).fetchone() is None
assert db.execute(query, ("session-a2", 1)).fetchone() is None
assert db.execute(query, ("session-b", 1)).fetchone()[0] == "b"
assert db.execute("SELECT count(*) FROM academic_accounts WHERE id='a'").fetchone()[0] == 0
assert db.execute("SELECT count(*) FROM academic_sessions WHERE account_id='a'").fetchone()[0] == 0
assert db.execute("SELECT count(*) FROM academic_login_limits WHERE key IN ('a','refresh:a')").fetchone()[0] == 0
assert db.execute("SELECT profile FROM academic_accounts WHERE id='b'").fetchone()[0] == '{"privateNote": "profile-b"}'
assert db.execute("SELECT snapshot FROM academic_accounts WHERE id='b'").fetchone()[0] == '{"lmsData": {"privateCourse": "course-b"}}'

restored = sqlite3.connect(":memory:")
db.commit()
db.backup(restored)
assert restored.execute("PRAGMA integrity_check").fetchone() == ("ok",)
assert restored.execute("SELECT count(*) FROM academic_accounts").fetchone() == (1,)
assert restored.execute("SELECT count(*) FROM public_snapshots").fetchone() == (1,)

print("PASS: A/B isolation, session expiry, relogin, deletion cleanup, migration idempotency, backup/restore fixture")
