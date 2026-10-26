import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { checkinToken } from '../src/server/attendance/service'
import { getDb } from '../src/server/db/client'
import { students } from '../src/server/db/schema'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

it('สแกนเช็กอินไม่ลบล้าง "สาย" ที่ครูตั้งไว้; คนที่เป็นมาอยู่แล้วไม่ได้ EXP ซ้ำ', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const late = await seedStudent(db(), classId)
  const present = await seedStudent(db(), classId)
  const { day } = await json(await postJson(`/api/teacher/classes/${classId}/attendance`, { date: '2026-10-26' }, { cookie }))
  await putJson(`/api/teacher/attendance/${day.id}/records/${late.id}`, { status: 'late' }, cookie)
  await putJson(`/api/teacher/attendance/${day.id}/self-checkin`, { open: true }, cookie)
  const token = await checkinToken('test-secret', day.id, Math.floor(Date.now() / 30000))
  const r1 = await json(await postJson('/api/student/checkin', { dayId: day.id, token }, { cookie: await studentCookie(late.id) }))
  expect(r1).toMatchObject({ status: 'late', earnedExp: false })
  const r2 = await json(await postJson('/api/student/checkin', { dayId: day.id, token }, { cookie: await studentCookie(present.id) }))
  expect(r2).toMatchObject({ status: 'present', earnedExp: false })
  const rec = (await json(await getJson(`/api/teacher/attendance/${day.id}`, cookie))).records.find((r: { studentId: string }) => r.studentId === late.id)
  expect(rec).toMatchObject({ status: 'late', source: 'teacher' })
})

it('ให้แต้มนักเรียนที่ปิดใช้งานแล้วไม่ได้', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const s = await seedStudent(db(), classId)
  await db().update(students).set({ active: false }).where(eq(students.id, s.id))
  expect((await postJson('/api/teacher/points', { studentIds: [s.id], delta: 5, reason: 'ตอบคำถาม' }, { cookie })).status).toBe(404)
})

it('กระดานจัดอันดับ: แต้มเท่ากันได้อันดับเท่ากัน', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const ids = []
  for (const name of ['ก', 'ข', 'ค']) ids.push((await seedStudent(db(), classId, { firstName: name })).id)
  await postJson('/api/teacher/points', { studentIds: [ids[0], ids[1]], delta: 5, reason: 'x' }, { cookie })
  await putJson(`/api/teacher/classes/${classId}/settings/leaderboard`, { enabled: true }, cookie)
  const board = await json(await getJson('/api/student/leaderboard', await studentCookie(ids[2])))
  expect(board.map((r: { rank: number; firstName: string }) => [r.rank, r.firstName])).toEqual([
    [1, 'ก'],
    [1, 'ข'],
    [3, 'ค'],
  ])
})

it('URL ไฟล์ที่ถอดรหัสไม่ได้ → 404 ไม่ใช่ 500', async () => {
  const cookie = await loginTeacher()
  const { SELF } = await import('cloudflare:test')
  const res = await SELF.fetch('http://x/api/files/%E0%A4%A', { headers: { cookie } })
  expect(res.status).toBe(404)
})

it('อัปโหลดรูป: ใหญ่เกิน 5MB ถูกปฏิเสธจาก content-length; นักเรียนอัปได้ไม่เกิน 60 รูป/ชม.', async () => {
  const { uploadFile, TINY_JPEG } = await import('./helpers')
  const { classId } = await seedClass(db())
  const sc = await studentCookie((await seedStudent(db(), classId)).id)
  const { SELF } = await import('cloudflare:test')
  const big = await SELF.fetch('http://x/api/files?kind=submission', { method: 'POST', headers: { 'content-type': 'image/jpeg', 'content-length': String(6 * 1024 * 1024), cookie: sc }, body: new Uint8Array(10) })
  expect(big.status).toBe(400)
  const { rateLimits } = await import('../src/server/db/schema')
  const { students: st } = await import('../src/server/db/schema')
  const [me] = await db().select({ id: st.id }).from(st).where(eq(st.classId, classId))
  await db().insert(rateLimits).values({ key: `upload:s:${me.id}`, windowStart: Date.now(), count: 60 })
  expect((await uploadFile('kind=submission', TINY_JPEG, 'image/jpeg', sc)).status).toBe(429)
})
