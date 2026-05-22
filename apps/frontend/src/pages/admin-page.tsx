import { useState } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import { userAtom, isAuthenticatedAtom } from '../stores/auth'
import { useAdminTenants, useUsersUsage } from '../queries'

function ProgressBar({ percent }: { percent: number }) {
  const barColor = percent >= 80 ? 'bg-red-500' : percent >= 50 ? 'bg-yellow-500' : 'bg-green-500'

  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <span className="w-10 text-right text-xs text-gray-500">{percent}%</span>
    </div>
  )
}

export function AdminPage() {
  const isAuth = useAtomValue(isAuthenticatedAtom)
  const user = useAtomValue(userAtom)
  const { data: tenantsData } = useAdminTenants(user?.role === 'admin')
  const [selectedTenantId, setSelectedTenantId] = useState<string | undefined>(user?.tenantId)

  const activeTenantId = selectedTenantId ?? user?.tenantId
  const { data, isLoading, isError, refetch } = useUsersUsage(activeTenantId)

  if (!isAuth) return <Navigate to="/login" />
  if (user?.role !== 'admin') return <Navigate to="/" />

  return (
    <div className="mx-auto max-w-6xl p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Tenant별 사용자 저장공간 사용량</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600" htmlFor="tenant-select">
            회사(Tenant)
          </label>
          <select
            id="tenant-select"
            value={activeTenantId ?? ''}
            onChange={(event) => setSelectedTenantId(event.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            {(tenantsData?.tenants ?? []).map((tenant) => (
              <option key={tenant.tenantId} value={tenant.tenantId}>
                {tenant.name} ({tenant.ncGroupId})
              </option>
            ))}
          </select>
          <button
            onClick={() => refetch()}
            className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-gray-400">Loading usage data...</p>
        </div>
      )}

      {isError && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
          Failed to load usage data. Please try again.
        </div>
      )}

      {data && data.users.length === 0 && (
        <div className="rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-400">
          No users found for this tenant.
        </div>
      )}

      {data && data.users.length > 0 && (
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <p className="border-b px-4 py-2 text-xs text-gray-500">
            수집 시각: {new Date(data.lastCollectedAt).toLocaleString()}
          </p>
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Used</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Quota</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Usage</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Collected</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((row) => (
                <tr key={row.userId} className="border-b last:border-0">
                  <td className="px-4 py-3 text-gray-800">{row.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        'rounded px-1.5 py-0.5 text-xs font-medium' +
                        (row.role === 'admin'
                          ? ' bg-purple-100 text-purple-700'
                          : ' bg-gray-100 text-gray-600')
                      }
                    >
                      {row.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {(row.usedBytes / (1024 * 1024)).toFixed(1)} MB
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {(row.quotaBytes / (1024 * 1024)).toFixed(0)} MB
                  </td>
                  <td className="px-4 py-3">
                    <ProgressBar percent={row.usagePercent} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(row.lastCollectedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
