import pdfParse from 'pdf-parse'
import { prisma } from '../prisma'
import { NextcloudProvider } from './nextcloud.provider'
import { EmbeddingProvider } from './embedding.provider'

const pdf = pdfParse as unknown as (
  dataBuffer: Buffer,
) => Promise<{ numpages: number; text: string }>

const CHUNK_SIZE = 500
const CHUNK_OVERLAP = 100
const CHUNK_PROGRESS_UPDATE_INTERVAL = 20

type ChunkRow = { pageNo: number; paragraphNo: number; text: string }

export namespace PdfWorkerProvider {
  export const processDocument = async (documentId: string) => {
    await runFullPipeline(documentId)
  }

  export const resumeDocument = async (documentId: string) => {
    const doc = await prisma.document.findUnique({ where: { documentId } })
    if (!doc) return

    const totalChunks = await prisma.documentChunk.count({ where: { documentId } })
    const embeddedChunks = await countEmbeddedChunks(documentId)

    if (totalChunks > 0) {
      if (embeddedChunks >= totalChunks) {
        await prisma.document.update({
          where: { documentId },
          data: {
            indexStatus: 'COMPLETED',
            chunkCount: totalChunks,
            indexedAt: new Date(),
          },
        })
        return
      }

      await prisma.document.update({
        where: { documentId },
        data: { indexStatus: 'PROCESSING' },
      })

      const pending = await listChunksMissingEmbedding(documentId)
      await embedPendingChunks(documentId, doc.tenantId, pending)
      await markCompleted(documentId, doc.pageCount, totalChunks)
      return
    }

    if (doc.pageCount > 0) {
      await runChunkAndEmbedFromStoredPdf(documentId, doc)
      return
    }

    await runFullPipeline(documentId)
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
  const rows = await prisma.$queryRaw<
    Array<{ chunk_id: string; chunk_text: string }>
  >`
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
    const pages = await extractPages(buffer)
    await prisma.document.update({
      where: { documentId },
      data: { pageCount: pages.length },
    })

    const totalChunks = await persistChunks(documentId, doc.tenantId, chunkPages(pages))
    const pending = await listChunksMissingEmbedding(documentId)
    await embedPendingChunks(documentId, doc.tenantId, pending)
    await markCompleted(documentId, pages.length, totalChunks)
  } catch (error) {
    await prisma.document.update({
      where: { documentId },
      data: { indexStatus: 'FAILED' },
    })
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
    const pages = await extractPages(buffer)
    await prisma.document.update({
      where: { documentId },
      data: { pageCount: pages.length },
    })

    const existingKeys = await loadExistingChunkKeys(documentId)
    const allChunks = chunkPages(pages)
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
    await embedPendingChunks(documentId, doc.tenantId, pending)
    await markCompleted(documentId, pages.length, totalChunks)
  } catch (error) {
    await prisma.document.update({
      where: { documentId },
      data: { indexStatus: 'FAILED' },
    })
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
) {
  if (pending.length === 0) {
    return
  }

  await EmbeddingProvider.batchEmbedAndStore(tenantId, pending)
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

const extractPages = async (buffer: Buffer) => {
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

const chunkPages = (pages: Array<{ pageNo: number; text: string }>) => {
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
      })
      paragraphNo++
      start += CHUNK_SIZE - CHUNK_OVERLAP
      if (end >= page.text.length) break
    }
  }
  return chunks
}
