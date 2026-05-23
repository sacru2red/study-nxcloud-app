import 'dotenv/config'
import { PrismaClient, type Prisma } from 'prisma-client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
})

function resolvePrismaLogLevels(): Prisma.LogLevel[] {
  if (process.env['NODE_ENV'] !== 'development') {
    return []
  }
  const levels: Prisma.LogLevel[] = ['warn', 'error']
  if (process.env['PRISMA_LOG_QUERY'] === 'true') {
    levels.unshift('query')
  }
  return levels
}

export const prisma = new PrismaClient({ adapter, log: resolvePrismaLogLevels() })
