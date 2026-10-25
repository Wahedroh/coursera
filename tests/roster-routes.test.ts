import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { createSession } from '../src/server/auth/sessions'
import { getDb } from '../src/server/db/client'
import fixture from './fixtures/roster.sample.csv?raw'
import { getJson, json, loginTeacher, postJson, resetDb, seedClass, seedStudent } from './helpers'

beforeEach(resetDb)

it('ไม่ได้ล็อกอินเรียก preview ได้ 401', async () => {
  expect((await postJson('/api/teacher/roster/preview', { csv: fixture })).status).toBe(401)
})

it('preview แล้ว apply fixture แล้ว GET classes ได้ 2 โรงเรียน', async () => {
  const cookie = await loginTeacher()
  const pv = await postJson('/api/teacher/roster/preview', { csv: fixture }, { cookie })
  expect(pv.status).toBe(200)
  const pvBody = await json(pv)
  expect(pvBody.preview.newStudents).toHaveLength(7)
  expect(pvBody.errors).toEqual([])

  const ap = await postJson('/api/teacher/roster/apply', { csv: fixture, deactivateMissing: false }, { cookie })
  expect(await json(ap)).toEqual({ created: 7, updated: 0, deactivated: 0 })

  const list = await json(await getJson('/api/teacher/classes', cookie))
  expect(list.map((s: { schoolName: string }) => s.schoolName)).toEqual(['โรงเรียนตัวอย่าง', 'โรงเรียนทดสอบ'])
  const test = list.find((s: { schoolName: string }) => s.schoolName === 'โรงเรียนทดสอบ')
  expect(test.classes).toEqual([expect.objectContaining({ name: 'โรงเรียนทดสอบ ชั้น 1', grade: 1, studentCount: 3, pinSetCount: 0 })])
  expect(list[0].classes[0].studentCount).toBe(4)
})

it('CSV ไม่มีหัวคอลัมน์ที่ต้องการ apply ได้ 400 invalid_csv', async () => {
  const cookie = await loginTeacher()
  const res = await postJson('/api/teacher/roster/apply', { csv: 'a,b\n1,2', deactivateMissing: false }, { cookie })
  expect(res.status).toBe(400)
  expect((await json(res)).error.code).toBe('invalid_csv')
})

it('CSV ใหญ่เกิน 1MB ได้ 413', async () => {
  const cookie = await loginTeacher()
  const res = await postJson('/api/teacher/roster/preview', { csv: 'x'.repeat(1_100_000) }, { cookie })
  expect(res.status).toBe(413)
  expect((await json(res)).error.code).toBe('too_large')
})

it('นักเรียนเรียก API ครูได้ 401', async () => {
  const db = getDb(env)
  const { classId } = await seedClass(db)
  const { id } = await seedStudent(db, classId)
  const { token } = await createSession(db, { kind: 'student', studentId: id }, 'ua')
  expect((await getJson('/api/teacher/classes', `sid=${token}`)).status).toBe(401)
})
