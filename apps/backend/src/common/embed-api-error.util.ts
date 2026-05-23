import axios from 'axios'

export interface EmbedApiErrorDetail {
  message: string
  httpStatus?: number
  retryAfterMs?: number
}

export function parseRetryAfterMs(error: unknown): number | null {
  if (!axios.isAxiosError(error) || !error.response) {
    return null
  }

  const retryAfterHeader = error.response.headers['retry-after']
  if (typeof retryAfterHeader === 'string') {
    const seconds = Number(retryAfterHeader)
    if (!Number.isNaN(seconds)) {
      return seconds * 1000
    }
  }

  const bodyText = JSON.stringify(error.response.data)
  const match = bodyText.match(/retry in ([\d.]+)s/i)
  if (match) {
    return Math.ceil(Number(match[1]) * 1000)
  }

  return null
}

export function describeEmbedApiError(error: unknown): EmbedApiErrorDetail {
  if (axios.isAxiosError(error)) {
    const httpStatus = error.response?.status
    const body = error.response?.data
    let bodySnippet = ''
    if (typeof body === 'string') {
      bodySnippet = body.slice(0, 300)
    } else if (body !== undefined) {
      bodySnippet = JSON.stringify(body).slice(0, 300)
    }

    const message =
      httpStatus !== undefined
        ? `HTTP ${httpStatus}${bodySnippet ? `: ${bodySnippet}` : ''}`
        : error.message

    return {
      httpStatus,
      message,
      retryAfterMs: parseRetryAfterMs(error) ?? undefined,
    }
  }

  return {
    message: error instanceof Error ? error.message : String(error),
  }
}

export function isRetryableEmbedHttpStatus(httpStatus: number | undefined): boolean {
  return httpStatus === 429 || httpStatus === 502 || httpStatus === 503
}
