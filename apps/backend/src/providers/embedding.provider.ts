import axios from 'axios'
import { prisma } from '../prisma'

const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001'
const EMBEDDING_DIMENSIONS = 768

export namespace EmbeddingProvider {
  export const generateEmbedding = async (text: string) => {
    const apiKey = process.env.GEMINI_API_KEY
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`

    const response = await axios.post<{ embedding: { values: number[] } }>(url, {
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIMENSIONS,
    })

    return response.data.embedding.values
  }

  export const batchEmbedAndStore = async (
    tenantId: string,
    chunks: Array<{ chunkId: string; text: string }>,
  ) => {
    const batchSize = 50
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize)
      for (const chunk of batch) {
        try {
          const embedding = await generateEmbedding(chunk.text)
          const vectorStr = `[${embedding.join(',')}]`
          await prisma.$executeRawUnsafe(
            `UPDATE document_chunks SET embedding = $1::vector WHERE chunk_id = $2`,
            vectorStr,
            chunk.chunkId,
          )
        // eslint-disable-next-line no-empty
        } catch {}
      }
      if (i + batchSize < chunks.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
  }
}
