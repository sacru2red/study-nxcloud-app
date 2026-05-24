import pdfParse from 'pdf-parse'
import { prisma } from '../prisma'
import { NextcloudProvider } from './nextcloud.provider'
import { EmbeddingProvider } from './embedding.provider'
import { IndexJobTracker } from '../common/index-job-tracker'
import { describeEmbedApiError } from '../common/embed-api-error.util'
import type { PdfChunkRow } from '../common/pdf-bbox.types'
import {
  chunkParagraphs,
  extractPageParagraphsFromPdf,
  serializeBbox,
} from '../common/pdf-layout.util'

const pdf = pdfParse as unknown as (
  dataBuffer: Buffer,
) => Promise<{ numpages: number; text: string }>

const CHUNK_SIZE = 500
const CHUNK_OVERLAP = 100
const CHUNK_PROGRESS_UPDATE_INTERVAL = 20

type ChunkRow = PdfChunkRow

export namespace PdfWorkerProvider {
  export const processDocument = async (documentId: string) => {
    await runFullPipeline(documentId)
  }

  export const resumeDocument = async (documentId: string) => {
    const doc = await prisma.document.findUnique({ where: { documentId } })
    if (!doc) return

    try {
      const totalChunks = await prisma.documentChunk.count({ where: { documentId } })
      const embeddedAtStart = await countEmbeddedChunks(documentId)

      if (totalChunks > 0) {
        if (embeddedAtStart >= totalChunks) {
          await markCompleted(documentId, doc.pageCount, totalChunks)
          return
        }

        await prisma.document.update({
          where: { documentId },
          data: { indexStatus: 'PROCESSING' },
        })

        const pending = await listChunksMissingEmbedding(documentId)
        await embedPendingChunks(documentId, doc.tenantId, pending, embeddedAtStart, totalChunks)
        await markCompleted(documentId, doc.pageCount, totalChunks)
        return
      }

      if (doc.pageCount > 0) {
        await runChunkAndEmbedFromStoredPdf(documentId, doc)
        return
      }

      await runFullPipeline(documentId)
    } catch (error) {
      const detail = describeEmbedApiError(error)
      IndexJobTracker.recordTransientError(documentId, detail.message, detail.httpStatus)
      await prisma.document.update({
        where: { documentId },
        data: { indexStatus: 'FAILED' },
      })
      console.error(`[PdfWorker] Resume failed for document ${documentId}:`, detail.message)
      throw error
    }
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

async function listChunksMissingEmbedding(
  documentId: string,
): Promise<Array<{ chunkId: string; text: string }>> {
  const rows = await prisma.$queryRaw<Array<{ chunk_id: string; chunk_text: string }>>`
    SELECT chunk_id, chunk_text
    FROM document_chunks
    WHERE document_id = ${documentId}::uuid
      AND embedding IS NULL
    ORDER BY page_no ASC, paragraph_no ASC
  `
  return rows.map((row) => ({ chunkId: row.chunk_id, text: row.chunk_text }))
}

async function runFullPipeline(documentId: string) {
  const doc = await prisma.document.findUnique({ where: { documentId } })
  if (!doc) return

  await prisma.document.update({
    where: { documentId },
    data: {
      indexStatus: 'PROCESSING',
      pageCount: 0,
      chunkCount: 0,
      indexedAt: null,
    },
  })

  try {
    const buffer = await NextcloudProvider.getFile(doc.tenantId, doc.fileName)
    const { pageCount, chunks } = await extractChunks(buffer)
    await prisma.document.update({
      where: { documentId },
      data: { pageCount },
    })

    const totalChunks = await persistChunks(documentId, doc.tenantId, chunks)
    const pending = await listChunksMissingEmbedding(documentId)
    await embedPendingChunks(documentId, doc.tenantId, pending, 0, totalChunks)
    await markCompleted(documentId, pageCount, totalChunks)
  } catch (error) {
    const detail = describeEmbedApiError(error)
    IndexJobTracker.recordTransientError(documentId, detail.message, detail.httpStatus)
    await prisma.document.update({
      where: { documentId },
      data: { indexStatus: 'FAILED' },
    })
    console.error(`[PdfWorker] Pipeline failed for document ${documentId}:`, detail.message)
    throw error
  }
}

async function runChunkAndEmbedFromStoredPdf(
  documentId: string,
  doc: { tenantId: string; fileName: string; pageCount: number },
) {
  await prisma.document.update({
    where: { documentId },
    data: { indexStatus: 'PROCESSING', chunkCount: 0 },
  })

  try {
    const buffer = await NextcloudProvider.getFile(doc.tenantId, doc.fileName)
    const { pageCount, chunks: allChunks } = await extractChunks(buffer)
    await prisma.document.update({
      where: { documentId },
      data: { pageCount },
    })

    const existingKeys = await loadExistingChunkKeys(documentId)
    let created = 0

    for (const chunk of allChunks) {
      const key = chunkKey(chunk.pageNo, chunk.paragraphNo)
      if (existingKeys.has(key)) {
        continue
      }
      await prisma.documentChunk.create({
        data: {
          documentId,
          tenantId: doc.tenantId,
          pageNo: chunk.pageNo,
          paragraphNo: chunk.paragraphNo,
          chunkText: chunk.text,
          bboxJson: serializeBbox(chunk.bbox),
        },
      })
      existingKeys.add(key)
      created += 1
      if (created % CHUNK_PROGRESS_UPDATE_INTERVAL === 0) {
        const total = await prisma.documentChunk.count({ where: { documentId } })
        await prisma.document.update({
          where: { documentId },
          data: { chunkCount: total },
        })
      }
    }

    const totalChunks = await prisma.documentChunk.count({ where: { documentId } })
    await prisma.document.update({
      where: { documentId },
      data: { chunkCount: totalChunks },
    })

    const pending = await listChunksMissingEmbedding(documentId)
    const embeddedBefore = await countEmbeddedChunks(documentId)
    await embedPendingChunks(documentId, doc.tenantId, pending, embeddedBefore, totalChunks)
    await markCompleted(documentId, pageCount, totalChunks)
  } catch (error) {
    const detail = describeEmbedApiError(error)
    IndexJobTracker.recordTransientError(documentId, detail.message, detail.httpStatus)
    await prisma.document.update({
      where: { documentId },
      data: { indexStatus: 'FAILED' },
    })
    console.error(`[PdfWorker] Pipeline failed for document ${documentId}:`, detail.message)
    throw error
  }
}

async function loadExistingChunkKeys(documentId: string): Promise<Set<string>> {
  const rows = await prisma.documentChunk.findMany({
    where: { documentId },
    select: { pageNo: true, paragraphNo: true },
  })
  return new Set(rows.map((row) => chunkKey(row.pageNo, row.paragraphNo)))
}

function chunkKey(pageNo: number, paragraphNo: number): string {
  return `${pageNo}:${paragraphNo}`
}

async function persistChunks(
  documentId: string,
  tenantId: string,
  chunks: ChunkRow[],
): Promise<number> {
  await prisma.documentChunk.deleteMany({ where: { documentId } })

  let processedChunkCount = 0
  for (const chunk of chunks) {
    await prisma.documentChunk.create({
      data: {
        documentId,
        tenantId,
        pageNo: chunk.pageNo,
        paragraphNo: chunk.paragraphNo,
        chunkText: chunk.text,
        bboxJson: serializeBbox(chunk.bbox),
      },
    })
    processedChunkCount += 1
    if (
      processedChunkCount % CHUNK_PROGRESS_UPDATE_INTERVAL === 0 ||
      processedChunkCount === chunks.length
    ) {
      await prisma.document.update({
        where: { documentId },
        data: { chunkCount: processedChunkCount },
      })
    }
  }

  return chunks.length
}

async function embedPendingChunks(
  documentId: string,
  tenantId: string,
  pending: Array<{ chunkId: string; text: string }>,
  embeddedBefore = 0,
  totalChunks?: number,
) {
  if (pending.length === 0) {
    return
  }

  console.log(
    `[PdfWorker] embedPendingChunks start documentId=${documentId} pending=${pending.length}`,
  )

  const ownsJob = !IndexJobTracker.isActive(documentId)
  if (ownsJob) {
    IndexJobTracker.start(documentId, 'embedding', embeddedBefore)
  }

  try {
    let doneInBatch = 0
    await EmbeddingProvider.batchEmbedAndStore(tenantId, pending, {
      documentId,
      onChunkDone: async () => {
        doneInBatch += 1
        const embeddedNow = embeddedBefore + doneInBatch
        IndexJobTracker.recordProgress(documentId, embeddedNow)
        if (doneInBatch % 10 === 0) {
          await prisma.document.update({
            where: { documentId },
            data: {
              updatedAt: new Date(),
              ...(totalChunks !== undefined ? { chunkCount: totalChunks } : {}),
            },
          })
        }
      },
    })
  } finally {
    if (ownsJob) {
      const job = IndexJobTracker.get(documentId)
      if (!job?.lastError) {
        IndexJobTracker.finish(documentId)
      }
    }
  }
}

async function markCompleted(documentId: string, pageCount: number, chunkCount: number) {
  await prisma.document.update({
    where: { documentId },
    data: {
      indexStatus: 'COMPLETED',
      pageCount,
      chunkCount,
      indexedAt: new Date(),
    },
  })
}

const extractTextFromPdfContentStream = (buffer: Buffer) => {
  const raw = buffer.toString('latin1')
  const parts: string[] = []
  const pattern = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj/g
  let match = pattern.exec(raw)
  while (match) {
    parts.push(match[1].replace(/\\([\\()])/g, '$1'))
    match = pattern.exec(raw)
  }
  return parts.join(' ').trim()
}

let pdfJsLayoutFallbackWarned = false

async function extractChunks(buffer: Buffer): Promise<{ pageCount: number; chunks: ChunkRow[] }> {
  try {
    const paragraphs = await extractPageParagraphsFromPdf(buffer)
    if (paragraphs.length > 0) {
      const pageCount = Math.max(...paragraphs.map((p) => p.pageNo))
      return { pageCount, chunks: chunkParagraphs(paragraphs) }
    }
  } catch (error) {
    if (!pdfJsLayoutFallbackWarned) {
      pdfJsLayoutFallbackWarned = true
      const message = error instanceof Error ? error.message : String(error)
      console.warn(
        `[PdfWorker] pdf.js layout extraction unavailable on this platform; using pdf-parse fallback (${message})`,
      )
    }
  }

  const pages = await extractPagesFallback(buffer)
  return { pageCount: pages.length, chunks: chunkPagesFallback(pages) }
}

const extractPagesFallback = async (buffer: Buffer) => {
  try {
    const data = await pdf(buffer)
    if (data.numpages <= 1) return [{ pageNo: 1, text: data.text }]
    const pageTexts = data.text.split('\f').filter(Boolean)
    return pageTexts.map((text, i) => ({ pageNo: i + 1, text: text.trim() }))
  } catch {
    const text = extractTextFromPdfContentStream(buffer)
    if (!text) throw new Error('Failed to extract text from PDF')
    return [{ pageNo: 1, text }]
  }
}

const chunkPagesFallback = (pages: Array<{ pageNo: number; text: string }>): ChunkRow[] => {
  const chunks: ChunkRow[] = []
  for (const page of pages) {
    if (!page.text.trim()) continue
    let paragraphNo = 0
    let start = 0
    while (start < page.text.length) {
      const end = Math.min(start + CHUNK_SIZE, page.text.length)
      chunks.push({
        pageNo: page.pageNo,
        paragraphNo,
        text: page.text.slice(start, end).trim(),
        bbox: null,
      })
      paragraphNo++
      start += CHUNK_SIZE - CHUNK_OVERLAP
      if (end >= page.text.length) break
    }
  }
  return chunks
}
