export type IndexProgressPhase =
  | 'queued'
  | 'extracting'
  | 'chunking'
  | 'embedding'
  | 'completed'
  | 'failed'

export interface IndexProgressData {
  phase: IndexProgressPhase
  progressPercent: number
  message: string
  totalChunks?: number
  embeddedChunks?: number
  pageCount?: number
}

interface IndexProgressDisplayProps {
  progress: IndexProgressData
  compact?: boolean
}

const phaseLabels: Record<string, string> = {
  queued: '대기',
  extracting: '추출',
  chunking: '분할',
  embedding: '임베딩',
  completed: '완료',
  failed: '실패',
}

export function IndexProgressDisplay({ progress, compact = false }: IndexProgressDisplayProps) {
  const phaseLabel = phaseLabels[progress.phase] ?? progress.phase

  return (
    <div className={compact ? 'mt-2' : 'mt-2 space-y-1'}>
      <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
        <span>
          {phaseLabel} · {progress.progressPercent}%
        </span>
        {progress.totalChunks !== undefined && progress.totalChunks > 0 && (
          <span>
            {progress.embeddedChunks ?? 0}/{progress.totalChunks} 청크
          </span>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
        <div
          className={
            'h-full rounded-full transition-all duration-500' +
            (progress.phase === 'failed' ? ' bg-red-400' : ' bg-blue-500')
          }
          style={{ width: `${Math.min(100, Math.max(0, progress.progressPercent))}%` }}
        />
      </div>
      {!compact && (
        <p className="text-[11px] leading-snug text-gray-500">{progress.message}</p>
      )}
    </div>
  )
}
