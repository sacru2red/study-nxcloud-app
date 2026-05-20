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

  export interface IndexStatusResponse {
    documentId: string & tags.Format<'uuid'>
    status: string
    pageCount: number
    chunkCount: number
  }

  export interface RetryResponse {
    documentId: string & tags.Format<'uuid'>
    status: string
  }
}
