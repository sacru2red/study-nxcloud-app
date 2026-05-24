import { prisma } from '../prisma'

import { EmbeddingProvider } from './embedding.provider'

import { LlmChatError, LlmProvider } from './llm.provider'

import { normalizeUploadFileName } from '../common/decode-upload-filename'

import { parseBboxJson } from '../common/pdf-layout.util'

import type { PdfBbox } from '../common/pdf-bbox.types'

import type { ChatDto } from '../presentation/chat.dto'

const SIMILARITY_THRESHOLD = 0.3

type FolderChatDiagnostics = ChatDto.ChatDiagnostics

interface FolderChatSource {
  documentId: string

  fileName: string

  pageNo: number

  paragraphNo: number

  text: string

  similarity: number

  bbox?: PdfBbox
}

interface FolderChatResponse {
  answer: string

  sources: FolderChatSource[]

  sessionId: string | null

  documentCount: number

  diagnostics?: FolderChatDiagnostics
}

export namespace FolderProvider {
  export const chat = async (
    folderId: string,

    tenantId: string,

    userId: string,

    question: string,
  ): Promise<FolderChatResponse> => {
    const docs = await prisma.document.findMany({
      where: { folderId, tenantId, indexStatus: 'COMPLETED' },
    })

    const documentIds = docs.map((d) => d.documentId)

    if (documentIds.length === 0) {
      return {
        answer: '폴더에 인덱싱 완료된 문서가 없습니다.',

        sources: [],

        sessionId: null,

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

    let questionVector: number[]

    try {
      questionVector = await EmbeddingProvider.generateEmbedding(question)
    } catch {
      const answer = '문서에서 확인 불가'

      await prisma.chatMessage.createMany({
        data: [
          { sessionId: session.sessionId, role: 'user', message: question },

          {
            sessionId: session.sessionId,

            role: 'assistant',

            message: answer,

            sourcesJson: '[]',
          },
        ],
      })

      return {
        answer,

        sources: [],

        sessionId: session.sessionId,

        documentCount: documentIds.length,

        diagnostics: { reason: 'EMBEDDING_FAILED' },
      }
    }

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

         AND dc.embedding IS NOT NULL

       ORDER BY dc.embedding <=> $1::vector

       LIMIT 5`,

      vectorStr,

      tenantId,

      folderId,
    )

    const relevantResults = results.filter((r) => r.similarity >= SIMILARITY_THRESHOLD)

    let answer: string

    let sources: FolderChatSource[]

    let diagnostics: FolderChatDiagnostics | undefined

    if (relevantResults.length === 0) {
      answer = '문서에서 확인 불가'

      sources = []

      diagnostics = { reason: 'NO_RELEVANT_CHUNKS' }
    } else {
      const context = relevantResults.map((r) => `[${r.file_name}]\n${r.chunk_text}`).join('\n\n')

      try {
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
      } catch (error) {
        if (error instanceof LlmChatError) {
          diagnostics = {
            reason: 'LLM_API_FAILED',

            llmError: {
              provider: 'opencode-compatible',

              statusCode: error.statusCode,

              code: error.code,

              message: error.message,

              retryAfterSeconds: error.retryAfterSeconds,
            },
          }

          console.error('[FolderProvider] LLM API failed', {
            folderId,

            tenantId,

            userId,

            statusCode: error.statusCode,

            code: error.code,

            message: error.message,
          })
        } else {
          diagnostics = {
            reason: 'LLM_API_FAILED',

            llmError: {
              provider: 'opencode-compatible',

              statusCode: null,

              code: null,

              message: error instanceof Error ? error.message : 'Unknown LLM error',

              retryAfterSeconds: null,
            },
          }
        }

        answer = '문서에서 확인 불가'

        sources = []
      }
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

    return {
      answer,

      sources,

      sessionId: session.sessionId,

      documentCount: documentIds.length,

      diagnostics,
    }
  }
}
