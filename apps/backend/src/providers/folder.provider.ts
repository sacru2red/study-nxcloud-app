import { prisma } from '../prisma'
import { EmbeddingProvider } from './embedding.provider'
import { LlmProvider } from './llm.provider'
import { normalizeUploadFileName } from '../common/decode-upload-filename'
import { parseBboxJson } from '../common/pdf-layout.util'
import type { PdfBbox } from '../common/pdf-bbox.types'

const SIMILARITY_THRESHOLD = 0.3

interface FolderChatSource {
  documentId: string
  fileName: string
  pageNo: number
  paragraphNo: number
  text: string
  similarity: number
  bbox?: PdfBbox
}

export namespace FolderProvider {
  export const chat = async (
    folderId: string,
    tenantId: string,
    userId: string,
    question: string,
  ) => {
    const docs = await prisma.document.findMany({
      where: { folderId, tenantId, indexStatus: 'COMPLETED' },
    })

    const documentIds = docs.map((d) => d.documentId)
    if (documentIds.length === 0) {
      return {
        answer: '폴더에 인덱싱 완료된 문서가 없습니다.',
        sources: [],
        sessionId: null as string | null,
        documentCount: 0,
      }
    }

    let session = await prisma.chatSession.findFirst({
      where: { folderId, userId },
    })
    if (!session) {
      session = await prisma.chatSession.create({
        data: { tenantId, userId, folderId },
      })
    }

    const questionVector = await EmbeddingProvider.generateEmbedding(question)
    const vectorStr = `[${questionVector.join(',')}]`

    const results: Array<{
      chunk_text: string
      page_no: number
      paragraph_no: number
      file_name: string
      document_id: string
      bbox_json: string | null
      similarity: number
    }> = await prisma.$queryRawUnsafe(
      `SELECT dc.chunk_text, dc.page_no, dc.paragraph_no,
              d.file_name, d.document_id, dc.bbox_json,
              1 - (dc.embedding <=> $1::vector) as similarity
       FROM document_chunks dc
       JOIN documents d ON dc.document_id = d.document_id
       WHERE dc.tenant_id = $2 AND d.folder_id = $3
       ORDER BY dc.embedding <=> $1::vector
       LIMIT 5`,
      vectorStr,
      tenantId,
      folderId,
    )

    const relevantResults = results.filter((r) => r.similarity >= SIMILARITY_THRESHOLD)

    let answer: string
    let sources: FolderChatSource[]

    if (relevantResults.length === 0) {
      answer = '문서에서 확인 불가'
      sources = []
    } else {
      const context = relevantResults.map((r) => `[${r.file_name}]\n${r.chunk_text}`).join('\n\n')
      answer = await LlmProvider.chat(question, context)
      sources = relevantResults.map((r) => {
        const bbox = parseBboxJson(r.bbox_json)
        return {
          documentId: r.document_id,
          fileName: normalizeUploadFileName(r.file_name),
          pageNo: r.page_no,
          paragraphNo: r.paragraph_no,
          text: r.chunk_text.slice(0, 200),
          similarity: Math.round(r.similarity * 1000) / 1000,
          ...(bbox ? { bbox } : {}),
        }
      })
    }

    await prisma.chatMessage.createMany({
      data: [
        { sessionId: session.sessionId, role: 'user', message: question },
        {
          sessionId: session.sessionId,
          role: 'assistant',
          message: answer,
          sourcesJson: JSON.stringify(sources),
        },
      ],
    })

    return { answer, sources, sessionId: session.sessionId, documentCount: documentIds.length }
  }
}
