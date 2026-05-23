import type { IConnection } from 'backend-sdk'

const getAccessToken = () => {
  const rawToken = localStorage.getItem('accessToken')
  if (!rawToken) {
    return ''
  }

  try {
    const parsedToken = JSON.parse(rawToken) as unknown
    return typeof parsedToken === 'string' ? parsedToken : rawToken
  } catch {
    return rawToken
  }
}

export const getConnection = () => {
  const accessToken = getAccessToken()

  return {
    host:
      process.env['NODE_ENV'] === 'development'
        ? new URL('/api', window.location.origin).href
        : 'http://localhost:3000/api',
    headers: {
      Authorization: accessToken ? `Bearer ${accessToken}` : '',
    },
  } satisfies IConnection
}

/** WebSocket용 연결 (HTTP /api → ws, JWT는 authorization 헤더) */
export const getWsConnection = () => {
  const http = getConnection()
  const host = http.host.replace(/^http/i, 'ws').replace(/\/$/, '')
  const authorization =
    typeof http.headers?.Authorization === 'string' && http.headers.Authorization.length > 0
      ? http.headers.Authorization
      : undefined

  return {
    host,
    headers: { authorization },
  } satisfies IConnection<{ authorization?: string }>
}
