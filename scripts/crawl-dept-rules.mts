/**
 * 학과별 졸업요건 수집 → lib/data/dept-rules.json
 *
 * 수동/주기 실행용 (node --experimental-strip-types scripts/crawl-dept-rules.mts).
 * 사용자 요청 경로에서 실행되지 않는다.
 *
 * 발견 경로: /sitemap/{slug}/view.do → 학과소개 블록 내 졸업요건 링크 →
 * 각 페이지에서 규정 문구를 원문(verbatim) 추출. 수치 해석 없음 —
 * 졸업 사정이 아니라 학과 공식 요건 안내다.
 */
import { readFile } from 'node:fs/promises';
import { fetchTextWithRetry, writeSnapshotAtomic } from './crawl-utils.mts';
import {
  extractAttachment,
  extractContentImage,
  extractRulesText,
  inferDeptLabel,
  isMultiDeptPage,
  isRulesetAnomalous,
  pairDeptRules,
  parseSitemapLinks,
  parseYearTable,
  type DeptRuleset,
  type DeptRulesSnapshot,
} from '../lib/data/dept-rules.ts';
import { resolveDept } from '../lib/data/dept.ts';
import catalogJson from '../lib/data/catalog-2026-2.json' with { type: 'json' };
import type { Catalog } from '../lib/data/catalog.ts';

const HOST = 'https://www.hansung.ac.kr';
const OUT = new URL('../lib/data/dept-rules.json', import.meta.url);
const UA = 'hansung-campus-helper/1.0 (+snapshot; contact: site admin)';
const DELAY_MS = 700;

/** 졸업요건을 탐색할 사이트 슬러그 — 사이트맵 존재 확인분 */
const SLUGS = ['CreCon', 'Design', 'HmnArt', 'Engineering', 'futureplus', 'CSE', 'SclScn', 'global'];
/** 사이트 자체가 단일 학과인 슬러그 — 사이트맵에 학과명 라벨이 없어 직접 지정 */
const SITE_DEPT: Record<string, string> = { CSE: '컴퓨터공학부' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string): Promise<string> {
  return fetchTextWithRetry(url, {
    headers: { 'User-Agent': UA },
  });
}

const catalog = catalogJson as Catalog;
const catalogDepts = [...new Set(catalog.sections.map((s) => s.dept))];

const items: DeptRuleset[] = [];
let incomplete = false;
for (const slug of SLUGS) {
  const sitemapUrl = `${HOST}/sitemap/${slug}/view.do`;
  let links;
  try {
    links = parseSitemapLinks(await fetchText(sitemapUrl), slug);
  } catch (e) {
    incomplete = true;
    console.log(`${slug}: sitemap fetch failed — ${(e as Error).message}`);
    await sleep(DELAY_MS);
    continue;
  }
  const pairs = pairDeptRules(links, { siteDept: SITE_DEPT[slug] });
  console.log(`${slug}: ${pairs.length} 졸업요건 페이지 발견`);
  await sleep(DELAY_MS);

  for (const p of pairs) {
    const url = HOST + p.url;
    try {
      const html = await fetchText(url);
      const lines = extractRulesText(html);
      // 단일학과 사이트(CSE 등): 사이트맵 라벨이 없으면 본문에서 학과명 추정
      const deptLabel = p.deptLabel || inferDeptLabel(lines);
      const multi = isMultiDeptPage(lines);
      let r = { dept: undefined as string | undefined };
      if (!multi && deptLabel) {
        r = resolveDept(deptLabel, catalogDepts) as typeof r;
        // 트랙/학과 명칭만 다른 동일 학과 (예: 문학문화콘텐츠트랙→학과)
        if (!r.dept && deptLabel.endsWith('트랙')) {
          r = resolveDept(
            deptLabel.replace(/트랙$/, '학과'),
            catalogDepts,
          ) as typeof r;
        }
      }
      const ruleset: DeptRuleset = {
        deptLabel: multi ? '' : deptLabel,
        dept: r.dept ?? null,
        url,
        lines,
        attachment: extractAttachment(html),
        image: extractContentImage(html) ?? undefined,
        multiDept: multi || undefined,
        yearTable: parseYearTable(html) ?? undefined,
      };
      if (isRulesetAnomalous(ruleset)) {
        incomplete = true;
        console.log(
          `  ${deptLabel || '(학과 미확정)'} ${url}: 본문 추출 부족(${lines.length}줄) — 제외`,
        );
      } else {
        items.push(ruleset);
        console.log(
          `  ${deptLabel || '(학과 미확정)'} -> ${ruleset.dept ?? '(미해석)'}: ${lines.length}줄${ruleset.attachment ? ' +첨부' : ''}${ruleset.image ? ' +이미지' : ''}${ruleset.yearTable ? ' +학번표' : ''}`,
        );
      }
    } catch (e) {
      incomplete = true;
      console.log(`  ${p.deptLabel} ${url}: ${(e as Error).message}`);
    }
    await sleep(DELAY_MS);
  }
}

const next: DeptRulesSnapshot = {
  source: 'hansung-dept-pages',
  sourceUrl: `${HOST}/sitemap/{slug}/view.do`,
  fetchedAt: new Date().toISOString(),
  itemCount: items.length,
  items,
};

// 이상 감지 — 전체 학과가 사라지거나 본문이 전멸하면 기존 유지
const previous: DeptRulesSnapshot | null = await readFile(OUT, 'utf8')
  .then((value) => JSON.parse(value))
  .catch(() => null);
const collectedUrls = new Set(items.map((item) => item.url));
const missingPrevious = previous?.items?.filter((item) => !collectedUrls.has(item.url)) ?? [];
if (!items.length || incomplete || missingPrevious.length) {
  console.error(`ANOMALY: incomplete dept rules collection (missing previous: ${missingPrevious.length}) — keeping previous snapshot`);
  process.exit(2);
}

await writeSnapshotAtomic(OUT, next);
console.log(`wrote ${items.length} rulesets -> lib/data/dept-rules.json`);
