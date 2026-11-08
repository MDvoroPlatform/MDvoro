import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node scripts/mock-supabase-auth.mjs', url: 'http://127.0.0.1:54321/auth/v1/health', reuseExistingServer: true },
    {
      command: 'npm run start -- --hostname 127.0.0.1',
      url: 'http://127.0.0.1:3000/api/health/live',
      reuseExistingServer: true,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'e2e-public-test-key',
        NEXT_PUBLIC_SITE_URL: 'https://127.0.0.1:3000',
        MDVORO_APP_ORIGIN: 'https://127.0.0.1:3000',
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
      },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['iPhone 13'] } }]
});
