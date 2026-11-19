import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb, now } from '../src/server/db/client'
import { todayBangkok } from '../src/shared/attendance'
import { addDays } from '../src/shared/leave'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedAssignment, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

it('หน้าแรกนักเรียน: งานที่ยังไม่ส่ง + วันสำคัญ ภายใน 30 วัน เรียงตามวัน (ไม่รวมงานที่ส่งแล้ว/เกิน 30 วัน)', async () => {
  const teacher = await loginTeacher()
  const { classId } = await seedClass(db())
  const s = await seedStudent(db(), classId)
  const sc = await studentCookie(s.id)
  const today = todayBangkok()
  const soon = await seedAssignment(classId, { title: 'ใบงานใกล้', dueAt: now() + 2 * 86400_000, maxScore: 10 })
  const done = await seedAssignment(classId, { title: 'ส่งแล้ว', dueAt: now() + 86400_000 })
  await seedAssignment(classId, { title: 'ไกลเกิน', dueAt: now() + 40 * 86400_000 })
  await putJson(`/api/student/assignments/${done}/submission`, { text: 'ตอบ', imageKeys: [], clientRequestId: 'x' }, sc)
  await postJson('/api/teacher/events', { kind: 'exam', title: 'สอบกลางภาค', date: addDays(today, 12), period: 'คาบ 2', classIds: [classId] }, { cookie: teacher })
  const c = await json(await getJson('/api/student/home-cards', sc))
  expect(c.upcoming.map((x: { kind: string; title: string }) => [x.kind, x.title])).toEqual([
    ['assignment', 'ใบงานใกล้'],
    ['exam', 'สอบกลางภาค'],
  ])
  expect(c.upcoming[0]).toMatchObject({ id: soon, maxScore: 10 })
  expect(c.upcoming[1]).toMatchObject({ at: null, maxScore: null, detail: 'คาบ 2' })
})

it('หน้าแรกครู: แถวข้อสังเกต — เสี่ยง มส · ใบลารอ · งานซ่อมรอตรวจ · ค่าเอกสารค้าง', async () => {
  const teacher = await loginTeacher()
  const { classId } = await seedClass(db())
  const [a, b] = [await seedStudent(db(), classId), await seedStudent(db(), classId)]
  const empty = await json(await getJson('/api/teacher/home-insights', teacher))
  expect(empty).toEqual({ atRisk: { attendance: 0, incomplete: 0, zero: 0 }, remedialToReview: 0, leavesPending: 0, fees: { students: 0, baht: 0 } })

  const day = await json(await postJson(`/api/teacher/classes/${classId}/attendance`, { date: todayBangkok() }, { cookie: teacher }))
  await putJson(`/api/teacher/attendance/${day.day.id}/records/${a.id}`, { status: 'absent' }, teacher)
  const sa = await studentCookie(a.id)
  await postJson('/api/student/leaves', { kind: 'sick', from: todayBangkok(), to: todayBangkok(), reason: 'ไข้' }, { cookie: sa })
  await postJson('/api/teacher/remedials', { classId, studentIds: [a.id], reason: 'attendance', title: 'ซ่อม' }, { cookie: teacher })
  const [rem] = await json(await getJson('/api/student/remedials', sa))
  await putJson(`/api/student/remedials/${rem.id}/submission`, { text: 'ส่ง', imageKeys: [] }, sa)
  const { ids } = await json(await postJson('/api/teacher/fee-items', { title: 'ชีท', amount: 35, classIds: [classId] }, { cookie: teacher }))
  await putJson(`/api/teacher/fee-items/${ids[0]}/charges/${a.id}`, { amount: 35, paid: 10, note: '' }, teacher)
  await putJson(`/api/teacher/fee-items/${ids[0]}/charges/${b.id}`, { amount: 35, paid: 35, note: '' }, teacher)

  const r = await json(await getJson('/api/teacher/home-insights', teacher))
  expect(r).toEqual({ atRisk: { attendance: 1, incomplete: 0, zero: 0 }, remedialToReview: 1, leavesPending: 1, fees: { students: 1, baht: 25 } })
  expect((await getJson('/api/teacher/home-insights', sa)).status).toBe(401)
})
