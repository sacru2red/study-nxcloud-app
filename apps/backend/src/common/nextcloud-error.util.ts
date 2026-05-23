import axios from 'axios'
import { HttpException, HttpStatus } from '@nestjs/common'

export interface SafeNextcloudHttpError {
  status: HttpStatus
  message: string
}

export function mapAxiosErrorToSafeNextcloudHttpError(error: unknown): SafeNextcloudHttpError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    if (status === 401 || status === 403) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Nextcloud authentication failed',
      }
    }
    if (status && status >= 500) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Nextcloud service is unavailable',
      }
    }
    return {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      message: 'Nextcloud request failed',
    }
  }

  return {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'Nextcloud request failed',
  }
}

export function throwSafeNextcloudHttpException(error: unknown): never {
  const safe = mapAxiosErrorToSafeNextcloudHttpError(error)
  throw new HttpException({ message: safe.message }, safe.status)
}
