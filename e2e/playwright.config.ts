import { defineConfig, devices } from '@playwright/test';

const daemonPort = Number(process.env.OD_PORT) || 17_456;
const webPort = Number(process.env.OD_WEB_PORT) || 17_573;
const baseURL = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: './specs',
  outputDir: './reports/test-results',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  reporter: process.env.CI
    ? [
        ['github'],
        ['list'],
        ['html', { open: 'never', outputFolder: './reports/playwright-html-report' }],
        ['json', { outputFile: './reports/results.json' }],
        ['junit', { outputFile: './reports/junit.xml' }],
        ['./reporters/markdown-reporter.ts', { outputFile: './reports/latest.md' }],
      ]
    : [
        ['list'],
        ['html', { open: 'never', outputFolder: './reports/playwright-html-report' }],
        ['json', { outputFile: './reports/results.json' }],
        ['junit', { outputFile: './reports/junit.xml' }],
        ['./reporters/markdown-reporter.ts', { outputFile: './reports/latest.md' }],
      ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // Two-entry webServer: daemon first (ready when /api/version responds),
  // then web dev server. Playwright 1.34+ supports array webServer with
  // per-entry env injection — no cross-env or shell tricks needed.
  webServer: [
    {
      command: 'pnpm --filter @clade/daemon dev',
      url: `http://127.0.0.1:${daemonPort}/api/version`,
      env: {
        OD_PORT: String(daemonPort),
        OD_DATA_DIR: 'e2e/.od-data',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @clade/web dev',
      url: baseURL,
      env: {
        OD_PORT: String(daemonPort),
        PORT: String(webPort),
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
