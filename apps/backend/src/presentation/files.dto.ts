import { tags } from 'typia';

export namespace FilesDto {
  export interface IUploadBody {
    file: File;
  }

  export interface FileItem {
    documentId: string & tags.Format<'uuid'>;
    tenantId: string & tags.Format<'uuid'>;
    fileName: string;
    ncPath: string | null;
    ncDownloadUrl: string | null;
    fileSize: number;
    mimeType: string;
    indexStatus: string;
    pageCount: number;
    chunkCount: number;
    createdAt: string;
    indexedAt: string | null;
  }

  export interface IndexStatusResponse {
    documentId: string & tags.Format<'uuid'>;
    status: string;
    pageCount: number;
    chunkCount: number;
  }
}
