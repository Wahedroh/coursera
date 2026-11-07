import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { hashSecret, PIN_ITERATIONS } from '../src/server/auth/crypto'
import { getDb } from '../src/server/db/client'
import { todayBangkok } from '../src/shared/attendance'
import { cookieFrom, getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const ASG = { instructions: '', attachmentKeys: [], maxScore: 10, submitMode: 'text' }

it('สถิติของฉัน: มาเรียน · ส่งงานตรงเวลา/สาย/ค้าง/ยังไม่ถึงกำหนด · คะแนนสอบที่เผยแพร่ (%) · EXP', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const a = await seedStudent(db(), classId)
  const ca = await studentCookie(a.id)
  const mk = async (title: string, dueAt: number | null) => (await json(await postJson('/api/teacher/assignments', { ...ASG, title, dueAt, classIds: [classId] }, { cookie }))).ids[0]
  const future = await mk('ยังไม่ถึง', Date.now() + 86400_000)
  const past = await mk('เลยแล้ว', Date.now() - 1000)
  await mk('ค้าง', Date.now() - 1000)
  await mk('ไม่มีกำหนด', null)
  await putJson(`/api/student/assignments/${future}/submission`, { text: 'ส่ง', imageKeys: [], clientRequestId: 'a' }, ca)
  await putJson(`/api/student/assignments/${past}/submission`, { text: 'ส่ง', imageKeys: [], clientRequestId: 'b' }, ca)
  const day = await json(await postJson(`/api/teacher/classes/${classId}/attendance`, { date: todayBangkok() }, { cookie }))
  await putJson(`/api/teacher/attendance/${day.day.id}/records/${a.id}`, { status: 'late' }, cookie)
  const [i1] = (await json(await postJson('/api/teacher/score-items', { title: 'บท 1', category: 'quiz', maxScore: 20, takenOn: '2026-10-01', classIds: [classId] }, { cookie }))).ids
  const hidden = (await json(await postJson('/api/teacher/score-items', { title: 'ยังไม่เผยแพร่', category: 'quiz', maxScore: 10, takenOn: '2026-10-02', classIds: [classId] }, { cookie }))).ids[0]
  await putJson(`/api/teacher/score-items/${i1}/scores/${a.id}`, { score: 15, absent: false, note: 'ห้ามเห็น' }, cookie)
  await putJson(`/api/teacher/score-items/${hidden}/scores/${a.id}`, { score: 3, absent: false, note: '' }, cookie)
  await putJson(`/api/teacher/score-items/${i1}/published`, { published: true }, cookie)

  const s = await json(await getJson('/api/student/stats', ca))
  expect(s.attendance).toEqual({ present: 0, late: 1, sick: 0, leave: 0, absent: 0 })
  expect(s.assignments).toEqual({ total: 4, onTime: 1, late: 1, missing: 1, notDue: 1 })
  expect(s.exams).toEqual([{ title: 'บท 1', takenOn: '2026-10-01', pct: 75, absent: false }])
  expect(JSON.stringify(s)).not.toContain('ห้ามเห็น')
  expect(s).toEqual(expect.objectContaining({ exp: 2, level: 0, nextLevelAt: 100 }))
  expect(await json(await getJson('/api/student/exp', ca))).toEqual({ exp: 2, level: 0, nextLevelAt: 100 })
  expect((await getJson('/api/student/stats')).status).toBe(401)
})

it('เปลี่ยน PIN เอง: ต้องใส่ PIN เดิมถูก · เครื่องอื่นออกจากระบบ · PIN ใหม่ใช้เข้าได้ · ผิด 5 ครั้งล็อก', async () => {
  const { classId } = await seedClass(db())
  await seedStudent(db(), classId, { zipgradeId: '555', pinHash: await hashSecret('1357', PIN_ITERATIONS) })
  const login = async (pin: string) => postJson('/api/student/login', { zipgradeId: '555', pin })
  const other = cookieFrom(await login('1357'))
  const mine = cookieFrom(await login('1357'))
  expect((await postJson('/api/student/change-pin', { currentPin: '0000', newPin: '2468' }, { cookie: mine })).status).toBe(401)
  expect((await postJson('/api/student/change-pin', { currentPin: '1357', newPin: '1357' }, { cookie: mine })).status).toBe(400)
  expect((await postJson('/api/student/change-pin', { currentPin: '1357', newPin: '12a4' }, { cookie: mine })).status).toBe(400)
  const ok = await postJson('/api/student/change-pin', { currentPin: '1357', newPin: '2468' }, { cookie: mine })
  expect(ok.status).toBe(200)
  const fresh = cookieFrom(ok)
  expect((await getJson('/api/student/exp', fresh)).status).toBe(200)
  expect((await getJson('/api/student/exp', other)).status).toBe(401)
  expect((await login('1357')).status).toBe(401)
  expect((await login('2468')).status).toBe(200)
  for (let i = 0; i < 4; i++) expect((await postJson('/api/student/change-pin', { currentPin: '9999', newPin: '1111' }, { cookie: fresh })).status).toBe(401)
  expect((await postJson('/api/student/change-pin', { currentPin: '9999', newPin: '1111' }, { cookie: fresh })).status).toBe(423)
})
