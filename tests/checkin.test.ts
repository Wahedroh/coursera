import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { checkinToken } from '../src/server/attendance/service'
import { getDb } from '../src/server/db/client'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const W = () => Math.floor(Date.now() / 30000)

async function setup() {
  const cookie = await loginTeacher()
  const c1 = await seedClass(db(), { name: 'ห้อง A ชั้น 1' })
  const c2 = await seedClass(db())
  const s = await seedStudent(db(), c1.classId)
  const other = await seedStudent(db(), c2.classId)
  const { day, records } = await json(await postJson(`/api/teacher/classes/${c1.classId}/attendance`, { date: '2026-10-26' }, { cookie }))
  await putJson(`/api/teacher/attendance/${day.id}/records/${s.id}`, { status: 'absent' }, cookie)
  const open = (v: boolean) => putJson(`/api/teacher/attendance/${day.id}/self-checkin`, { open: v }, cookie)
  const status = async () =>
    (await json(await postJson(`/api/teacher/classes/${c1.classId}/attendance`, { date: '2026-10-26' }, { cookie }))).records.find((r: { studentId: string }) => r.studentId === s.id)
  return { cookie, day, records, s, other, open, status, sc: await studentCookie(s.id), oc: await studentCookie(other.id) }
}
const checkin = (dayId: string, token: string, cookie: string) => postJson('/api/student/checkin', { dayId, token }, { cookie })

it('ครูขอ QR ได้ url ที่มี token และเช็กอินสำเร็จได้ present source self', async () => {
  const { cookie, day, open, sc, status } = await setup()
  await open(true)
  const qr = await json(await getJson(`/api/teacher/attendance/${day.id}/qr`, cookie))
  const url = new URL(qr.url, 'http://x')
  expect(url.pathname).toBe('/checkin')
  expect(url.searchParams.get('d')).toBe(day.id)
  expect(qr.expiresAt).toBeGreaterThan(Date.now())
  const res = await checkin(day.id, url.searchParams.get('t')!, sc)
  expect(res.status).toBe(200)
  expect(await json(res)).toEqual({ status: 'present', className: 'ห้อง A ชั้น 1', date: '2026-10-26', earnedExp: true })
  expect(await status()).toMatchObject({ status: 'present', source: 'self' })
})

it('token ช่วงก่อนหน้ายังใช้ได้ แต่เก่ากว่านั้นใช้ไม่ได้', async () => {
  const { day, open, sc } = await setup()
  await open(true)
  expect((await checkin(day.id, await checkinToken(env.SESSION_SECRET, day.id, W() - 1), sc)).status).toBe(200)
  const res = await checkin(day.id, await checkinToken(env.SESSION_SECRET, day.id, W() - 3), sc)
  expect(res.status).toBe(400)
  expect(await json(res)).toEqual({ error: { code: 'invalid_checkin', message: 'QR หมดอายุหรือไม่ถูกต้อง ให้สแกนใหม่จากจอหน้าห้อง' } })
})

it('ครูปิดเช็กอิน / นักเรียนห้องอื่น / token ปลอม → 400 และสถานะไม่เปลี่ยน', async () => {
  const { day, open, sc, oc, status } = await setup()
  const tok = await checkinToken(env.SESSION_SECRET, day.id, W())
  expect((await checkin(day.id, tok, sc)).status).toBe(400)
  await open(true)
  expect((await checkin(day.id, tok, oc)).status).toBe(400)
  expect((await checkin(day.id, 'deadbeefdeadbeef', sc)).status).toBe(400)
  expect((await status()).status).toBe('absent')
})

it('ครูเรียก QR ได้เท่านั้น', async () => {
  const { day, sc } = await setup()
  expect((await getJson(`/api/teacher/attendance/${day.id}/qr`, sc)).status).toBe(401)
})
