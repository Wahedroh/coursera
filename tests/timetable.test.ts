import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { releaseDue } from '../src/server/timetable/release'
import { currentSlot, nextClassStart, nextOccurrence, upcomingSlots } from '../src/shared/timetable'
import { del, getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie, TINY_JPEG } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
// พุธ 18 พ.ย. 2026 10:15 เวลาไทย
const WED_1015 = Date.parse('2026-11-18T10:15:00+07:00')

describe('คำนวณคาบ (เวลาไทย)', () => {
  const slots = [
    { id: 'a', classId: 'A', weekday: 3, start: '10:00', end: '10:50' },
    { id: 'b', classId: 'B', weekday: 3, start: '13:00', end: '13:50' },
    { id: 'c', classId: 'A', weekday: 1, start: '08:30', end: '09:20' },
  ]
  it('คาบที่กำลังสอน · คาบถัดไป · เริ่มคาบถัดไปของห้อง', () => {
    expect(currentSlot(slots, WED_1015)).toMatchObject({ id: 'a', startAt: Date.parse('2026-11-18T10:00:00+07:00') })
    expect(currentSlot(slots, Date.parse('2026-11-18T12:00:00+07:00'))).toBeNull()
    expect(upcomingSlots(slots, WED_1015).map((s) => s.id)).toEqual(['b', 'c', 'a'])
    expect(nextClassStart(slots, 'A', WED_1015)).toBe(Date.parse('2026-11-23T08:30:00+07:00'))
    expect(nextClassStart(slots, 'B', WED_1015)).toBe(Date.parse('2026-11-18T13:00:00+07:00'))
    expect(nextClassStart(slots, 'Z', WED_1015)).toBeNull()
    // อาทิตย์ดึก → จันทร์
    expect(nextOccurrence(slots[2], Date.parse('2026-11-22T23:00:00+07:00')).start).toBe(Date.parse('2026-11-23T08:30:00+07:00'))
  })
})

async function setup() {
  const cookie = await loginTeacher()
  const a = (await seedClass(db(), { name: 'ห้อง A' })).classId
  const b = (await seedClass(db(), { name: 'ห้อง B' })).classId
  const sa = await studentCookie((await seedStudent(db(), a)).id)
  const sb = await studentCookie((await seedStudent(db(), b)).id)
  return { cookie, a, b, sa, sb }
}

describe('ตารางสอน', () => {
  it('เพิ่ม/ลบคาบ · เวลาซ้อนกัน 409 · พักตาราง · นักเรียนเรียกไม่ได้', async () => {
    const { cookie, a, b, sa } = await setup()
    const { id } = await json(await postJson('/api/teacher/timetable', { classId: a, weekday: 1, start: '08:30', end: '09:20' }, { cookie }))
    expect((await postJson('/api/teacher/timetable', { classId: b, weekday: 1, start: '09:00', end: '09:50' }, { cookie })).status).toBe(409)
    expect((await postJson('/api/teacher/timetable', { classId: b, weekday: 1, start: '09:20', end: '10:10' }, { cookie })).status).toBe(200)
    expect((await postJson('/api/teacher/timetable', { classId: b, weekday: 2, start: '10:00', end: '09:00' }, { cookie })).status).toBe(400)
    const tt = await json(await getJson('/api/teacher/timetable', cookie))
    expect(tt.slots).toHaveLength(2)
    expect(tt.paused).toBe(false)
    expect((await getJson('/api/teacher/timetable/now', cookie)).status).toBe(200)
    await putJson('/api/teacher/timetable/paused', { paused: true }, cookie)
    expect(await json(await getJson('/api/teacher/timetable/now', cookie))).toMatchObject({ paused: true, current: null })
    expect((await del(`/api/teacher/timetable/${id}`, cookie)).status).toBe(200)
    expect((await getJson('/api/teacher/timetable', sa)).status).toBe(401)
  })
})

describe('ตั้งเวลาเผยแพร่', () => {
  const ASG = { instructions: '', attachmentKeys: [], dueAt: null, maxScore: 10, submitMode: 'text' }

  it('งาน: ตั้งเวลา → นักเรียนยังไม่เห็น · ถึงเวลาเปิดเอง + แจ้งเตือน · ร่างไม่เปิดเอง · เผยแพร่ตอนนี้ได้', async () => {
    const { cookie, a, sa } = await setup()
    const later = Date.now() + 3600_000
    const { ids } = await json(await postJson('/api/teacher/assignments', { ...ASG, title: 'งานตั้งเวลา', classIds: [a], publishMode: 'at', publishAt: later }, { cookie }))
    const { ids: draft } = await json(await postJson('/api/teacher/assignments', { ...ASG, title: 'งานร่าง', classIds: [a], publishMode: 'draft' }, { cookie }))
    expect(await json(await getJson('/api/student/assignments', sa))).toEqual([])
    expect((await getJson(`/api/student/assignments/${ids[0]}`, sa)).status).toBe(404)
    const sched = await json(await getJson('/api/teacher/scheduled', cookie))
    expect(sched.map((x: { title: string; publishAt: number | null }) => [x.title, x.publishAt])).toEqual([
      ['งานตั้งเวลา', later],
      ['งานร่าง', null],
    ])
    // ยังไม่มีแจ้งเตือนงานใหม่
    expect((await json(await getJson('/api/student/push/notifications', sa))).items).toEqual([])

    // ถึงเวลา
    expect(await releaseDue(db(), later + 1000, true)).toBe(1)
    expect((await json(await getJson('/api/student/assignments', sa))).map((x: { title: string }) => x.title)).toEqual(['งานตั้งเวลา'])
    expect((await json(await getJson('/api/student/push/notifications', sa))).items.map((n: { title: string; body: string }) => [n.title, n.body])).toEqual([['📝 งานใหม่', 'งานตั้งเวลา']])
    expect(await releaseDue(db(), later + 2000, true)).toBe(0)

    // ร่าง → เผยแพร่ตอนนี้
    expect((await putJson(`/api/teacher/scheduled/assignment/${draft[0]}`, { publishAt: null }, cookie)).status).toBe(200)
    expect(await json(await getJson('/api/student/assignments', sa))).toHaveLength(2)
    expect((await putJson(`/api/teacher/scheduled/assignment/${draft[0]}`, { publishAt: null }, cookie)).status).toBe(404)
  })

  it('ตอนเริ่มคาบถัดไป: ใช้ตารางสอนของแต่ละห้อง · ห้องไม่มีตาราง = เผยแพร่ทันที', async () => {
    const { cookie, a, b, sa, sb } = await setup()
    await postJson('/api/teacher/timetable', { classId: a, weekday: 3, start: '10:00', end: '10:50' }, { cookie })
    const { ids } = await json(await postJson('/api/teacher/assignments', { ...ASG, title: 'คาบหน้า', classIds: [a, b], publishMode: 'next-period' }, { cookie }))
    const rows = (await env.DB.prepare(`SELECT class_id AS c, published AS p, publish_at AS at FROM assignments WHERE id IN (?, ?)`).bind(ids[0], ids[1]).all<{ c: string; p: number; at: number | null }>()).results
    const ra = rows.find((r) => r.c === a)!
    expect(ra.p).toBe(0)
    expect(new Date(ra.at! + 7 * 3600_000).toISOString().slice(11, 16)).toBe('10:00')
    expect(new Date(ra.at! + 7 * 3600_000).getUTCDay()).toBe(3)
    expect(rows.find((r) => r.c === b)).toMatchObject({ p: 1, at: null })
    expect(await json(await getJson('/api/student/assignments', sa))).toEqual([])
    expect(await json(await getJson('/api/student/assignments', sb))).toHaveLength(1)
  })

  it('ประกาศ/คลิป/เอกสารตั้งเวลาได้ · นักเรียนไม่เห็นก่อนเวลา', async () => {
    const { cookie, a, sa } = await setup()
    const later = Date.now() + 3600_000
    await postJson('/api/teacher/announcements', { title: 'ประกาศล่วงหน้า', body: '', pinned: false, expiresOn: null, classIds: [a], publishMode: 'at', publishAt: later }, { cookie })
    await postJson('/api/teacher/videos', { title: 'คลิปล่วงหน้า', description: '', url: 'https://youtu.be/dQw4w9WgXcQ', classIds: [a], publishMode: 'at', publishAt: later }, { cookie })
    const { SELF } = await import('cloudflare:test')
    const qs = new URLSearchParams({ classIds: a, name: 'x.jpg', title: 'เอกสารล่วงหน้า', topic: '', publishMode: 'at', publishAt: String(later) })
    expect((await SELF.fetch(`http://x/api/teacher/materials?${qs}`, { method: 'POST', headers: { cookie, 'content-type': 'application/octet-stream' }, body: new Blob([TINY_JPEG]) })).status).toBe(200)
    expect(await json(await getJson('/api/student/announcements', sa))).toEqual([])
    expect(await json(await getJson('/api/student/videos', sa))).toEqual([])
    expect(await json(await getJson('/api/student/materials', sa))).toEqual([])
    expect((await json(await getJson('/api/teacher/scheduled', cookie))).map((x: { type: string }) => x.type).sort()).toEqual(['announcement', 'material', 'video'])
    expect(await releaseDue(db(), later + 1, true)).toBe(3)
    expect(await json(await getJson('/api/student/announcements', sa))).toHaveLength(1)
    expect(await json(await getJson('/api/student/videos', sa))).toHaveLength(1)
    expect(await json(await getJson('/api/student/materials', sa))).toHaveLength(1)
  })
})

describe('คัดลอกไปห้องอื่น / คลังของครู', () => {
  it('งาน: กำหนดส่ง = คาบถัดไปของห้องปลายทาง · ไม่มีงานที่ส่งติดไป · แจ้งเตือนห้องปลายทาง', async () => {
    const { cookie, a, b, sa, sb } = await setup()
    await postJson('/api/teacher/timetable', { classId: b, weekday: 2, start: '13:00', end: '13:50' }, { cookie })
    const { ids } = await json(await postJson('/api/teacher/assignments', { instructions: 'ทำข้อ 1–5', attachmentKeys: [], dueAt: Date.now() + 86400_000, maxScore: 10, submitMode: 'text', title: 'ใบงานต้นแบบ', classIds: [a] }, { cookie }))
    await putJson(`/api/student/assignments/${ids[0]}/submission`, { text: 'ส่ง', imageKeys: [], clientRequestId: 'c1' }, sa)
    const r = await json(await postJson('/api/teacher/copy', { type: 'assignment', ids, classIds: [b], due: 'next-period' }, { cookie }))
    expect(r).toEqual({ count: 1, scheduled: 0 })
    const [copy] = await json(await getJson('/api/student/assignments', sb))
    expect(copy).toMatchObject({ title: 'ใบงานต้นแบบ', instructions: 'ทำข้อ 1–5', status: 'missing', maxScore: 10 })
    expect(new Date(copy.dueAt + 7 * 3600_000).getUTCDay()).toBe(2)
    expect(new Date(copy.dueAt + 7 * 3600_000).toISOString().slice(11, 16)).toBe('13:00')
    expect((await json(await getJson('/api/student/push/notifications', sb))).items[0]).toMatchObject({ title: '📝 งานใหม่', body: 'ใบงานต้นแบบ' })
  })

  it('คลิป (พร้อมคำถาม) · สอบ (ยังไม่เผยแพร่) · ประกาศ · จำกัดจำนวน · คลังจัดกลุ่มตามชื่อ', async () => {
    const { cookie, a, b, sb } = await setup()
    const { ids: v } = await json(await postJson('/api/teacher/videos', { title: 'ทบทวน', description: '', url: 'https://youtu.be/dQw4w9WgXcQ', questions: [{ q: '1+1', choices: ['1', '2'], answer: 1 }], classIds: [a] }, { cookie }))
    await postJson('/api/teacher/copy', { type: 'video', ids: v, classIds: [b] }, { cookie })
    expect((await json(await getJson('/api/student/videos', sb)))[0]).toMatchObject({ title: 'ทบทวน', quiz: [{ q: '1+1', choices: ['1', '2'] }] })
    const { ids: s } = await json(await postJson('/api/teacher/score-items', { title: 'สอบย่อย 1', category: 'quiz', maxScore: 10, takenOn: '2026-11-10', classIds: [a] }, { cookie }))
    await postJson('/api/teacher/copy', { type: 'score-item', ids: s, classIds: [b] }, { cookie })
    expect((await json(await getJson(`/api/teacher/classes/${b}/score-items`, cookie)))[0]).toMatchObject({ title: 'สอบย่อย 1', published: false })
    const { ids: n } = await json(await postJson('/api/teacher/announcements', { title: 'พกเครื่องคิดเลข', body: '', pinned: true, expiresOn: null, classIds: [a] }, { cookie }))
    await postJson('/api/teacher/copy', { type: 'announcement', ids: n, classIds: [b], publishMode: 'draft' }, { cookie })
    expect(await json(await getJson('/api/student/announcements', sb))).toEqual([])
    const many = Array.from({ length: 41 }, (_, i) => `x${i}`)
    expect((await postJson('/api/teacher/copy', { type: 'video', ids: many.slice(0, 30), classIds: [a, b] }, { cookie })).status).toBe(400)
    expect((await postJson('/api/teacher/copy', { type: 'video', ids: ['nope'], classIds: [b] }, { cookie })).status).toBe(404)

    const lib = await json(await getJson('/api/teacher/library?type=video', cookie))
    expect(lib).toEqual([expect.objectContaining({ title: 'ทบทวน', classCount: 2, detail: 'คำถาม 1 ข้อ' })])
    expect((await getJson('/api/teacher/library?type=x', cookie)).status).toBe(400)
  })
})
