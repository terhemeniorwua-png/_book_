import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.E2E_WEB_ORIGIN ?? 'http://127.0.0.1:3015',
  },
  webServer: [
    {
      command: 'node e2e/mock-api.mjs',
      url: 'http://127.0.0.1:4100/health',
      reuseExistingServer: !process.env.CI,
      timeout: 20_000,
      env: {
        E2E_WEB_ORIGIN: process.env.E2E_WEB_ORIGIN ?? 'http://127.0.0.1:3015',
      },
    },
    {
      command: 'pnpm exec next dev --port 3015',
      url: process.env.E2E_WEB_ORIGIN ?? 'http://127.0.0.1:3015',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        API_BASE_URL: 'http://127.0.0.1:4100/api/v1',
        NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4100/api/v1',
        NEXT_PUBLIC_APP_URL:
          process.env.E2E_WEB_ORIGIN ?? 'http://127.0.0.1:3015',
        E2E_NEXT_DIST_DIR: '.next-e2e',
      },
    },
  ],
});
