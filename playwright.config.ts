import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './playwright-tests',
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  outputDir: 'output/playwright/results',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    channel: 'chrome',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'VITE_DEMO_MODE=false VITE_USE_FIREBASE_EMULATORS=true VITE_SHOW_FIREBASE_PANEL=true VITE_DEV_SERVER_HOST=127.0.0.1 VITE_DEV_SERVER_PORT=3100 bash scripts/start-local-dev.sh',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
