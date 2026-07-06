import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  globalSetup: './global-setup',
  testDir: './specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Local runs and CI use multiple workers across spec files to reduce total runtime.
  // Tests must be isolated because they share a single Wails dev backend/config.
  workers: 20,
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: process.env.WAILS_DEV_URL || 'http://localhost:34115',
    contextOptions: {
      permissions: ['clipboard-read', 'clipboard-write'],
    },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  outputDir: 'test-results/artifacts',
})
