import { prisma } from '../prisma'
import { NextcloudProvider } from './nextcloud.provider'

export namespace AdminProvider {
  export const getUsersUsage = async (tenantId: string) => {
    const users = await prisma.user.findMany({ where: { tenantId } })

    const userUsages = await Promise.all(
      users.map(async (user) => {
        const quota = await NextcloudProvider.getUserQuota(user.ncUserId)
        return {
          userId: user.userId,
          email: user.email,
          ncUserId: user.ncUserId,
          role: user.role,
          usedBytes: quota.used,
          quotaBytes: quota.total,
          usagePercent: quota.relative,
        }
      }),
    )

    return { tenantId, users: userUsages }
  }
}
