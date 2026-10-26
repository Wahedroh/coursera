import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { teacherLoginSchema } from '../../shared/schemas'
import { getDb } from '../db/client'
import { classes, students } from '../db/schema'
import type { AppEnv } from '../env'
import { apiError, getClientIp, parseBody } from '../http'
import { verifySecret } from './crypto'
import { requireSession } from './middleware'
import { hitRateLimit, refundRateLimit } from './rate-limit'
import { clearSessionCookie, createSession, revokeSession, setSessionCookie } from './sessions'

// ต่อ IP: กันเดารหัสจากเครื่องเดียว / รวมทุก IP: กันการเดาแบบกระจาย — ตั้งสูงพอที่ครูเปลี่ยนเครือข่ายหลายครั้งไม่โดนล็อก
const LIMITS = {
  ip: { limit: 10, windowMs: 15 * 60 * 1000 },
  global: { limit: 300, windowMs: 60 * 60 * 1000 },
}

export const teacherAuthRoutes = new Hono<AppEnv>()

teacherAuthRoutes.post('/teacher/login', async (c) => {
  const { password } = await parseBody(c, teacherLoginSchema)
  const db = getDb(c.env)
  const ipKey = `teacher-login:ip:${getClientIp(c)}`
  // จองสิทธิ์ก่อนตรวจรหัส (นับแบบ atomic): ยิงพร้อมกันหลายคำขอก็ลอดเพดานไม่ได้
  const ipOver = await hitRateLimit(db, ipKey, LIMITS.ip.limit, LIMITS.ip.windowMs)
  const globalOver = await hitRateLimit(db, 'teacher-login', LIMITS.global.limit, LIMITS.global.windowMs)
  if (ipOver || globalOver) throw apiError('too_many_attempts', 'ลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่', 429)
  if (!(await verifySecret(password, c.env.TEACHER_PASSWORD_HASH))) {
    throw apiError('invalid_password', 'รหัสผ่านไม่ถูกต้อง', 401)
  }
  // เข้าสำเร็จไม่นับเป็นครั้งที่ลองผิด
  await refundRateLimit(db, ipKey)
  await refundRateLimit(db, 'teacher-login')
  const { token } = await createSession(db, { kind: 'teacher' }, c.req.header('user-agent') ?? '', c.env.SESSION_SECRET)
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
