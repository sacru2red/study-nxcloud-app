import { AxiosError, AxiosHeaders } from 'axios'
import { HttpStatus } from '@nestjs/common'
import {
  mapAxiosErrorToSafeNextcloudHttpError,
  throwSafeNextcloudHttpException,
} from '../../../backend/src/common/nextcloud-error.util'

describe('Nextcloud error sanitization', () => {
  it('maps 401 to safe 503 without credential details', () => {
    const error = new AxiosError(
      'Request failed with status code 401',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { message: 'secret admin:wrongpass' },
      },
    )

    const safe = mapAxiosErrorToSafeNextcloudHttpError(error)
    expect(safe.status).toBe(HttpStatus.SERVICE_UNAVAILABLE)
    expect(safe.message).toBe('Nextcloud authentication failed')
    expect(safe.message).not.toContain('wrongpass')
    expect(safe.message).not.toContain('admin')
  })

  it('throws HttpException with fixed message for 403', () => {
    const error = new AxiosError('Forbidden', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 403,
      statusText: 'Forbidden',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {},
    })

    try {
      throwSafeNextcloudHttpException(error)
      fail('expected HttpException')
    } catch (err: unknown) {
      const response = (err as { getResponse?: () => { message: string } }).getResponse?.()
      expect(response?.message).toBe('Nextcloud authentication failed')
    }
  })
})
