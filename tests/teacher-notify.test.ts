import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { openDay } from '../src/server/attendance/service'
import { drainTeacher, generateTeacherNotifications, notifyResubmitted } from '../src/server/teacherNotify/service'
import { inQuietHours, DEFAULT_TEACHER_NOTIFY } from '../src/shared/teacherNotify'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedAssignment, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const at = (hhmm: string) => Date.parse(`2026-11-18T${hhmm}:00+07:00`) // พุธ
const titles = async (cookie: string) => (await json(await getJson('/api/teacher/notifications', cookie))).items.map((n: { title: string }) => n.title)

async function setup() {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db(), { name: 'ห้องทดสอบ ชั้น 5' })
  const s = await seedStudent(db(), classId)
  const { id: slotId } = await json(await postJson('/api/teacher/timetable', { classId, weekday: 3, start: '08:30', end: '09:20' }, { cookie }))
  return { cookie, classId, s, slotId }
}

it('ก่อนเข้าคาบ 10 นาที · เริ่มคาบเตือนยืนยันการสอน (ลิงก์เซลฟี) · ลืมเช็กชื่อหลังจบคาบ — ครั้งเดียวต่อเรื่อง', async () => {
  const { cookie, classId } = await setup()
  await generateTeacherNotifications(db(), at('08:10'))
  expect(await titles(cookie)).toEqual([])
  await generateTeacherNotifications(db(), at('08:22'))
  await generateTeacherNotifications(db(), at('08:25'))
  expect(await titles(cookie)).toEqual(['⏰ อีก 8 นาทีเข้าคาบ'])
  await generateTeacherNotifications(db(), at('08:35'))
  const inbox = await json(await getJson('/api/teacher/notifications', cookie))
  expect(inbox.items[0]).toMatchObject({ title: '📸 ยืนยันการสอน (เซลฟี + พิกัด)', url: 'https://change-classroom1.base44.app/' })
  await generateTeacherNotifications(db(), at('09:40'))
  expect((await titles(cookie))[0]).toBe('📋 ยังไม่เช็กชื่อ')
  expect(inbox.unread).toBe(2)

  // เช็กชื่อแล้ว → วันถัดไป(สัปดาห์หน้า)ไม่เตือนลืม
  await openDay(db(), classId, '2026-11-25')
  await generateTeacherNotifications(db(), Date.parse('2026-11-25T09:40:00+07:00'))
  expect((await titles(cookie)).filter((x: string) => x === '📋 ยังไม่เช็กชื่อ')).toHaveLength(1)

  // อ่านแล้ว
  await postJson('/api/teacher/notifications/read', {}, { cookie })
  expect((await json(await getJson('/api/teacher/notifications', cookie))).unread).toBe(0)
})

it('กด “ยืนยันแล้ว” ก่อน → ไม่เตือนเซลฟี · ปิดเรื่องไหนไม่เตือนเรื่องนั้น · เปลี่ยนลิงก์ได้', async () => {
  const { cookie, slotId } = await setup()
  await putJson('/api/teacher/selfie-done', { slotId, date: '2026-11-18', done: true }, cookie)
  await generateTeacherNotifications(db(), at('08:35'))
  expect(await titles(cookie)).toEqual([])
  const s = await json(await getJson('/api/teacher/notify-settings', cookie))
  expect(s.selfie.url).toBe('https://change-classroom1.base44.app/')
  expect((await putJson('/api/teacher/notify-settings', { ...s, selfie: { on: true, url: 'http://ไม่ปลอดภัย' } }, cookie)).status).toBe(400)
  await putJson('/api/teacher/notify-settings', { ...s, beforeClass: { on: false, minutes: 10 }, selfie: { on: true, url: 'https://example.org/checkin' } }, cookie)
  await generateTeacherNotifications(db(), at('08:22'))
  expect(await titles(cookie)).toEqual([])
  await putJson('/api/teacher/selfie-done', { slotId, date: '2026-11-18', done: false }, cookie)
  await generateTeacherNotifications(db(), at('08:40'))
  expect((await json(await getJson('/api/teacher/notifications', cookie))).items[0].url).toBe('https://example.org/checkin')
})

it('สรุปงานรอตรวจวันละครั้ง · ครบกำหนดแล้วยังค้าง · ส่งแก้แล้ว N คน (รวมเป็นรายการเดียว)', async () => {
  const { cookie, classId, s } = await setup()
  const s2 = await seedStudent(db(), classId)
  const due = Date.now() + 3600_000
  const asg = await seedAssignment(classId, { title: 'ใบงานแรง', dueAt: due })
  await putJson(`/api/student/assignments/${asg}/submission`, { text: 'ส่ง', imageKeys: [], clientRequestId: 'x1' }, await studentCookie(s.id))
  const t17 = Date.parse(`${new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)}T17:05:00+07:00`)
  await generateTeacherNotifications(db(), t17)
  await generateTeacherNotifications(db(), t17 + 600_000)
  expect((await titles(cookie)).filter((x: string) => x.startsWith('✅'))).toEqual(['✅ งานรอตรวจ 1 ชิ้น'])

  await generateTeacherNotifications(db(), due + 60_000)
  expect(await titles(cookie)).toContain('📮 ครบกำหนด “ใบงานแรง” · ค้าง 1 คน')

  await notifyResubmitted(db(), { id: asg, title: 'ใบงานแรง', classId }, Date.now())
  await notifyResubmitted(db(), { id: asg, title: 'ใบงานแรง', classId }, Date.now())
  expect(await titles(cookie)).toContain('↩️ ส่งแก้แล้ว 2 คน · ใบงานแรง')
  expect(s2).toBeTruthy()
})

it('ส่งแก้จริงผ่าน API: ครูส่งกลับ → นักเรียนส่งใหม่ → ครูได้แจ้งเตือน', async () => {
  const { cookie, classId, s } = await setup()
  const asg = await seedAssignment(classId, { title: 'ใบงานส่งแก้', dueAt: Date.now() + 86400_000 })
  const sc = await studentCookie(s.id)
  await putJson(`/api/student/assignments/${asg}/submission`, { text: 'รอบ 1', imageKeys: [], clientRequestId: 'r1' }, sc)
  const [{ id }] = (await env.DB.prepare('SELECT id FROM submissions WHERE assignment_id = ?').bind(asg).all<{ id: string }>()).results
  await postJson(`/api/teacher/submissions/${id}/return`, { comment: 'แก้ข้อ 2' }, { cookie })
  expect(await titles(cookie)).toEqual([])
  await putJson(`/api/student/assignments/${asg}/submission`, { text: 'รอบ 2', imageKeys: [], clientRequestId: 'r2' }, sc)
  expect(await titles(cookie)).toEqual(['↩️ ส่งแก้แล้ว 1 คน · ใบงานส่งแก้'])
})

it('ช่วงห้ามรบกวน: ไม่ส่ง push แต่เก็บไว้ส่งทีหลัง · เครื่องที่หมดอายุถูกลบ', async () => {
  expect(inQuietHours(DEFAULT_TEACHER_NOTIFY.quiet, 22 * 60)).toBe(true)
  expect(inQuietHours(DEFAULT_TEACHER_NOTIFY.quiet, 6 * 60)).toBe(true)
  expect(inQuietHours(DEFAULT_TEACHER_NOTIFY.quiet, 7 * 60)).toBe(false)
  const { cookie } = await setup()
  expect((await postJson('/api/teacher/push/subscribe', { endpoint: 'https://fcm.googleapis.com/fcm/send/abc' }, { cookie })).status).toBe(200)
  await postJson('/api/teacher/push/subscribe', { endpoint: 'https://fcm.googleapis.com/fcm/send/old' }, { cookie })
  await generateTeacherNotifications(db(), at('08:22'))
  const sent: string[] = []
  const sender = async (endpoint: string) => (sent.push(endpoint), endpoint.endsWith('old') ? 410 : 201)
  expect(await drainTeacher(db(), Date.parse('2026-11-18T22:00:00+07:00'), sender)).toBe(0)
  expect(sent).toEqual([])
  expect(await drainTeacher(db(), at('08:23'), sender)).toBe(2)
  expect(sent).toHaveLength(2)
  expect(await drainTeacher(db(), at('08:24'), sender)).toBe(0)
  const take = await json(await postJson('/api/teacher/push/take', {}, { cookie }))
  expect(take[0]).toMatchObject({ title: expect.stringMatching(/^⏰ อีก/) })
  const left = (await env.DB.prepare('SELECT endpoint FROM teacher_push_subscriptions').all<{ endpoint: string }>()).results
  expect(left.map((r) => r.endpoint)).toEqual(['https://fcm.googleapis.com/fcm/send/abc'])
  expect((await getJson('/api/teacher/notifications', await studentCookie((await seedStudent(db(), (await seedClass(db())).classId)).id))).status).toBe(401)
})
