import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { notifications } from '../src/server/db/schema'
import { enqueueEventReminders } from '../src/server/calendar/service'
import { monthRange } from '../src/shared/calendar'
import { todayBangkok } from '../src/shared/attendance'
import { del, getJson, json, loginTeacher, postJson, putJson, resetDb, seedAssignment, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const EV = { kind: 'exam', title: 'สอบกลางภาค', date: '2026-11-25', period: 'คาบ 2–3', detail: 'บทที่ 1–4' }

async function setup() {
  const teacher = await loginTeacher()
  const a = await seedClass(db(), { name: 'ม.5/1' })
  const b = await seedClass(db(), { name: 'ม.5/2' })
  const s1 = await seedStudent(db(), a.classId)
  const s2 = await seedStudent(db(), b.classId)
  return { teacher, a: a.classId, b: b.classId, s1, s2, c1: await studentCookie(s1.id), c2: await studentCookie(s2.id) }
}

it('monthRange: วันแรก–วันสุดท้ายของเดือน (รวมปีอธิกสุรทิน)', () => {
  expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
  expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
})

it('ครูเพิ่มวันสอบให้หลายห้อง · นักเรียนเห็นเฉพาะของห้องตัวเอง พร้อมกำหนดส่งงานและสถานะ', async () => {
  const { teacher, a, b, c1, c2 } = await setup()
  expect((await postJson('/api/teacher/events', { ...EV, classIds: [a, b] }, { cookie: teacher })).status).toBe(200)
  await postJson('/api/teacher/events', { kind: 'activity', title: 'ทัศนศึกษา', date: '2026-11-21', classIds: [a] }, { cookie: teacher })
  const due = Date.parse('2026-11-12T16:59:00Z') // 23:59 เวลาไทย 12 พ.ย.
  const asg = await seedAssignment(a, { title: 'ใบงานเวกเตอร์', dueAt: due })
  await putJson(`/api/student/assignments/${asg}/submission`, { text: 'ตอบ', imageKeys: [], clientRequestId: 'c1' }, c1)

  const mine = await json(await getJson('/api/student/calendar?month=2026-11', c1))
  expect(mine.map((x: { type: string; title: string; date: string }) => [x.type, x.title, x.date])).toEqual([
    ['due', 'ใบงานเวกเตอร์', '2026-11-12'],
    ['event', 'ทัศนศึกษา', '2026-11-21'],
    ['event', 'สอบกลางภาค', '2026-11-25'],
  ])
  expect(mine[0].status).toBe('submitted')
  expect(mine[2]).toMatchObject({ kind: 'exam', period: 'คาบ 2–3', detail: 'บทที่ 1–4' })
  const other = await json(await getJson('/api/student/calendar?month=2026-11', c2))
  expect(other.map((x: { title: string }) => x.title)).toEqual(['สอบกลางภาค'])
  expect(await json(await getJson('/api/student/calendar?month=2026-12', c1))).toEqual([])
  expect((await getJson('/api/student/calendar?month=2026-13', c1)).status).toBe(400)

  // ครูเห็นทุกห้อง หรือกรองห้อง
  expect(await json(await getJson('/api/teacher/calendar?month=2026-11', teacher))).toHaveLength(4)
  expect(await json(await getJson(`/api/teacher/calendar?month=2026-11&classId=${b}`, teacher))).toHaveLength(1)
  expect((await getJson('/api/teacher/calendar?month=2026-11', c1)).status).toBe(401)
})

it('แก้/ลบรายการได้ · ตรวจรูปแบบข้อมูล', async () => {
  const { teacher, a, c1 } = await setup()
  const { ids } = await json(await postJson('/api/teacher/events', { ...EV, classIds: [a] }, { cookie: teacher }))
  expect((await putJson(`/api/teacher/events/${ids[0]}`, { ...EV, title: 'สอบกลางภาค (เลื่อน)', date: '2026-11-27' }, teacher)).status).toBe(200)
  expect((await json(await getJson('/api/student/calendar?month=2026-11', c1)))[0]).toMatchObject({ title: 'สอบกลางภาค (เลื่อน)', date: '2026-11-27' })
  expect((await del(`/api/teacher/events/${ids[0]}`, teacher)).status).toBe(200)
  expect(await json(await getJson('/api/student/calendar?month=2026-11', c1))).toEqual([])
  expect((await del(`/api/teacher/events/${ids[0]}`, teacher)).status).toBe(404)
  expect((await postJson('/api/teacher/events', { ...EV, kind: 'party', classIds: [a] }, { cookie: teacher })).status).toBe(400)
  expect((await postJson('/api/teacher/events', { ...EV, date: '25/11/2026', classIds: [a] }, { cookie: teacher })).status).toBe(400)
  expect((await postJson('/api/teacher/events', { ...EV, classIds: ['nope'] }, { cookie: teacher })).status).toBe(404)
})

it('วันสอบสร้างรายการคะแนนสอบคู่กันได้', async () => {
  const { teacher, a } = await setup()
  await postJson('/api/teacher/events', { ...EV, classIds: [a], scoreItem: { category: 'midterm', maxScore: 30 } }, { cookie: teacher })
  const items = await json(await getJson(`/api/teacher/classes/${a}/score-items`, teacher))
  expect(items).toMatchObject([{ title: 'สอบกลางภาค', category: 'midterm', maxScore: 30, takenOn: '2026-11-25', published: false }])
})

it('แจ้งนักเรียนเมื่อเพิ่มรายการวันนี้/อนาคต · เย็นวันก่อนเตือน "พรุ่งนี้สอบ" ครั้งเดียว', async () => {
  const { teacher, a, s1, c1 } = await setup()
  const t = Date.now()
  const tomorrow = todayBangkok(t + 86400_000)
  await postJson('/api/teacher/events', { ...EV, date: tomorrow, classIds: [a] }, { cookie: teacher })
  await postJson('/api/teacher/events', { ...EV, title: 'สอบเก่า', date: '2020-01-01', classIds: [a] }, { cookie: teacher })
  const box = await json(await getJson('/api/student/push/notifications', c1))
  expect(box.items.map((n: { title: string }) => n.title)).toEqual([expect.stringMatching(/^📅 สอบ: สอบกลางภาค · /)])

  // 10:00 เวลาไทย ยังไม่เตือน · 18:00 เตือน · รอบถัดไปไม่ซ้ำ
  const day = Date.parse(`${todayBangkok(t)}T00:00:00Z`) - 7 * 3600_000
  expect(await enqueueEventReminders(db(), day + 10 * 3600_000)).toBe(0)
  expect(await enqueueEventReminders(db(), day + 18 * 3600_000)).toBe(1)
  expect(await enqueueEventReminders(db(), day + 18.5 * 3600_000)).toBe(0)
  const rows = (await db().select().from(notifications)).filter((n) => n.title.startsWith('📝 พรุ่งนี้สอบ'))
  expect(rows.map((r) => [r.studentId, r.title, r.body, r.url])).toEqual([[s1.id, '📝 พรุ่งนี้สอบ: สอบกลางภาค', 'คาบ 2–3 บทที่ 1–4', '/me/calendar']])
})
