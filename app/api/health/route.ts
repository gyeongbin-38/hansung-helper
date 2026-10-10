// 업타임 모니터링용 — 외부 체커(UptimeRobot·CF Health Checks)가 이
// 엔드포인트를 주기적으로 호출해 워커 생존을 확인한다.
export function GET() {
  return Response.json(
    { ok: true, now: Date.now() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
