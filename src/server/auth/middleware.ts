import { getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { getDb } from '../db/client'
import type { AppEnv } from '../env'
import { apiError } from '../http'
import { readSession } from './sessions'

export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, 'sid')
  if (token) {
    const session = await readSession(getDb(c.env), token)
    if (session) c.set('session', session)
  }
  await next()
})

const unauthorized = () => apiError('unauthorized', 'กรุณาเข้าสู่ระบบ', 401)

export const requireTeacher = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('session')?.kind !== 'teacher') throw unauthorized()
  await next()
})

export const requireStudent = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('session')?.kind !== 'student') throw unauthorized()
  await next()
})

export function requireSession(c: { get(k: 'session'): AppEnv['Variables']['session'] }) {
  const s = c.get('session')
  if (!s) throw unauthorized()
  return s
}
