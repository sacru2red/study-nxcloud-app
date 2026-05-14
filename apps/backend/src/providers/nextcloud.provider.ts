import { createClient, type FileStat, type WebDAVClient } from 'webdav';
import axios from 'axios';

const ncUrl = process.env.NEXTCLOUD_URL || 'http://localhost:8080';
const ncUser = process.env.NEXTCLOUD_ADMIN_USER || 'admin';
const ncPass = process.env.NEXTCLOUD_ADMIN_PASS || 'admin123';

const client: WebDAVClient = createClient(ncUrl, {
  username: ncUser,
  password: ncPass,
});

export namespace NextcloudProvider {
  export const uploadFile = async (
    tenantId: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string,
  ) => {
    const dirPath = `/files/${ncUser}/${tenantId}`;
    const filePath = `${dirPath}/${fileName}`;

    try {
      await client.createDirectory(dirPath);
    } catch {}

    await client.putFileContents(filePath, buffer, {
      contentLength: buffer.length,
      headers: { 'Content-Type': mimeType },
    });

    return {
      ncFileId: `${tenantId}/${fileName}`,
      ncPath: filePath,
      fileName,
      fileSize: buffer.length,
      mimeType,
    };
  };

  export const listFiles = async (tenantId: string) => {
    const dirPath = `/files/${ncUser}/${tenantId}`;
    try {
      const items = await client.getDirectoryContents(dirPath);
      return items.map((item: FileStat) => ({
        filename: item.filename,
        basename: item.basename,
        size: item.size ?? 0,
        lastmod: item.lastmod,
        mime: item.mime,
      }));
    } catch {
      return [];
    }
  };

  export const getFile = async (tenantId: string, fileName: string) => {
    const filePath = `/files/${ncUser}/${tenantId}/${fileName}`;
    const data = await client.getFileContents(filePath);
    return Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
  };

  export const getUserQuota = async (ncUserId: string) => {
    try {
      const response = await axios.get(
        `${ncUrl}/ocs/v2.php/cloud/users/${ncUserId}`,
        {
          auth: { username: ncUser, password: ncPass },
          headers: { 'OCS-APIRequest': 'true' },
        },
      );
      const quota = response.data?.ocs?.data?.quota;
      if (!quota) return { used: 0, available: 0, total: 0, relative: 0 };
      return {
        used: Number(quota.used) || 0,
        available: Number(quota.free) || 0,
        total: Number(quota.total) || 0,
        relative:
          Number(quota.total) > 0
            ? Math.round((Number(quota.used) / Number(quota.total)) * 100)
            : 0,
      };
    } catch {
      return { used: 0, available: 0, total: 0, relative: 0 };
    }
  };
}
