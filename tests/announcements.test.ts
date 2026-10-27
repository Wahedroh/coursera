import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { todayBangkok } from '../src/shared/attendance'
import { del, getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const A = { title: 'พรุ่งนี้สอบบทที่ 2', body: 'เตรียมเครื่องคิดเลข', pinned: false, expiresOn: null }

async function setup() {
  const cookie = await loginTeacher()
  const a = (await seedClass(db())).classId
  const b = (await seedClass(db())).classId
  const s1 = await seedStudent(db(), a, { firstName: 'มานี', lastName: 'มีนา' })
  const s2 = await seedStudent(db(), a, { firstName: 'ปิติ', lastName: 'ใจดี' })
  const sb = await seedStudent(db(), b)
  return { cookie, a, b, c1: await studentCookie(s1.id), c2: await studentCookie(s2.id), cb: await studentCookie(sb.id) }
}

it('ประกาศหลายห้อง นักเรียนเห็นเฉพาะห้องตัวเอง กดรับทราบแล้วครูเห็นจำนวนคนอ่านและรายชื่อคนยังไม่อ่าน', async () => {
  const { cookie, a, c1, cb } = await setup()
  const { ids } = await json(await postJson('/api/teacher/announcements', { ...A, classIds: [a] }, { cookie }))
  const [mine] = await json(await getJson('/api/student/announcements', c1))
  expect(mine).toEqual(expect.objectContaining({ id: ids[0], title: A.title, read: false }))
  expect(await json(await getJson('/api/student/announcements', cb))).toEqual([])
  expect((await postJson(`/api/student/announcements/${ids[0]}/read`, {}, { cookie: cb })).status).toBe(404)
  expect((await postJson(`/api/student/announcements/${ids[0]}/read`, {}, { cookie: c1 })).status).toBe(200)
  expect((await postJson(`/api/student/announcements/${ids[0]}/read`, {}, { cookie: c1 })).status).toBe(200)
  expect((await json(await getJson('/api/student/announcements', c1)))[0].read).toBe(true)
  const [t] = await json(await getJson(`/api/teacher/classes/${a}/announcements`, cookie))
  expect(t).toEqual(expect.objectContaining({ readCount: 1, total: 2, unread: ['ปิติ ใจดี'], expired: false }))
})

it('ปักหมุดขึ้นบนสุด · หมดอายุแล้วนักเรียนไม่เห็นแต่ครูยังเห็น · แก้และลบได้', async () => {
  const { cookie, a, c1 } = await setup()
  const old = (await json(await postJson('/api/teacher/announcements', { ...A, title: 'เก่า', expiresOn: '2020-01-01', classIds: [a] }, { cookie }))).ids[0]
  const first = (await json(await postJson('/api/teacher/announcements', { ...A, title: 'ปักหมุด', pinned: true, expiresOn: todayBangkok(), classIds: [a] }, { cookie }))).ids[0]
  await postJson('/api/teacher/announcements', { ...A, title: 'ใหม่สุด', classIds: [a] }, { cookie })
  expect((await json(await getJson('/api/student/announcements', c1))).map((x: { title: string }) => x.title)).toEqual(['ปักหมุด', 'ใหม่สุด'])
  const list = await json(await getJson(`/api/teacher/classes/${a}/announcements`, cookie))
  expect(list.find((x: { id: string }) => x.id === old).expired).toBe(true)
  expect((await postJson(`/api/student/announcements/${old}/read`, {}, { cookie: c1 })).status).toBe(404)
  expect((await putJson(`/api/teacher/announcements/${first}`, { ...A, title: 'แก้แล้ว', pinned: false }, cookie)).status).toBe(200)
  await postJson(`/api/student/announcements/${first}/read`, {}, { cookie: c1 })
  expect((await del(`/api/teacher/announcements/${first}`, cookie)).status).toBe(200)
  expect((await json(await getJson('/api/student/announcements', c1))).map((x: { title: string }) => x.title)).toEqual(['ใหม่สุด'])
  expect((await postJson('/api/teacher/announcements', { ...A, title: '', classIds: [a] }, { cookie })).status).toBe(400)
  expect((await getJson(`/api/teacher/classes/${a}/announcements`, c1)).status).toBe(401)
})
