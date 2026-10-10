/**
 * 합성 부하 테스트 — 공개 읽기 경로의 동시 접속 안정성 측정.
 *
 *   node --experimental-strip-types scripts/load-test.mts [base] [concurrency] [rounds]
 *
 * 대상은 인증·학교 서버 없이 처리되는 경로만 — 로그인은 학교
 * info.hansung에 부하를 주므로 여기서는 제외한다(/api/account의
 * 401 경로만 포함). 응답 시간 분포·오류율·상태코드 집계를 출력한다.
 */
const base = process.argv[2] || 'https://hansung-helper.gyeongbin-38.workers.dev';
const conc = parseInt(process.argv[3] || '300', 10);
const rounds = parseInt(process.argv[4] || '5', 10);
const PATHS = [
  '/',
  '/api/health',
  '/api/courses',
  '/api/activities',
  '/api/schedule',
  '/api/account', // 미인증 → 401 경로 (인증+D1 조회 비용 측정)
];

type Result = { ms: number; status: number; path: string };
const hit = async (path: string): Promise<Result> => {
  const t0 = performance.now();
  try {
    const r = await fetch(base + path, {
      // Bot Fight가 UA 없는 요청을 차단하므로 브라우저 UA로 — 실제
      // 사용자 경험과 동일한 경로를 측정한다.
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(30000),
    });
    await r.arrayBuffer();
    return { ms: performance.now() - t0, status: r.status, path };
  } catch {
    return { ms: performance.now() - t0, status: -1, path };
  }
};

const pct = (xs: number[], p: number) =>
  xs.length ? xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : 0;

console.log(`base=${base} concurrency=${conc} rounds=${rounds} paths=${PATHS.length}`);
const all: Result[] = [];
for (let round = 1; round <= rounds; round++) {
  const t0 = performance.now();
  // conc개의 작업 슬롯 — 각 슬롯이 경로를 순회하며 한 번씩 호출
  const jobs = Array.from({ length: conc }, (_, i) => hit(PATHS[i % PATHS.length]));
  const res = await Promise.all(jobs);
  all.push(...res);
  const ok = res.filter((r) => r.status > 0).length;
  const wall = Math.round(performance.now() - t0);
  console.log(`round ${round}: ${ok}/${res.length} responded, ${wall}ms wall`);
}
const times = all.filter((r) => r.status > 0).map((r) => r.ms).sort((a, b) => a - b);
const byStatus = new Map<string, number>();
for (const r of all) {
  const k = `${r.status} ${r.path}`;
  byStatus.set(k, (byStatus.get(k) ?? 0) + 1);
}
console.log('\n-- status × path --');
for (const [k, n] of [...byStatus].sort()) console.log(`${k}  ×${n}`);
console.log('\n-- latency (responded only) --');
console.log(`n=${times.length} p50=${Math.round(pct(times, 50))}ms p95=${Math.round(pct(times, 95))}ms p99=${Math.round(pct(times, 99))}ms max=${Math.round(times[times.length - 1] ?? 0)}ms`);
const fails = all.filter((r) => r.status <= 0 || r.status >= 500).length;
console.log(`failures(0|5xx)=${fails}/${all.length} (${((fails / all.length) * 100).toFixed(1)}%)`);
process.exit(fails / all.length > 0.01 ? 1 : 0);
