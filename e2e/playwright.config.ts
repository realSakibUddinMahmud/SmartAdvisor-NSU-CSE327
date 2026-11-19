import { defineConfig, devices } from '@playwright/test';

const skipWebServer =
  process.env.PW_SKIP_WEBSERVER === '1' || process.env.E2E_SKIP_WEBSERVER === '1';
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const apiBaseURL = process.env.E2E_API_URL || 'http://localhost:4000';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL,
    screenshot: 'on',
    video: 'on',
    trace: 'on',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: {
      slowMo: process.env.PW_SLOW_MO ? Number(process.env.PW_SLOW_MO) : 0,
    },
  },
  projects: [
    {
      name: 'desktop',
      grepInvert: /@mobile/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile',
      grep: /@mobile/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: skipWebServer
    ? undefined
    : [
        {
          command: 'npm --prefix ../services/api run build && npm --prefix ../services/api start',
          url: `${apiBaseURL}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            PORT: '4000',
            NODE_ENV: 'test',
            CORS_ORIGIN: baseURL,
            DEMO_DEFAULT_PASSWORD:
              process.env.DEMO_DEFAULT_PASSWORD || 'SmartAdvisor2025!',
          },
        },
        {
          command: 'npm --prefix ../apps/web run dev -- -p 3000',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            PORT: '3000',
            NEXT_PUBLIC_API_URL: `${apiBaseURL}/api/v1`,
          },
        },
      ],
});
