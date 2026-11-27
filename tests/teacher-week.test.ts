import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { generateTeacherNotifications } from '../src/server/teacherNotify/service'
import { planSummary, teacherUpcoming } from '../src/server/teacherWeek/service'
import { del, getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const at = (d: string, hhmm: string) => Date.parse(`${d}T${hhmm}:00+07:00`)

it('วันนี้ + 3 วันข้างหน้า: วันสอบ · รายการสอบ · กำหนดส่ง · สิ่งที่ต้องทำ (เพิ่ม/ติ๊ก/ลบ)', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db(), { name: 'ม.2/1' })
  // วันนี้ = 2026-11-24 → แสดง 24–27
  await postJson('/api/teacher/events', { kind: 'exam', title: 'สอบกลางภาค', date: '2026-11-26', period: 'คาบ 3', detail: '', classIds: [classId] }, { cookie })
  await postJson('/api/teacher/score-items', { title: 'สอบย่อยบทที่ 3', category: 'quiz', maxScore: 10, takenOn: '2026-11-24', classIds: [classId] }, { cookie })
  await postJson('/api/teacher/assignments', { title: 'ใบงานที่ 4', instructions: '', attachmentKeys: [], dueAt: at('2026-11-27', '23:59'), maxScore: 5, submitMode: 'text', classIds: [classId] }, { cookie })
  await postJson('/api/teacher/events', { kind: 'exam', title: 'นอกสัปดาห์', date: '2026-11-28', period: '', detail: '', classIds: [classId] }, { cookie })

  expect((await postJson('/api/teacher/todos', { title: '  ', date: '2026-11-25' }, { cookie })).status).toBe(400)
  const { id } = await json(await postJson('/api/teacher/todos', { title: '🖨️ ปริ้นข้อสอบกลางภาค 40 ชุด', date: '2026-11-25', classId }, { cookie }))

  const w = await teacherUpcoming(db(), '2026-11-24')
  expect(w.from).toBe('2026-11-24')
  expect(w.to).toBe('2026-11-27')
  expect(w.days.map((d) => d.date)).toEqual(['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'])
  const on = (d: string) => w.days.find((x) => x.date === d)!.items.map((i) => `${i.kind}:${i.title}`)
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
  expect((await teacherUpcoming(db(), '2026-11-24')).days[1].items[0]).toMatchObject({ kind: 'todo', done: true })
  expect(await planSummary(db(), '2026-11-25')).toBeNull()
  expect((await putJson('/api/teacher/todos/nope', { done: true }, cookie)).status).toBe(404)
  await del(`/api/teacher/todos/${id}`, cookie)
  expect((await teacherUpcoming(db(), '2026-11-24')).days[1].items).toEqual([])
  expect((await json(await getJson('/api/teacher/upcoming', cookie))).days).toHaveLength(4)
  expect((await getJson('/api/teacher/upcoming')).status).toBe(401)
})

it('สิ่งที่ต้องทำที่ค้างจากวันก่อน ๆ ย้ายมาแสดงที่วันนี้ · ที่ทำแล้วไม่ย้าย', async () => {
  const cookie = await loginTeacher()
  await postJson('/api/teacher/todos', { title: 'ปริ้นใบงานเก่า', date: '2026-11-10' }, { cookie })
  const { id } = await json(await postJson('/api/teacher/todos', { title: 'ทำแล้ว', date: '2026-11-20' }, { cookie }))
  await putJson(`/api/teacher/todos/${id}`, { done: true }, cookie)
  const w = await teacherUpcoming(db(), '2026-11-25')
  expect(w.days[0].items).toEqual([expect.objectContaining({ kind: 'todo', title: 'ปริ้นใบงานเก่า', date: '2026-11-25', time: 'ค้างจาก 10 พ.ย.' })])
  expect(w.days.flatMap((d) => d.items)).toHaveLength(1)
})
