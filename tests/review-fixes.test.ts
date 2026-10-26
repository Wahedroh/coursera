import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { hashSecret } from '../src/server/auth/crypto'
import { reserveLoginAttempt } from '../src/server/auth/pin-attempts'
import { createSession, readSession } from '../src/server/auth/sessions'
import { getDb } from '../src/server/db/client'
import { students } from '../src/server/db/schema'
import { parseZipgradeCsv } from '../src/shared/roster/parse'
import { json, postJson, resetDb, seedClass, seedStudent } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

async function student(pin?: string) {
  const { classId } = await seedClass(db())
  return seedStudent(db(), classId, { zipgradeId: '124', pinHash: pin ? await hashSecret(pin) : null })
}

// I1: จองสิทธิ์ลองก่อนตรวจ PIN ทำให้คำขอพร้อมกันลอดการล็อกไม่ได้
it('reserveLoginAttempt นับครั้งแบบ atomic และคืน null เมื่อถูกล็อก', async () => {
  const { id } = await student('2468')
  const t = Date.now()
  expect(await reserveLoginAttempt(db(), id, t)).toBe(1)
  expect(await reserveLoginAttempt(db(), id, t)).toBe(2)
  await db().update(students).set({ lockedUntil: t + 60_000 }).where(eq(students.id, id))
  expect(await reserveLoginAttempt(db(), id, t)).toBeNull()
})

it('มี 5 ครั้งที่จองค้างอยู่ (คำขอพร้อมกัน) แล้ว PIN ถูกก็ยังถูกล็อก', async () => {
  const { id } = await student('2468')
  await db().update(students).set({ failedAttempts: 5 }).where(eq(students.id, id))
  const res = await postJson('/api/student/login', { zipgradeId: '124', pin: '2468' })
  expect(res.status).toBe(423)
})

// I2: PIN ใช้ iteration ต่ำกว่าเพื่อไม่เกิน CPU 10ms ของแพ็กเกจฟรี (มีแค่ 10^4 ค่า การล็อกคือการป้องกันจริง)
it('PIN ที่ตั้งใหม่เก็บด้วย 10000 iterations', async () => {
  const { id } = await student()
  expect((await postJson('/api/student/set-pin', { zipgradeId: '124', pin: '2468' })).status).toBe(200)
  const [row] = await db().select().from(students).where(eq(students.id, id))
  expect(row.pinHash!.startsWith('pbkdf2-sha256$10000$')).toBe(true)
  expect((await postJson('/api/student/login', { zipgradeId: '124', pin: '2468' })).status).toBe(200)
})

// I3: นักเรียนพิมพ์รหัสครูผิดจาก IP ตัวเอง ต้องไม่ล็อกครูที่อยู่คนละเครื่อง
it('ผิด 10 ครั้งจาก IP หนึ่ง ครูล็อกอินจาก IP อื่นได้', async () => {
  for (let i = 0; i < 10; i++) await postJson('/api/teacher/login', { password: 'x' }, { headers: { 'cf-connecting-ip': '10.1.1.1' } })
  expect((await postJson('/api/teacher/login', { password: 'x' }, { headers: { 'cf-connecting-ip': '10.1.1.1' } })).status).toBe(429)
  expect((await postJson('/api/teacher/login', { password: 'teacher-pass' }, { headers: { 'cf-connecting-ip': '10.2.2.2' } })).status).toBe(200)
})

it('ลองรวมทุก IP ครบเพดาน (300/ชม.) → ปิดล็อกอินครูชั่วคราว', async () => {
  const { rateLimits } = await import('../src/server/db/schema')
  await db().insert(rateLimits).values({ key: 'teacher-login', windowStart: Date.now(), count: 300 })
  const res = await postJson('/api/teacher/login', { password: 'teacher-pass' }, { headers: { 'cf-connecting-ip': '10.9.9.9' } })
  expect(res.status).toBe(429)
})

it('ยิงรหัสครูพร้อมกัน 15 คำขอจาก IP เดียว → ตรวจรหัสได้ไม่เกิน 10 ครั้ง', async () => {
  const h = { 'cf-connecting-ip': '10.4.4.4' }
  const rs = await Promise.all(Array.from({ length: 15 }, () => postJson('/api/teacher/login', { password: 'x' }, { headers: h })))
  const codes = rs.map((r) => r.status)
  expect(codes.filter((c) => c === 401).length).toBeLessThanOrEqual(10)
  expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(5)
}, 30_000)

it('ล็อกอินครูสำเร็จไม่กินโควตาการลองผิด', async () => {
  const h = { 'cf-connecting-ip': '10.5.5.5' }
  for (let i = 0; i < 12; i++) expect((await postJson('/api/teacher/login', { password: 'teacher-pass' }, { headers: h })).status).toBe(200)
}, 30_000)

// I4: session ผูกกับ SESSION_SECRET — เปลี่ยน secret แล้ว session เดิมใช้ไม่ได้
it('readSession ด้วย secret อื่นคืน null', async () => {
  const { token } = await createSession(db(), { kind: 'teacher' }, 'ua', env.SESSION_SECRET)
  expect(await readSession(db(), token, env.SESSION_SECRET)).toMatchObject({ kind: 'teacher' })
  expect(await readSession(db(), token, 'rotated-secret')).toBeNull()
})

// ทั้งห้อง (~30 คน) อยู่หลัง NAT เดียวกัน ตั้ง PIN พร้อมกันในคาบแรก ต้องไม่โดน 429
it('IP เดียวส่งได้ 150 คำขอต่อนาที คำขอที่ 151 ได้ 429', async () => {
  await student()
  const h = { 'cf-connecting-ip': '192.168.50.1' }
  for (let i = 0; i < 150; i++) expect((await postJson('/api/student/lookup', { zipgradeId: '124' }, { headers: h })).status).toBe(200)
  const res = await postJson('/api/student/lookup', { zipgradeId: '124' }, { headers: h })
  expect(res.status).toBe(429)
  expect((await json(res)).error.code).toBe('too_many_requests')
}, 30_000)

// CSV ที่ Excel ภาษาไทยบันทึกเป็น cp874 ต้องถูกปฏิเสธ ไม่ใช่เขียนทับชื่อด้วยตัวอักษรเสีย
it('CSV ที่ไม่ใช่ UTF-8 (มี U+FFFD) ถูกปฏิเสธพร้อมคำแนะนำ', () => {
  const csv = 'ZipGrade ID,External ID,First Name,Last Name,Classes\n1,,���,��,�� 1'
  expect(parseZipgradeCsv(csv)).toEqual({
    rows: [],
    errors: [{ line: 1, message: 'ไฟล์ไม่ได้บันทึกเป็น UTF-8 (ชื่อภาษาไทยจะเพี้ยน) กรุณาบันทึกใหม่เป็น "CSV UTF-8" แล้วลองอีกครั้ง' }],
  })
})
