import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { nxE2EPreset } from '@nx/playwright/preset'
import { workspaceRoot } from '@nx/devkit'

const baseURL = process.env['BASE_URL'] || 'http://localhost:4200'
// MOCK_EMBEDDINGS는 E2E 통과용(토큰 해시 기반)으로 RAG 품질이 크게 떨어집니다.
// 데모 스크린샷/영상 품질이 필요하면 설정하지 말고 Gemini 할당량을 사용하세요.
const isDemoCaptureRun =
  process.argv.includes('--project=demo-capture') ||
  process.argv.some((arg) => arg.includes('demo-capture'))
const mockEmbeddingsEnabled = process.env['MOCK_EMBEDDINGS'] === 'true'
const reuseExistingServer = !process.env['CI'] && !isDemoCaptureRun

export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src' }),
  globalSetup: require.resolve('./src/global-setup.ts'),
  outputDir: join(workspaceRoot, 'test-results'),
  timeout: 60_000,
  // 동일 PDF를 같은 tenant에 병렬 업로드하면 Nextcloud WebDAV 423 Locked가 난다.
  workers: process.env['E2E_WORKERS'] ? Number(process.env['E2E_WORKERS']) : 1,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'node dist/apps/backend/main.js',
      url: 'http://localhost:3000/api',
      reuseExistingServer,
      cwd: workspaceRoot,
      timeout: 180_000,
      env: {
        ...process.env,
        MOCK_EMBEDDINGS: mockEmbeddingsEnabled ? 'true' : '',
      },
    },
    {
      command: 'npx vite',
      url: 'http://localhost:4200',
      reuseExistingServer,
      cwd: join(workspaceRoot, 'apps/frontend'),
      timeout: 180_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /demo-capture\.spec\.ts/,
    },
    {
      name: 'demo-capture',
      testMatch: /demo-capture\.spec\.ts/,
      timeout: 900_000,
      use: {
        video: 'on',
        viewport: { width: 1440, height: 900 },
        baseURL,
        trace: 'on-first-retry',
      },
      retries: 0,
    },
  ],
})
