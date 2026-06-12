import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.PORT ?? 4173)
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts$/,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1600, height: 1000 },
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    command: `node tests/e2e/static-server.mjs`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 15_000,
    env: { PORT: String(PORT) }
  }
})
