import type { Document } from 'prisma-client'
import { prisma } from '../prisma'
import { IndexJobTracker, PROGRESS_STALL_MS } from './index-job-tracker'

export type IndexPhase = 'queued' | 'extracting' | 'chunking' | 'embedding' | 'completed' | 'failed'

export interface IndexDiagnostic {
  code: 'EMBEDDING_ACTIVE' | 'EMBEDDING_STALLED' | 'EMBEDDING_RATE_LIMITED' | 'AWAITING_WORKER'
  message: string
  hint: string
  retryRecommended: boolean
  httpStatus?: number | null
  apiError?: string | null
}

export interface IndexProgressSnapshot {
  documentId: string
  status: string
  phase: IndexPhase
  progressPercent: number
  message: string
  pageCount: number
  totalChunks: number
  embeddedChunks: number
  fileSize: number
  diagnostic: IndexDiagnostic | null
}

const STALE_DOCUMENT_MS = PROGRESS_STALL_MS
/** chunk embed delay (1s) + typical API latency */
const MS_PER_REMAINING_CHUNK_ESTIMATE = 1_500

function formatRemainingDuration(remainingChunks: number): string {
  const ms = remainingChunks * MS_PER_REMAINING_CHUNK_ESTIMATE
  if (ms < 60_000) {
    return `약 ${Math.max(30, Math.round(ms / 1000))}초`
  }
  return `약 ${Math.ceil(ms / 60_000)}분`
}

function formatIdleDuration(idleMs: number): string {
  if (idleMs < 60_000) {
    return `${Math.max(1, Math.round(idleMs / 1000))}초`
  }
  return `${Math.floor(idleMs / 60_000)}분`
}

function isEmbeddingStalled(doc: Document, embeddedChunks: number): boolean {
  if (IndexJobTracker.get(doc.documentId)) {
    return IndexJobTracker.isProgressStalled(doc.documentId, embeddedChunks)
  }
  return Date.now() - doc.updatedAt.getTime() >= STALE_DOCUMENT_MS
}

function buildRateLimitDiagnostic(job: NonNullable<ReturnType<typeof IndexJobTracker.get>>): IndexDiagnostic {
  const httpStatus = job.lastHttpStatus ?? 429
  return {
    code: 'EMBEDDING_RATE_LIMITED',
    message: `임베딩 API 할당량 초과 (HTTP ${httpStatus}). 자동 재시도 중…`,
    hint: job.lastError ?? '잠시 후 진행률이 다시 오릅니다.',
    retryRecommended: false,
    httpStatus,
    apiError: job.lastError,
  }
}

async function countEmbeddedChunks(documentId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM document_chunks
    WHERE document_id = ${documentId}::uuid
      AND embedding IS NOT NULL
  `
  return rows[0]?.count ?? 0
}

function resolveEmbeddingDiagnostic(
  doc: Document,
  embeddedChunks: number,
  totalChunks: number,
): IndexDiagnostic | null {
  if (totalChunks === 0 || embeddedChunks >= totalChunks) {
    return null
  }

  const idleMs = Date.now() - doc.updatedAt.getTime()
  const job = IndexJobTracker.get(doc.documentId)

  if (isEmbeddingStalled(doc, embeddedChunks)) {
    const stalled: IndexDiagnostic = {
      code: 'EMBEDDING_STALLED',
      message: `임베딩이 ${embeddedChunks}/${totalChunks}에서 ${formatIdleDuration(idleMs)}간 멈춘 것으로 보입니다.`,
      hint: '재시도를 눌러 남은 청크부터 이어서 진행하세요.',
      retryRecommended: true,
      apiError: job?.lastError ?? null,
      httpStatus: job?.lastHttpStatus ?? null,
    }
    if (job?.lastError) {
      stalled.hint = `${job.lastError} 재시도를 눌러 이어서 진행하세요.`
    }
    return stalled
  }

  if (job?.lastHttpStatus === 429 && IndexJobTracker.isActive(doc.documentId)) {
    return buildRateLimitDiagnostic(job)
  }

  if (IndexJobTracker.isActive(doc.documentId)) {
    const remaining = totalChunks - embeddedChunks
    return {
      code: 'EMBEDDING_ACTIVE',
      message: '임베딩 작업이 진행 중입니다.',
      hint: `남은 ${remaining}개 · ${formatRemainingDuration(remaining)} 예상. ${embeddedChunks}→${embeddedChunks + 1}처럼 위 숫자가 오르면 정상입니다.`,
      retryRecommended: false,
    }
  }

  if (doc.indexStatus === 'PROCESSING') {
    return {
      code: 'AWAITING_WORKER',
      message: '임베딩을 시작하는 중입니다.',
      hint: '90초 넘게 숫자가 변하지 않으면 재시도를 눌러 주세요.',
      retryRecommended: true,
    }
  }

  return null
}

export async function buildIndexProgressSnapshot(
  doc: Document,
): Promise<IndexProgressSnapshot> {
  const fileSize = Number(doc.fileSize)
  const totalChunks = await prisma.documentChunk.count({ where: { documentId: doc.documentId } })
  const embeddedChunks = await countEmbeddedChunks(doc.documentId)

  if (doc.indexStatus === 'COMPLETED') {
    return {
      documentId: doc.documentId,
      status: doc.indexStatus,
      phase: 'completed',
      progressPercent: 100,
      message: '인덱싱 완료',
      pageCount: doc.pageCount,
      totalChunks: doc.chunkCount || totalChunks,
      embeddedChunks: doc.chunkCount || totalChunks,
      fileSize,
      diagnostic: null,
    }
  }

  if (doc.indexStatus === 'FAILED') {
    const partial = totalChunks > 0 && embeddedChunks < totalChunks
    const failedJob = IndexJobTracker.get(doc.documentId)
    return {
      documentId: doc.documentId,
      status: doc.indexStatus,
      phase: 'failed',
      progressPercent: partial
        ? Math.min(99, Math.round((embeddedChunks / totalChunks) * 100))
        : 0,
      message: partial
        ? `인덱싱 실패 (임베딩 ${embeddedChunks}/${totalChunks}) — 재시도 시 이어서 진행`
        : '인덱싱 실패 — 재시도',
      pageCount: doc.pageCount,
      totalChunks,
      embeddedChunks,
      fileSize,
      diagnostic: partial
        ? {
            code: 'EMBEDDING_STALLED',
            message: `임베딩 ${embeddedChunks}/${totalChunks}에서 실패했습니다.`,
            hint: failedJob?.lastError
              ? `${failedJob.lastError} 재시도를 눌러 이어서 진행하세요.`
              : '재시도를 눌러 남은 청크부터 이어서 진행하세요.',
            retryRecommended: true,
            httpStatus: failedJob?.lastHttpStatus ?? null,
            apiError: failedJob?.lastError ?? null,
          }
        : null,
    }
  }

  if (doc.indexStatus === 'PENDING') {
    return {
      documentId: doc.documentId,
      status: doc.indexStatus,
      phase: 'queued',
      progressPercent: 0,
      message: '인덱싱 대기 중',
      pageCount: doc.pageCount,
      totalChunks,
      embeddedChunks,
      fileSize,
      diagnostic: null,
    }
  }

  // PROCESSING
  if (doc.pageCount === 0) {
    return {
      documentId: doc.documentId,
      status: doc.indexStatus,
      phase: 'extracting',
      progressPercent: 8,
      message: `PDF 텍스트 추출 중 (${formatMb(fileSize)})`,
      pageCount: 0,
      totalChunks,
      embeddedChunks,
      fileSize,
      diagnostic: null,
    }
  }

  if (totalChunks > 0 && embeddedChunks < totalChunks) {
    const embedBase = 35
    const embedRange = 64
    const progressPercent = embedBase + Math.round((embedRange * embeddedChunks) / totalChunks)
    return {
      documentId: doc.documentId,
      status: doc.indexStatus,
      phase: 'embedding',
      progressPercent,
      message: `임베딩 생성 중 ${embeddedChunks}/${totalChunks} (청크당 API 호출·대기 포함)`,
      pageCount: doc.pageCount,
      totalChunks,
      embeddedChunks,
      fileSize,
      diagnostic: resolveEmbeddingDiagnostic(doc, embeddedChunks, totalChunks),
    }
  }

  const created = Math.max(doc.chunkCount, totalChunks)
  const chunkProgress = created > 0 ? Math.min(34, 12 + Math.floor(created / 10)) : 15

  return {
    documentId: doc.documentId,
    status: doc.indexStatus,
    phase: 'chunking',
    progressPercent: chunkProgress,
    message:
      created > 0
        ? `청크 분할 중 (${doc.pageCount}페이지 · ${created}개 생성됨)`
        : `청크 분할 중 (${doc.pageCount}페이지)`,
    pageCount: doc.pageCount,
    totalChunks: created,
    embeddedChunks,
    fileSize,
    diagnostic: null,
  }
}

function formatMb(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)}KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
