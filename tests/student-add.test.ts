import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { getJson, json, loginTeacher, postJson, resetDb, seedClass, seedStudent } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

it('ครูเพิ่มนักเรียนรายคน ต่อท้ายรายชื่อ แล้วนักเรียนเข้าระบบตั้ง PIN ได้', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  await seedStudent(db(), classId, { zipgradeId: '500', sortOrder: 7 })
  const res = await postJson(`/api/teacher/classes/${classId}/students`, { zipgradeId: ' 0777 ', title: 'เด็กหญิง', firstName: 'ย้ายเข้า', lastName: 'กลางเทอม' }, { cookie })
  expect(res.status).toBe(200)
  const { students } = await json(await getJson(`/api/teacher/classes/${classId}/students`, cookie))
  expect(students.at(-1)).toEqual(expect.objectContaining({ zipgradeId: '777', title: 'เด็กหญิง', firstName: 'ย้ายเข้า', lastName: 'กลางเทอม', sortOrder: 8, active: true, pinSet: false }))
  const lookup = await postJson('/api/student/lookup', { zipgradeId: '777' })
  expect(lookup.status).toBe(200)
})

it('ZipGrade ID ซ้ำ (ห้องอื่น) → 409 บอกว่าเป็นของใคร · ข้อมูลไม่ครบ → 400 · ห้องไม่มี → 404 · นักเรียนเรียกไม่ได้', async () => {
  const cookie = await loginTeacher()
  const a = (await seedClass(db(), { name: 'ห้อง A' })).classId
  const b = (await seedClass(db())).classId
  await seedStudent(db(), a, { zipgradeId: '42', firstName: 'มีแล้ว', lastName: 'คนเดิม' })
  const dup = await postJson(`/api/teacher/classes/${b}/students`, { zipgradeId: '042', title: null, firstName: 'x', lastName: '' }, { cookie })
  expect(dup.status).toBe(409)
  expect((await json(dup)).error.message).toContain('มีแล้ว คนเดิม (ห้อง A)')
  expect((await postJson(`/api/teacher/classes/${b}/students`, { zipgradeId: '43', title: null, firstName: '', lastName: '' }, { cookie })).status).toBe(400)
  expect((await postJson(`/api/teacher/classes/${b}/students`, { zipgradeId: '4 3', title: null, firstName: 'ก', lastName: '' }, { cookie })).status).toBe(400)
  expect((await postJson('/api/teacher/classes/nope/students', { zipgradeId: '43', title: null, firstName: 'ก', lastName: '' }, { cookie })).status).toBe(404)
  expect((await postJson(`/api/teacher/classes/${b}/students`, { zipgradeId: '43', title: null, firstName: 'ก', lastName: '' })).status).toBe(401)
})
