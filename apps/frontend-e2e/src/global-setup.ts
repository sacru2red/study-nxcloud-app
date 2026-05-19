import { waitForPortOpen } from '@nx/node/utils'

export default async function globalSetup(): Promise<void> {
  const host = process.env.HOST ?? 'localhost'
  const backendPort = process.env.BACKEND_PORT ? Number(process.env.BACKEND_PORT) : 3000
  const frontendPort = process.env.FRONTEND_PORT
    ? Number(process.env.FRONTEND_PORT)
    : 4200

  await waitForPortOpen(backendPort, { host })
  await waitForPortOpen(frontendPort, { host })
}
