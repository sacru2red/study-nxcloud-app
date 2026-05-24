import { createClient, type FileStat, type WebDAVClient } from 'webdav'
import axios from 'axios'
import { Logger } from '@nestjs/common'
import { throwSafeNextcloudHttpException } from '../common/nextcloud-error.util'

const logger = new Logger('NextcloudProvider')
const loggedMissingQuotaUsers = new Set<string>()
const loggedNextcloudErrors = new Map<string, number>()
const ERROR_LOG_THROTTLE_EVERY = 10

const UPLOAD_MAX_ATTEMPTS = 5
const UPLOAD_RETRY_BASE_MS = 400

const ncUrl = process.env.NEXTCLOUD_URL || 'http://localhost:8081'
const ncUser = process.env.NEXTCLOUD_ADMIN_USER || 'admin'
const ncPass = process.env.NEXTCLOUD_ADMIN_PASS || 'admin123'

const client: WebDAVClient = createClient(`${ncUrl}/remote.php/dav/files/${ncUser}`, {
  username: ncUser,
  password: ncPass,
})

interface NextcloudErrorDetail {
  status?: number
  message: string
}

function describeNextcloudError(error: unknown): NextcloudErrorDetail {
  if (axios.isAxiosError(error)) {
    return {
      status: error.response?.status,
      message: error.message,
    }
  }

  if (error instanceof Error) {
    const status = (error as Error & { status?: number }).status
    return {
      status,
      message: error.message,
    }
  }

  return { message: String(error) }
}

function logNextcloudError(context: string, error: unknown): void {
  const detail = describeNextcloudError(error)
  const key = `${context}:${detail.status ?? 'unknown'}`
  const count = (loggedNextcloudErrors.get(key) ?? 0) + 1
  loggedNextcloudErrors.set(key, count)

  if (count !== 1 && count % ERROR_LOG_THROTTLE_EVERY !== 0) {
    return
  }

  const repeatSuffix = count > 1 ? ` (repeat ${count})` : ''
  logger.error(
    `${context} failed — HTTP ${detail.status ?? 'n/a'}: ${detail.message}${repeatSuffix}`,
  )
}

function isRetryableUploadStatus(status: number | undefined): boolean {
  return status === 423 || status === 409 || status === 503
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
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

    let lastError: unknown
    for (let attempt = 0; attempt < UPLOAD_MAX_ATTEMPTS; attempt += 1) {
      try {
        await client.putFileContents(filePath, buffer, {
          contentLength: buffer.length,
          headers: { 'Content-Type': mimeType },
        })
        lastError = undefined
        break
      } catch (error) {
        lastError = error
        const status = describeNextcloudError(error).status
        if (isRetryableUploadStatus(status) && attempt < UPLOAD_MAX_ATTEMPTS - 1) {
          await sleep(UPLOAD_RETRY_BASE_MS * (attempt + 1))
          continue
        }
        logNextcloudError('uploadFile', error)
        throwSafeNextcloudHttpException(error)
      }
    }

    if (lastError) {
      logNextcloudError('uploadFile', lastError)
      throwSafeNextcloudHttpException(lastError)
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
      logNextcloudError('getFile', error)
      throwSafeNextcloudHttpException(error)
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
        if (!loggedMissingQuotaUsers.has(ncUserId)) {
          loggedMissingQuotaUsers.add(ncUserId)
          logger.warn(`getUserQuota: user not found in Nextcloud (${ncUserId})`)
        }
        return { used: 0, available: 0, total: 0, relative: 0 }
      }
      logNextcloudError('getUserQuota', error)
      throwSafeNextcloudHttpException(error)
    }
  }
}
