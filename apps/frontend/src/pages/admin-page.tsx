import { Navigate } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import { userAtom, isAuthenticatedAtom } from '../stores/auth';
import { useUsersUsage } from '../queries';

function ProgressBar({ percent }: { percent: number }) {
  const barColor =
    percent >= 80
      ? 'bg-red-500'
      : percent >= 50
        ? 'bg-yellow-500'
        : 'bg-green-500';

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
  );
}

export function AdminPage() {
  const isAuth = useAtomValue(isAuthenticatedAtom);
  const user = useAtomValue(userAtom);

  if (!isAuth) return <Navigate to="/login" />;
  if (user?.role !== 'admin') return <Navigate to="/" />;

  const { data, isLoading, isError, refetch } = useUsersUsage(user?.tenantId);

  return (
    <div className="mx-auto max-w-6xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            User storage usage for {user?.email}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-2">
            <svg
              className="h-6 w-6 animate-spin text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <p className="text-sm text-gray-400">Loading usage data...</p>
          </div>
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
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">NC User ID</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Used</th>
                <th className="px-4 py-3 font-medium">Quota</th>
                <th className="px-4 py-3 font-medium">Usage</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.users.map((u) => (
                <tr key={u.userId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {u.email}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{u.ncUserId}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        u.role === 'admin'
                          ? 'rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-600'
                          : 'rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500'
                      }
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {u.usedBytes > 0
                      ? `${(u.usedBytes / (1024 * 1024)).toFixed(1)} MB`
                      : '0 MB'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {u.quotaBytes > 0
                      ? `${(u.quotaBytes / (1024 * 1024)).toFixed(1)} MB`
                      : 'N/A'}
                  </td>
                  <td className="px-4 py-3">
                    <ProgressBar percent={u.usagePercent} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
