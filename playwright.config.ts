import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3100);
const BASE = `http://127.0.0.1:${PORT}`;

/**
 * Playwright config — boots `next start` against the production build,
 * runs the e2e/ specs, then tears it down.
 *
 * The tests intentionally avoid third-party services. Anything that
 * would call Stripe / Anthropic / Supabase is intercepted with route
 * mocks — see `e2e/fixtures.ts`. This makes the suite deterministic
 * and runnable in CI without secrets.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Build-time / runtime defaults that keep the app rendering even
      // without real provider credentials.
      NEXT_PUBLIC_APP_URL: BASE,
      NEXT_PUBLIC_APP_NAME: 'LexyFlow',
      NEXT_PUBLIC_SUPABASE_URL: 'https://e2e.supabase.invalid',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key-not-real',
      DEFAULT_LOCALE: 'en'
    }
  }
});
