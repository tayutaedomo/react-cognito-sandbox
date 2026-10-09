import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// E2E テスト用の環境変数を読み込む
dotenv.config({ path: path.resolve(__dirname, '.env.e2e') });

export default defineConfig({
  testDir: './tests',
  reporter: [['html', { outputFolder: path.resolve(__dirname, 'playwright-report') }]],
  outputDir: path.resolve(__dirname, 'test-results'),
  fullyParallel: true,
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
      cwd: path.resolve(__dirname, '../frontend'),
      env: {
        VITE_USE_MOCK_COGNITO: process.env.VITE_USE_MOCK_COGNITO || 'true',
        ...(process.env.VITE_USE_MOCK_COGNITO !== 'false'
          ? { VITE_API_ENDPOINT: 'http://localhost:8000' }
          : {}),
      },
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
    {
      command: 'uv run python -m uvicorn app.main:app --port 8000',
      cwd: path.resolve(__dirname, '../backend'),
      env: { USE_MOCK_COGNITO: '1' },
      url: 'http://localhost:8000/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    }
  ],
});
