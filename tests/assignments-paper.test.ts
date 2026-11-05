import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { del, getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

async function setup(dueAt: number | null) {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const a = await seedStudent(db(), classId)
  const b = await seedStudent(db(), classId)
  const asg = (await json(await postJson('/api/teacher/assignments', { title: 'ใบงานกระดาษ', instructions: '', attachmentKeys: [], maxScore: 10, submitMode: 'image', dueAt, classIds: [classId] }, { cookie }))).ids[0]
  return { cookie, classId, a, b, asg }
}
const cell = async (classId: string, studentId: string, asg: string, cookie: string) =>
  (await json(await getJson(`/api/teacher/classes/${classId}/gradebook`, cookie))).students.find((s: { id: string }) => s.id === studentId).cells[asg]
const exp = async (c: string) => (await json(await getJson('/api/student/progress', c))).exp

it('ครูบันทึกส่งกระดาษพร้อมคะแนน → ตรวจแล้ว ได้ EXP ตรงเวลา · นักเรียนเห็นคะแนนและว่าส่งกระดาษ', async () => {
  const { cookie, classId, a, asg } = await setup(Date.now() - 3600_000)
  const r = await putJson(`/api/teacher/assignments/${asg}/paper/${a.id}`, { score: 8, late: false, comment: 'เรียบร้อยดี' }, cookie)
  expect(r.status).toBe(200)
  expect(await cell(classId, a.id, asg, cookie)).toEqual(expect.objectContaining({ status: 'graded', score: 8, onPaper: true }))
  const ca = await studentCookie(a.id)
  const mine = await json(await getJson(`/api/student/assignments/${asg}`, ca))
  expect(mine).toEqual(expect.objectContaining({ status: 'graded', submission: expect.objectContaining({ score: 8, onPaper: true, comment: 'เรียบร้อยดี' }) }))
  expect(await exp(ca)).toBe(10)
  // แก้คะแนนซ้ำ ไม่ได้ EXP เพิ่ม
  await putJson(`/api/teacher/assignments/${asg}/paper/${a.id}`, { score: 9, late: false, comment: '' }, cookie)
  expect((await cell(classId, a.id, asg, cookie)).score).toBe(9)
  expect(await exp(ca)).toBe(10)
})

it('ส่งกระดาษแบบยังไม่ให้คะแนน → รอตรวจ (ส่งช้า) แล้วตรวจทีหลังได้ · ยกเลิกได้ และหัก EXP คืน', async () => {
  const { cookie, classId, a, asg } = await setup(Date.now() - 3600_000)
  const { submissionId } = await json(await putJson(`/api/teacher/assignments/${asg}/paper/${a.id}`, { score: null, late: true, comment: '' }, cookie))
  expect(await cell(classId, a.id, asg, cookie)).toEqual(expect.objectContaining({ status: 'late', score: null, onPaper: true }))
  expect((await postJson(`/api/teacher/submissions/${submissionId}/grade`, { score: 6, comment: '', annotatedKeys: [] }, { cookie })).status).toBe(200)
  const ca = await studentCookie(a.id)
  expect(await exp(ca)).toBe(5)
  expect((await del(`/api/teacher/submissions/${submissionId}/paper`, cookie)).status).toBe(200)
  expect((await cell(classId, a.id, asg, cookie)).status).toBe('missing')
  expect(await exp(ca)).toBe(0)
})

it('นักเรียนส่งในระบบแล้ว บันทึกกระดาษทับไม่ได้ และยกเลิกงานในระบบไม่ได้ · คะแนนเกิน/คนนอกห้อง ไม่ได้', async () => {
  const { cookie, a, b, asg } = await setup(null)
  const other = await seedStudent(db(), (await seedClass(db())).classId)
  const ca = await studentCookie(a.id)
  // จำลองงานที่นักเรียนส่งในระบบแล้ว
  const { submissions } = await import('../src/server/db/schema')
  await db().insert(submissions).values({ id: 'online1', assignmentId: asg, studentId: a.id, status: 'submitted', submittedAt: Date.now(), updatedAt: Date.now() })
  expect((await putJson(`/api/teacher/assignments/${asg}/paper/${a.id}`, { score: 5, late: false, comment: '' }, cookie)).status).toBe(409)
  expect((await del('/api/teacher/submissions/online1/paper', cookie)).status).toBe(409)
  expect((await putJson(`/api/teacher/assignments/${asg}/paper/${b.id}`, { score: 11, late: false, comment: '' }, cookie)).status).toBe(400)
  expect((await putJson(`/api/teacher/assignments/${asg}/paper/${other.id}`, { score: 5, late: false, comment: '' }, cookie)).status).toBe(404)
  expect((await putJson(`/api/teacher/assignments/${asg}/paper/${b.id}`, { score: 5, late: false, comment: '' }, ca)).status).toBe(401)
})

it('ครูส่งกลับให้แก้ แล้วนักเรียนส่งแก้เป็นกระดาษ → บันทึกได้', async () => {
  const { cookie, a, asg } = await setup(null)
  const { submissions } = await import('../src/server/db/schema')
  await db().insert(submissions).values({ id: 'ret1', assignmentId: asg, studentId: a.id, status: 'returned', submittedAt: Date.now(), updatedAt: Date.now() })
  const r = await json(await putJson(`/api/teacher/assignments/${asg}/paper/${a.id}`, { score: 7, late: false, comment: '' }, cookie))
  expect(r.submissionId).toBe('ret1')
})
