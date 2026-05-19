import axios from 'axios'
import { prisma } from '../prisma'

const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001'
const EMBEDDING_DIMENSIONS = 768
const USE_MOCK_EMBEDDINGS = process.env['MOCK_EMBEDDINGS'] === 'true'
const MAX_EMBEDDING_RETRIES = 5

function createMockEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0)
  const tokens: string[] = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  if (tokens.length === 0) {
    tokens.push(text.toLowerCase())
  }

  for (const token of tokens) {
    let hash = 2_166_136_261
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index)
      hash = Math.imul(hash, 1_677_7619)
    }
    const slot = Math.abs(hash) % EMBEDDING_DIMENSIONS
    vector[slot] += 1
    vector[(slot + 7) % EMBEDDING_DIMENSIONS] += 0.5
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (norm === 0) {
    vector[0] = 1
    return vector
  }

  return vector.map((value) => value / norm)
}

function parseRetryAfterMs(error: unknown): number | null {
  if (!axios.isAxiosError(error) || !error.response) {
    return null
  }

  const retryAfterHeader = error.response.headers['retry-after']
  if (typeof retryAfterHeader === 'string') {
    const seconds = Number(retryAfterHeader)
    if (!Number.isNaN(seconds)) {
      return seconds * 1000
    }
  }

  const message = JSON.stringify(error.response.data)
  const match = message.match(/retry in ([\d.]+)s/i)
  if (match) {
    return Math.ceil(Number(match[1]) * 1000)
  }

  return null
}

export namespace EmbeddingProvider {
  export const generateEmbedding = async (text: string): Promise<number[]> => {
    if (USE_MOCK_EMBEDDINGS) {
      return createMockEmbedding(text)
    }

    const apiKey = process.env.GEMINI_API_KEY
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`

    let lastError: unknown
    for (let attempt = 0; attempt < MAX_EMBEDDING_RETRIES; attempt += 1) {
      try {
        const response = await axios.post<{ embedding: { values: number[] } }>(url, {
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
          outputDimensionality: EMBEDDING_DIMENSIONS,
        })

        return response.data.embedding.values
      } catch (error) {
        lastError = error
        const status = axios.isAxiosError(error) ? error.response?.status : undefined
        if (status !== 429 || attempt >= MAX_EMBEDDING_RETRIES - 1) {
          throw error
        }

        const retryAfterMs = parseRetryAfterMs(error) ?? (attempt + 1) * 1000
        await new Promise((resolve) => setTimeout(resolve, retryAfterMs))
      }
    }

    throw lastError
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
        } catch (error) {
          console.error('[EmbeddingProvider] Failed to embed chunk', {
            tenantId,
            chunkId: chunk.chunkId,
            error: error instanceof Error ? error.message : error,
          })
        }
      }
      if (i + batchSize < chunks.length) {
        await new Promise((resolve) => setTimeout(resolve, USE_MOCK_EMBEDDINGS ? 0 : 1000))
      }
    }
  }
}
