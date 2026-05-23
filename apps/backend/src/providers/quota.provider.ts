import { BadRequestException } from '@nestjs/common'
import { prisma } from '../prisma'
import { NextcloudProvider } from './nextcloud.provider'

export interface UserQuotaSnapshot {
  usedBytes: number
  quotaBytes: number
  usagePercent: number
}

async function sumOwnedFileBytes(userId: string): Promise<number> {
  const result = await prisma.document.aggregate({
    where: { ownerUserId: userId },
    _sum: { fileSize: true },
  })
  return Number(result._sum.fileSize ?? 0n)
}

function toUsagePercent(usedBytes: number, quotaBytes: number): number {
  if (quotaBytes <= 0) {
    return 0
  }
  return Math.min(100, Math.round((usedBytes / quotaBytes) * 100))
}

export namespace QuotaProvider {
  export const getUserQuota = async (userId: string): Promise<UserQuotaSnapshot> => {
    const user = await prisma.user.findUnique({ where: { userId } })
    if (!user) {
      throw new Error(`User not found: ${userId}`)
    }

    const [usedBytes, ncQuota] = await Promise.all([
      sumOwnedFileBytes(userId),
      NextcloudProvider.getUserQuota(user.ncUserId),
    ])

    const quotaBytes = ncQuota.total

    return {
      usedBytes,
      quotaBytes,
      usagePercent: toUsagePercent(usedBytes, quotaBytes),
    }
  }

  export const assertUploadAllowed = async (userId: string, fileSize: number): Promise<void> => {
    if (fileSize <= 0) {
      throw new BadRequestException('업로드할 파일이 비어 있습니다.')
    }

    const quota = await getUserQuota(userId)
    if (quota.quotaBytes <= 0) {
      return
    }

    if (quota.usedBytes + fileSize > quota.quotaBytes) {
      const remainingBytes = Math.max(0, quota.quotaBytes - quota.usedBytes)
      throw new BadRequestException(
        `저장공간 할당량을 초과하여 업로드할 수 없습니다. (사용 ${formatBytes(quota.usedBytes)} / ${formatBytes(quota.quotaBytes)}, 남은 용량 ${formatBytes(remainingBytes)})`,
      )
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
