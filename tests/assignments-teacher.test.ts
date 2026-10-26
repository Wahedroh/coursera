import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb, newId, now } from '../src/server/db/client'
import { submissions } from '../src/server/db/schema'
import { ASSIGNMENT, del, getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

it('สร้างงานให้ 2 ห้องได้ 2 งาน', async () => {
  const cookie = await loginTeacher()
  const c1 = await seedClass(db())
  const c2 = await seedClass(db())
  const res = await postJson('/api/teacher/assignments', { classIds: [c1.classId, c2.classId], ...ASSIGNMENT }, { cookie })
  expect(res.status).toBe(200)
  expect((await json(res)).ids).toHaveLength(2)
  const list = await json(await getJson(`/api/teacher/classes/${c2.classId}/assignments`, cookie))
  expect(list).toHaveLength(1)
  expect(list[0]).toMatchObject({ title: 'ใบงาน 1', maxScore: 10, submitMode: 'both' })
})

it('ห้องไม่มีอยู่ 404 และข้อมูลไม่ถูกต้อง 400', async () => {
  const cookie = await loginTeacher()
  expect((await postJson('/api/teacher/assignments', { classIds: ['nope'], ...ASSIGNMENT }, { cookie })).status).toBe(404)
  const { classId } = await seedClass(db())
  expect((await postJson('/api/teacher/assignments', { classIds: [classId], ...ASSIGNMENT, maxScore: 0 }, { cookie })).status).toBe(400)
  expect((await postJson('/api/teacher/assignments', { classIds: [], ...ASSIGNMENT }, { cookie })).status).toBe(400)
})

it('listForClass นับสถานะถูก (missing = นักเรียน active ที่ยังไม่ส่ง)', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const s1 = await seedStudent(db(), classId)
  await seedStudent(db(), classId)
  await seedStudent(db(), classId, { active: false })
  const { ids } = await json(await postJson('/api/teacher/assignments', { classIds: [classId], ...ASSIGNMENT }, { cookie }))
  await db().insert(submissions).values({ id: newId(), assignmentId: ids[0], studentId: s1.id, status: 'late', submittedAt: now(), updatedAt: now() })
  const [a] = await json(await getJson(`/api/teacher/classes/${classId}/assignments`, cookie))
  expect(a.counts).toEqual({ submitted: 0, late: 1, graded: 0, returned: 0, missing: 1 })
})

it('แก้งานได้ และลบงานที่ยังไม่มีคนส่งได้ แต่มีคนส่งแล้วได้ 409', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const s1 = await seedStudent(db(), classId)
  const { ids } = await json(await postJson('/api/teacher/assignments', { classIds: [classId], ...ASSIGNMENT }, { cookie }))
  expect((await putJson(`/api/teacher/assignments/${ids[0]}`, { ...ASSIGNMENT, title: 'ใบงาน 1 (แก้)' }, cookie)).status).toBe(200)
  expect((await json(await getJson(`/api/teacher/assignments/${ids[0]}`, cookie))).title).toBe('ใบงาน 1 (แก้)')
  await db().insert(submissions).values({ id: newId(), assignmentId: ids[0], studentId: s1.id, status: 'submitted', submittedAt: now(), updatedAt: now() })
  const res = await del(`/api/teacher/assignments/${ids[0]}`, cookie)
  expect(res.status).toBe(409)
  expect((await json(res)).error.code).toBe('has_submissions')
  const { ids: [id2] } = await json(await postJson('/api/teacher/assignments', { classIds: [classId], ...ASSIGNMENT }, { cookie }))
  expect((await del(`/api/teacher/assignments/${id2}`, cookie)).status).toBe(200)
  expect((await getJson(`/api/teacher/assignments/${id2}`, cookie)).status).toBe(404)
})

it('นักเรียนเรียกได้ 401', async () => {
  const { classId } = await seedClass(db())
  const s = await seedStudent(db(), classId)
  const cookie = await studentCookie(s.id)
  expect((await postJson('/api/teacher/assignments', { classIds: [classId], ...ASSIGNMENT }, { cookie })).status).toBe(401)
})
