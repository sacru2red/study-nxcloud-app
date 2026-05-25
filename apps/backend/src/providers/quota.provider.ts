import { BadRequestException } from '@nestjs/common'
import { prisma } from '../prisma'
import { CacheProvider } from './cache.provider'

export interface UserQuotaSnapshot {
  usedBytes: number
  quotaBytes: number
  usagePercent: number
}

export function toUsagePercent(usedBytes: number, quotaBytes: number): number {
  if (quotaBytes <= 0) {
    return 0
  }
  return Math.min(100, Math.round((usedBytes / quotaBytes) * 100))
}

export namespace QuotaProvider {
  export const getUserQuota = async (userId: string): Promise<UserQuotaSnapshot> => {
    const cacheKey = `quota:${userId}`
    const cached = await CacheProvider.get<UserQuotaSnapshot>(cacheKey)
    if (cached) return cached

    const user = await prisma.user.findUnique({ where: { userId } })
    if (!user) throw new Error(`User not found: ${userId}`)

    const usedBytes = Number(user.usedBytes)
    const quotaBytes = Number(user.quotaBytes)
    const result = { usedBytes, quotaBytes, usagePercent: toUsagePercent(usedBytes, quotaBytes) }

    await CacheProvider.set(cacheKey, result, 120_000) // 2 min TTL
    return result
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
