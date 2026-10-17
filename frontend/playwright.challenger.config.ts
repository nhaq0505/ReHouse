import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4188',
    headless: true,
    trace: 'off',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4188',
    url: 'http://127.0.0.1:4188',
    reuseExistingServer: false,
  },
});
