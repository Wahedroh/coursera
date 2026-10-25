import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { hashSecret } from '../src/server/auth/crypto'
import { getDb } from '../src/server/db/client'
import { students } from '../src/server/db/schema'
import { cookieFrom, getJson, json, postJson, resetDb, seedClass, seedStudent } from './helpers'

const db = () => getDb(env)
let ipCounter = 0
const ip = () => ({ 'cf-connecting-ip': `10.0.0.${++ipCounter}` })
const post = (path: string, body: unknown, headers: Record<string, string> = ip()) => postJson(path, body, { headers })

async function student(over: Partial<typeof students.$inferInsert> = {}) {
  const { classId } = await seedClass(db(), { name: 'โรงเรียนทดสอบ ชั้น 2' })
  return seedStudent(db(), classId, { zipgradeId: '124', title: 'เด็กหญิง', firstName: 'สมใจ', lastName: 'ใจดี', ...over })
}
const withPin = async (pin = '2468') => student({ pinHash: await hashSecret(pin) })
const row = async (id: string) => (await db().select().from(students).where(eq(students.id, id)))[0]

beforeEach(resetDb)

it('lookup คนยังไม่ตั้ง PIN ได้ชื่อและห้อง', async () => {
  await student()
  const res = await post('/api/student/lookup', { zipgradeId: '124' })
  expect(await json(res)).toEqual({ status: 'needs_pin', student: { title: 'เด็กหญิง', firstName: 'สมใจ', lastName: 'ใจดี', className: 'โรงเรียนทดสอบ ชั้น 2' } })
})

it('lookup ด้วย " 0124 " หาเจอคนที่ ID 124', async () => {
  await student()
  expect((await json(await post('/api/student/lookup', { zipgradeId: ' 0124 ' }))).status).toBe('needs_pin')
})

it('lookup ไม่พบ / ถูกปิดใช้งาน ได้ 404', async () => {
  await student({ active: false })
  for (const z of ['124', '999']) {
    const res = await post('/api/student/lookup', { zipgradeId: z })
    expect(res.status).toBe(404)
    expect(await json(res)).toEqual({ error: { code: 'student_not_found', message: 'ไม่พบรหัสนี้ กรุณาตรวจสอบกับครู' } })
  }
})

it('ตั้ง PIN ครั้งแรกได้ cookie และ /api/me เป็นนักเรียนคนนั้น', async () => {
  const { id } = await student()
  const res = await post('/api/student/set-pin', { zipgradeId: '124', pin: '2468' })
  expect(res.status).toBe(200)
  const me = await json(await getJson('/api/me', cookieFrom(res)))
  expect(me).toEqual({ kind: 'student', student: { id, zipgradeId: '124', title: 'เด็กหญิง', firstName: 'สมใจ', lastName: 'ใจดี', className: 'โรงเรียนทดสอบ ชั้น 2' } })
})

it('ตั้ง PIN พร้อมกัน 2 คำขอ สำเร็จ 1 ได้ 409 อีก 1', async () => {
  await student()
  const [a, b] = await Promise.all([
    post('/api/student/set-pin', { zipgradeId: '124', pin: '1111' }),
    post('/api/student/set-pin', { zipgradeId: '124', pin: '2222' }),
  ])
  expect([a.status, b.status].sort()).toEqual([200, 409])
  const loser = a.status === 409 ? a : b
  expect((await json(loser)).error.code).toBe('pin_already_set')
})

it('lookup หลังตั้ง PIN ได้ has_pin โดยไม่มีชื่อ', async () => {
  await withPin()
  expect(await json(await post('/api/student/lookup', { zipgradeId: '124' }))).toEqual({ status: 'has_pin' })
})

it('ล็อกอินด้วย PIN ถูก', async () => {
  await withPin()
  const res = await post('/api/student/login', { zipgradeId: '124', pin: '2468' })
  expect(res.status).toBe(200)
  expect(await json(res)).toEqual({ ok: true, flaggedNewDevice: false })
  expect((await getJson('/api/me', cookieFrom(res))).status).toBe(200)
})

it('PIN ผิดแจ้งจำนวนครั้งที่เหลือ', async () => {
  await withPin()
  const res = await post('/api/student/login', { zipgradeId: '124', pin: '0000' })
  expect(res.status).toBe(401)
  expect(await json(res)).toEqual({ error: { code: 'invalid_pin', message: 'PIN ไม่ถูกต้อง (เหลืออีก 4 ครั้ง)' } })
})

it('PIN ผิด 5 ครั้ง → 423 แม้ PIN ถูก', async () => {
  await withPin()
  for (let i = 0; i < 5; i++) await post('/api/student/login', { zipgradeId: '124', pin: '0000' })
  const res = await post('/api/student/login', { zipgradeId: '124', pin: '2468' })
  expect(res.status).toBe(423)
  expect(await json(res)).toEqual({ error: { code: 'locked', message: 'พิมพ์ PIN ผิดหลายครั้ง กรุณารอ 15 นาที หรือแจ้งครู' } })
})

it('ผ่านไป 15 นาที (แก้ lockedUntil ใน DB) ล็อกอินได้', async () => {
  const { id } = await withPin()
  for (let i = 0; i < 5; i++) await post('/api/student/login', { zipgradeId: '124', pin: '0000' })
  await db().update(students).set({ lockedUntil: Date.now() - 1 }).where(eq(students.id, id))
  expect((await post('/api/student/login', { zipgradeId: '124', pin: '2468' })).status).toBe(200)
  expect((await row(id)).failedAttempts).toBe(0)
})

it('ยังไม่ตั้ง PIN แล้วล็อกอินได้ 409 pin_not_set', async () => {
  await student()
  const res = await post('/api/student/login', { zipgradeId: '124', pin: '2468' })
  expect(res.status).toBe(409)
  expect((await json(res)).error.code).toBe('pin_not_set')
})

it('PIN ผิดรูปแบบ 12a4 / 12345 / "" ได้ 400 และ failedAttempts ไม่เพิ่ม', async () => {
  const { id } = await withPin()
  for (const pin of ['12a4', '12345', '']) {
    for (const path of ['/api/student/login', '/api/student/set-pin']) {
      const res = await post(path, { zipgradeId: '124', pin })
      expect(res.status).toBe(400)
      expect(await json(res)).toEqual({ error: { code: 'invalid_pin_format', message: 'PIN ต้องเป็นตัวเลข 4 หลัก' } })
    }
  }
  expect((await row(id)).failedAttempts).toBe(0)
})

it('ล็อกอินจาก user-agent ใหม่ขณะมี session เดิม → flaggedNewDevice true', async () => {
  await withPin()
  await post('/api/student/login', { zipgradeId: '124', pin: '2468' }, { ...ip(), 'user-agent': 'phone-A' })
  const again = await post('/api/student/login', { zipgradeId: '124', pin: '2468' }, { ...ip(), 'user-agent': 'phone-A' })
  expect((await json(again)).flaggedNewDevice).toBe(false)
  const other = await post('/api/student/login', { zipgradeId: '124', pin: '2468' }, { ...ip(), 'user-agent': 'phone-B' })
  expect((await json(other)).flaggedNewDevice).toBe(true)
})

