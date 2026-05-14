import { tags } from 'typia';

export namespace AdminDto {
  export interface UserUsage {
    userId: string & tags.Format<'uuid'>;
    email: string;
    ncUserId: string;
    role: string;
    usedBytes: number;
    quotaBytes: number;
    usagePercent: number;
  }

  export interface UsersUsageResponse {
    tenantId: string & tags.Format<'uuid'>;
    users: UserUsage[];
  }
}
