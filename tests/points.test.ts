import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

async function setup() {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const a = await seedStudent(db(), classId, { sortOrder: 1 })
  const b = await seedStudent(db(), classId, { sortOrder: 0 })
  return { cookie, classId, a, b }
}

it('แจกแต้มหลายคน แล้ว exp/level รวมถูก', async () => {
  const { cookie, classId, a, b } = await setup()
  for (let i = 0; i < 11; i++) expect((await postJson('/api/teacher/points', { studentIds: [a.id], delta: 10, reason: 'ตอบคำถาม' }, { cookie })).status).toBe(200)
  await postJson('/api/teacher/points', { studentIds: [a.id, b.id], delta: -1, reason: 'คุยในห้อง' }, { cookie })
  const pts = await json(await getJson(`/api/teacher/classes/${classId}/points`, cookie))
  expect(pts).toEqual(expect.arrayContaining([expect.objectContaining({ studentId: a.id, exp: 109, level: 1 }), expect.objectContaining({ studentId: b.id, exp: -1, level: 0 })]))
  expect(pts[0].avatar).toEqual(expect.objectContaining({ job: 'student' }))
})

it('delta 0 / เกินช่วง / ไม่มีนักเรียน → 400', async () => {
  const { cookie, a } = await setup()
  for (const delta of [0, 11, -6]) expect((await postJson('/api/teacher/points', { studentIds: [a.id], delta, reason: 'x' }, { cookie })).status).toBe(400)
  expect((await postJson('/api/teacher/points', { studentIds: ['nope'], delta: 1, reason: 'x' }, { cookie })).status).toBe(404)
})

it('ผังเริ่มต้นเรียงตามลำดับ 6 คอลัมน์ และบันทึกผังได้', async () => {
  const { cookie, classId, a, b } = await setup()
  const layout = await json(await getJson(`/api/teacher/classes/${classId}/seating`, cookie))
  expect(layout).toEqual({ cols: 6, seats: [b.id, a.id] })
  expect((await putJson(`/api/teacher/classes/${classId}/seating`, { cols: 4, seats: [null, a.id, b.id] }, cookie)).status).toBe(200)
  expect(await json(await getJson(`/api/teacher/classes/${classId}/seating`, cookie))).toEqual({ cols: 4, seats: [null, a.id, b.id] })
})

it('บันทึกผังที่มีคนห้องอื่นหรือคนซ้ำ 400', async () => {
  const { cookie, classId, a } = await setup()
  const { classId: other } = await seedClass(db())
  const x = await seedStudent(db(), other)
  expect((await putJson(`/api/teacher/classes/${classId}/seating`, { cols: 6, seats: [x.id] }, cookie)).status).toBe(400)
  expect((await putJson(`/api/teacher/classes/${classId}/seating`, { cols: 6, seats: [a.id, a.id] }, cookie)).status).toBe(400)
})

it('นักเรียนแจกแต้มไม่ได้', async () => {
  const { a } = await setup()
  expect((await postJson('/api/teacher/points', { studentIds: [a.id], delta: 5, reason: 'x' }, { cookie: await studentCookie(a.id) })).status).toBe(401)
})
