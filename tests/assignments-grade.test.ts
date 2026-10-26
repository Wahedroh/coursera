import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { getDb, newId } from '../src/server/db/client'
import { pointEvents, submissions } from '../src/server/db/schema'
import { getJson, json, loginTeacher, postJson, resetDb, seedAssignment, seedClass, seedStudent } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

async function setup(submittedAt: number, dueAt = 10_000) {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const s = await seedStudent(db(), classId, { sortOrder: 2 })
  const a = await seedAssignment(classId, { title: 'ใบงาน 4', dueAt, maxScore: 10 })
  const id = newId()
  await db().insert(submissions).values({ id, assignmentId: a, studentId: s.id, status: submittedAt > dueAt ? 'late' : 'submitted', submittedAt, updatedAt: 1 })
  const grade = (b: unknown) => postJson(`/api/teacher/submissions/${id}/grade`, b, { cookie })
  const points = () => db().select().from(pointEvents).where(eq(pointEvents.studentId, s.id))
  return { cookie, classId, a, s, id, grade, points }
}

it('ให้คะแนนแล้วสถานะ graded และ EXP +10', async () => {
  const { id, grade, points } = await setup(5_000)
  const res = await grade({ score: 8, comment: 'ดีมาก', annotatedKeys: [`ann/${id}/x.png`] })
  expect(res.status).toBe(200)
  const [row] = await db().select().from(submissions).where(eq(submissions.id, id))
  expect(row).toMatchObject({ status: 'graded', score: 8, comment: 'ดีมาก', annotatedKeys: [`ann/${id}/x.png`] })
  expect((await points()).map((p) => [p.delta, p.reason, p.source, p.refId])).toEqual([[10, 'ส่งงาน: ใบงาน 4', 'assignment', id]])
})

it('ส่งสายได้ +5', async () => {
  const { grade, points } = await setup(20_000)
  await grade({ score: 5, comment: '', annotatedKeys: [] })
  expect((await points()).map((p) => p.delta)).toEqual([5])
})

it('ตรวจซ้ำ EXP ไม่เพิ่ม', async () => {
  const { grade, points } = await setup(5_000)
  await grade({ score: 8, comment: '', annotatedKeys: [] })
  await grade({ score: 9, comment: 'แก้คะแนน', annotatedKeys: [] })
  expect(await points()).toHaveLength(1)
})

it('คะแนนเกิน/ติดลบ 400 invalid_score และ annotatedKeys ผิด 400', async () => {
  const { grade } = await setup(5_000)
  for (const score of [11, -1]) {
    const res = await grade({ score, comment: '', annotatedKeys: [] })
    expect(res.status).toBe(400)
    expect(await json(res)).toEqual({ error: { code: 'invalid_score', message: 'คะแนนต้องอยู่ระหว่าง 0 ถึง 10' } })
  }
  expect((await grade({ score: 5, comment: '', annotatedKeys: ['sub/x/y.jpg'] })).status).toBe(400)
})

it('ส่งกลับแก้ได้ returned ไม่มี EXP', async () => {
  const { id, cookie, points } = await setup(5_000)
  expect((await postJson(`/api/teacher/submissions/${id}/return`, { comment: 'แก้ข้อ 7' }, { cookie })).status).toBe(200)
  const [row] = await db().select().from(submissions).where(eq(submissions.id, id))
  expect(row).toMatchObject({ status: 'returned', comment: 'แก้ข้อ 7' })
  expect(await points()).toEqual([])
})

it('getSubmission มีข้อมูลงาน นักเรียน และ neighbors ข้ามคนไม่ส่ง', async () => {
  const { id, cookie, classId, a } = await setup(5_000)
  const first = await seedStudent(db(), classId, { sortOrder: 1 })
  await seedStudent(db(), classId, { sortOrder: 3 })
  const last = await seedStudent(db(), classId, { sortOrder: 4 })
  const firstSub = newId()
  const lastSub = newId()
  await db().insert(submissions).values([
    { id: firstSub, assignmentId: a, studentId: first.id, status: 'submitted', submittedAt: 1, updatedAt: 1 },
    { id: lastSub, assignmentId: a, studentId: last.id, status: 'submitted', submittedAt: 1, updatedAt: 1 },
  ])
  const d = await json(await getJson(`/api/teacher/submissions/${id}`, cookie))
  expect(d.assignment).toMatchObject({ id: a, title: 'ใบงาน 4', maxScore: 10 })
  expect(d.student).toMatchObject({ firstName: 'ทดสอบ' })
  expect(d.neighbors).toEqual({ prevId: firstSub, nextId: lastSub })
})
