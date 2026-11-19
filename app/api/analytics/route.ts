import {
  database,
  ipRateLimitKey,
  json,
  limited,
  PayloadTooLargeError,
  readTextLimited,
  validOrigin,
  visitorDigest,
} from '@/lib/server/account';

const KST = 9 * 3600000;
const day = (ts: number) => new Date(ts + KST).toISOString().slice(0, 10);

/** 방문 핑 — 로그인 없이 같은 사이트 안에서만 허용(validOrigin). 방문자는
 *  IP+UA+날짜의 HMAC라 원본 IP가 저장되지 않고 날짜마다 새로 부여된다.
 *  본문은 경로 해시와 외부 유입 도메인만 받는다. */
export async function POST(request: Request) {
  if (!validOrigin(request)) return json({ error: '잘못된 요청입니다.' }, 403);
  try {
    const ip = await ipRateLimitKey(
      request.headers.get('cf-connecting-ip') || 'unknown',
    );
    // 캠퍼스 공유망 기준 넉넉한 상한 — 페이지뷰당 1핑이므로 15분 300회까지.
    if (await limited('ping:' + ip, 300))
      return json({ error: '요청이 많습니다.' }, 429);
    const input = JSON.parse(await readTextLimited(request, 1024)) as {
      p?: unknown;
      ref?: unknown;
    };
    const today = day(Date.now());
    const visitor = await visitorDigest(
      request.headers.get('cf-connecting-ip') || 'unknown',
      request.headers.get('user-agent') || '',
      today,
    );
    const ref =
      typeof input?.ref === 'string' && /^[\w.-]+$/.test(input.ref)
        ? input.ref.slice(0, 60)
        : '';
    const section =
      typeof input?.p === 'string' && /^[\w/-]{1,40}$/.test(input.p)
        ? input.p
        : '';
    const now = Date.now();
    const db = database();
    const stmts = [
      db.prepare(
        `INSERT INTO site_visitors (day, visitor, first_at, last_at, views, ref)
         VALUES (?, ?, ?, ?, 1, ?)
         ON CONFLICT(day, visitor) DO UPDATE SET last_at = excluded.last_at,
           views = views + 1`,
      ).bind(today, visitor, now, now, ref),
    ];
    if (section)
      stmts.push(
        db.prepare(
          `INSERT INTO site_views (day, section, views) VALUES (?, ?, 1)
           ON CONFLICT(day, section) DO UPDATE SET views = views + 1`,
        ).bind(today, section),
      );
    await db.batch(stmts);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof PayloadTooLargeError || error instanceof SyntaxError)
      return json({ error: '입력 형식을 확인해 주세요.' }, 400);
    return json({ error: '기록하지 못했습니다.' }, 503);
  }
}

/** 최근 30일 방문 집계 — 일별 방문자 수·조회 수만 돌려준다(집계라 개인
 *  정보 없음). 운영 확인과 공개 '누적 방문' 표시에 사용한다. */
export async function GET() {
  try {
    const db = database();
    const [visitors, sections] = await db.batch([
      db.prepare(
        `SELECT day, COUNT(*) AS visitors, SUM(views) AS views,
           SUM(CASE WHEN ref <> '' THEN 1 ELSE 0 END) AS referred
         FROM site_visitors WHERE day >= ? GROUP BY day ORDER BY day DESC LIMIT 30`,
      ).bind(day(Date.now() - 30 * 86400000)),
      db.prepare(
        `SELECT day, section, views FROM site_views WHERE day >= ? ORDER BY day DESC, views DESC`,
      ).bind(day(Date.now() - 30 * 86400000)),
    ]);
    return json({
      days: visitors.results ?? [],
      sections: sections.results ?? [],
    });
  } catch {
    return json({ error: '집계를 불러오지 못했습니다.' }, 503);
  }
}
