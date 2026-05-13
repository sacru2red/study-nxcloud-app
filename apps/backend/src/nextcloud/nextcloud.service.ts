import { Injectable, Logger } from '@nestjs/common';
import { createClient, WebDAVClient } from 'webdav';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { INcFileInfo, INcQuota, INcUploadResult } from './dto';

@Injectable()
export class NextcloudService {
  private readonly logger = new Logger(NextcloudService.name);
  private readonly ncUrl: string;
  private readonly ncUser: string;
  private readonly ncPass: string;
  private client: WebDAVClient;

  constructor(private readonly config: ConfigService) {
    this.ncUrl = this.config.get<string>(
      'NEXTCLOUD_URL',
      'http://localhost:8080',
    );
    this.ncUser = this.config.get<string>('NEXTCLOUD_ADMIN_USER', 'admin');
    this.ncPass = this.config.get<string>('NEXTCLOUD_ADMIN_PASS', 'admin123');

    this.client = createClient(this.ncUrl, {
      username: this.ncUser,
      password: this.ncPass,
    });
  }

  /**
   * Upload file to Nextcloud via WebDAV
   * Path: /remote.php/dav/files/{admin}/{tenantId}/{fileName}
   */
  async uploadFile(
    tenantId: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<INcUploadResult> {
    const dirPath = `/files/${this.ncUser}/${tenantId}`;
    const filePath = `${dirPath}/${fileName}`;

    // Ensure tenant directory exists
    try {
      await this.client.createDirectory(dirPath);
    } catch {
      // Directory likely already exists, ignore
    }

    await this.client.putFileContents(filePath, buffer, {
      contentLength: buffer.length,
      headers: { 'Content-Type': mimeType },
    });

    this.logger.log(`Uploaded: ${filePath} (${buffer.length} bytes)`);

    return {
      ncFileId: `${tenantId}/${fileName}`,
      ncPath: filePath,
      fileName,
      fileSize: buffer.length,
      mimeType,
    };
  }

  /**
   * List files in tenant directory via WebDAV PROPFIND
   */
  async listFiles(tenantId: string): Promise<INcFileInfo[]> {
    const dirPath = `/files/${this.ncUser}/${tenantId}`;

    try {
      const items = await this.client.getDirectoryContents(dirPath);
      return (items as any[]).map((item) => ({
        filename: item.filename,
        basename: item.basename,
        size: item.size ?? 0,
        lastmod: item.lastmod,
        mime: item.mime,
      }));
    } catch (error) {
      this.logger.warn(`Failed to list files for tenant ${tenantId}: ${error}`);
      return [];
    }
  }

  /**
   * Download file from Nextcloud via WebDAV GET
   */
  async getFile(tenantId: string, fileName: string): Promise<Buffer> {
    const filePath = `/files/${this.ncUser}/${tenantId}/${fileName}`;
    const data = await this.client.getFileContents(filePath);
    return Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
  }

  /**
   * Get user quota via OCS API
   * GET /ocs/v2.php/cloud/users/{ncUserId}
   */
  async getUserQuota(ncUserId: string): Promise<INcQuota> {
    const url = `${this.ncUrl}/ocs/v2.php/cloud/users/${ncUserId}`;
    const response = await axios.get(url, {
      auth: { username: this.ncUser, password: this.ncPass },
      headers: { 'OCS-APIRequest': 'true' },
    });

    const quota = response.data?.ocs?.data?.quota;
    if (!quota) {
      return { used: 0, available: 0, total: 0, relative: 0 };
    }

    return {
      used: Number(quota.used) || 0,
      available: Number(quota.free) || 0,
      total: Number(quota.total) || 0,
      relative:
        Number(quota.total) > 0
          ? Math.round((Number(quota.used) / Number(quota.total)) * 100)
          : 0,
    };
  }
}
