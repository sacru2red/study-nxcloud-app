import 'dotenv/config'
import { PrismaClient } from './generated/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  const users = await prisma.user.findMany()

  for (const user of users) {
    const result = await prisma.document.aggregate({
      where: { ownerUserId: user.userId },
      _sum: { fileSize: true },
    })
    const newValue = result._sum.fileSize ?? 0n
    const oldValue = user.usedBytes

    if (oldValue !== newValue) {
      await prisma.user.update({
        where: { userId: user.userId },
        data: { usedBytes: newValue },
      })
    }

    console.log(
      `user=${user.email} used_bytes: ${oldValue.toString()} → ${newValue.toString()}${oldValue !== newValue ? ' (updated)' : ''}`,
    )
  }

  console.log('Backfill complete')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
