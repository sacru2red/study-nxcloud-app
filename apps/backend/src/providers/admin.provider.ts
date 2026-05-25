import { prisma } from '../prisma'
import { toUsagePercent } from './quota.provider'

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

    const userUsages = users.map((user) => ({
      userId: user.userId,
      email: user.email,
      ncUserId: user.ncUserId,
      role: user.role,
      usedBytes: Number(user.usedBytes),
      quotaBytes: Number(user.quotaBytes),
      usagePercent: toUsagePercent(Number(user.usedBytes), Number(user.quotaBytes)),
      lastCollectedAt: collectedAt,
    }))

    return { tenantId, lastCollectedAt: collectedAt, users: userUsages }
  }
}
