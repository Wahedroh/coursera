import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { generateTeacherNotifications } from '../src/server/teacherNotify/service'
import { planSummary, teacherWeek } from '../src/server/teacherWeek/service'
import { del, getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const at = (d: string, hhmm: string) => Date.parse(`${d}T${hhmm}:00+07:00`)

it('ปฏิทินรายสัปดาห์ (เสาร์–ศุกร์): วันสอบ · รายการสอบ · กำหนดส่ง · สิ่งที่ต้องทำ (เพิ่ม/ติ๊ก/ลบ)', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db(), { name: 'ม.2/1' })
  // 2026-11-25 = พุธ → สัปดาห์ 21 (ส.) – 27 (ศ.)
  await postJson('/api/teacher/events', { kind: 'exam', title: 'สอบกลางภาค', date: '2026-11-26', period: 'คาบ 3', detail: '', classIds: [classId] }, { cookie })
  await postJson('/api/teacher/score-items', { title: 'สอบย่อยบทที่ 3', category: 'quiz', maxScore: 10, takenOn: '2026-11-24', classIds: [classId] }, { cookie })
  await postJson('/api/teacher/assignments', { title: 'ใบงานที่ 4', instructions: '', attachmentKeys: [], dueAt: at('2026-11-27', '23:59'), maxScore: 5, submitMode: 'text', classIds: [classId] }, { cookie })
  await postJson('/api/teacher/events', { kind: 'exam', title: 'นอกสัปดาห์', date: '2026-11-28', period: '', detail: '', classIds: [classId] }, { cookie })

  expect((await postJson('/api/teacher/todos', { title: '  ', date: '2026-11-25' }, { cookie })).status).toBe(400)
  const { id } = await json(await postJson('/api/teacher/todos', { title: '🖨️ ปริ้นข้อสอบกลางภาค 40 ชุด', date: '2026-11-25', classId }, { cookie }))

  const w = await json(await getJson('/api/teacher/week?date=2026-11-25', cookie))
  expect(w.from).toBe('2026-11-21')
  expect(w.to).toBe('2026-11-27')
  expect(w.days).toHaveLength(7)
  const on = (d: string) => w.days.find((x: { date: string }) => x.date === d).items.map((i: { kind: string; title: string }) => `${i.kind}:${i.title}`)
  expect(on('2026-11-24')).toEqual(['exam:สอบย่อยบทที่ 3'])
  expect(on('2026-11-25')).toEqual(['todo:🖨️ ปริ้นข้อสอบกลางภาค 40 ชุด'])
  expect(on('2026-11-26')).toEqual(['exam:สอบกลางภาค'])
  expect(on('2026-11-27')).toEqual(['due:ใบงานที่ 4'])
  expect(JSON.stringify(w)).not.toContain('นอกสัปดาห์')

  // แจ้งเตือน: เย็นวันก่อนสอบ + เช้าวันที่ต้องปริ้น
  expect(await planSummary(db(), '2026-11-26')).toEqual({ count: 1, body: 'สอบ สอบกลางภาค (ม.2/1)' })
  await generateTeacherNotifications(db(), at('2026-11-25', '17:05'))
  await generateTeacherNotifications(db(), at('2026-11-25', '17:10'))
  const titles = (await json(await getJson('/api/teacher/notifications', cookie))).items.map((n: { title: string }) => n.title)
  expect(titles.filter((t: string) => t.startsWith('🗓️ พรุ่งนี้มี 1 เรื่อง'))).toHaveLength(1)
  expect(titles).toContain('📅 วันนี้มี 1 เรื่อง')

  // ทำเสร็จ → ไม่นับในแจ้งเตือน · ลบได้
  await putJson(`/api/teacher/todos/${id}`, { done: true }, cookie)
  expect((await json(await getJson('/api/teacher/week?date=2026-11-25', cookie))).days[4].items[0]).toMatchObject({ kind: 'todo', done: true })
  expect(await planSummary(db(), '2026-11-25')).toBeNull()
  expect((await putJson('/api/teacher/todos/nope', { done: true }, cookie)).status).toBe(404)
  await del(`/api/teacher/todos/${id}`, cookie)
  expect((await json(await getJson('/api/teacher/week?date=2026-11-25', cookie))).days[4].items).toEqual([])
  expect((await getJson('/api/teacher/week')).status).toBe(401)
})

it('สิ่งที่ต้องทำที่ค้างจากสัปดาห์ก่อน ย้ายมาแสดงที่วันนี้ (เฉพาะสัปดาห์ปัจจุบัน)', async () => {
  const cookie = await loginTeacher()
  await postJson('/api/teacher/todos', { title: 'ปริ้นใบงานเก่า', date: '2026-11-10' }, { cookie })
  const w = await teacherWeek(db(), '2026-11-25', '2026-11-25')
  expect(w.days[4].items).toEqual([expect.objectContaining({ kind: 'todo', title: 'ปริ้นใบงานเก่า', date: '2026-11-25', time: 'ค้างจาก 10 พ.ย.' })])
  // ดูสัปดาห์อื่นไม่ย้ายมา
  expect((await teacherWeek(db(), '2026-12-02', '2026-11-25')).days.flatMap((d) => d.items)).toEqual([])
})

it('สัปดาห์ที่ไม่ระบุวันที่ = สัปดาห์นี้ · วันที่ผิดรูปแบบใช้วันนี้', async () => {
  const cookie = await loginTeacher()
  const w = await teacherWeek(db(), '2026-11-21')
  expect(w.from).toBe('2026-11-21')
  expect((await json(await getJson('/api/teacher/week?date=xx', cookie))).days).toHaveLength(7)
})
