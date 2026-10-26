import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { getDb, now } from '../src/server/db/client'
import { pointEvents, students } from '../src/server/db/schema'
import { getJson, json, loginTeacher, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const exp = async (studentId: string) =>
  (await db().select().from(pointEvents).where(eq(pointEvents.studentId, studentId))).reduce((n, p) => n + p.delta, 0)

async function setup(n = 2) {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const ss = []
  for (let i = 0; i < n; i++) ss.push(await seedStudent(db(), classId, { sortOrder: i }))
  return { cookie, classId, ss }
}

it('เปิดวันแล้วทุกคนเป็น present และได้ +2', async () => {
  const { cookie, classId, ss } = await setup()
  await seedStudent(db(), classId, { active: false })
  const res = await getJson(`/api/teacher/classes/${classId}/attendance?date=2026-10-26`, cookie)
  expect(res.status).toBe(200)
  const body = await json(res)
  expect(body.day).toMatchObject({ date: '2026-10-26', selfCheckinOpen: false })
  expect(body.records.map((r: { status: string }) => r.status)).toEqual(['present', 'present'])
  expect(await exp(ss[0].id)).toBe(2)
})

it('เปิดวันซ้ำไม่สร้างซ้ำ และ EXP ไม่เพิ่ม', async () => {
  const { cookie, classId, ss } = await setup()
  const a = await json(await getJson(`/api/teacher/classes/${classId}/attendance?date=2026-10-26`, cookie))
  const b = await json(await getJson(`/api/teacher/classes/${classId}/attendance?date=2026-10-26`, cookie))
  expect(b.day.id).toBe(a.day.id)
  expect(b.records).toHaveLength(2)
  expect(await exp(ss[0].id)).toBe(2)
})

it('มา→ขาด→มา EXP เหลือ +2 และสาย = +2', async () => {
  const { cookie, classId, ss } = await setup()
  const { day } = await json(await getJson(`/api/teacher/classes/${classId}/attendance?date=2026-10-26`, cookie))
  const put = (status: string) => putJson(`/api/teacher/attendance/${day.id}/records/${ss[0].id}`, { status }, cookie)
  expect((await put('absent')).status).toBe(200)
  expect(await exp(ss[0].id)).toBe(0)
  await put('present')
  await put('late')
  expect(await exp(ss[0].id)).toBe(2)
  const again = await json(await getJson(`/api/teacher/classes/${classId}/attendance?date=2026-10-26`, cookie))
  expect(again.records[0]).toMatchObject({ studentId: ss[0].id, status: 'late', source: 'teacher' })
})

it('ห้อง 120 คนเปิดวันได้', async () => {
  const { cookie, classId } = await setup(0)
  const t = now()
  const rows = Array.from({ length: 120 }, (_, i) => ({ id: `s${i}`, zipgradeId: `z${i}`, classId, firstName: 'ก', lastName: 'ข', sortOrder: i, createdAt: t, updatedAt: t }))
  for (let i = 0; i < rows.length; i += 10) await db().insert(students).values(rows.slice(i, i + 10))
  const res = await getJson(`/api/teacher/classes/${classId}/attendance?date=2026-10-26`, cookie)
  expect(res.status).toBe(200)
  expect((await json(res)).records).toHaveLength(120)
})

it('วันที่ผิดรูปแบบ 400 และสถานะผิด 400', async () => {
  const { cookie, classId, ss } = await setup()
  expect((await getJson(`/api/teacher/classes/${classId}/attendance?date=26/10/2026`, cookie)).status).toBe(400)
  const { day } = await json(await getJson(`/api/teacher/classes/${classId}/attendance?date=2026-10-26`, cookie))
  expect((await putJson(`/api/teacher/attendance/${day.id}/records/${ss[0].id}`, { status: 'gone' }, cookie)).status).toBe(400)
})

it('range นับสถานะถูก', async () => {
  const { cookie, classId, ss } = await setup()
  for (const date of ['2026-10-26', '2026-10-27']) {
    const { day } = await json(await getJson(`/api/teacher/classes/${classId}/attendance?date=${date}`, cookie))
    if (date === '2026-10-27') await putJson(`/api/teacher/attendance/${day.id}/records/${ss[1].id}`, { status: 'sick' }, cookie)
  }
  const r = await json(await getJson(`/api/teacher/classes/${classId}/attendance-range?from=2026-10-01&to=2026-10-31`, cookie))
  expect(r.days).toEqual(['2026-10-26', '2026-10-27'])
  expect(r.cells[ss[1].id]).toEqual({ '2026-10-26': 'present', '2026-10-27': 'sick' })
  expect(r.totals[ss[1].id]).toEqual({ present: 1, late: 0, sick: 1, leave: 0, absent: 0 })
})

it('นักเรียนเรียก 401', async () => {
  const { classId, ss } = await setup()
  expect((await getJson(`/api/teacher/classes/${classId}/attendance?date=2026-10-26`, await studentCookie(ss[0].id))).status).toBe(401)
})
