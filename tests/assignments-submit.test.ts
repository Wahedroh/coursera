import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { submissions } from '../src/server/db/schema'
import { json, putJson, resetDb, seedAssignment, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
let n = 0
const body = (over: Record<string, unknown> = {}) => ({ text: 'คำตอบ', imageKeys: [], clientRequestId: `r${++n}`, ...over })

async function setup(over: Record<string, unknown> = {}) {
  const { classId } = await seedClass(db())
  const s = await seedStudent(db(), classId)
  const a = await seedAssignment(classId, over)
  const submit = (b: unknown) => putJson(`/api/student/assignments/${a}/submission`, b, cookie)
  const cookie = await studentCookie(s.id)
  return { s, a, submit, row: async () => (await db().select().from(submissions).where(eq(submissions.assignmentId, a)))[0] }
}

it('ส่งก่อนกำหนดได้ submitted', async () => {
  const { submit } = await setup({ dueAt: Date.now() + 3600_000 })
  const res = await submit(body())
  expect(res.status).toBe(200)
  expect(await json(res)).toMatchObject({ status: 'submitted', submission: { text: 'คำตอบ' } })
})

it('ส่งหลังกำหนดได้ late', async () => {
  const { submit } = await setup({ dueAt: Date.now() - 1000 })
  expect((await json(await submit(body()))).status).toBe('late')
})

it('แก้ได้ก่อนตรวจ แต่ตรวจแล้วแก้ได้ 409', async () => {
  const { submit, row } = await setup()
  await submit(body())
  expect((await json(await submit(body({ text: 'แก้แล้ว' })))).submission.text).toBe('แก้แล้ว')
  await db().update(submissions).set({ status: 'graded' }).where(eq(submissions.id, (await row()).id))
  const res = await submit(body({ text: 'อีกรอบ' }))
  expect(res.status).toBe(409)
  expect((await json(res)).error.code).toBe('already_graded')
})

it('ส่งกลับแก้แล้วส่งใหม่ได้', async () => {
  const { submit, row } = await setup()
  await submit(body())
  await db().update(submissions).set({ status: 'returned' }).where(eq(submissions.id, (await row()).id))
  expect((await json(await submit(body({ text: 'แก้ตามครู' })))).status).toBe('submitted')
})

it('clientRequestId ซ้ำไม่เปลี่ยน submittedAt', async () => {
  const { submit, row } = await setup()
  const b = body()
  await submit(b)
  const first = await row()
  await new Promise((r) => setTimeout(r, 5))
  expect((await submit({ ...b, text: 'ส่งซ้ำ' })).status).toBe(200)
  const again = await row()
  expect(again.submittedAt).toBe(first.submittedAt)
  expect(again.text).toBe('คำตอบ')
})

it('submitMode image แต่ไม่มีรูป 400 empty_submission', async () => {
  const { submit } = await setup({ submitMode: 'image' })
  const res = await submit(body())
  expect(res.status).toBe(400)
  expect((await json(res)).error.code).toBe('empty_submission')
})

it('แนบ key ของคนอื่น 400 invalid_image และของตัวเองผ่าน', async () => {
  const { s, submit } = await setup({ submitMode: 'image' })
  const bad = await submit(body({ imageKeys: ['sub/OTHER/x.jpg'] }))
  expect(bad.status).toBe(400)
  expect((await json(bad)).error.code).toBe('invalid_image')
  expect((await submit(body({ imageKeys: [`sub/${s.id}/a.jpg`] }))).status).toBe(200)
})
