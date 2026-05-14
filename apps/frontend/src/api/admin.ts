import client from './client';

export interface UserUsage {
  userId: string;
  email: string;
  ncUserId: string;
  role: string;
  usedBytes: number;
  quotaBytes: number;
  usagePercent: number;
}

export const adminApi = {
  getUsersUsage: (tenantId: string) =>
    client
      .get<{
        tenantId: string;
        users: UserUsage[];
      }>(`/admin/tenants/${tenantId}/users-usage`)
      .then((r) => r.data),
};
