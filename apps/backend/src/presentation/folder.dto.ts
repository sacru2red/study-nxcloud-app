import { SourceBboxDto } from './source-bbox.dto'
import type { ChatDto } from './chat.dto'

export namespace FolderDto {
  export interface ChatRequest {
    question: string
  }

  export interface ChatSource {
    documentId: string
    fileName: string
    pageNo: number
    paragraphNo: number
    text: string
    similarity: number
    bbox?: SourceBboxDto.Bbox
  }

  export interface ChatResponse {
    answer: string
    sources: ChatSource[]
    sessionId: string | null
    documentCount: number
    diagnostics?: ChatDto.ChatDiagnostics
  }
}
