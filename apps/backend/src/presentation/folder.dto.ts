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
  }

  export interface ChatResponse {
    answer: string
    sources: ChatSource[]
    sessionId: string | null
    documentCount: number
  }
}
