import { and, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { PIN_RE, studentLookupSchema, studentPinSchema } from '../../shared/schemas'
import { canonicalZipgradeId } from '../../shared/zipgrade'
import { getDb, now, type Db } from '../db/client'
import { classes, students } from '../db/schema'
import type { AppEnv } from '../env'
import { apiError, getClientIp, parseBody } from '../http'
import { hashSecret, PIN_ITERATIONS, verifySecret } from './crypto'
import { clearLoginAttempts, lockStudent, reserveLoginAttempt } from './pin-attempts'
import { hitRateLimit, refundRateLimit } from './rate-limit'
import { createSession, setSessionCookie } from './sessions'

const MAX_FAILS = 5
const LOCK_MS = 15 * 60 * 1000
/** PIN ผิดรวมทุกบัญชีต่อ IP: กันการไล่เดา/ไล่ล็อกบัญชีทั้งโรงเรียนจากเครื่องเดียว (คนพิมพ์ผิดตามปกติไม่ถึง) */
const IP_FAIL = { limit: 40, windowMs: 15 * 60 * 1000 }

export const studentAuthRoutes = new Hono<AppEnv>()

studentAuthRoutes.use('*', async (c, next) => {
  // หลวมพอให้ทั้งห้อง (~45 คน หลัง NAT เดียว) ค้นรหัส + ตั้ง/ใส่ PIN พร้อมกันได้
  if (await hitRateLimit(getDb(c.env), `ip:${getClientIp(c)}`, 150, 60 * 1000)) {
    throw apiError('too_many_requests', 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่', 429)
  }
  await next()
})

async function findActive(db: Db, rawId: string) {
  const [row] = await db
    .select({
      id: students.id,
      title: students.title,
      firstName: students.firstName,
      lastName: students.lastName,
      pinHash: students.pinHash,
      lockedUntil: students.lockedUntil,
      className: classes.name,
    })
    .from(students)
    .innerJoin(classes, eq(students.classId, classes.id))
    .where(and(eq(students.zipgradeId, canonicalZipgradeId(rawId)), eq(students.active, true)))
  if (!row) throw apiError('student_not_found', 'ไม่พบรหัสนี้ กรุณาตรวจสอบกับครู', 404)
  return row
}

function checkPinFormat(pin: string) {
  if (!PIN_RE.test(pin)) throw apiError('invalid_pin_format', 'PIN ต้องเป็นตัวเลข 4 หลัก', 400)
}

const lockedError = (until: number) =>
  apiError('locked', `พิมพ์ PIN ผิดหลายครั้ง กรุณารอ ${Math.ceil((until - now()) / 60000)} นาที หรือแจ้งครู`, 423)

studentAuthRoutes.post('/lookup', async (c) => {
  const { zipgradeId } = await parseBody(c, studentLookupSchema)
  const s = await findActive(getDb(c.env), zipgradeId)
  if (s.pinHash) return c.json({ status: 'has_pin' })
  return c.json({ status: 'needs_pin', student: { title: s.title, firstName: s.firstName, lastName: s.lastName, className: s.className } })
})

studentAuthRoutes.post('/set-pin', async (c) => {
  const { zipgradeId, pin } = await parseBody(c, studentPinSchema)
  checkPinFormat(pin)
  const db = getDb(c.env)
  const s = await findActive(db, zipgradeId)
  const alreadySet = () =>
    apiError('pin_already_set', 'รหัสนี้ตั้ง PIN แล้ว กรุณาเข้าสู่ระบบด้วย PIN หรือแจ้งครูให้รีเซ็ต', 409)
  if (s.pinHash) throw alreadySet()
  const pinHash = await hashSecret(pin, PIN_ITERATIONS)
  const updated = await db
    .update(students)
    .set({ pinHash, failedAttempts: 0, lockedUntil: null, updatedAt: now() })
    .where(and(eq(students.id, s.id), isNull(students.pinHash)))
    .returning({ id: students.id })
  if (updated.length === 0) throw alreadySet()
  const { token } = await createSession(db, { kind: 'student', studentId: s.id }, c.req.header('user-agent') ?? '', c.env.SESSION_SECRET)
  setSessionCookie(c, token, 'student')
  return c.json({ ok: true })
})

studentAuthRoutes.post('/login', async (c) => {
  const { zipgradeId, pin } = await parseBody(c, studentPinSchema)
  checkPinFormat(pin)
  const db = getDb(c.env)
  const s = await findActive(db, zipgradeId)
  if (s.lockedUntil && s.lockedUntil > now()) throw lockedError(s.lockedUntil)
  if (!s.pinHash) throw apiError('pin_not_set', 'ยังไม่ได้ตั้ง PIN กรุณาตั้ง PIN ก่อน', 409)

  // จองสิทธิ์ต่อ IP ก่อนตรวจ (คืนให้เมื่อ PIN ถูก) — นับเฉพาะครั้งที่ผิด
  const ipKey = `pinfail:ip:${getClientIp(c)}`
  if (await hitRateLimit(db, ipKey, IP_FAIL.limit, IP_FAIL.windowMs)) {
    throw apiError('too_many_attempts', 'มีการใส่ PIN ผิดจากเครื่องนี้หลายครั้ง กรุณารอ 15 นาทีหรือแจ้งครู', 429)
  }
  // จองสิทธิ์ก่อนตรวจ PIN: คำขอพร้อมกันหลายคำขอลอดการล็อกไม่ได้
  const t = now()
  const attempt = await reserveLoginAttempt(db, s.id, t)
  if (attempt === null) throw lockedError(t + LOCK_MS)
  if (attempt > MAX_FAILS) {
    await lockStudent(db, s.id, t + LOCK_MS)
    throw lockedError(t + LOCK_MS)
  }
  if (!(await verifySecret(pin, s.pinHash))) {
    if (attempt >= MAX_FAILS) {
      await lockStudent(db, s.id, t + LOCK_MS)
      throw lockedError(t + LOCK_MS)
    }
    throw apiError('invalid_pin', `PIN ไม่ถูกต้อง (เหลืออีก ${MAX_FAILS - attempt} ครั้ง)`, 401)
  }
  if (!(await clearLoginAttempts(db, s.id, t))) throw lockedError(t + LOCK_MS)
  await refundRateLimit(db, ipKey)

  const { token, flaggedNewDevice } = await createSession(db, { kind: 'student', studentId: s.id }, c.req.header('user-agent') ?? '', c.env.SESSION_SECRET)
  setSessionCookie(c, token, 'student')
  return c.json({ ok: true, flaggedNewDevice })
})
