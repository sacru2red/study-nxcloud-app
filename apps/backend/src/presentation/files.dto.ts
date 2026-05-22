import { tags } from 'typia'

export namespace FilesDto {
  export interface IUploadBody {
    file: File
    folderId?: string
  }

  export interface FileItem {
    documentId: string & tags.Format<'uuid'>
    tenantId: string & tags.Format<'uuid'>
    folderId: string | null
    fileName: string
    ncPath: string | null
    ncDownloadUrl: string | null
    fileSize: number
    mimeType: string | null
    indexStatus: string
    pageCount: number
    chunkCount: number
    createdAt: string
    indexedAt: string | null
  }

  export type IndexPhase = 'queued' | 'extracting' | 'chunking' | 'embedding' | 'completed' | 'failed'

  export interface IndexStatusResponse {
    documentId: string & tags.Format<'uuid'>
    status: string
    phase: IndexPhase
    progressPercent: number & tags.Type<'uint32'> & tags.Maximum<100>
    message: string
    pageCount: number
    totalChunks: number
    embeddedChunks: number
    chunkCount: number
    fileSize: number
  }

  export interface RetryResponse {
    documentId: string & tags.Format<'uuid'>
    status: string
    resumed: boolean
  }
}
