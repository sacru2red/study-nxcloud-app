import { execSync } from 'child_process'
import { join } from 'path'
import { config } from 'dotenv'
import { waitForPortOpen } from '@nx/node/utils'

/* eslint-disable */
var __TEARDOWN_MESSAGE__: string

const workspaceRoot = join(__dirname, '../../../../')

module.exports = async function () {
  console.log('\nSetting up e2e infrastructure...\n')

  config({ path: join(workspaceRoot, '.env') })

  execSync('docker compose -f infra/docker-compose.yml up -d', {
    cwd: workspaceRoot,
    stdio: 'inherit',
  })

  const host = process.env.HOST ?? 'localhost'
  await waitForPortOpen(5480, { host, retries: 60 })
  await waitForPortOpen(8081, { host, retries: 120 })

  execSync(
    'npx prisma db push --schema=prisma/schema.prisma --config=prisma/prisma.config.ts',
    { cwd: workspaceRoot, stdio: 'inherit', env: process.env },
  )
  execSync('npx tsx prisma/seed.ts', {
    cwd: workspaceRoot,
    stdio: 'inherit',
    env: process.env,
  })

  const port = process.env.PORT ? Number(process.env.PORT) : 3000
  await waitForPortOpen(port, { host })

  ;(globalThis as unknown as Record<string, string>).__TEARDOWN_MESSAGE__ =
    '\nTearing down...\n'
}
