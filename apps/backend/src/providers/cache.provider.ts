import Keyv from 'keyv'
import KeyvPostgres from '@keyv/postgres'
import { Logger } from '@nestjs/common'

const logger = new Logger('CacheProvider')

const keyv = new Keyv({
  store: new KeyvPostgres({
    uri: process.env.DATABASE_URL ?? 'postgresql://nxcloud:nxcloud123@localhost:5480/nxcloud_app',
    table: 'cache',
  }),
})

keyv.on('error', (err: unknown) => {
  logger.error(`Cache connection error: ${String(err)}`)
})

export namespace CacheProvider {
  export const get = async <T>(key: string): Promise<T | undefined> => {
    return keyv.get<T>(key)
  }

  export const set = async (key: string, value: unknown, ttlMs?: number): Promise<void> => {
    await keyv.set(key, value, ttlMs)
  }

  export const del = async (key: string): Promise<void> => {
    await keyv.delete(key)
  }
}
