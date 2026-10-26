import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { storageStats, submissions } from '../src/server/db/schema'
import { purgeOrphans, STORAGE_LIMIT_BYTES } from '../src/server/storage/service'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedAssignment, seedClass, seedStudent, studentCookie, TINY_JPEG, uploadFile } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

async function setup() {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const a = await seedStudent(db(), classId)
  const b = await seedStudent(db(), classId)
  const sa = await studentCookie(a.id)
  const sb = await studentCookie(b.id)
  const asg = await seedAssignment(classId, { title: 'ใบงาน 1' })
  const send = async (sc: string) => {
    const { key } = await json(await uploadFile('kind=submission', TINY_JPEG, 'image/jpeg', sc))
    expect((await putJson(`/api/student/assignments/${asg}/submission`, { text: 'คำตอบ', imageKeys: [key], clientRequestId: crypto.randomUUID() }, sc)).status).toBe(200)
    return key as string
  }
  const subId = async (studentId: string) => (await db().select().from(submissions).where(eq(submissions.studentId, studentId)))[0].id
  return { cookie, a, b, sa, sb, asg, send, subId }
}

it('อัปโหลดแล้วนับพื้นที่; ใกล้เต็มแล้วไม่รับอัปโหลด (507)', async () => {
  const { cookie, sa } = await setup()
  await uploadFile('kind=submission', TINY_JPEG, 'image/jpeg', sa)
  const u = await json(await getJson('/api/teacher/storage/usage', cookie))
  expect(u).toMatchObject({ bytes: TINY_JPEG.byteLength, files: 1 })
  await db().update(storageStats).set({ bytes: STORAGE_LIMIT_BYTES }).where(eq(storageStats.id, 'main'))
  const full = await uploadFile('kind=submission', TINY_JPEG, 'image/jpeg', sa)
  expect(full.status).toBe(507)
  expect((await json(full)).error.code).toBe('storage_full')
})

it('ลบรูปงานที่ตรวจแล้วของงานหนึ่ง: ไฟล์หาย คะแนน/ข้อความอยู่ งานที่ยังไม่ตรวจไม่แตะ', async () => {
  const { cookie, a, b, sa, sb, asg, send, subId } = await setup()
  const ka = await send(sa)
  const kb = await send(sb)
  const ida = await subId(a.id)
  expect((await postJson(`/api/teacher/submissions/${ida}/grade`, { score: 8, comment: 'ดี', annotatedKeys: [] }, { cookie })).status).toBe(200)

  const before = await json(await getJson('/api/teacher/storage', cookie))
  expect(before.candidates).toEqual([expect.objectContaining({ assignmentId: asg, title: 'ใบงาน 1', submissions: 1, files: 1, bytes: TINY_JPEG.byteLength })])

  const r = await json(await postJson('/api/teacher/storage/purge', { assignmentId: asg }, { cookie }))
  expect(r).toEqual({ submissions: 1, files: 1, bytes: TINY_JPEG.byteLength })
  expect(await env.BUCKET.get(ka)).toBeNull()
  expect(await env.BUCKET.get(kb)).not.toBeNull()
  const mine = await json(await getJson(`/api/student/assignments/${asg}`, sa))
  expect(mine.submission).toMatchObject({ text: 'คำตอบ', score: 8, comment: 'ดี', imageKeys: [], imagesPurged: true })
  expect((await json(await getJson(`/api/student/assignments/${asg}`, sb))).submission).toMatchObject({ imageKeys: [kb], imagesPurged: false })
  expect((await json(await getJson('/api/teacher/storage/usage', cookie))).files).toBe(1)
  expect((await json(await getJson('/api/teacher/storage', cookie))).candidates).toEqual([])
})

it('ลบรูปงานที่ตรวจก่อน N วัน', async () => {
  const { cookie, a, sa, send, subId } = await setup()
  await send(sa)
  const id = await subId(a.id)
  await postJson(`/api/teacher/submissions/${id}/grade`, { score: 5, comment: '', annotatedKeys: [] }, { cookie })
  expect((await json(await postJson('/api/teacher/storage/purge', { olderThanDays: 30 }, { cookie }))).submissions).toBe(0)
  await db().update(submissions).set({ gradedAt: Date.now() - 40 * 24 * 3600_000 }).where(eq(submissions.id, id))
  expect((await json(await postJson('/api/teacher/storage/purge', { olderThanDays: 30 }, { cookie }))).submissions).toBe(1)
})

it('ลบไฟล์ค้างที่ไม่มีงานไหนใช้ (อายุเกิน 1 วัน) และนับพื้นที่ใหม่จาก R2', async () => {
  const { cookie, sa, send } = await setup()
  const used = await send(sa)
  const { key: orphan } = await json(await uploadFile('kind=submission', TINY_JPEG, 'image/jpeg', sa))
  expect(await purgeOrphans(db(), env.BUCKET, Date.now())).toEqual({ files: 0, bytes: 0 })
  expect(await purgeOrphans(db(), env.BUCKET, Date.now() + 2 * 24 * 3600_000)).toEqual({ files: 1, bytes: TINY_JPEG.byteLength })
  expect(await env.BUCKET.get(orphan)).toBeNull()
  expect(await env.BUCKET.get(used)).not.toBeNull()
  // ไฟล์ที่ระบบไม่รู้จัก (เช่น อัปโหลดก่อนมีระบบนับ) → นับเพิ่มเมื่อซิงก์
  await env.BUCKET.put('sub/legacy/x.jpg', new Uint8Array(1234))
  const u = await json(await postJson('/api/teacher/storage/sync', {}, { cookie }))
  expect(u).toMatchObject({ files: 2, bytes: TINY_JPEG.byteLength + 1234 })
})

it('เฉพาะครูเท่านั้น', async () => {
  const { sa, asg } = await setup()
  expect((await getJson('/api/teacher/storage', sa)).status).toBe(401)
  expect((await postJson('/api/teacher/storage/purge', { assignmentId: asg }, { cookie: sa })).status).toBe(401)
  expect((await postJson('/api/teacher/storage/purge', { assignmentId: 'nope' }, { cookie: await loginTeacher() })).status).toBe(404)
})
