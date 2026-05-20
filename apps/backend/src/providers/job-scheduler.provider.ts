import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { prisma } from '../prisma'

@Injectable()
export class JobSchedulerProvider {
  @Cron('* * * * *')
  async handleStuckDocuments(): Promise<void> {
    const threshold = new Date(Date.now() - 10 * 60 * 1000)

    const stuckDocuments = await prisma.document.findMany({
      where: {
        indexStatus: 'PROCESSING',
        updatedAt: { lt: threshold },
      },
    })

    if (stuckDocuments.length === 0) return

    for (const doc of stuckDocuments) {
      await prisma.document.update({
        where: { documentId: doc.documentId },
        data: { indexStatus: 'FAILED' },
      })
    }

    console.log(
      `[JobScheduler] Detected ${stuckDocuments.length} stuck document(s), marked as FAILED`,
    )
  }
}
