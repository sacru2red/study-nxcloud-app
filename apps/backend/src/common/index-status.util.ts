import type { Document } from 'prisma-client'
import { prisma } from '../prisma'

export type IndexPhase = 'queued' | 'extracting' | 'chunking' | 'embedding' | 'completed' | 'failed'

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
    }
  }

  if (doc.indexStatus === 'FAILED') {
    const partial = totalChunks > 0 && embeddedChunks < totalChunks
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
  }
}

function formatMb(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)}KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
