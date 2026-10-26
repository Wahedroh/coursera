import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { pointEvents } from '../src/server/db/schema'
import { del, getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const ITEM = { title: 'สอบย่อย บทที่ 3', category: 'quiz', maxScore: 20, takenOn: '2026-10-20' }

async function setup(n = 3) {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const ss = []
  for (let i = 0; i < n; i++) ss.push(await seedStudent(db(), classId, { sortOrder: n - i, firstName: `คน${i}` }))
  const { ids } = await json(await postJson('/api/teacher/score-items', { ...ITEM, classIds: [classId] }, { cookie }))
  return { cookie, classId, ss, itemId: ids[0] as string }
}
const put = (itemId: string, studentId: string, body: object, cookie: string) =>
  putJson(`/api/teacher/score-items/${itemId}/scores/${studentId}`, { score: null, absent: false, note: '', ...body }, cookie)

it('สร้างให้หลายห้องพร้อมกัน 1 รายการต่อห้อง ค่าเริ่มต้นยังไม่เผยแพร่', async () => {
  const cookie = await loginTeacher()
  const a = await seedClass(db())
  const b = await seedClass(db())
  const res = await postJson('/api/teacher/score-items', { ...ITEM, classIds: [a.classId, b.classId, a.classId] }, { cookie })
  expect(res.status).toBe(200)
  expect((await json(res)).ids).toHaveLength(2)
  const list = await json(await getJson(`/api/teacher/classes/${b.classId}/score-items`, cookie))
  expect(list).toEqual([expect.objectContaining({ title: ITEM.title, published: false, filled: 0, total: 0 })])
  expect((await postJson('/api/teacher/score-items', { ...ITEM, classIds: ['nope'] }, { cookie })).status).toBe(404)
  expect((await postJson('/api/teacher/score-items', { ...ITEM, maxScore: -1, classIds: [a.classId] }, { cookie })).status).toBe(400)
})

it('ตารางกรอกเรียงตามลำดับในห้อง ไม่รวมคนปิดใช้งาน', async () => {
  const { cookie, classId, ss, itemId } = await setup()
  await seedStudent(db(), classId, { active: false })
  const sheet = await json(await getJson(`/api/teacher/score-items/${itemId}`, cookie))
  expect(sheet.item).toMatchObject({ ...ITEM, published: false })
  expect(sheet.students.map((s: { id: string }) => s.id)).toEqual([ss[2].id, ss[1].id, ss[0].id])
  expect(sheet.students[0]).toMatchObject({ score: null, absent: false, note: '', zipgradeId: ss[2].zipgradeId })
})

it('บันทึก/แก้คะแนน และนับในรายการ ไม่ให้ EXP', async () => {
  const { cookie, classId, ss, itemId } = await setup()
  expect((await put(itemId, ss[0].id, { score: 15.5 }, cookie)).status).toBe(200)
  expect((await put(itemId, ss[0].id, { score: 18, note: 'สอบซ่อม' }, cookie)).status).toBe(200)
  await put(itemId, ss[1].id, { score: 0 }, cookie)
  const sheet = await json(await getJson(`/api/teacher/score-items/${itemId}`, cookie))
  expect(sheet.students.find((s: { id: string }) => s.id === ss[0].id)).toMatchObject({ score: 18, note: 'สอบซ่อม' })
  const [row] = await json(await getJson(`/api/teacher/classes/${classId}/score-items`, cookie))
  expect(row).toMatchObject({ filled: 2, total: 3 })
  expect(await db().select().from(pointEvents)).toEqual([])
})

it('คะแนนผิดช่วงหรือทศนิยมเกิน 2 ตำแหน่ง → 400', async () => {
  const { cookie, ss, itemId } = await setup()
  for (const score of [-1, 20.5 + 0.001, 21]) expect((await put(itemId, ss[0].id, { score }, cookie)).status).toBe(400)
  expect((await put(itemId, ss[0].id, { score: 20 }, cookie)).status).toBe(200)
})

it('ขาดสอบล้างคะแนน', async () => {
  const { cookie, ss, itemId } = await setup()
  await put(itemId, ss[0].id, { score: 10 }, cookie)
  await put(itemId, ss[0].id, { score: 10, absent: true }, cookie)
  const sheet = await json(await getJson(`/api/teacher/score-items/${itemId}`, cookie))
  expect(sheet.students.find((s: { id: string }) => s.id === ss[0].id)).toMatchObject({ score: null, absent: true })
})

it('นักเรียนห้องอื่น/ปิดใช้งาน → 404, รายการไม่มี → 404', async () => {
  const { cookie, classId, itemId } = await setup()
  const other = await seedClass(db())
  const outsider = await seedStudent(db(), other.classId)
  const inactive = await seedStudent(db(), classId, { active: false })
  expect((await put(itemId, outsider.id, { score: 1 }, cookie)).status).toBe(404)
  expect((await put(itemId, inactive.id, { score: 1 }, cookie)).status).toBe(404)
  expect((await put('nope', outsider.id, { score: 1 }, cookie)).status).toBe(404)
  expect((await getJson('/api/teacher/score-items/nope', cookie)).status).toBe(404)
})

it('แก้รายการ: ลดคะแนนเต็มต่ำกว่าคะแนนที่กรอกแล้ว → 409', async () => {
  const { cookie, ss, itemId } = await setup()
  await put(itemId, ss[0].id, { score: 15 }, cookie)
  expect((await putJson(`/api/teacher/score-items/${itemId}`, { ...ITEM, maxScore: 10 }, cookie)).status).toBe(409)
  expect((await putJson(`/api/teacher/score-items/${itemId}`, { ...ITEM, title: 'สอบย่อย 3 (แก้)', maxScore: 15 }, cookie)).status).toBe(200)
  const sheet = await json(await getJson(`/api/teacher/score-items/${itemId}`, cookie))
  expect(sheet.item).toMatchObject({ title: 'สอบย่อย 3 (แก้)', maxScore: 15 })
})

it('เผยแพร่/ยกเลิก และลบรายการพร้อมคะแนน', async () => {
  const { cookie, classId, ss, itemId } = await setup()
  await put(itemId, ss[0].id, { score: 5 }, cookie)
  expect((await putJson(`/api/teacher/score-items/${itemId}/published`, { published: true }, cookie)).status).toBe(200)
  expect((await json(await getJson(`/api/teacher/score-items/${itemId}`, cookie))).item.published).toBe(true)
  expect((await del(`/api/teacher/score-items/${itemId}`, cookie)).status).toBe(200)
  expect(await json(await getJson(`/api/teacher/classes/${classId}/score-items`, cookie))).toEqual([])
  expect((await del(`/api/teacher/score-items/${itemId}`, cookie)).status).toBe(404)
})

it('นักเรียนเรียก API ครู → 401', async () => {
  const { ss, itemId } = await setup()
  const c = await studentCookie(ss[0].id)
  expect((await getJson(`/api/teacher/score-items/${itemId}`, c)).status).toBe(401)
  expect((await put(itemId, ss[0].id, { score: 20 }, c)).status).toBe(401)
})
