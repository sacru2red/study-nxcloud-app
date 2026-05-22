import { tags } from 'typia'

export namespace AdminDto {
  export interface TenantSummary {
    tenantId: string & tags.Format<'uuid'>
    name: string
    ncGroupId: string
  }

  export interface TenantListResponse {
    tenants: TenantSummary[]
  }

  export interface UserUsage {
    userId: string & tags.Format<'uuid'>
    email: string
    ncUserId: string
    role: string
    usedBytes: number
    quotaBytes: number
    usagePercent: number
    lastCollectedAt: string & tags.Format<'date-time'>
  }

  export interface UsersUsageResponse {
    tenantId: string & tags.Format<'uuid'>
    lastCollectedAt: string & tags.Format<'date-time'>
    users: UserUsage[]
  }
}
