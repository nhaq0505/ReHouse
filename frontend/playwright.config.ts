import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', fullyParallel: true, retries: 0,
  use: { baseURL: 'http://127.0.0.1:4178', headless: true, trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4178', url: 'http://127.0.0.1:4178', reuseExistingServer: false },
});
