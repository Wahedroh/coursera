import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { todayBangkok } from '../src/shared/attendance'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const ASG = { instructions: '', attachmentKeys: [], maxScore: 10, submitMode: 'text' }

it('รวมนักเรียนค้างงานเลยกำหนด ขาดเรียน และยังไม่ตั้ง PIN ปรับเกณฑ์ได้', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db(), { name: 'ห้องทดสอบ ชั้น 1' })
  const lazy = await seedStudent(db(), classId, { firstName: 'ขี้เกียจ', pinHash: 'x' })
  const good = await seedStudent(db(), classId, { firstName: 'ขยัน', pinHash: 'x' })
  const noPin = await seedStudent(db(), classId, { firstName: 'ใหม่', pinHash: null })
  const past = Date.now() - 86400_000
  const ids: string[] = []
  for (const title of ['ใบงาน 1', 'ใบงาน 2', 'ใบงาน 3']) ids.push((await json(await postJson('/api/teacher/assignments', { ...ASG, title, dueAt: past, classIds: [classId] }, { cookie }))).ids[0])
  await postJson('/api/teacher/assignments', { ...ASG, title: 'ยังไม่ถึงกำหนด', dueAt: Date.now() + 86400_000, classIds: [classId] }, { cookie })
  for (const [i, id] of ids.entries()) {
    const c = await studentCookie(good.id)
    expect((await putJson(`/api/student/assignments/${id}/submission`, { text: 'ส่ง', imageKeys: [], clientRequestId: `r${i}` }, c)).status).toBe(200)
  }
  const day = await json(await postJson(`/api/teacher/classes/${classId}/attendance`, { date: todayBangkok() }, { cookie }))
  await putJson(`/api/teacher/attendance/${day.day.id}/records/${lazy.id}`, { status: 'absent' }, cookie)

  const w = await json(await getJson('/api/teacher/watchlist?absent=1', cookie))
  const [c] = w.classes
  expect(c).toEqual(expect.objectContaining({ name: 'ห้องทดสอบ ชั้น 1', total: 3 }))
  const by = Object.fromEntries(c.students.map((s: { id: string }) => [s.id, s]))
  expect(by[lazy.id]).toEqual(expect.objectContaining({ reasons: ['missing', 'absent'], missing: 3, absent: 1, missingTitles: ['ใบงาน 1', 'ใบงาน 2', 'ใบงาน 3'] }))
  expect(by[good.id]).toBeUndefined()
  expect(by[noPin.id].reasons).toEqual(['missing', 'no_pin'])
  // เกณฑ์ค้างงาน 4 ชิ้น + ขาด 2 ครั้ง → ไม่ติด (คนไม่มี PIN ยังติด)
  const w2 = await json(await getJson('/api/teacher/watchlist?missing=4&absent=2', cookie))
  expect(w2.classes[0].students.map((s: { id: string }) => s.id)).toEqual([noPin.id])
  expect((await getJson('/api/teacher/watchlist?missing=0', cookie)).status).toBe(400)
})
