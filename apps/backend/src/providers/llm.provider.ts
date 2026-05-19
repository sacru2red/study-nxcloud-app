import axios from 'axios'

const SYSTEM_PROMPT = `당신은 문서 분석 어시스턴트입니다.
반드시 제공된 문서 내용만 근거로 답변하세요.
문서에 해당 내용이 없으면 "문서에서 확인 불가"라고만 답변하세요.
일반 지식으로 보완하지 마세요.
답변은 한국어로 작성하세요.`

interface LlmApiErrorPayload {
  error?: {
    code?: string
    message?: string
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

export namespace LlmProvider {
  export const chat = async (question: string, context: string) => {
    const apiKey = process.env.LLM_API_KEY
    const model = process.env.LLM_MODEL || 'minimax-m2.5-free'

    const userMessage = context
      ? `다음 문서 내용을 바탕으로 질문에 답변하세요.\n\n[문서 내용]\n${context}\n\n[질문]\n${question}`
      : question

    try {
      const response = await axios.post(
        process.env.LLM_BASE_URL || 'https://opencode.ai/zen/v1/chat/completions',
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

      return response.data.choices[0].message.content
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status ?? null
        const retryAfterHeader = error.response?.headers?.['retry-after']
        const retryAfterSeconds =
          typeof retryAfterHeader === 'string' ? Number.parseInt(retryAfterHeader, 10) : null
        const responseData = error.response?.data as LlmApiErrorPayload | undefined
        const providerCode = responseData?.error?.code
        const providerMessage = responseData?.error?.message

        throw new LlmChatError({
          statusCode,
          code: providerCode ?? error.code ?? null,
          message: providerMessage ?? error.message ?? 'LLM API request failed',
          retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
        })
      }

      throw new LlmChatError({
        statusCode: null,
        code: null,
        message: error instanceof Error ? error.message : 'Unknown LLM error',
        retryAfterSeconds: null,
      })
    }
  }
}
