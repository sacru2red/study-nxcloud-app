import type { Document } from 'prisma-client'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { prisma } from '../prisma'
import { NextcloudProvider } from './nextcloud.provider'
import { PdfWorkerProvider } from './pdf-worker.provider'
import { normalizeUploadFileName } from '../common/decode-upload-filename'
import { QuotaProvider } from './quota.provider'
import { buildIndexProgressSnapshot } from '../common/index-status.util'
import { IndexJobTracker, PROGRESS_STALL_MS } from '../common/index-job-tracker'

function formatRetryDuration(remainingChunks: number): string {
  const ms = remainingChunks * 1_500
  if (ms < 60_000) {
    return `약 ${Math.max(30, Math.round(ms / 1000))}초`
  }
  return `약 ${Math.ceil(ms / 60_000)}분`
}

export namespace FilesProvider {
  const toResponse = (doc: Document) => {
    const ncPath: string | null = doc.ncPath ?? null
    let ncDownloadUrl: string | null = null
    if (ncPath) {
      const ncUrl = process.env.NEXTCLOUD_URL || 'http://localhost:8081'
      const ncUser = process.env.NEXTCLOUD_ADMIN_USER || 'admin'
      const relativePath = ncPath.replace(/^\/files\/[^/]+\//, '')
      ncDownloadUrl = `${ncUrl}/remote.php/dav/files/${ncUser}/${relativePath}`
    }
    return {
      documentId: doc.documentId,
      tenantId: doc.tenantId,
      folderId: doc.folderId ?? null,
      fileName: normalizeUploadFileName(doc.fileName),
      ncPath,
      ncDownloadUrl,
      fileSize: Number(doc.fileSize),
      mimeType: doc.mimeType,
      indexStatus: doc.indexStatus,
      pageCount: doc.pageCount,
      chunkCount: doc.chunkCount,
      createdAt: doc.createdAt.toISOString(),
      indexedAt: doc.indexedAt?.toISOString() ?? null,
    }
  }

  export const uploadFile = async (
    tenantId: string,
    ownerUserId: string,
    file: {
      originalname: string
      buffer: Buffer
      mimetype: string
      size: number
    },
    folderId?: string,
  ) => {
    const fileName = normalizeUploadFileName(file.originalname)
    await QuotaProvider.assertUploadAllowed(ownerUserId, file.size)

    const ncResult = await NextcloudProvider.uploadFile(
      tenantId,
      fileName,
      file.buffer,
      file.mimetype,
    )

    const doc = await prisma.document.create({
      data: {
        tenantId,
        ownerUserId,
        folderId: folderId ?? null,
        ncFileId: ncResult.ncFileId,
        fileName,
        ncPath: ncResult.ncPath,
        mimeType: file.mimetype,
        fileSize: BigInt(file.size),
        indexStatus: 'PENDING',
      },
    })

    PdfWorkerProvider.processDocument(doc.documentId).catch((err) => {
      console.error(`[PdfWorker] Failed to process document ${doc.documentId}:`, err)
    })

    return toResponse(doc)
  }

  export const listFiles = async (tenantId: string) => {
    const docs = await prisma.document.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    })
    return docs.map(toResponse)
  }

  export const getIndexStatus = async (documentId: string, tenantId: string) => {
    const doc = await prisma.document.findFirst({
      where: { documentId, tenantId },
    })
    if (!doc) throw new NotFoundException('Document not found')
    const snapshot = await buildIndexProgressSnapshot(doc)
    return {
      ...snapshot,
      chunkCount: doc.chunkCount,
    }
  }

  export const getFileContent = async (documentId: string, tenantId: string) => {
    const doc = await prisma.document.findFirst({
      where: { documentId, tenantId },
    })

    if (!doc || !doc.ncPath) {
      throw new Error('Document not found')
    }

    const fileBuffer = await NextcloudProvider.getFile(tenantId, doc.fileName)

    return {
      fileName: normalizeUploadFileName(doc.fileName),
      mimeType: doc.mimeType ?? 'application/pdf',
      buffer: fileBuffer,
    }
  }

  export const retryIndex = async (
    documentId: string,
    tenantId: string,
  ): Promise<{
    documentId: string
    status: string
    resumed: boolean
    action: 'resumed' | 'already_running' | 'completed' | 'restarted'
    message: string
  }> => {
    const doc = await prisma.document.findFirst({
      where: { documentId, tenantId },
    })
    if (!doc) throw new NotFoundException('Document not found')
    if (doc.indexStatus === 'COMPLETED') {
      throw new BadRequestException('Cannot retry a completed document')
    }

    const totalChunks = await prisma.documentChunk.count({ where: { documentId } })
    const embeddedRows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM document_chunks
      WHERE document_id = ${documentId}::uuid
        AND embedding IS NOT NULL
    `
    const embeddedChunks = embeddedRows[0]?.count ?? 0

    if (totalChunks > 0 && embeddedChunks >= totalChunks) {
      await prisma.document.update({
        where: { documentId },
        data: {
          indexStatus: 'COMPLETED',
          chunkCount: totalChunks,
          indexedAt: new Date(),
        },
      })
      return {
        documentId,
        status: 'COMPLETED',
        resumed: false,
        action: 'completed',
        message: '모든 청크 임베딩이 완료되어 문서를 COMPLETED로 표시했습니다.',
      }
    }

    if (totalChunks > 0) {
      const idleMs = Date.now() - doc.updatedAt.getTime()
      const progressStalled =
        idleMs >= PROGRESS_STALL_MS || IndexJobTracker.isProgressStalled(documentId, embeddedChunks)

      if (IndexJobTracker.isActive(documentId) && !progressStalled) {
        const remaining = totalChunks - embeddedChunks
        return {
          documentId,
          status: 'PROCESSING',
          resumed: false,
          action: 'already_running',
          message: `임베딩 진행 중 (${embeddedChunks}/${totalChunks}). 남은 ${remaining}개 · ${formatRetryDuration(remaining)} 예상 — 숫자가 오르면 재시도하지 않아도 됩니다.`,
        }
      }

      if (IndexJobTracker.isActive(documentId) && progressStalled) {
        IndexJobTracker.finish(documentId)
      }

      await prisma.document.update({
        where: { documentId },
        data: { indexStatus: 'PROCESSING' },
      })
      const remaining = totalChunks - embeddedChunks
      PdfWorkerProvider.resumeDocument(documentId).catch((err) => {
        console.error(`[PdfWorker] Resume failed for document ${documentId}:`, err)
      })
      return {
        documentId,
        status: 'PROCESSING',
        resumed: true,
        action: 'resumed',
        message: `임베딩 재개 (${embeddedChunks}/${totalChunks} 완료). 남은 ${remaining}개 청크를 처리합니다.`,
      }
    }

    await prisma.documentChunk.deleteMany({ where: { documentId } })
    await prisma.document.update({
      where: { documentId },
      data: {
        indexStatus: 'PENDING',
        pageCount: 0,
        chunkCount: 0,
        indexedAt: null,
      },
    })

    PdfWorkerProvider.processDocument(documentId).catch((err) => {
      console.error(`[PdfWorker] Retry failed for document ${documentId}:`, err)
    })

    return {
      documentId,
      status: 'PENDING',
      resumed: false,
      action: 'restarted',
      message: '청크가 없어 처음부터 인덱싱을 다시 시작합니다.',
    }
  }
}
