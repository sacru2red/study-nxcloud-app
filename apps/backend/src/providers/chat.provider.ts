import { prisma } from '../prisma'
import { EmbeddingProvider } from './embedding.provider'
import { LlmProvider } from './llm.provider'

const SIMILARITY_THRESHOLD = 0.3

export namespace ChatProvider {
  export const chat = async (
    documentId: string,
    tenantId: string,
    userId: string,
    question: string,
  ) => {
    const doc = await prisma.document.findFirst({
      where: { documentId, tenantId },
    })
    if (!doc) throw new Error('Document not found')
    if (doc.indexStatus !== 'COMPLETED') throw new Error('Document not indexed yet')

    let session = await prisma.chatSession.findFirst({
      where: { documentId, userId },
    })
    if (!session) {
      session = await prisma.chatSession.create({
        data: { tenantId, userId, documentId },
      })
    }

    const questionVector = await EmbeddingProvider.generateEmbedding(question)
    const vectorStr = `[${questionVector.join(',')}]`

    const results: Array<{
      chunk_text: string
      page_no: number
      paragraph_no: number
      file_name: string
      similarity: number
    }> = await prisma.$queryRawUnsafe(
      `SELECT dc.chunk_text, dc.page_no, dc.paragraph_no,
              d.file_name,
              1 - (dc.embedding <=> $1::vector) as similarity
       FROM document_chunks dc
       JOIN documents d ON dc.document_id = d.document_id
       WHERE dc.tenant_id = $2 AND dc.document_id = $3
       ORDER BY dc.embedding <=> $1::vector
       LIMIT 5`,
      vectorStr,
      tenantId,
      documentId,
    )

    const relevantResults = results.filter((r) => r.similarity >= SIMILARITY_THRESHOLD)

    let answer: string
    let sources: any[]

    if (relevantResults.length === 0) {
      answer = '문서에서 확인 불가'
      sources = []
    } else {
      const context = relevantResults.map((r) => r.chunk_text).join('\n\n')
      answer = await LlmProvider.chat(question, context)
      sources = relevantResults.map((r) => ({
        fileName: r.file_name,
        pageNo: r.page_no,
        paragraphNo: r.paragraph_no,
        text: r.chunk_text.slice(0, 200),
        similarity: Math.round(r.similarity * 1000) / 1000,
      }))
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

    return { answer, sources, sessionId: session.sessionId }
  }
}
