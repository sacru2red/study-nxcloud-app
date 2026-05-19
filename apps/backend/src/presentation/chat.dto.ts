import { tags } from 'typia'

export namespace ChatDto {
  export interface ChatRequest {
    question: string & tags.MinLength<1>
  }

  export interface ChatSource {
    fileName: string
    pageNo: number
    paragraphNo: number
    text: string
    similarity: number
  }

  export interface ChatResponse {
    answer: string
    sources: ChatSource[]
    sessionId: string & tags.Format<'uuid'>
    diagnostics?: ChatDiagnostics
  }

  export interface ChatDiagnostics {
    reason: 'NO_RELEVANT_CHUNKS' | 'EMBEDDING_FAILED' | 'LLM_API_FAILED'
    llmError?: LlmErrorDiagnostics
  }

  export interface LlmErrorDiagnostics {
    provider: 'opencode-compatible'
    statusCode: number | null
    code: string | null
    message: string
    retryAfterSeconds: number | null
  }
}
