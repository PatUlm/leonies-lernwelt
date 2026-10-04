import { defineConfig, devices } from '@playwright/test';

/**
 * UI tests in a real browser: `npm run test:ui`. They start their own API (with
 * an empty data directory) and Vite dev server on separate ports, so a running
 * `npm run dev` / `npm run api` does not interfere.
 */
const API_PORT = 8091;
const WEB_PORT = 5181;

export default defineConfig({
  testDir: 'e2e',
  // One API for all tests: profiles and the sign-up limit are shared.
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 } } },
    // Wide landscape: where the time-of-day card once ended up far from the question.
    { name: 'pc', use: { ...devices['Desktop Chrome'], viewport: { width: 1900, height: 1000 } } },
    // Small phone held sideways: the narrowest answer column.
    { name: 'phone-landscape', use: { ...devices['Desktop Chrome'], viewport: { width: 667, height: 375 } } },
  ],
  webServer: [
    {
      // Every test run signs up a profile per project and repetition.
      command: `rm -rf .data/e2e && DATA_DIR=.data/e2e PORT=${API_PORT} SIGNUPS_PER_CLIENT=100 node server/src/main.ts`,
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
    },
    {
      command: `API_URL=http://127.0.0.1:${API_PORT} npx vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
    },
  ],
});
