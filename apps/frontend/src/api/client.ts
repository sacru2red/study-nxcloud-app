import type { IConnection } from 'backend-sdk'

export const getConnection = () => {
  return {
    host: process.env['NODE_ENV'] === 'development' ? new URL(window.location.origin, '/api').href  : 'http://localhost:3000',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
    },
  } satisfies IConnection
}