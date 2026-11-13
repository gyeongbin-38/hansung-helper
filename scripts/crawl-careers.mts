/**
 * 커리어넷 오픈 API 학과정보 → lib/data/careers.json
 *
 *   CAREERNET_API_KEY=<키> node --experimental-strip-types scripts/crawl-careers.mts
 *   특정 학과만: ... --dept "컴퓨터공학부" --dept "디지털콘텐츠디자인학과"
 *
 * 인증키는 career.go.kr 오픈API 신청(무료·관리자 승인)으로 발급한다.
 * 사용자 요청 경로에서 실행되지 않으며, 수집 결과가 없으면 기존 스냅샷을 유지한다.
 */
import { readdir, readFile } from 'node:fs/promises';
import { fetchTextWithRetry, writeSnapshotAtomic } from './crawl-utils.mts';
import { normDeptName, type CareerEntry, type CareerSnapshot } from '../lib/data/careers.ts';

const KEY = process.env.CAREERNET_API_KEY;
const BASE = 'https://www.career.go.kr/cnet/openapi/getOpenApi';
const OUT = new URL('../lib/data/careers.json', import.meta.url);
const DELAY_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const argDepts = process.argv.slice(2).flatMap((a, i, arr) =>
  a === '--dept' ? [arr[i + 1] ?? ''] : [],
).filter(Boolean);

/** 카탈로그 스냅샷의 개설 학과·트랙 — 행정 버킷(교양·학점인정 등)은 제외. */
const SKIP_DEPT =
  /교양|구분없음|학점인정|아카데미|전문가\s?과정|전문과정|일학습병행|자기설계|연계전공|C&C|IPP|전기기사/;

async function deptCandidates(): Promise<string[]> {
  if (argDepts.length) return argDepts;
  const dir = new URL('../lib/data/', import.meta.url);
  const names = new Set<string>();
  for (const f of await readdir(dir)) {
    if (!/^catalog-\d{4}-[12]\.json$/.test(f)) continue;
    const cat = JSON.parse(await readFile(new URL(f, dir), 'utf-8'));
    for (const s of cat.sections ?? []) if (s.dept) names.add(String(s.dept));
  }
  return [...names].filter((n) => n.trim().length > 1 && !SKIP_DEPT.test(n)).sort();
}

const api = (params: Record<string, string>) =>
  `${BASE}?apiKey=${encodeURIComponent(KEY!)}&svcType=api&contentType=json&gubun=univ_list&` +
  Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

async function searchMajor(keyword: string) {
  const text = await fetchTextWithRetry(
    api({ svcCode: 'MAJOR', thisPage: '1', perPage: '15', searchTitle: keyword }),
  );
  const data = JSON.parse(text);
  return (data?.dataSearch?.content ?? []) as Record<string, unknown>[];
}

async function majorDetail(seq: string | number) {
  const text = await fetchTextWithRetry(api({ svcCode: 'MAJOR_VIEW', majorSeq: String(seq) }));
  const data = JSON.parse(text);
  return (data?.dataSearch?.content?.[0] ?? null) as Record<string, unknown> | null;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const pickStr = (obj: Record<string, unknown> | null, keys: string[]) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
};

/** 관련 직업 필드 — 문자열 나열 또는 {name:[…]} 형태를 모두 받는다. */
function parseJobs(v: unknown): string[] | undefined {
  if (typeof v === 'string') {
    const list = v.split(/[,·\n]/).map((s) => s.trim()).filter(Boolean);
    return list.length ? list : undefined;
  }
  if (Array.isArray(v)) {
    const list = v.flatMap((j) => {
      if (typeof j === 'string') return [j.trim()];
      const n = (j as Record<string, unknown>)?.name ?? (j as Record<string, unknown>)?.job_nm;
      return typeof n === 'string' ? [n.trim()] : [];
    }).filter(Boolean);
    return list.length ? [...new Set(list)] : undefined;
  }
  const name = (v as Record<string, unknown> | null)?.name;
  if (Array.isArray(name)) {
    const list = name.map((x) => str((x as Record<string, unknown>)?.text ?? x)).filter(Boolean);
    return list.length ? list : undefined;
  }
  return undefined;
}

if (!KEY) {
  console.error(
    'CAREERNET_API_KEY 환경 변수가 필요합니다. 커리어넷(career.go.kr) 오픈API를 신청해 인증키를 발급받아 주세요.',
  );
  process.exit(1);
}

const depts = await deptCandidates();
const prev: CareerSnapshot | null = await readFile(new URL('lib/data/careers.json', `file://${process.cwd()}/`), 'utf-8')
  .then((t) => JSON.parse(t))
  .catch(() => null);

const result: CareerSnapshot = { generated: new Date().toISOString(), depts: {} };
let hits = 0;
for (const [i, dept] of depts.entries()) {
  const keyword = dept
    .replace(/공학[부과]$/, '공학')
    .replace(/(학부|학과|전공|트랙|과정)$/, '')
    .trim();
  try {
    const hits0 = await searchMajor(keyword);
    const kw = normDeptName(keyword);
    const scored = hits0
      .map((h) => ({
        h,
        name: normDeptName(str(h.major) + str(h.facilName) || str(h.major)),
        base: normDeptName(str(h.major)),
      }))
      .sort((a, b) =>
        Number(b.name === kw) - Number(a.name === kw) ||
        Number(b.base === kw) - Number(a.base === kw) ||
        Number(b.base.startsWith(kw) || b.name.startsWith(kw)) -
          Number(a.base.startsWith(kw) || a.name.startsWith(kw)),
      );
    const best = scored[0]?.h;
    if (!best || !normDeptName(str(best.major))) {
      console.log(`${i + 1}/${depts.length} ${dept}: 결과 없음`);
      continue;
    }
    await sleep(DELAY_MS);
    const detail = best.majorSeq ? await majorDetail(best.majorSeq as string) : null;
    const jobs =
      parseJobs(detail?.job) ?? parseJobs(detail?.rel_job_nm) ??
      parseJobs(detail?.relatedJob) ?? parseJobs(detail?.jobs);
    const entry: CareerEntry = {
      majorSeq: Number(best.majorSeq) || undefined,
      name: str(detail?.major) || str(best.major) || undefined,
      summary: pickStr(detail, ['summary', 'majorSumry', 'overview', 'major_sumry']),
      jobs,
      employment: pickStr(detail, ['employment', 'empymn', 'emp_rate', 'employRate']),
      salary: pickStr(detail, ['salary', 'sal', 'wage', 'avgSalary']),
      source: 'careernet',
      fetchedAt: result.generated ?? undefined,
    };
    if (!entry.name && !entry.jobs?.length && !entry.summary) {
      console.log(`${i + 1}/${depts.length} ${dept}: 상세 없음`);
      continue;
    }
    result.depts[dept] = entry;
    hits += 1;
    console.log(`${i + 1}/${depts.length} ${dept} -> ${entry.name ?? '?'} (직업 ${entry.jobs?.length ?? 0})`);
  } catch (e) {
    console.warn(`${i + 1}/${depts.length} ${dept}: ${e instanceof Error ? e.message : e}`);
  }
  await sleep(DELAY_MS);
}

const prevCount = Object.keys(prev?.depts ?? {}).length;
if (hits === 0 && prevCount > 0) {
  console.error(`ANOMALY: 0 hits vs previous ${prevCount} — keeping previous snapshot`);
  process.exit(2);
}
if (hits === 0) {
  console.error('수집된 학과가 없습니다. 기존 파일을 유지합니다.');
  process.exit(2);
}
// 이전 수집에만 있던 학과도 보존 — 이번 목록에서 빠진 학과는 지우지 않는다.
for (const [k, v] of Object.entries(prev?.depts ?? {})) {
  if (!(k in result.depts)) result.depts[k] = v;
}
await writeSnapshotAtomic(OUT, result);
console.log(`wrote ${Object.keys(result.depts).length} depts (${hits} updated) -> lib/data/careers.json`);
