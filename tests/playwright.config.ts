// playwright.config.ts — Image Pro extension tests
// Connects to Chrome already running with the extension loaded via CDP
// (port 9229). See test file for launch command.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4096',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium-cdp',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
