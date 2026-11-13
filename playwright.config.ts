import { defineConfig } from '@playwright/test';

// 대상 서버는 wrangler dev(:8787) — 로컬 D1 + 로컬 전용 키가 필요하다.
// 실행 전: npm run build && node scripts/setup-local.mjs && npm run d1:migrate:local
// CI(e2e.yml)는 위 단계를 자동으로 수행한 뒤 이 설정으로 테스트한다.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8787',
    locale: 'ko-KR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run start',
    // health가 200이어야 키·마이그레이션·공개 API가 모두 준비된 상태다.
    url: 'http://127.0.0.1:8787/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
