import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { teacherLoginSchema } from '../../shared/schemas'
import { getDb } from '../db/client'
import { classes, students } from '../db/schema'
import type { AppEnv } from '../env'
import { apiError, parseBody } from '../http'
import { verifySecret } from './crypto'
import { requireSession } from './middleware'
import { hitRateLimit, isRateLimited } from './rate-limit'
import { clearSessionCookie, createSession, revokeSession, setSessionCookie } from './sessions'

const TEACHER_KEY = 'teacher-login'
const TEACHER_LIMIT = 10
const WINDOW = 15 * 60 * 1000

export const teacherAuthRoutes = new Hono<AppEnv>()

teacherAuthRoutes.post('/teacher/login', async (c) => {
  const { password } = await parseBody(c, teacherLoginSchema)
  const db = getDb(c.env)
  if (await isRateLimited(db, TEACHER_KEY, TEACHER_LIMIT, WINDOW)) {
    throw apiError('too_many_attempts', 'ลองหลายครั้งเกินไป กรุณารอ 15 นาที', 429)
  }
  if (!(await verifySecret(password, c.env.TEACHER_PASSWORD_HASH))) {
    await hitRateLimit(db, TEACHER_KEY, TEACHER_LIMIT, WINDOW)
    throw apiError('invalid_password', 'รหัสผ่านไม่ถูกต้อง', 401)
  }
  const { token } = await createSession(db, { kind: 'teacher' }, c.req.header('user-agent') ?? '')
  setSessionCookie(c, token, 'teacher')
  return c.json({ ok: true })
})

teacherAuthRoutes.post('/logout', async (c) => {
  const s = c.get('session')
  if (s) await revokeSession(getDb(c.env), s.sessionId)
  clearSessionCookie(c)
  return c.json({ ok: true })
})

teacherAuthRoutes.get('/me', async (c) => {
  const s = requireSession(c)
  if (s.kind === 'teacher') return c.json({ kind: 'teacher' })
  const [row] = await getDb(c.env)
    .select({
      id: students.id,
      zipgradeId: students.zipgradeId,
      title: students.title,
      firstName: students.firstName,
      lastName: students.lastName,
      className: classes.name,
    })
    .from(students)
    .innerJoin(classes, eq(students.classId, classes.id))
    .where(eq(students.id, s.studentId))
  return c.json({ kind: 'student', student: row })
})
