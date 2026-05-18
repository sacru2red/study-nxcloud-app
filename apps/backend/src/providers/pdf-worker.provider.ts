import pdfParse from 'pdf-parse'
import { prisma } from '../prisma'
import { NextcloudProvider } from './nextcloud.provider'
import { EmbeddingProvider } from './embedding.provider'

const pdf = pdfParse as unknown as (
  dataBuffer: Buffer,
) => Promise<{ numpages: number; text: string }>

const CHUNK_SIZE = 500
const CHUNK_OVERLAP = 100

export namespace PdfWorkerProvider {
  export const processDocument = async (documentId: string) => {
    const doc = await prisma.document.findUnique({ where: { documentId } })
    if (!doc) return

    await prisma.document.update({
      where: { documentId },
      data: { indexStatus: 'PROCESSING' },
    })

    try {
      const buffer = await NextcloudProvider.getFile(doc.tenantId, doc.fileName)
      const pages = await extractPages(buffer)
      const chunks = chunkPages(pages)

      for (const chunk of chunks) {
        await prisma.documentChunk.create({
          data: {
            documentId,
            tenantId: doc.tenantId,
            pageNo: chunk.pageNo,
            paragraphNo: chunk.paragraphNo,
            chunkText: chunk.text,
          },
        })
      }

      const createdChunks = await prisma.documentChunk.findMany({
        where: { documentId },
        select: { chunkId: true, chunkText: true },
      })
      await EmbeddingProvider.batchEmbedAndStore(
        doc.tenantId,
        createdChunks.map((c) => ({ chunkId: c.chunkId, text: c.chunkText })),
      )

      await prisma.document.update({
        where: { documentId },
        data: {
          indexStatus: 'COMPLETED',
          pageCount: pages.length,
          chunkCount: chunks.length,
          indexedAt: new Date(),
        },
      })
    } catch (error) {
      await prisma.document.update({
        where: { documentId },
        data: { indexStatus: 'FAILED' },
      })
      throw error
    }
  }
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
  const chunks: Array<{ pageNo: number; paragraphNo: number; text: string }> = []
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
