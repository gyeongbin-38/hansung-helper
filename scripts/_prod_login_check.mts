// 프로덕션 로그인 → waitUntil LMS 수집 도착 검증.
// COSMOS_ID/COSMOS_PW 환경변수로 자격증명 전달.
const BASE = 'https://hansung-helper.gyeongbin-38.workers.dev';

const studentId = process.env.COSMOS_ID ?? '';
const password = process.env.COSMOS_PW ?? '';
if (!studentId || !password) {
  console.error('COSMOS_ID/COSMOS_PW 필요');
  process.exit(1);
}

const t0 = Date.now();
const login = await fetch(BASE + '/api/account/login', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    origin: BASE,
  },
  body: JSON.stringify({ studentId, password, agreed: true }),
});
const loginMs = ((Date.now() - t0) / 1000).toFixed(1);
const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
const body = (await login.json()) as {
  snapshot?: { portal?: string; lms?: string; lmsData?: unknown };
};
console.log(`로그인 응답: ${login.status} (${loginMs}s)`);
if (!login.ok) {
  console.log(JSON.stringify(body));
  process.exit(1);
}
console.log(`  portal=${body.snapshot?.portal} lms=${body.snapshot?.lms}`);
console.log(`  lmsData at login: ${body.snapshot?.lmsData ? '있음' : '없음(예상)'}`);
console.log(`  cookie: ${cookie ? '발급됨' : '없음!'}`);

for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 8000));
  const res = await fetch(BASE + '/api/account', {
    headers: { cookie },
    cache: 'no-store',
  });
  const acc = (await res.json()) as {
    snapshot?: {
      lmsData?: {
        fetchedAt?: string;
        courses?: { vods?: { attended?: boolean }[] }[];
      };
    };
  };
  const lmsData = acc?.snapshot?.lmsData;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  if (lmsData) {
    console.log(`\n${elapsed}s — lmsData 도착!`);
    console.log(`  과목 ${lmsData.courses?.length}개 · fetchedAt ${lmsData.fetchedAt}`);
    let vods = 0, attended = 0;
    for (const c of lmsData.courses ?? []) {
      vods += c.vods?.length ?? 0;
      attended += (c.vods ?? []).filter((v) => v.attended).length;
    }
    console.log(`  강의 수강 ${attended}/${vods}`);
    process.exit(0);
  }
  console.log(`${elapsed}s — 아직 없음 (poll ${i + 1}/10)`);
}
console.log('\n90초 내 lmsData 미도착 — waitUntil 또는 병합 경로 문제');
process.exit(2);
