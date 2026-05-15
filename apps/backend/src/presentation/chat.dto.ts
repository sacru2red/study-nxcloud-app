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
  }
}
