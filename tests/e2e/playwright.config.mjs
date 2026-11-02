import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

if (!process.env.CMVS_E2E_BASE_URL?.startsWith('http://127.0.0.1:') || !process.env.CMVS_E2E_WORKSPACE) {
  throw Error('Run npm run test:e2e; the suite must use its disposable loopback environment.');
}
export default defineConfig({
  testDir: '.', testMatch: '*.spec.mjs', fullyParallel: false, workers: 1,
  timeout: 60000, expect: { timeout: 10000 }, retries: 0,
  outputDir: '../../test-results/browser',
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('../../test-results/e2e.json', import.meta.url)) }]],
  use: { baseURL: process.env.CMVS_E2E_BASE_URL, browserName: 'chromium',
    viewport: { width: 1440, height: 1000 }, acceptDownloads: true,
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    launchOptions: process.env.CMVS_BROWSER_PATH ? { executablePath: process.env.CMVS_BROWSER_PATH } : {},
  },
});
