from pathlib import Path
if not Path('.session-race-fixture').is_file():
    raise SystemExit('Run only inside the isolated fixture copy described in README.md')
p=Path('app/api/account/lms-refresh/route.ts')
s=p.read_text(encoding='utf-8')
assert "import { connectSchool, SchoolError } from '@/lib/server/school';" in s
s=s.replace("import { connectSchool, SchoolError } from '@/lib/server/school';", """import { SchoolError } from '@/lib/server/school';
// Only in this isolated test copy: pause an authenticated request deterministically.
const connectSchool = async (_id: string, _password: string, _options: unknown) => {
  await fetch('http://127.0.0.1:18889/gate');
  return { checkedAt: 'integration-test', lmsData: undefined, infoData: undefined };
};""")
p.write_text(s, encoding='utf-8')
