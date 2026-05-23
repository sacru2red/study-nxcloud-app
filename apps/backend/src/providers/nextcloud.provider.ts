import { createClient, type FileStat, type WebDAVClient } from 'webdav'
import axios from 'axios'
import { Logger } from '@nestjs/common'
import { throwSafeNextcloudHttpException } from '../common/nextcloud-error.util'

const logger = new Logger('NextcloudProvider')

const ncUrl = process.env.NEXTCLOUD_URL || 'http://localhost:8081'
const ncUser = process.env.NEXTCLOUD_ADMIN_USER || 'admin'
const ncPass = process.env.NEXTCLOUD_ADMIN_PASS || 'admin123'

const client: WebDAVClient = createClient(`${ncUrl}/remote.php/dav/files/${ncUser}`, {
  username: ncUser,
  password: ncPass,
})

function mapAxiosError(error: unknown, context: string): never {
  if (axios.isAxiosError(error)) {
    logger.error(`${context} failed`, {
      status: error.response?.status,
      code: error.code,
    })
  } else {
    logger.error(`${context} failed`, { error })
  }
  throwSafeNextcloudHttpException(error)
}

export namespace NextcloudProvider {
  export const uploadFile = async (
    tenantId: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string,
  ) => {
    const dirPath = `/${tenantId}`
    const filePath = `${dirPath}/${fileName}`

    try {
      await client.createDirectory(dirPath)
    } catch {
      // directory may already exist
    }

    try {
      await client.putFileContents(filePath, buffer, {
        contentLength: buffer.length,
        headers: { 'Content-Type': mimeType },
      })
    } catch (error) {
      mapAxiosError(error, 'uploadFile')
    }

    const ncPath = `/files/${ncUser}/${tenantId}/${fileName}`

    return {
      ncFileId: `${tenantId}/${fileName}`,
      ncPath,
      fileName,
      fileSize: buffer.length,
      mimeType,
    }
  }

  export const listFiles = async (tenantId: string) => {
    const dirPath = `/${tenantId}`
    try {
      const items = await client.getDirectoryContents(dirPath)
      return items.map((item: FileStat) => ({
        filename: item.filename,
        basename: item.basename,
        size: item.size ?? 0,
        lastmod: item.lastmod,
        mime: item.mime,
      }))
    } catch {
      return []
    }
  }

  export const getFile = async (tenantId: string, fileName: string) => {
    const filePath = `/${tenantId}/${fileName}`
    try {
      const data = await client.getFileContents(filePath)
      return Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
    } catch (error) {
      mapAxiosError(error, 'getFile')
    }
  }

  export const getUserQuota = async (ncUserId: string) => {
    try {
      const response = await axios.get(`${ncUrl}/ocs/v2.php/cloud/users/${ncUserId}`, {
        auth: { username: ncUser, password: ncPass },
        headers: { 'OCS-APIRequest': 'true' },
      })
      const quota = response.data?.ocs?.data?.quota
      if (!quota) {
        return { used: 0, available: 0, total: 0, relative: 0 }
      }
      return {
        used: Number(quota.used) || 0,
        available: Number(quota.free) || 0,
        total: Number(quota.total) || 0,
        relative:
          Number(quota.total) > 0
            ? Math.round((Number(quota.used) / Number(quota.total)) * 100)
            : 0,
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        logger.warn(`getUserQuota: user not found in Nextcloud (${ncUserId})`)
        return { used: 0, available: 0, total: 0, relative: 0 }
      }
      mapAxiosError(error, 'getUserQuota')
    }
  }
}
