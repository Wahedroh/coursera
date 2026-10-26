import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const ITEM = { title: 'กลางภาค', category: 'midterm', maxScore: 30, takenOn: '2026-10-15' }

async function setup() {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const a = await seedStudent(db(), classId)
  const b = await seedStudent(db(), classId)
  const { ids } = await json(await postJson('/api/teacher/score-items', { ...ITEM, classIds: [classId] }, { cookie }))
  const itemId = ids[0] as string
  for (const [s, score] of [[a, 25], [b, 12]] as const)
    await putJson(`/api/teacher/score-items/${itemId}/scores/${s.id}`, { score, absent: false, note: s === a ? 'ดีมาก' : '' }, cookie)
  return { cookie, classId, a, b, itemId }
}
const publish = (itemId: string, published: boolean, cookie: string) => putJson(`/api/teacher/score-items/${itemId}/published`, { published }, cookie)

it('ยังไม่เผยแพร่ นักเรียนไม่เห็น', async () => {
  const { a } = await setup()
  expect(await json(await getJson('/api/student/scores', await studentCookie(a.id)))).toEqual([])
})

it('เผยแพร่แล้วเห็นเฉพาะคะแนนของตัวเอง; ยกเลิกแล้วหาย', async () => {
  const { cookie, a, b, itemId } = await setup()
  await publish(itemId, true, cookie)
  const mine = await json(await getJson('/api/student/scores', await studentCookie(a.id)))
  expect(mine).toEqual([{ id: itemId, title: 'กลางภาค', category: 'midterm', maxScore: 30, takenOn: '2026-10-15', score: 25, absent: false }])
  expect(JSON.stringify(mine)).not.toContain('ดีมาก')
  const theirs = await json(await getJson('/api/student/scores', await studentCookie(b.id)))
  expect(theirs[0]).toMatchObject({ score: 12 })
  expect(JSON.stringify(theirs)).not.toContain('25')
  await publish(itemId, false, cookie)
  expect(await json(await getJson('/api/student/scores', await studentCookie(a.id)))).toEqual([])
})

it('นักเรียนห้องอื่นไม่เห็นรายการของห้องนี้; ยังไม่กรอก = null', async () => {
  const { cookie, itemId } = await setup()
  await publish(itemId, true, cookie)
  const other = await seedClass(db())
  const c = await seedStudent(db(), other.classId)
  expect(await json(await getJson('/api/student/scores', await studentCookie(c.id)))).toEqual([])
  const { classId } = await setup()
  const late = await seedStudent(db(), classId)
  const [item] = await json(await getJson(`/api/teacher/classes/${classId}/score-items`, cookie))
  await publish(item.id, true, cookie)
  expect((await json(await getJson('/api/student/scores', await studentCookie(late.id))))[0]).toMatchObject({ score: null, absent: false })
})

it('ไม่ล็อกอิน → 401', async () => {
  expect((await getJson('/api/student/scores')).status).toBe(401)
})

it('score-book รวมทุกรายการของห้องสำหรับ Excel', async () => {
  const { cookie, classId, a, b, itemId } = await setup()
  await putJson(`/api/teacher/score-items/${itemId}/scores/${b.id}`, { score: null, absent: true, note: '' }, cookie)
  const book = await json(await getJson(`/api/teacher/classes/${classId}/score-book`, cookie))
  expect(book.items).toEqual([{ id: itemId, title: 'กลางภาค', maxScore: 30, takenOn: '2026-10-15' }])
  expect(book.cells[a.id][itemId]).toEqual({ score: 25, absent: false })
  expect(book.cells[b.id][itemId]).toEqual({ score: null, absent: true })
})
