import axios from 'axios'
import { prisma } from '../prisma'
import { describeEmbedApiError, parseRetryAfterMs } from '../common/embed-api-error.util'
import { IndexJobTracker } from '../common/index-job-tracker'

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
const CHUNK_EMBED_DELAY_MS = USE_MOCK_EMBEDDINGS ? 0 : 1_000
const BATCH_PROGRESS_LOG_EVERY = 10

interface GeminiEmbedResponse {
  embedding: { values: number[] }
}

interface OpenRouterEmbeddingsResponse {
  data: Array<{ embedding: number[] }>
}

export interface EmbedLogContext {
  documentId?: string
  chunkId?: string
}

function isFallbackConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim())
}

function logEmbedEvent(
  level: 'warn' | 'error' | 'log',
  event: string,
  fields: Record<string, unknown>,
): void {
  const line = `[EmbeddingProvider] ${event} ${JSON.stringify(fields)}`
  if (level === 'error') {
    console.error(line)
    return
  }
  if (level === 'warn') {
    console.warn(line)
    return
  }
  console.log(line)
}

function reportEmbedApiError(
  scope: string,
  error: unknown,
  context: EmbedLogContext & { attempt: number; maxAttempts: number; retryAfterMs?: number },
): ReturnType<typeof describeEmbedApiError> {
  const detail = describeEmbedApiError(error)
  const retryAfterMs = context.retryAfterMs ?? detail.retryAfterMs

  logEmbedEvent('warn', `${scope} — retry`, {
    documentId: context.documentId,
    chunkId: context.chunkId,
    attempt: context.attempt,
    maxAttempts: context.maxAttempts,
    httpStatus: detail.httpStatus,
    retryAfterMs,
    message: detail.message,
  })

  if (context.documentId) {
    IndexJobTracker.recordTransientError(context.documentId, detail.message, detail.httpStatus)
  }

  return detail
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

function assertEmbeddingDimensions(embedding: number[], source: string): number[] {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `${source} embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${embedding.length}`,
    )
  }
  return embedding
}

async function generateGeminiEmbedding(text: string, context: EmbedLogContext): Promise<number[]> {
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
        reportEmbedApiError('Gemini 429 → OpenRouter fallback', error, {
          ...context,
          attempt: attempt + 1,
          maxAttempts: MAX_EMBEDDING_RETRIES,
        })
        throw error
      }

      if (status !== 429 || attempt >= MAX_EMBEDDING_RETRIES - 1) {
        if (status === 429 || status !== undefined) {
          logEmbedEvent('error', 'Gemini embed failed', {
            ...context,
            httpStatus: status,
            message: describeEmbedApiError(error).message,
          })
        }
        throw error
      }

      const retryAfterMs = parseRetryAfterMs(error) ?? (attempt + 1) * 1000
      reportEmbedApiError('Gemini rate limit', error, {
        ...context,
        attempt: attempt + 1,
        maxAttempts: MAX_EMBEDDING_RETRIES,
        retryAfterMs,
      })
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs))
    }
  }

  throw lastError
}

async function generateFallbackEmbedding(text: string, context: EmbedLogContext): Promise<number[]> {
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
        logEmbedEvent('error', 'OpenRouter fallback failed', {
          ...context,
          httpStatus: status,
          message: describeEmbedApiError(error).message,
        })
        throw error
      }

      const retryAfterMs = parseRetryAfterMs(error) ?? (attempt + 1) * 1000
      reportEmbedApiError('OpenRouter rate limit', error, {
        ...context,
        attempt: attempt + 1,
        maxAttempts: MAX_FALLBACK_RETRIES,
        retryAfterMs,
      })
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs))
    }
  }

  throw lastError
}

export namespace EmbeddingProvider {
  export const generateEmbedding = async (
    text: string,
    context: EmbedLogContext = {},
  ): Promise<number[]> => {
    if (USE_MOCK_EMBEDDINGS) {
      return createMockEmbedding(text)
    }

    try {
      return await generateGeminiEmbedding(text, context)
    } catch (primaryError) {
      if (!isFallbackConfigured()) {
        throw primaryError
      }

      const detail = describeEmbedApiError(primaryError)
      logEmbedEvent('warn', 'Primary failed — OpenRouter fallback', {
        ...context,
        httpStatus: detail.httpStatus,
        message: detail.message,
      })

      return await generateFallbackEmbedding(text, context)
    }
  }

  export const batchEmbedAndStore = async (
    tenantId: string,
    chunks: Array<{ chunkId: string; text: string }>,
    options?: {
      documentId?: string
      onChunkDone?: () => void | Promise<void>
    },
  ) => {
    const documentId = options?.documentId
    logEmbedEvent('log', 'batch start', {
      documentId,
      tenantId,
      pendingChunks: chunks.length,
    })

    let failedCount = 0
    let storedCount = 0
    let lastFailureDetail: ReturnType<typeof describeEmbedApiError> | null = null

    for (const chunk of chunks) {
      const chunkContext: EmbedLogContext = { documentId, chunkId: chunk.chunkId }
      let stored = false

      for (let attempt = 0; attempt < CHUNK_EMBED_MAX_ATTEMPTS; attempt += 1) {
        try {
          const embedding = await generateEmbedding(chunk.text, chunkContext)
          const vectorStr = `[${embedding.join(',')}]`
          await prisma.$executeRawUnsafe(
            `UPDATE document_chunks SET embedding = $1::vector WHERE chunk_id = $2`,
            vectorStr,
            chunk.chunkId,
          )
          stored = true
          storedCount += 1
          if (documentId) {
            IndexJobTracker.clearTransientError(documentId)
          }
          if (storedCount % BATCH_PROGRESS_LOG_EVERY === 0) {
            logEmbedEvent('log', 'batch progress', {
              documentId,
              storedCount,
              total: chunks.length,
            })
          }
          break
        } catch (error) {
          const detail = describeEmbedApiError(error)
          lastFailureDetail = detail
          const retryAfterMs = detail.retryAfterMs ?? (attempt + 1) * 2_000
          const isLastAttempt = attempt >= CHUNK_EMBED_MAX_ATTEMPTS - 1

          if (documentId) {
            IndexJobTracker.recordTransientError(documentId, detail.message, detail.httpStatus)
          }

          if (isLastAttempt) {
            logEmbedEvent('error', 'chunk failed after retries', {
              documentId,
              tenantId,
              chunkId: chunk.chunkId,
              attempts: CHUNK_EMBED_MAX_ATTEMPTS,
              httpStatus: detail.httpStatus,
              message: detail.message,
            })
          } else {
            reportEmbedApiError('chunk embed', error, {
              ...chunkContext,
              attempt: attempt + 1,
              maxAttempts: CHUNK_EMBED_MAX_ATTEMPTS,
              retryAfterMs,
            })
            await new Promise((resolve) => setTimeout(resolve, retryAfterMs))
          }
        }
      }

      if (!stored) {
        failedCount += 1
      } else if (options?.onChunkDone) {
        await options.onChunkDone()
      }

      if (CHUNK_EMBED_DELAY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, CHUNK_EMBED_DELAY_MS))
      }
    }

    if (failedCount > 0) {
      const apiHint = lastFailureDetail?.httpStatus
        ? ` (마지막 API 오류: HTTP ${lastFailureDetail.httpStatus})`
        : ''
      throw new Error(
        `Failed to embed ${failedCount}/${chunks.length} chunks for tenant ${tenantId}${apiHint}: ${lastFailureDetail?.message ?? 'unknown error'}`,
      )
    }

    logEmbedEvent('log', 'batch complete', { documentId, storedCount })
  }
}
