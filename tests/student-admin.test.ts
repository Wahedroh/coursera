import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { hashSecret } from '../src/server/auth/crypto'
import { createSession } from '../src/server/auth/sessions'
import { getDb } from '../src/server/db/client'
import { students } from '../src/server/db/schema'
import { cookieFrom, getJson, json, loginTeacher, postJson, resetDb, seedClass, seedStudent } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

async function setup() {
  const { classId, joinCode } = await seedClass(db(), { name: 'โรงเรียนทดสอบ ชั้น 2' })
  const a = await seedStudent(db(), classId, { zipgradeId: '1', firstName: 'ก', sortOrder: 2, pinHash: await hashSecret('1111') })
  const b = await seedStudent(db(), classId, { zipgradeId: '2', firstName: 'ข', sortOrder: 1, lockedUntil: Date.now() + 600000 })
  return { classId, joinCode, a, b, cookie: await loginTeacher() }
}

it('รายชื่อห้องแสดง pinSet, locked, newDeviceSessionIds', async () => {
  const { classId, joinCode, a, cookie } = await setup()
  await createSession(db(), { kind: 'student', studentId: a.id }, 'phone-A')
  await createSession(db(), { kind: 'student', studentId: a.id }, 'phone-B')
  const res = await json(await getJson(`/api/teacher/classes/${classId}/students`, cookie))
  expect(res.class).toEqual({ id: classId, name: 'โรงเรียนทดสอบ ชั้น 2', joinCode })
  expect(res.students.map((s: { zipgradeId: string }) => s.zipgradeId)).toEqual(['2', '1'])
  const [sb, sa] = res.students
  expect(sa).toMatchObject({ pinSet: true, locked: false, activeSessions: 2 })
  expect(sa.newDeviceSessionIds).toHaveLength(1)
  expect(typeof sa.lastSeenAt).toBe('number')
  expect(sb).toMatchObject({ pinSet: false, locked: true, activeSessions: 0, newDeviceSessionIds: [], lastSeenAt: null })
})

it('ห้องไม่มีอยู่ได้ 404 class_not_found', async () => {
  const { cookie } = await setup()
  const res = await getJson('/api/teacher/classes/nope/students', cookie)
  expect(res.status).toBe(404)
  expect((await json(res)).error.code).toBe('class_not_found')
})

it('reset-pin แล้วนักเรียนตั้ง PIN ใหม่ได้ และ cookie เดิมใช้ไม่ได้', async () => {
  const { a, cookie } = await setup()
  const login = await postJson('/api/student/login', { zipgradeId: '1', pin: '1111' })
  const studentCookie = cookieFrom(login)
  expect((await postJson(`/api/teacher/students/${a.id}/reset-pin`, {}, { cookie })).status).toBe(200)
  expect((await getJson('/api/me', studentCookie)).status).toBe(401)
  expect((await json(await postJson('/api/student/lookup', { zipgradeId: '1' }))).status).toBe('needs_pin')
  expect((await postJson('/api/student/set-pin', { zipgradeId: '1', pin: '9999' })).status).toBe(200)
})

it('unlock แล้วล็อกอินได้ทันที', async () => {
  const { b, cookie } = await setup()
  await db().update(students).set({ pinHash: await hashSecret('2222') }).where(eq(students.id, b.id))
  expect((await postJson('/api/student/login', { zipgradeId: '2', pin: '2222' })).status).toBe(423)
  expect((await postJson(`/api/teacher/students/${b.id}/unlock`, {}, { cookie })).status).toBe(200)
  expect((await postJson('/api/student/login', { zipgradeId: '2', pin: '2222' })).status).toBe(200)
})

it('logout-all แล้ว session ของนักเรียนใช้ไม่ได้', async () => {
  const { a, cookie } = await setup()
  const studentCookie = cookieFrom(await postJson('/api/student/login', { zipgradeId: '1', pin: '1111' }))
  expect((await postJson(`/api/teacher/students/${a.id}/logout-all`, {}, { cookie })).status).toBe(200)
  expect((await getJson('/api/me', studentCookie)).status).toBe(401)
})

it('ack แล้ว newDeviceSessionIds ว่าง', async () => {
  const { classId, a, cookie } = await setup()
  await createSession(db(), { kind: 'student', studentId: a.id }, 'phone-A')
  await createSession(db(), { kind: 'student', studentId: a.id }, 'phone-B')
  const list = async () => (await json(await getJson(`/api/teacher/classes/${classId}/students`, cookie))).students[1]
  const [sid] = (await list()).newDeviceSessionIds
  expect((await postJson(`/api/teacher/sessions/${sid}/ack`, {}, { cookie })).status).toBe(200)
  expect((await list()).newDeviceSessionIds).toEqual([])
})

it('นักเรียนไม่มีอยู่ได้ 404 student_not_found', async () => {
  const { cookie } = await setup()
  const res = await postJson('/api/teacher/students/nope/reset-pin', {}, { cookie })
  expect(res.status).toBe(404)
  expect((await json(res)).error.code).toBe('student_not_found')
})

it('นักเรียนเรียก reset-pin ได้ 401', async () => {
  const { a } = await setup()
  const studentCookie = cookieFrom(await postJson('/api/student/login', { zipgradeId: '1', pin: '1111' }))
  expect((await postJson(`/api/teacher/students/${a.id}/reset-pin`, {}, { cookie: studentCookie })).status).toBe(401)
})
