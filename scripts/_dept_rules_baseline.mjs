// Read the active D1 rules before crawling. No account tables or writes are used.
import { readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const KIND = 'dept-rules';
function validSnapshot(value) {
  return value && value.source === 'hansung-dept-pages' && Array.isArray(value.items) &&
    value.items.length > 0 && value.itemCount === value.items.length &&
    value.items.every((item) => item && typeof item.url === 'string' && item.url.startsWith('https://www.hansung.ac.kr/')) &&
    typeof value.fetchedAt === 'string' && Number.isFinite(Date.parse(value.fetchedAt));
}
export async function mergeBaseline(query, bundled) {
  if (!validSnapshot(bundled)) throw new Error('invalid bundled department baseline');
  const pointerRows = await query(`${KIND}@active`);
  if (!Array.isArray(pointerRows) || pointerRows.length > 1 || (pointerRows.length && pointerRows[0].part !== -1))
    throw new Error('invalid department snapshot pointer');
  const pointer = pointerRows[0];
  let rows;
  if (pointer) {
    let manifest;
    try { manifest = JSON.parse(pointer.payload); } catch { throw new Error('invalid department snapshot manifest'); }
    if (!manifest || typeof manifest.kind !== 'string' || !manifest.kind.startsWith(`${KIND}@`) ||
        !Number.isSafeInteger(manifest.parts) || manifest.parts < 1 || manifest.parts > 10000)
      throw new Error('invalid department snapshot manifest');
    rows = await query(manifest.kind);
    if (!Array.isArray(rows) || rows.length !== manifest.parts || rows.some((row, i) =>
      row.part !== i || typeof row.payload !== 'string' || row.updated_at !== pointer.updated_at || row.fetched_at !== pointer.fetched_at))
      throw new Error('incomplete department snapshot');
    const again = await query(`${KIND}@active`);
    if (again.length !== 1 || again[0].payload !== pointer.payload || again[0].updated_at !== pointer.updated_at)
      throw new Error('department snapshot changed while reading');
  } else {
    rows = await query(KIND);
    if (!Array.isArray(rows)) throw new Error('invalid legacy department snapshot');
    if (!rows.length) return bundled;
    if (rows.some((row, i) => row.part !== i || typeof row.payload !== 'string' || row.fetched_at !== rows[0].fetched_at || row.updated_at !== rows[0].updated_at))
      throw new Error('incomplete legacy department snapshot');
  }
  let active;
  try { active = JSON.parse(rows.map((row) => row.payload).join('')); } catch { throw new Error('invalid department snapshot JSON'); }
  if (!validSnapshot(active) || active.fetchedAt !== rows[0].fetched_at)
    throw new Error('invalid active department snapshot');
  const items = new Map(bundled.items.map((item) => [item.url, item]));
  for (const item of active.items) items.set(item.url, item);
  return { ...active, itemCount: items.size, items: [...items.values()] };
}

async function main() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
  const database = process.env.HANSUNG_D1_DATABASE_ID ?? '';
  const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
  if (!/^[a-f0-9]{32}$/i.test(account) || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(database) || !token)
    throw new Error('department baseline credentials are not configured');
  const path = new URL('../lib/data/dept-rules.json', import.meta.url);
  const bundled = JSON.parse(readFileSync(path, 'utf8'));
  const query = async (kind) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT part, payload, fetched_at, updated_at FROM public_snapshots WHERE kind = ? ORDER BY part', params: [kind] }),
    });
    if (!response.ok) throw new Error('department baseline database query failed');
    const data = await response.json();
    if (!data?.success || !Array.isArray(data.result) || !data.result[0]?.success || !Array.isArray(data.result[0].results))
      throw new Error('invalid department baseline database response');
    return data.result[0].results;
  };
  const baseline = await mergeBaseline(query, bundled);
  const tmp = new URL(`../lib/data/.dept-baseline-${randomUUID()}.tmp`, import.meta.url);
  try {
    writeFileSync(tmp, JSON.stringify(baseline, null, 2) + '\n', { flag: 'wx' });
    renameSync(tmp, path);
  } finally {
    try { unlinkSync(tmp); } catch { /* already renamed */ }
  }
  console.log(`department baseline ready: ${baseline.items.length} public pages`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => { console.error('department baseline unavailable; previous published data remains active'); process.exitCode = 1; });
