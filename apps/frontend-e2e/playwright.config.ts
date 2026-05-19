import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { nxE2EPreset } from '@nx/playwright/preset'
import { workspaceRoot } from '@nx/devkit'

const baseURL = process.env['BASE_URL'] || 'http://localhost:4200'
const isDemoCaptureRun =
  process.argv.includes('--project=demo-capture') ||
  process.argv.some((arg) => arg.includes('demo-capture'))
const mockEmbeddingsEnabled =
  process.env['MOCK_EMBEDDINGS'] === 'true' || isDemoCaptureRun
const reuseExistingServer = !process.env['CI'] && !mockEmbeddingsEnabled

export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src' }),
  globalSetup: require.resolve('./src/global-setup.ts'),
  outputDir: join(workspaceRoot, 'test-results'),
  timeout: 60_000,
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
      timeout: 180_000,
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
