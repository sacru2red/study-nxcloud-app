import { prisma } from '../prisma';
import { NextcloudProvider } from './nextcloud.provider';

export namespace FilesProvider {
  const toResponse = (doc: any) => {
    const ncPath: string | null = doc.ncPath ?? null;
    let ncDownloadUrl: string | null = null;
    if (ncPath) {
      const ncUrl = process.env.NEXTCLOUD_URL || 'http://localhost:8080';
      const ncUser = process.env.NEXTCLOUD_ADMIN_USER || 'admin';
      const relativePath = ncPath.replace(/^\/files\/[^/]+\//, '');
      ncDownloadUrl = `${ncUrl}/remote.php/dav/files/${ncUser}/${relativePath}`;
    }
    return {
      documentId: doc.documentId,
      tenantId: doc.tenantId,
      fileName: doc.fileName,
      ncPath,
      ncDownloadUrl,
      fileSize: Number(doc.fileSize),
      mimeType: doc.mimeType,
      indexStatus: doc.indexStatus,
      pageCount: doc.pageCount,
      chunkCount: doc.chunkCount,
      createdAt: doc.createdAt.toISOString(),
      indexedAt: doc.indexedAt?.toISOString() ?? null,
    };
  };

  export const uploadFile = async (
    tenantId: string,
    ownerUserId: string,
    file: {
      originalname: string;
      buffer: Buffer;
      mimetype: string;
      size: number;
    },
  ) => {
    const ncResult = await NextcloudProvider.uploadFile(
      tenantId,
      file.originalname,
      file.buffer,
      file.mimetype,
    );

    const doc = await prisma.document.create({
      data: {
        tenantId,
        ownerUserId,
        ncFileId: ncResult.ncFileId,
        fileName: file.originalname,
        ncPath: ncResult.ncPath,
        mimeType: file.mimetype,
        fileSize: BigInt(file.size),
        indexStatus: 'PENDING',
      },
    });

    return toResponse(doc);
  };

  export const listFiles = async (tenantId: string) => {
    const docs = await prisma.document.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return docs.map(toResponse);
  };

  export const getIndexStatus = async (
    documentId: string,
    tenantId: string,
  ) => {
    const doc = await prisma.document.findFirst({
      where: { documentId, tenantId },
    });
    if (!doc) throw new Error('Document not found');
    return {
      documentId: doc.documentId,
      status: doc.indexStatus,
      pageCount: doc.pageCount,
      chunkCount: doc.chunkCount,
    };
  };
}
