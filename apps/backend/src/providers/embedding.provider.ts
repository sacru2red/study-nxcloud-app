import axios from 'axios'
import { prisma } from '../prisma'

const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001'
const EMBEDDING_DIMENSIONS = 768
const EMBEDDING_FALLBACK_URL =
  process.env.EMBEDDING_FALLBACK_URL ?? 'https://openrouter.ai/api/v1/embeddings'
const EMBEDDING_FALLBACK_MODEL =
  process.env.EMBEDDING_FALLBACK_MODEL ?? 'openai/text-embedding-3-small'
const USE_MOCK_EMBEDDINGS = process.env['MOCK_EMBEDDINGS'] === 'true'
const MAX_EMBEDDING_RETRIES = 8
const MAX_FALLBACK_RETRIES = 4
const CHUNK_EMBED_MAX_ATTEMPTS = 12
// 청크마다 Gemini embed API를 연속 호출하면 429(RPM/할당량)가 잦아지므로, 요청 사이에 고정 대기.
// API 응답 시간과 별개인 스로틀이다. MOCK_EMBEDDINGS=true면 E2E용으로 0.
const CHUNK_EMBED_DELAY_MS = USE_MOCK_EMBEDDINGS ? 0 : 1_000

interface GeminiEmbedResponse {
  embedding: { values: number[] }
}

interface OpenRouterEmbeddingsResponse {
  data: Array<{ embedding: number[] }>
}

function isFallbackConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim())
}

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

function assertEmbeddingDimensions(embedding: number[], source: string): number[] {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `${source} embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${embedding.length}`,
    )
  }
  return embedding
}

async function generateGeminiEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`

  let lastError: unknown
  for (let attempt = 0; attempt < MAX_EMBEDDING_RETRIES; attempt += 1) {
    try {
      const response = await axios.post<GeminiEmbedResponse>(url, {
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: EMBEDDING_DIMENSIONS,
      })

      return assertEmbeddingDimensions(response.data.embedding.values, 'Gemini')
    } catch (error) {
      lastError = error
      const status = axios.isAxiosError(error) ? error.response?.status : undefined

      if (status === 429 && isFallbackConfigured()) {
        throw error
      }

      if (status !== 429 || attempt >= MAX_EMBEDDING_RETRIES - 1) {
        throw error
      }

      const retryAfterMs = parseRetryAfterMs(error) ?? (attempt + 1) * 1000
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs))
    }
  }

  throw lastError
}

async function generateFallbackEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured')
  }

  let lastError: unknown
  for (let attempt = 0; attempt < MAX_FALLBACK_RETRIES; attempt += 1) {
    try {
      const response = await axios.post<OpenRouterEmbeddingsResponse>(
        EMBEDDING_FALLBACK_URL,
        {
          model: EMBEDDING_FALLBACK_MODEL,
          input: text,
          dimensions: EMBEDDING_DIMENSIONS,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30_000,
        },
      )

      const embedding = response.data.data[0]?.embedding
      if (!embedding) {
        throw new Error('OpenRouter embeddings response missing embedding data')
      }

      return assertEmbeddingDimensions(embedding, 'OpenRouter fallback')
    } catch (error) {
      lastError = error
      const status = axios.isAxiosError(error) ? error.response?.status : undefined
      if (status !== 429 || attempt >= MAX_FALLBACK_RETRIES - 1) {
        throw error
      }

      const retryAfterMs = parseRetryAfterMs(error) ?? (attempt + 1) * 1000
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs))
    }
  }

  throw lastError
}

export namespace EmbeddingProvider {
  export const generateEmbedding = async (text: string): Promise<number[]> => {
    if (USE_MOCK_EMBEDDINGS) {
      return createMockEmbedding(text)
    }

    try {
      return await generateGeminiEmbedding(text)
    } catch (primaryError) {
      if (!isFallbackConfigured()) {
        throw primaryError
      }

      const status = axios.isAxiosError(primaryError) ? primaryError.response?.status : undefined
      console.warn('[EmbeddingProvider] Primary embedding failed, using OpenRouter fallback', {
        status,
        message: primaryError instanceof Error ? primaryError.message : primaryError,
      })

      return await generateFallbackEmbedding(text)
    }
  }

  export const batchEmbedAndStore = async (
    tenantId: string,
    chunks: Array<{ chunkId: string; text: string }>,
  ) => {
    let failedCount = 0
    for (const chunk of chunks) {
      let stored = false
      for (let attempt = 0; attempt < CHUNK_EMBED_MAX_ATTEMPTS; attempt += 1) {
        try {
          const embedding = await generateEmbedding(chunk.text)
          const vectorStr = `[${embedding.join(',')}]`
          await prisma.$executeRawUnsafe(
            `UPDATE document_chunks SET embedding = $1::vector WHERE chunk_id = $2`,
            vectorStr,
            chunk.chunkId,
          )
          stored = true
          break
        } catch (error) {
          const retryAfterMs = parseRetryAfterMs(error) ?? (attempt + 1) * 2_000
          if (attempt >= CHUNK_EMBED_MAX_ATTEMPTS - 1) {
            console.error('[EmbeddingProvider] Failed to embed chunk', {
              tenantId,
              chunkId: chunk.chunkId,
              error: error instanceof Error ? error.message : error,
            })
          } else {
            await new Promise((resolve) => setTimeout(resolve, retryAfterMs))
          }
        }
      }
      if (!stored) {
        failedCount += 1
      }
      if (CHUNK_EMBED_DELAY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, CHUNK_EMBED_DELAY_MS))
      }
    }

    if (failedCount > 0) {
      throw new Error(
        `Failed to embed ${failedCount}/${chunks.length} chunks for tenant ${tenantId}`,
      )
    }
  }
}
