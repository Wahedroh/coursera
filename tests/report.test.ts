import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { todayBangkok } from '../src/shared/attendance'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

it('รายงานรายบุคคลรวม เช็กชื่อ งาน คะแนนสอบ เกรด และค่าเอกสารค้าง', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db(), { name: 'ห้องรายงาน ชั้น 1' })
  const a = await seedStudent(db(), classId, { firstName: 'มานี', sortOrder: 1 })
  const b = await seedStudent(db(), classId, { firstName: 'ปิติ', sortOrder: 2 })
  const asg = (await json(await postJson('/api/teacher/assignments', { title: 'ใบงาน 1', instructions: '', attachmentKeys: [], maxScore: 10, submitMode: 'text', dueAt: Date.now() - 1000, classIds: [classId] }, { cookie }))).ids[0]
  await putJson(`/api/student/assignments/${asg}/submission`, { text: 'ส่ง', imageKeys: [], clientRequestId: 'x' }, await studentCookie(a.id))
  const item = (await json(await postJson('/api/teacher/score-items', { title: 'สอบย่อย', category: 'quiz', maxScore: 20, takenOn: '2026-10-20', classIds: [classId] }, { cookie }))).ids[0]
  await putJson(`/api/teacher/score-items/${item}/scores/${a.id}`, { score: 15, absent: false, note: '' }, cookie)
  await putJson(`/api/teacher/score-items/${item}/scores/${b.id}`, { score: null, absent: true, note: '' }, cookie)
  const day = await json(await postJson(`/api/teacher/classes/${classId}/attendance`, { date: todayBangkok() }, { cookie }))
  await putJson(`/api/teacher/attendance/${day.day.id}/records/${b.id}`, { status: 'absent' }, cookie)
  const fee = (await json(await postJson('/api/teacher/fee-items', { title: 'ชีท', amount: 50, classIds: [classId] }, { cookie }))).ids[0]
  await postJson(`/api/teacher/fee-items/${fee}/charges/bulk`, { studentIds: [b.id] }, { cookie })

  const r = await json(await getJson(`/api/teacher/classes/${classId}/report`, cookie))
  expect(r).toEqual(expect.objectContaining({ class: expect.objectContaining({ name: 'ห้องรายงาน ชั้น 1' }), classSize: 2, maxTotal: 20 }))
  const [ma, pi] = r.students
  expect(ma).toEqual(expect.objectContaining({ name: 'เด็กหญิงมานี ระบบ', total: 15, feeOutstanding: 0 }))
  expect(ma.attendance.present).toBe(1)
  expect(ma.assignments).toEqual([expect.objectContaining({ title: 'ใบงาน 1', status: 'late' })])
  expect(ma.exams).toEqual([expect.objectContaining({ title: 'สอบย่อย', score: 15, absent: false })])
  expect(pi).toEqual(expect.objectContaining({ total: 0, feeOutstanding: 50 }))
  expect(pi.attendance.absent).toBe(1)
  expect(pi.assignments[0].status).toBe('missing')
  expect(pi.exams[0].absent).toBe(true)
  expect(ma.grade).not.toBeNull()
  expect((await getJson(`/api/teacher/classes/${classId}/report`, await studentCookie(a.id))).status).toBe(401)
})
