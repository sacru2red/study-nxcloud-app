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
        : 'http://localhost:3000',
    headers: {
      Authorization: accessToken ? `Bearer ${accessToken}` : '',
    },
  } satisfies IConnection
}