import { tags } from 'typia';

export interface INcFileInfo {
  filename: string;
  basename: string;
  size: number;
  lastmod: string;
  mime?: string;
}

export interface INcQuota {
  used: number;
  available: number;
  total: number;
  relative: number;
}

export interface INcUploadResult {
  ncFileId: string;
  ncPath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}
