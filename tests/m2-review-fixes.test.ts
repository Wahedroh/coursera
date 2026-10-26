import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { openDay, setStatus } from '../src/server/attendance/service'
import { getDb } from '../src/server/db/client'
import { pointEvents } from '../src/server/db/schema'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const exp = async (id: string) => (await db().select().from(pointEvents).where(eq(pointEvents.studentId, id))).reduce((n, p) => n + p.delta, 0)

// I1: เปิดวันพร้อมกัน 2 ครั้งต้องได้ +2 ครั้งเดียว และหักคืนได้เมื่อขาด
it('openDay พร้อมกันได้ +2 ครั้งเดียว และเปลี่ยนเป็นขาดแล้วเหลือ 0', async () => {
  const { classId } = await seedClass(db())
  const s = await seedStudent(db(), classId)
  const [a] = await Promise.all([openDay(db(), classId, '2026-10-20'), openDay(db(), classId, '2026-10-20')])
  expect(await exp(s.id)).toBe(2)
  await setStatus(db(), a.day!.id, s.id, 'absent', 'teacher')
  expect(await exp(s.id)).toBe(0)
})

// I2: GET อ่านอย่างเดียว; สร้างวันต้องกดเริ่ม; วันอนาคต/วันที่เป็นไปไม่ได้ 400
it('GET วันที่ยังไม่เริ่มคืน day=null ไม่สร้างวัน ไม่ให้ EXP', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const s = await seedStudent(db(), classId)
  const r = await json(await getJson(`/api/teacher/classes/${classId}/attendance?date=2026-10-20`, cookie))
  expect(r).toEqual({ day: null, records: [] })
  expect(await exp(s.id)).toBe(0)
  const started = await postJson(`/api/teacher/classes/${classId}/attendance`, { date: '2026-10-20' }, { cookie })
  expect(started.status).toBe(200)
  expect((await json(started)).records).toHaveLength(1)
  expect(await exp(s.id)).toBe(2)
})

it('เริ่มเช็กชื่อวันอนาคต / วันที่เป็นไปไม่ได้ / ปีแปลก → 400', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  for (const date of ['2999-01-01', '2026-02-31', '0002-10-26']) {
    expect((await postJson(`/api/teacher/classes/${classId}/attendance`, { date }, { cookie })).status).toBe(400)
  }
})

// I3: QR บอกอายุที่เหลือ (ไม่พึ่งนาฬิกาเครื่องฉาย)
it('QR คืน ttlMs ระหว่าง 1–30000', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  await seedStudent(db(), classId)
  const { day } = await json(await postJson(`/api/teacher/classes/${classId}/attendance`, { date: '2026-10-20' }, { cookie }))
  const qr = await json(await getJson(`/api/teacher/attendance/${day.id}/qr`, cookie))
  expect(qr.ttlMs).toBeGreaterThan(0)
  expect(qr.ttlMs).toBeLessThanOrEqual(30_000)
})

// I4: นักเรียนใหม่หลังบันทึกผังต้องขึ้นในผัง
it('ผังที่บันทึกแล้วต่อท้ายนักเรียนที่ยังไม่มีที่นั่ง และตัดคนที่ปิดใช้งานออก', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const a = await seedStudent(db(), classId)
  const gone = await seedStudent(db(), classId)
  await putJson(`/api/teacher/classes/${classId}/seating`, { cols: 6, seats: [gone.id, a.id] }, cookie)
  const late = await seedStudent(db(), classId)
  await db().update((await import('../src/server/db/schema')).students).set({ active: false }).where(eq((await import('../src/server/db/schema')).students.id, gone.id))
  expect(await json(await getJson(`/api/teacher/classes/${classId}/seating`, cookie))).toEqual({ cols: 6, seats: [null, a.id, late.id] })
})

// I5: กระดานจัดอันดับเปิด/ปิดแยกต่อห้อง
it('เปิดกระดานจัดอันดับห้อง A ไม่เปิดห้อง B', async () => {
  const cookie = await loginTeacher()
  const A = await seedClass(db())
  const B = await seedClass(db())
  const sa = await seedStudent(db(), A.classId)
  const sb = await seedStudent(db(), B.classId)
  expect((await putJson(`/api/teacher/classes/${A.classId}/settings/leaderboard`, { enabled: true }, cookie)).status).toBe(200)
  expect((await getJson('/api/student/leaderboard', await studentCookie(sa.id))).status).toBe(200)
  expect((await getJson('/api/student/leaderboard', await studentCookie(sb.id))).status).toBe(403)
  expect((await json(await getJson(`/api/teacher/classes/${A.classId}/settings`, cookie))).leaderboardEnabled).toBe(true)
  expect((await json(await getJson(`/api/teacher/classes/${B.classId}/settings`, cookie))).leaderboardEnabled).toBe(false)
})
