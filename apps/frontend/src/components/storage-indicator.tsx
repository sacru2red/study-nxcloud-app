export interface StorageIndicatorProps {
  usedBytes: number
  quotaBytes: number
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + ' KB'
  }
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export function StorageIndicator({ usedBytes, quotaBytes }: StorageIndicatorProps) {
  if (quotaBytes <= 0) return null

  const percent = Math.min(100, Math.round((usedBytes / quotaBytes) * 100))
  const barColor = percent >= 80 ? 'bg-red-500' : percent >= 50 ? 'bg-yellow-500' : 'bg-green-500'

  return (
    <div className="inline-flex items-center gap-2 text-xs text-gray-500">
      <span>
        {formatBytes(usedBytes)} / {formatBytes(quotaBytes)}
      </span>
      <div className="h-2 w-20 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-gray-400">{percent}%</span>
    </div>
  )
}
