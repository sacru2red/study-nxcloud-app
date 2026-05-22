import { prisma } from '../prisma'
import { NextcloudProvider } from './nextcloud.provider'

export namespace AdminProvider {
  export const listTenants = async () => {
    const tenants = await prisma.tenant.findMany({
      orderBy: { name: 'asc' },
      select: { tenantId: true, name: true, ncGroupId: true },
    })
    return { tenants }
  }

  export const getUsersUsage = async (tenantId: string) => {
    const collectedAt = new Date().toISOString()
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
          lastCollectedAt: collectedAt,
        }
      }),
    )

    return { tenantId, lastCollectedAt: collectedAt, users: userUsages }
  }
}
