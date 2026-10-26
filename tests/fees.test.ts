import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { del, getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

async function setup(n = 3) {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const ss = []
  for (let i = 0; i < n; i++) ss.push(await seedStudent(db(), classId, { sortOrder: i, firstName: `คน${i}` }))
  const { ids } = await json(await postJson('/api/teacher/fee-items', { title: 'ชีทบทที่ 1', amount: 35, classIds: [classId] }, { cookie }))
  return { cookie, classId, ss, itemId: ids[0] as string }
}
const charge = (itemId: string, studentId: string, body: object, cookie: string) =>
  putJson(`/api/teacher/fee-items/${itemId}/charges/${studentId}`, { amount: 35, paid: 0, note: '', ...body }, cookie)

it('สร้างรายการ เลือกบางคน สรุปยอดค้าง', async () => {
  const { cookie, classId, ss, itemId } = await setup()
  let sheet = await json(await getJson(`/api/teacher/fee-items/${itemId}`, cookie))
  expect(sheet.item).toMatchObject({ title: 'ชีทบทที่ 1', amount: 35 })
  expect(sheet.students.map((s: { charge: unknown }) => s.charge)).toEqual([null, null, null])
  const bulk = await json(await postJson(`/api/teacher/fee-items/${itemId}/charges/bulk`, { studentIds: [ss[0].id, ss[2].id] }, { cookie }))
  expect(bulk.added).toBe(2)
  await charge(itemId, ss[2].id, { paid: 35 }, cookie)
  sheet = await json(await getJson(`/api/teacher/fee-items/${itemId}`, cookie))
  expect(sheet.students.map((s: { charge: { paid: number } | null }) => s.charge?.paid ?? null)).toEqual([0, null, 35])
  const [row] = await json(await getJson(`/api/teacher/classes/${classId}/fee-items`, cookie))
  expect(row).toMatchObject({ title: 'ชีทบทที่ 1', charged: 2, paidInFull: 1, outstanding: 35 })
})

it('เลือกทั้งห้อง 45 คน ไม่ชนข้อจำกัด D1 และไม่สร้างซ้ำ', async () => {
  const { cookie, classId, ss, itemId } = await setup(45)
  await charge(itemId, ss[0].id, { amount: 20, paid: 5 }, cookie)
  const r = await json(await postJson(`/api/teacher/fee-items/${itemId}/charges/bulk`, { studentIds: ss.map((s) => s.id) }, { cookie }))
  expect(r.added).toBe(44)
  const [row] = await json(await getJson(`/api/teacher/classes/${classId}/fee-items`, cookie))
  expect(row).toMatchObject({ charged: 45, outstanding: 15 + 44 * 35 })
})

it('จ่ายบางส่วน/ยอดเกิน/ทศนิยม และยกเลิกการเรียกเก็บ', async () => {
  const { cookie, ss, itemId } = await setup()
  expect((await charge(itemId, ss[0].id, { paid: 10.5 }, cookie)).status).toBe(200)
  expect((await charge(itemId, ss[0].id, { paid: 40 }, cookie)).status).toBe(400)
  expect((await charge(itemId, ss[0].id, { amount: 10, paid: 10.5 }, cookie)).status).toBe(400)
  expect((await charge(itemId, ss[0].id, { paid: 1.005 }, cookie)).status).toBe(400)
  expect((await del(`/api/teacher/fee-items/${itemId}/charges/${ss[0].id}`, cookie)).status).toBe(200)
  const sheet = await json(await getJson(`/api/teacher/fee-items/${itemId}`, cookie))
  expect(sheet.students[0].charge).toBeNull()
})

it('นักเรียนห้องอื่น → 404; คนที่ปิดใช้งานแต่ยังค้างจ่ายยังอยู่ในตาราง', async () => {
  const { cookie, classId, ss, itemId } = await setup()
  const other = await seedClass(db())
  const outsider = await seedStudent(db(), other.classId)
  expect((await charge(itemId, outsider.id, {}, cookie)).status).toBe(404)
  expect((await postJson(`/api/teacher/fee-items/${itemId}/charges/bulk`, { studentIds: [outsider.id] }, { cookie })).status).toBe(404)
  await charge(itemId, ss[1].id, {}, cookie)
  const { students } = await import('../src/server/db/schema')
  const { eq } = await import('drizzle-orm')
  await db().update(students).set({ active: false }).where(eq(students.id, ss[1].id))
  await seedStudent(db(), classId, { active: false })
  const sheet = await json(await getJson(`/api/teacher/fee-items/${itemId}`, cookie))
  expect(sheet.students.map((s: { id: string }) => s.id)).toEqual([ss[0].id, ss[1].id, ss[2].id])
})

it('นักเรียนเห็นเฉพาะยอดของตัวเอง', async () => {
  const { cookie, ss, itemId } = await setup()
  await charge(itemId, ss[0].id, { paid: 15, note: 'จ่ายพรุ่งนี้' }, cookie)
  const mine = await json(await getJson('/api/student/fees', await studentCookie(ss[0].id)))
  expect(mine).toEqual([{ id: itemId, title: 'ชีทบทที่ 1', amount: 35, paid: 15, outstanding: 20 }])
  expect(await json(await getJson('/api/student/fees', await studentCookie(ss[1].id)))).toEqual([])
  expect((await getJson('/api/student/fees')).status).toBe(401)
  expect((await getJson(`/api/teacher/fee-items/${itemId}`, await studentCookie(ss[0].id))).status).toBe(401)
})

it('แก้ราคาไม่กระทบยอดเดิม; ลบรายการพร้อมยอด', async () => {
  const { cookie, classId, ss, itemId } = await setup()
  await postJson(`/api/teacher/fee-items/${itemId}/charges/bulk`, { studentIds: [ss[0].id] }, { cookie })
  expect((await putJson(`/api/teacher/fee-items/${itemId}`, { title: 'ชีทบทที่ 1-2', amount: 50 }, cookie)).status).toBe(200)
  await postJson(`/api/teacher/fee-items/${itemId}/charges/bulk`, { studentIds: [ss[1].id] }, { cookie })
  const sheet = await json(await getJson(`/api/teacher/fee-items/${itemId}`, cookie))
  expect(sheet.students.slice(0, 2).map((s: { charge: { amount: number } }) => s.charge.amount)).toEqual([35, 50])
  expect((await del(`/api/teacher/fee-items/${itemId}`, cookie)).status).toBe(200)
  expect(await json(await getJson(`/api/teacher/classes/${classId}/fee-items`, cookie))).toEqual([])
  expect(await json(await getJson('/api/student/fees', await studentCookie(ss[0].id)))).toEqual([])
})
