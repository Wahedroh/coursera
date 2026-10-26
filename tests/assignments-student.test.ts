import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { getDb, newId, now } from '../src/server/db/client'
import { students, submissions } from '../src/server/db/schema'
import { getJson, json, resetDb, seedAssignment, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

async function setup() {
  const c1 = await seedClass(db())
  const c2 = await seedClass(db())
  const s = await seedStudent(db(), c1.classId)
  return { c1: c1.classId, c2: c2.classId, s, cookie: await studentCookie(s.id) }
}

it('เห็นเฉพาะงานห้องตัวเอง และสถานะ missing เมื่อยังไม่ส่ง', async () => {
  const { c1, c2, cookie } = await setup()
  const a1 = await seedAssignment(c1, { title: 'ของห้องฉัน' })
  await seedAssignment(c2, { title: 'ห้องอื่น' })
  await seedAssignment(c1, { title: 'ยังไม่เผยแพร่', published: false })
  const list = await json(await getJson('/api/student/assignments', cookie))
  expect(list.map((a: { id: string }) => a.id)).toEqual([a1])
  expect(list[0]).toMatchObject({ title: 'ของห้องฉัน', status: 'missing', submission: null })
})

it('เห็นคะแนนและคอมเมนต์หลังตรวจ', async () => {
  const { c1, s, cookie } = await setup()
  const a1 = await seedAssignment(c1)
  await db().insert(submissions).values({ id: newId(), assignmentId: a1, studentId: s.id, status: 'graded', score: 8, comment: 'เก่งมาก', submittedAt: now(), updatedAt: now() })
  const one = await json(await getJson(`/api/student/assignments/${a1}`, cookie))
  expect(one.status).toBe('graded')
  expect(one.submission).toMatchObject({ score: 8, comment: 'เก่งมาก' })
})

it('ย้ายห้องแล้วเห็นเฉพาะงานห้องใหม่ และของานห้องอื่นได้ 404', async () => {
  const { c1, c2, s, cookie } = await setup()
  const a1 = await seedAssignment(c1)
  const a2 = await seedAssignment(c2)
  await db().update(students).set({ classId: c2 }).where(eq(students.id, s.id))
  const list = await json(await getJson('/api/student/assignments', cookie))
  expect(list.map((a: { id: string }) => a.id)).toEqual([a2])
  const res = await getJson(`/api/student/assignments/${a1}`, cookie)
  expect(res.status).toBe(404)
  expect((await json(res)).error.code).toBe('assignment_not_found')
})

it('งานค้างเรียงก่อน ตามกำหนดส่ง', async () => {
  const { c1, s, cookie } = await setup()
  const done = await seedAssignment(c1, { dueAt: 1000 })
  const late = await seedAssignment(c1, { dueAt: 3000 })
  const soon = await seedAssignment(c1, { dueAt: 2000 })
  await db().insert(submissions).values({ id: newId(), assignmentId: done, studentId: s.id, status: 'submitted', submittedAt: now(), updatedAt: now() })
  const list = await json(await getJson('/api/student/assignments', cookie))
  expect(list.map((a: { id: string }) => a.id)).toEqual([soon, late, done])
})
