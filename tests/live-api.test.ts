import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { liveActivities, pointEvents } from '../src/server/db/schema'
import { del, getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const exp = async (studentId: string) => (await db().select().from(pointEvents).where(eq(pointEvents.studentId, studentId))).reduce((n, p) => n + p.delta, 0)

const POLL = { kind: 'poll', prompt: 'ชอบวิชาไหน', options: ['คณิต', 'ไทย', 'อังกฤษ'] }
const QUIZ = { kind: 'quiz', prompt: '2+2', options: ['3', '4'], correct: 1, seconds: 10 }

async function setup() {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const a = await seedStudent(db(), classId, { firstName: 'มานี' })
  const b = await seedStudent(db(), classId, { firstName: 'ปิติ' })
  const { id } = await json(await postJson(`/api/teacher/classes/${classId}/live`, { title: 'คาบ 1' }, { cookie }))
  const post = (path: string, body: unknown) => postJson(`/api/teacher/live/${id}${path}`, body, { cookie })
  return { cookie, classId, a, b, id: id as string, post, sa: await studentCookie(a.id), sb: await studentCookie(b.id) }
}
const answer = (id: string, body: unknown, cookie: string) => postJson(`/api/student/live/${id}/answer`, body, { cookie })

it('สร้างไลฟ์ เพิ่ม/เรียง/ลบกิจกรรม', async () => {
  const { cookie, classId, id, post } = await setup()
  await post('/activities', POLL)
  await post('/activities', { kind: 'checkin', prompt: 'วันนี้เป็นไง' })
  let st = await json(await post('/activities', QUIZ))
  expect(st.activities.map((x: { kind: string }) => x.kind)).toEqual(['poll', 'checkin', 'quiz'])
  expect(st.session).toMatchObject({ title: 'คาบ 1', status: 'draft' })
  st = await json(await postJson(`/api/teacher/live/activities/${st.activities[2].id}/move`, { dir: -1 }, { cookie }))
  expect(st.activities.map((x: { kind: string }) => x.kind)).toEqual(['poll', 'quiz', 'checkin'])
  st = await json(await del(`/api/teacher/live/activities/${st.activities[2].id}`, cookie))
  expect(st.activities).toHaveLength(2)
  expect((await post('/activities', { ...QUIZ, correct: 5 })).status).toBe(400)
  const list = await json(await getJson(`/api/teacher/classes/${classId}/live`, cookie))
  expect(list).toEqual([expect.objectContaining({ id, title: 'คาบ 1', status: 'draft', activityCount: 2 })])
})

it('นักเรียนไม่เห็นไลฟ์ที่ยังไม่เริ่ม; เริ่มแล้วเห็นแบนเนอร์และกิจกรรมแรก', async () => {
  const { id, post, sa } = await setup()
  await post('/activities', POLL)
  expect(await json(await getJson('/api/student/live/current', sa))).toEqual({ live: null })
  expect((await getJson(`/api/student/live/${id}`, sa)).status).toBe(404)
  const st = await json(await post('/start', {}))
  expect(st.session.status).toBe('live')
  expect(st.current.activity).toMatchObject({ index: 0, kind: 'poll', accepting: true })
  expect(await json(await getJson('/api/student/live/current', sa))).toEqual({ live: { id, title: 'คาบ 1' } })
  const s = await json(await getJson(`/api/student/live/${id}`, sa))
  expect(s.current.activity.prompt).toBe('ชอบวิชาไหน')
  expect(s.mine).toBeNull()
})

it('ตอบโพล: +1 EXP, ตอบซ้ำ 409, ผลรวมบนจอครู', async () => {
  const { a, b, id, post, sa, sb } = await setup()
  await post('/activities', POLL)
  await post('/start', {})
  const [r1, r2] = await Promise.all([answer(id, { choice: 2 }, sa), answer(id, { choice: 2 }, sa)])
  expect([r1.status, r2.status].sort()).toEqual([200, 409])
  expect((await answer(id, { choice: 0 }, sb)).status).toBe(200)
  expect((await answer(id, { choice: 9 }, sb)).status).toBe(400)
  expect((await answer(id, { choice: 1 }, sb)).status).toBe(409)
  expect(await exp(a.id)).toBe(1)
  expect(await exp(b.id)).toBe(1)
  const st = await json(await getJson(`/api/teacher/live/${id}`, await loginTeacher()))
  expect(st.current).toMatchObject({ responseCount: 2, total: 2, results: { kind: 'poll', counts: [1, 0, 1] } })
  const mine = await json(await getJson(`/api/student/live/${id}`, sa))
  expect(mine.mine).toMatchObject({ answer: { choice: 2 } })
  expect(mine.current.results).toBeNull()
  await post('/show-results', { show: true })
  expect((await json(await getJson(`/api/student/live/${id}`, sa))).current.results).toEqual({ kind: 'poll', counts: [1, 0, 1] })
})

it('คำตอบผิดรูปแบบ 400; ปิดรับแล้ว 409 ไม่ได้ EXP', async () => {
  const { a, id, post, sa } = await setup()
  await post('/activities', { kind: 'wordcloud', prompt: 'นึกถึงอะไร' })
  await post('/start', {})
  expect((await answer(id, { word: 'ก'.repeat(31) }, sa)).status).toBe(400)
  expect((await answer(id, { choice: 1 }, sa)).status).toBe(400)
  await post('/accepting', { open: false })
  expect((await answer(id, { word: 'แมว' }, sa)).status).toBe(409)
  expect(await exp(a.id)).toBe(0)
})

it('ควิซ: เฉลยซ่อนจนครูเปิด, ถูก +3 รวม, หมดเวลา 409', async () => {
  const { a, b, id, post, sa, sb } = await setup()
  await post('/activities', QUIZ)
  await post('/start', {})
  let s = await json(await getJson(`/api/student/live/${id}`, sa))
  expect(s.current.activity.correct).toBeUndefined()
  expect(s.current.activity.deadline).toBeGreaterThan(Date.now())
  expect(await json(await answer(id, { choice: 1 }, sa))).toEqual({ ok: true })
  s = await json(await getJson(`/api/student/live/${id}`, sa))
  expect(s.mine).toMatchObject({ answer: { choice: 1 }, correct: null })
  expect(await exp(a.id)).toBe(3)
  // หมดเวลา: เลื่อน openedAt ย้อนไป 20 วินาที
  await db().update(liveActivities).set({ openedAt: Date.now() - 20_000 }).where(eq(liveActivities.sessionId, id))
  expect((await answer(id, { choice: 1 }, sb)).status).toBe(409)
  expect(await exp(b.id)).toBe(0)
  const st = await json(await post('/show-results', { show: true }))
  expect(st.current.activity.accepting).toBe(false)
  expect(st.current.results.ranking).toEqual([{ name: 'มานี', ms: expect.any(Number) }])
  s = await json(await getJson(`/api/student/live/${id}`, sa))
  expect(s.current.activity.correct).toBe(1)
  expect(s.mine.correct).toBe(true)
  // เปิดรับใหม่ = จับเวลาใหม่
  await post('/accepting', { open: true })
  expect((await answer(id, { choice: 0 }, sb)).status).toBe(200)
})

it('ถัดไป/ก่อนหน้า และกิจกรรมที่มีคำตอบแล้วแก้/ลบไม่ได้', async () => {
  const { cookie, id, post, sa } = await setup()
  await post('/activities', POLL)
  await post('/activities', { kind: 'checkin', prompt: 'เป็นไง' })
  await post('/start', {})
  await answer(id, { choice: 0 }, sa)
  let st = await json(await post('/goto', { index: 1 }))
  expect(st.current.activity).toMatchObject({ index: 1, kind: 'checkin' })
  expect((await post('/goto', { index: 5 })).status).toBe(404)
  await answer(id, { text: 'ง่วงนอน' }, sa)
  st = await json(await getJson(`/api/teacher/live/${id}`, cookie))
  expect(st.current.results).toEqual({ kind: 'checkin', entries: [{ name: 'มานี', text: 'ง่วงนอน' }] })
  expect(st.activities.map((x: { responseCount: number }) => x.responseCount)).toEqual([1, 1])
  expect((await putJson(`/api/teacher/live/activities/${st.activities[0].id}`, POLL, cookie)).status).toBe(409)
  expect((await del(`/api/teacher/live/activities/${st.activities[0].id}`, cookie)).status).toBe(409)
  expect((await del(`/api/teacher/live/${id}`, cookie)).status).toBe(409)
})

it('จบไลฟ์: นักเรียนตอบไม่ได้ แบนเนอร์หาย; เริ่มไลฟ์ใหม่ในห้องเดียวกันจบอันเก่า', async () => {
  const { cookie, classId, id, post, sa } = await setup()
  await post('/activities', POLL)
  await post('/start', {})
  const { id: id2 } = await json(await postJson(`/api/teacher/classes/${classId}/live`, { title: 'คาบ 2' }, { cookie }))
  await postJson(`/api/teacher/live/${id2}/start`, {}, { cookie })
  expect((await json(await getJson(`/api/teacher/live/${id}`, cookie))).session.status).toBe('ended')
  expect(await json(await getJson('/api/student/live/current', sa))).toEqual({ live: { id: id2, title: 'คาบ 2' } })
  await postJson(`/api/teacher/live/${id2}/end`, {}, { cookie })
  expect(await json(await getJson('/api/student/live/current', sa))).toEqual({ live: null })
  expect((await answer(id, { choice: 0 }, sa)).status).toBe(409)
  expect((await json(await getJson(`/api/student/live/${id}`, sa))).session.status).toBe('ended')
})

it('สิทธิ์: นักเรียนห้องอื่น 404, นักเรียนเรียก API ครู 401, ไม่ล็อกอิน 401', async () => {
  const { id, post } = await setup()
  await post('/activities', POLL)
  await post('/start', {})
  const other = await seedClass(db())
  const c = await studentCookie((await seedStudent(db(), other.classId)).id)
  expect((await getJson(`/api/student/live/${id}`, c)).status).toBe(404)
  expect((await answer(id, { choice: 0 }, c)).status).toBe(404)
  expect(await json(await getJson('/api/student/live/current', c))).toEqual({ live: null })
  expect((await getJson(`/api/teacher/live/${id}`, c)).status).toBe(401)
  expect((await getJson(`/api/student/live/${id}`)).status).toBe(401)
})
