import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { getDayByDate, openDay } from '../src/server/attendance/service'
import { todayBangkok } from '../src/shared/attendance'
import { addDays } from '../src/shared/leave'
import { del, getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie, TINY_JPEG, uploadFile } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

async function setup() {
  const teacher = await loginTeacher()
  const { classId } = await seedClass(db(), { name: 'ห้องลา ชั้น 2' })
  const a = await seedStudent(db(), classId, { firstName: 'มานี', lastName: 'มีนา' })
  const b = await seedStudent(db(), classId, { firstName: 'ปิติ', lastName: 'ใจดี' })
  return { teacher, classId, a, b, sa: await studentCookie(a.id), sb: await studentCookie(b.id) }
}

it('นักเรียนส่งใบลา (แนบรูป) → ครูเห็นในรายการรอ + แจ้งเตือน → อนุมัติ → วันที่เช็กแล้วเป็น "ป่วย" · วันที่ยังไม่เช็กใส่ให้ตอนเปิดเช็กชื่อ', async () => {
  const { teacher, classId, a, b, sa } = await setup()
  const today = todayBangkok()
  const tomorrow = addDays(today, 1)
  await openDay(db(), classId, today)

  const { key } = await json(await uploadFile('kind=submission', TINY_JPEG, 'image/jpeg', sa))
  const res = await postJson('/api/student/leaves', { kind: 'sick', from: today, to: tomorrow, reason: 'ไข้ขึ้น หมอให้พัก', imageKey: key }, { cookie: sa })
  expect(res.status).toBe(201)
  const leave = await json(res)
  expect(leave).toMatchObject({ status: 'pending', kind: 'sick' })

  const list = await json(await getJson('/api/teacher/leaves', teacher))
  expect(list.pending).toHaveLength(1)
  expect(list.pending[0]).toMatchObject({ studentName: 'มานี มีนา', className: 'ห้องลา ชั้น 2', reason: 'ไข้ขึ้น หมอให้พัก', imageKey: key })
  const inbox = await json(await getJson('/api/teacher/notifications', teacher))
  expect(inbox.items[0]).toMatchObject({ title: expect.stringMatching(/^📝 ใบลาป่วย: มานี มีนา/), url: '/teacher/leaves' })

  // ครูเปิดรูปใบรับรองได้
  const { SELF } = await import('cloudflare:test')
  expect((await SELF.fetch(`http://x/api/files/${key}`, { headers: { cookie: teacher } })).status).toBe(200)

  const ok = await json(await putJson(`/api/teacher/leaves/${leave.id}`, { approve: true, note: 'หายไว ๆ' }, teacher))
  expect(ok.applied).toBe(1)
  const d1 = await getDayByDate(db(), classId, today)
  expect(d1.records.find((r) => r.studentId === a.id)?.status).toBe('sick')
  expect(d1.records.find((r) => r.studentId === b.id)?.status).toBe('present')

  // พรุ่งนี้ครูเปิดเช็กชื่อ → ระบบใส่ "ป่วย" ให้เอง
  const d2 = await openDay(db(), classId, tomorrow)
  expect(d2.records.find((r) => r.studentId === a.id)?.status).toBe('sick')
  expect(d2.records.find((r) => r.studentId === b.id)?.status).toBe('present')

  // นักเรียนเห็นผล + แจ้งเตือน · ยกเลิกใบที่อนุมัติแล้วไม่ได้
  const mine = await json(await getJson('/api/student/leaves', sa))
  expect(mine[0]).toMatchObject({ status: 'approved', teacherNote: 'หายไว ๆ' })
  const box = await json(await getJson('/api/student/push/notifications', sa))
  expect(box.items[0].title).toMatch(/^✅ ครูอนุมัติใบลาป่วย/)
  expect((await del(`/api/student/leaves/${leave.id}`, sa)).status).toBe(409)
  expect((await json(await getJson('/api/teacher/leaves', teacher))).recent).toHaveLength(1)
})

it('ไม่อนุมัติ → ไม่เปลี่ยนเช็กชื่อ · ยกเลิกใบที่รอได้ · ตรวจช่วงวัน/รูปของคนอื่น', async () => {
  const { teacher, classId, a, sa, sb } = await setup()
  const today = todayBangkok()
  await openDay(db(), classId, today)
  const l = await json(await postJson('/api/student/leaves', { kind: 'leave', from: today, to: today, reason: 'ไปงานบวช' }, { cookie: sa }))
  await putJson(`/api/teacher/leaves/${l.id}`, { approve: false, note: 'ไม่มีหลักฐาน' }, teacher)
  expect((await getDayByDate(db(), classId, today)).records.find((r) => r.studentId === a.id)?.status).toBe('present')
  expect((await json(await getJson('/api/student/leaves', sa)))[0].status).toBe('rejected')

  const l2 = await json(await postJson('/api/student/leaves', { kind: 'leave', from: today, to: today, reason: 'ธุระ' }, { cookie: sa }))
  expect((await del(`/api/student/leaves/${l2.id}`, sb)).status).toBe(404)
  expect((await del(`/api/student/leaves/${l2.id}`, sa)).status).toBe(200)

  const bad = (body: Record<string, unknown>) => postJson('/api/student/leaves', { kind: 'sick', from: today, to: today, reason: 'x', ...body }, { cookie: sa })
  expect((await bad({ from: addDays(today, -20), to: addDays(today, -20) })).status).toBe(400)
  expect((await bad({ from: addDays(today, 61), to: addDays(today, 61) })).status).toBe(400)
  expect((await bad({ to: addDays(today, 20) })).status).toBe(400)
  expect((await bad({ reason: '' })).status).toBe(400)
  const { key } = await json(await uploadFile('kind=submission', TINY_JPEG, 'image/jpeg', sb))
  expect((await bad({ imageKey: key })).status).toBe(400)
  expect((await getJson('/api/teacher/leaves', sa)).status).toBe(401)
})
