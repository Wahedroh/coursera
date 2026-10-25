import { drizzle } from 'drizzle-orm/d1'
import { ulid } from 'ulid'
import type { Env } from '../env'
import * as schema from './schema'

export function getDb(env: Pick<Env, 'DB'>) {
  return drizzle(env.DB, { schema })
}

export type Db = ReturnType<typeof getDb>

export const newId = (): string => ulid()
export const now = (): number => Date.now()
