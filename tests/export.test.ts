import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { todayBangkok } from '../src/shared/attendance'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

it('ข้อมูลส่งออกของห้อง: สมุดคะแนน คะแนนสอบ เกรด เช็กชื่อตามช่วงวัน และค่าเอกสารทุกรายการ', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const other = (await seedClass(db())).classId
  const a = await seedStudent(db(), classId)
  await seedStudent(db(), other)
  const item = (await json(await postJson('/api/teacher/score-items', { title: 'สอบย่อย', category: 'quiz', maxScore: 10, takenOn: '2026-10-20', classIds: [classId] }, { cookie }))).ids[0]
  await putJson(`/api/teacher/score-items/${item}/scores/${a.id}`, { score: 7, absent: false, note: '' }, cookie)
  const day = await json(await postJson(`/api/teacher/classes/${classId}/attendance`, { date: todayBangkok() }, { cookie }))
  await putJson(`/api/teacher/attendance/${day.day.id}/records/${a.id}`, { status: 'late' }, cookie)
  const fee = (await json(await postJson('/api/teacher/fee-items', { title: 'ชีท', amount: 40, classIds: [classId, other] }, { cookie }))).ids[0]
  await postJson(`/api/teacher/fee-items/${fee}/charges/bulk`, { studentIds: [a.id] }, { cookie })

  const x = await json(await getJson(`/api/teacher/classes/${classId}/export`, cookie))
  expect(x.gradebook.students).toHaveLength(1)
  expect(x.scoreBook.cells[a.id][item]).toEqual({ score: 7, absent: false })
  expect(x.grades.students[0]).toEqual(expect.objectContaining({ id: a.id, total: 7 }))
  expect(x.attendance.totals[a.id].late).toBe(1)
  expect(x.fees.items).toEqual([expect.objectContaining({ id: fee, title: 'ชีท', amount: 40 })])
  expect(x.fees.charges).toEqual([expect.objectContaining({ itemId: fee, studentId: a.id, amount: 40, paid: 0 })])
  expect(x.to).toBe(todayBangkok())

  // ช่วงวันที่ไม่มีการเช็กชื่อ
  const old = await json(await getJson(`/api/teacher/classes/${classId}/export?from=2020-01-01&to=2020-12-31`, cookie))
  expect(old.attendance.days).toEqual([])
  expect((await getJson(`/api/teacher/classes/${classId}/export?from=2026-12-01&to=2026-01-01`, cookie)).status).toBe(400)
  expect((await getJson(`/api/teacher/classes/nope/export`, cookie)).status).toBe(404)
})
