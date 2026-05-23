import { formatBytes } from '../lib/quota.util'

export interface StorageIndicatorProps {
  usedBytes: number
  quotaBytes: number
}

export function StorageIndicator({ usedBytes, quotaBytes }: StorageIndicatorProps) {
  if (quotaBytes <= 0) return null

  const percent = Math.min(100, Math.round((usedBytes / quotaBytes) * 100))
  const barColor =
    percent >= 100
      ? 'bg-semantic-error'
      : percent >= 80
        ? 'bg-accent-sale'
        : percent >= 50
          ? 'bg-accent-sale'
          : 'bg-storm-deep'

  return (
    <div className="text-graphite inline-flex items-center gap-2 text-xs tabular-nums">
      <span>
        {formatBytes(usedBytes)} / {formatBytes(quotaBytes)}
      </span>
      <div className="bg-fog h-2 w-20 overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-graphite">{percent}%</span>
    </div>
  )
}
