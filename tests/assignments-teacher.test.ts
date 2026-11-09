import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb, newId, now } from '../src/server/db/client'
import { submissions } from '../src/server/db/schema'
import { ASSIGNMENT, del, getJson, json, loginTeacher, postJson, putJson, resetDb, seedAssignment, seedClass, seedStudent, studentCookie, TINY_JPEG, uploadFile } from './helpers'

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
  expect((await json(await getJson(`/api/teacher/assignments/${ids[0]}`, cookie))).title).toBe('ใบงาน 1 (แก้)')
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

it('ยืนยันลบ (force) → ลบงานพร้อมงานที่ส่ง รูป และ EXP จากงานนี้ · งานอื่นไม่กระทบ', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const s1 = await seedStudent(db(), classId)
  const sc = await studentCookie(s1.id)
  const a1 = await seedAssignment(classId, { title: 'จะลบ' })
  const a2 = await seedAssignment(classId, { title: 'เก็บไว้' })
  const up = await uploadFile('kind=submission', TINY_JPEG, 'image/jpeg', sc)
  const { key } = await json(up)
  await putJson(`/api/student/assignments/${a1}/submission`, { text: '', imageKeys: [key], clientRequestId: 'd1' }, sc)
  await putJson(`/api/student/assignments/${a2}/submission`, { text: 'ตอบ', imageKeys: [], clientRequestId: 'd2' }, sc)
  const gb = await json(await getJson(`/api/teacher/classes/${classId}/gradebook`, cookie))
  const cells = gb.students[0].cells
  for (const a of [a1, a2]) await postJson(`/api/teacher/submissions/${cells[a].submissionId}/grade`, { score: 8, comment: '', annotatedKeys: [] }, { cookie })
  expect((await json(await getJson('/api/student/exp', sc))).exp).toBe(60)

  expect((await del(`/api/teacher/assignments/${a1}`, cookie)).status).toBe(409)
  expect(await json(await del(`/api/teacher/assignments/${a1}?force=1`, cookie))).toEqual({ removedSubmissions: 1 })
  expect((await getJson(`/api/teacher/assignments/${a1}`, cookie)).status).toBe(404)
  expect((await db().select().from(submissions)).map((x) => x.assignmentId)).toEqual([a2])
  expect((await json(await getJson('/api/student/exp', sc))).exp).toBe(30)
  expect(await env.BUCKET.get(key)).toBeNull()
  expect((await json(await getJson('/api/student/assignments', sc))).map((x: { title: string }) => x.title)).toEqual(['เก็บไว้'])
})
