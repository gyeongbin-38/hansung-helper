import sqlite3,pathlib
conn=sqlite3.connect(':memory:');conn.execute('PRAGMA foreign_keys=ON');conn.executescript(pathlib.Path('drizzle/0000_academic_accounts.sql').read_text(encoding='utf-8'))
for account in ['a','b']:
 conn.execute("INSERT INTO academic_accounts(id,student_mask,created_at,consent_at) VALUES(?,?,0,0)",(account,account))
 conn.execute('INSERT INTO academic_sessions VALUES(?,?,?)',('session-'+account,account,999))
query='SELECT a.id FROM academic_accounts a JOIN academic_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>?'
assert conn.execute(query,('session-a',1)).fetchone()==('a',)
assert conn.execute(query,('missing',1)).fetchone() is None
assert conn.execute(query,('session-a',1000)).fetchone() is None
conn.execute('DELETE FROM academic_accounts WHERE id=?',('a',))
assert conn.execute('SELECT count(*) FROM academic_sessions WHERE account_id=?',('a',)).fetchone()==(0,)
assert conn.execute(query,('session-b',1)).fetchone()==('b',)
print('PASS: migration, session ownership, expiry, cascading account deletion, other-account isolation')
