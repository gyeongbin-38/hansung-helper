# Production monitoring

GitHub Actions checks the seven production endpoints every 15 minutes with
`production-monitor.yml`. It validates HTTP success, content type, required
payloads, non-empty public snapshots, and snapshot age (36-hour limit). It also
checks that the daily refresh workflow has succeeded within the last 26 hours,
so a missed schedule is detected even before the snapshot-age limit expires.

The refresh job itself records crawler, publisher, and post-publication
verification output in its run log. Failures in either workflow open one
deduplicated `[자동 모니터링]` issue; later failures update that issue, and a
successful run comments on and closes it. Enable GitHub Actions and issue
notifications for the operators who need to receive those alerts.

The workflows need `issues: write`; the health check also needs `actions: read`
to inspect the refresh run history. Production snapshot refresh additionally
requires the Cloudflare Actions secrets listed in
[`public-snapshot-refresh.md`](public-snapshot-refresh.md).
