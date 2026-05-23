export type IndexProgressPhase =
  | 'queued'
  | 'extracting'
  | 'chunking'
  | 'embedding'
  | 'completed'
  | 'failed'

export type IndexDiagnosticCode =
  | 'EMBEDDING_ACTIVE'
  | 'EMBEDDING_STALLED'
  | 'EMBEDDING_RATE_LIMITED'
  | 'AWAITING_WORKER'

export interface IndexDiagnosticData {
  code: IndexDiagnosticCode
  message: string
  hint: string
  retryRecommended: boolean
  httpStatus?: number | null
  apiError?: string | null
}

export interface IndexProgressData {
  phase: IndexProgressPhase
  progressPercent: number
  message: string
  totalChunks?: number
  embeddedChunks?: number
  pageCount?: number
  diagnostic?: IndexDiagnosticData | null
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
      <div className="flex items-center justify-between gap-2 text-[11px] text-graphite">
        <span>
          {phaseLabel} · {progress.progressPercent}%
        </span>
        {progress.totalChunks !== undefined && progress.totalChunks > 0 && (
          <span>
            {progress.embeddedChunks ?? 0}/{progress.totalChunks} 청크
          </span>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-fog">
        <div
          className={
            'h-full rounded-full transition-all duration-500' +
            (progress.phase === 'failed' ? ' bg-error' : ' bg-primary')
          }
          style={{ width: `${Math.min(100, Math.max(0, progress.progressPercent))}%` }}
        />
      </div>
      {!compact && (
        <p className="text-[11px] leading-snug text-graphite">{progress.message}</p>
      )}
      {progress.diagnostic && (
        <p
          className={
            'leading-snug' +
            (compact ? ' mt-1 text-[10px]' : ' mt-1 text-[11px]') +
            (progress.diagnostic.code === 'EMBEDDING_STALLED'
              ? ' text-accent-sale'
              : progress.diagnostic.code === 'EMBEDDING_RATE_LIMITED'
                ? ' text-accent-sale'
                : progress.diagnostic.code === 'EMBEDDING_ACTIVE'
                  ? ' text-storm-deep'
                  : ' text-graphite')
          }
        >
          <span className="font-medium">{progress.diagnostic.message}</span>
          <span className="text-graphite"> {progress.diagnostic.hint}</span>
        </p>
      )}
    </div>
  )
}
