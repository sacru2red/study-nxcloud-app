import client from './client';

export interface DocumentResponse {
  documentId: string;
  tenantId: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  indexStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  pageCount: number;
  chunkCount: number;
  createdAt: string;
  indexedAt: string | null;
}

export interface UploadResponse {}

export const filesApi = {
  list: (tenantId: string) =>
    client
      .get<DocumentResponse[]>(`/tenants/${tenantId}/files`)
      .then((r) => r.data),

  upload: (tenantId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return client
      .post<DocumentResponse>(`/tenants/${tenantId}/files`, form)
      .then((r) => r.data);
  },

  indexStatus: (fileId: string) =>
    client
      .get<{
        documentId: string;
        status: string;
        pageCount: number;
        chunkCount: number;
      }>(`/files/${fileId}/index-status`)
      .then((r) => r.data),

  chat: (fileId: string, question: string) =>
    client
      .post<{ answer: string; sources: any[]; sessionId: string }>(
        `/files/${fileId}/chat`,
        {
          question,
        },
      )
      .then((r) => r.data),
};
