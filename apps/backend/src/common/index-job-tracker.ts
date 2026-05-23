/** In-process index job state (single backend instance). */

const STALE_JOB_MS = 3 * 60 * 1000
/** DB embedded count unchanged for this long → treat as stalled (not "still working"). */
export const PROGRESS_STALL_MS = 90 * 1000

export type IndexJobPhase = 'extracting' | 'chunking' | 'embedding'

interface IndexJobState {
  documentId: string
  phase: IndexJobPhase
  startedAt: number
  lastActivityAt: number
  embeddedAtStart: number
  lastEmbeddedCount: number
  lastEmbeddedProgressAt: number
  lastError: string | null
  lastHttpStatus: number | null
}

const jobs = new Map<string, IndexJobState>()

export namespace IndexJobTracker {
  export function get(documentId: string): IndexJobState | undefined {
    return jobs.get(documentId)
  }

  export function isActive(documentId: string): boolean {
    const job = jobs.get(documentId)
    if (!job) {
      return false
    }
    return Date.now() - job.lastActivityAt < STALE_JOB_MS
  }

  /** Job exists but no chunk progress and no retry activity for a while. */
  export function isProgressStalled(documentId: string, dbEmbeddedCount: number): boolean {
    const job = jobs.get(documentId)
    if (!job) {
      return false
    }
    const idleMs = Date.now() - job.lastActivityAt
    return idleMs >= PROGRESS_STALL_MS && job.lastEmbeddedCount === dbEmbeddedCount
  }

  export function start(
    documentId: string,
    phase: IndexJobPhase,
    embeddedAtStart: number,
  ): void {
    const now = Date.now()
    jobs.set(documentId, {
      documentId,
      phase,
      startedAt: now,
      lastActivityAt: now,
      embeddedAtStart,
      lastEmbeddedCount: embeddedAtStart,
      lastEmbeddedProgressAt: now,
      lastError: null,
      lastHttpStatus: null,
    })
  }

  export function recordTransientError(
    documentId: string,
    error: string,
    httpStatus?: number,
  ): void {
    const job = jobs.get(documentId)
    if (!job) {
      return
    }
    job.lastError = error
    job.lastHttpStatus = httpStatus ?? null
    job.lastActivityAt = Date.now()
  }

  export function clearTransientError(documentId: string): void {
    const job = jobs.get(documentId)
    if (!job) {
      return
    }
    job.lastError = null
    job.lastHttpStatus = null
  }

  export function recordProgress(documentId: string, embeddedCount: number): void {
    const job = jobs.get(documentId)
    if (!job) {
      return
    }
    const now = Date.now()
    job.lastActivityAt = now
    if (embeddedCount > job.lastEmbeddedCount) {
      job.lastEmbeddedCount = embeddedCount
      job.lastEmbeddedProgressAt = now
    }
  }

  export function recordError(documentId: string, error: string): void {
    const job = jobs.get(documentId)
    if (job) {
      job.lastError = error
      job.lastActivityAt = Date.now()
    }
  }

  export function finish(documentId: string): void {
    jobs.delete(documentId)
  }
}
