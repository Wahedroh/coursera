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
  expect(pts).toEqual(expect.arrayContaining([expect.objectContaining({ studentId: a.id, exp: 109, level: 2 }), expect.objectContaining({ studentId: b.id, exp: -1, level: 0 })]))
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

it('แต้มรายห้องมีชื่อเล่นที่นักเรียนตั้ง (ไว้โชว์ตอนสุ่มชื่อ) · ยังไม่ตั้ง = ว่าง', async () => {
  const { cookie, classId, a, b } = await setup()
  const { DEFAULT_AVATAR } = await import('../src/shared/avatar')
  expect((await putJson('/api/student/avatar', { nickname: '  นักบินน้อย ', config: DEFAULT_AVATAR }, await studentCookie(a.id))).status).toBe(200)
  const rows = await json(await getJson(`/api/teacher/classes/${classId}/points`, cookie))
  expect(rows.find((r: { studentId: string }) => r.studentId === a.id).nickname).toBe('นักบินน้อย')
  expect(rows.find((r: { studentId: string }) => r.studentId === b.id).nickname).toBe('')
})

it('ที่มา EXP รายคน: รวมตามประเภท (มากไปน้อย) + รายการทั้งหมด ใหม่ก่อน', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(getDb(env))
  const s = await seedStudent(getDb(env), classId)
  const ins = (id: string, delta: number, reason: string, source: string, at: number) =>
    env.DB.prepare('INSERT INTO point_events (id, student_id, delta, reason, source, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, s.id, delta, reason, source, id, at).run()
  const t = Date.now()
  await ins('a1', 25, 'ส่งงาน: ใบงาน 1', 'assignment', t - 5000)
  await ins('a2', 13, 'ส่งงาน: ใบงาน 2 (ส่งช้า)', 'assignment', t - 4000)
  await ins('v1', 5, 'ทบทวนคลิป: บทที่ 1', 'video', t - 3000)
  await ins('m1', -1, 'คุยในห้อง', 'manual', t - 2000)
  await ins('m2', 2, 'ตอบคำถาม', 'manual', t - 1000)
  const r = await json(await getJson(`/api/teacher/students/${s.id}/exp`, cookie))
  expect(r.exp).toBe(44)
  expect(r.bySource).toEqual([
    { source: 'assignment', exp: 38, count: 2 },
    { source: 'video', exp: 5, count: 1 },
    { source: 'manual', exp: 1, count: 2 },
  ])
  expect(r.events.map((e: { reason: string }) => e.reason)).toEqual(['ตอบคำถาม', 'คุยในห้อง', 'ทบทวนคลิป: บทที่ 1', 'ส่งงาน: ใบงาน 2 (ส่งช้า)', 'ส่งงาน: ใบงาน 1'])
  expect((await getJson('/api/teacher/students/nope/exp', cookie)).status).toBe(404)
  expect((await getJson(`/api/teacher/students/${s.id}/exp`, await studentCookie(s.id))).status).toBe(401)
})
