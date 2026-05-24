import axios from 'axios'

const SYSTEM_PROMPT = `당신은 문서 분석 어시스턴트입니다.
반드시 제공된 문서 내용만 근거로 답변하세요.
문서에 해당 내용이 없으면 "문서에서 확인 불가"라고만 답변하세요.
일반 지식으로 보완하지 마세요.
답변은 한국어로 작성하세요.`

interface LlmApiErrorPayload {
  error?: {
    code?: string | number
    message?: string
  }
  message?: string
  path?: string
  status?: number
}

const DEFAULT_LLM_ENDPOINT = 'https://opencode.ai/zen/v1/chat/completions'
const CHAT_COMPLETIONS_SUFFIX = '/chat/completions'
const MAX_LOG_BODY_LENGTH = 500

const resolveLlmEndpoint = (baseUrl?: string): string => {
  const raw = (baseUrl ?? DEFAULT_LLM_ENDPOINT).trim().replace(/\/+$/, '')
  if (raw.endsWith(CHAT_COMPLETIONS_SUFFIX)) {
    return raw
  }
  return `${raw}${CHAT_COMPLETIONS_SUFFIX}`
}

const summarizeResponseBody = (data: unknown): string => {
  if (data == null) {
    return '(empty body)'
  }
  try {
    const serialized = typeof data === 'string' ? data : JSON.stringify(data)
    return serialized.length <= MAX_LOG_BODY_LENGTH
      ? serialized
      : `${serialized.slice(0, MAX_LOG_BODY_LENGTH)}…`
  } catch {
    return '(unserializable body)'
  }
}

interface LlmChatErrorInput {
  statusCode: number | null
  code: string | null
  message: string
  retryAfterSeconds: number | null
}

export class LlmChatError extends Error {
  public readonly statusCode: number | null
  public readonly code: string | null
  public readonly retryAfterSeconds: number | null

  public constructor(input: LlmChatErrorInput) {
    super(input.message)
    this.name = 'LlmChatError'
    this.statusCode = input.statusCode
    this.code = input.code
    this.retryAfterSeconds = input.retryAfterSeconds
  }
}

const MAX_RETRIES = 1
const BASE_DELAY_MS = 500
const RETRYABLE_STATUS_CODES = [429, 502, 503]

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const buildLlmError = (error: unknown): LlmChatError => {
  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status ?? null
    const retryAfterHeader = error.response?.headers?.['retry-after']
    const retryAfterSeconds =
      typeof retryAfterHeader === 'string' ? Number.parseInt(retryAfterHeader, 10) : null
    const responseData = error.response?.data as LlmApiErrorPayload | undefined
    const providerCode = responseData?.error?.code
    const providerMessage =
      responseData?.error?.message ??
      responseData?.message ??
      (responseData?.path
        ? `HTTP ${statusCode ?? 'unknown'} on path ${responseData.path}`
        : undefined)

    return new LlmChatError({
      statusCode,
      code: providerCode != null ? String(providerCode) : (error.code ?? null),
      message: providerMessage ?? error.message ?? 'LLM API request failed',
      retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
    })
  }

  return new LlmChatError({
    statusCode: null,
    code: null,
    message: error instanceof Error ? error.message : 'Unknown LLM error',
    retryAfterSeconds: null,
  })
}

export namespace LlmProvider {
  export const chat = async (question: string, context: string) => {
    const apiKey = process.env.LLM_API_KEY
    const model = process.env.LLM_MODEL || 'minimax-m2.5-free'
    const endpoint = resolveLlmEndpoint(process.env.LLM_BASE_URL)

    if (!apiKey) {
      console.error('[LlmProvider] LLM_API_KEY is not set')
      throw new LlmChatError({
        statusCode: null,
        code: 'MISSING_API_KEY',
        message: 'LLM_API_KEY is not configured',
        retryAfterSeconds: null,
      })
    }

    const userMessage = context
      ? `다음 문서 내용을 바탕으로 질문에 답변하세요.\n\n[문서 내용]\n${context}\n\n[질문]\n${question}`
      : question

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1)
          console.log(
            `[LlmProvider] Retrying attempt ${attempt + 1}/${MAX_RETRIES + 1} after ${delay}ms...`,
          )
          await sleep(delay)
        }

        console.log(
          `[LlmProvider] POST ${endpoint} attempt=${attempt + 1}/${MAX_RETRIES + 1} model=${model} contextChars=${context.length} questionChars=${question.length}`,
        )

        const response = await axios.post(
          endpoint,
          {
            model,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userMessage },
            ],
            max_tokens: 1024,
            temperature: 0.3,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          },
        )

        const content = response.data?.choices?.[0]?.message?.content
        if (typeof content !== 'string') {
          console.error(
            '[LlmProvider] Unexpected response shape:',
            JSON.stringify(response.data)?.slice(0, 500),
          )
          throw new LlmChatError({
            statusCode: response.status ?? null,
            code: null,
            message: 'LLM returned unexpected response format',
            retryAfterSeconds: null,
          })
        }

        console.log(`[LlmProvider] LLM success on attempt ${attempt + 1}, length=${content.length}`)
        return content
      } catch (error) {
        const llmError = buildLlmError(error)
        const isRetryable =
          llmError.statusCode !== null && RETRYABLE_STATUS_CODES.includes(llmError.statusCode)
        const responseBody = axios.isAxiosError(error)
          ? summarizeResponseBody(error.response?.data)
          : undefined

        console.warn(
          `[LlmProvider] Attempt ${attempt + 1} failed: endpoint=${endpoint} status=${llmError.statusCode} code=${llmError.code} retryable=${isRetryable} message=${llmError.message}${responseBody ? ` body=${responseBody}` : ''}`,
        )

        if (!isRetryable || attempt === MAX_RETRIES) {
          console.error(
            `[LlmProvider] Giving up after ${attempt + 1} attempt(s): endpoint=${endpoint} model=${model} status=${llmError.statusCode} message=${llmError.message}`,
          )
          throw llmError
        }
        // continue to next retry iteration
      }
    }

    // Unreachable, but satisfies type checker
    throw new LlmChatError({
      statusCode: null,
      code: null,
      message: 'LLM retry loop exhausted',
      retryAfterSeconds: null,
    })
  }
}
