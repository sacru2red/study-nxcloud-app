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
  const barColor =
    percent >= 80 ? 'bg-error' : percent >= 50 ? 'bg-accent-sale' : 'bg-storm-deep'

  return (
    <div className="inline-flex items-center gap-2 text-xs text-graphite">
      <span>
        {formatBytes(usedBytes)} / {formatBytes(quotaBytes)}
      </span>
      <div className="h-2 w-20 overflow-hidden rounded-full bg-fog">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-graphite">{percent}%</span>
    </div>
  )
}
