import { env, SELF } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, newId } from '../src/server/db/client'
import { classes } from '../src/server/db/schema'
import { generateTeacherNotifications } from '../src/server/teacherNotify/service'
import { nextStop } from '../src/server/workload/service'
import { countTrips, navUrl, parsePlace, slotPeriods } from '../src/shared/workload'
import { del, getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
// 2030-01-07 = จันทร์
const at = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+07:00`)

describe('คำนวณ', () => {
  it('จำนวนคาบจากช่วงเวลา (50 นาที/คาบ) หรือที่ครูกำหนด', () => {
    expect(slotPeriods({ start: '08:30', end: '09:20' })).toBe(1)
    expect(slotPeriods({ start: '08:30', end: '10:10' })).toBe(2)
    expect(slotPeriods({ start: '13:00', end: '15:30' })).toBe(3)
    expect(slotPeriods({ start: '13:00', end: '13:30' })).toBe(1)
    expect(slotPeriods({ start: '08:30', end: '10:30', periods: 3 })).toBe(3)
  })
  it('นับการเดินทาง: เช้า A บ่าย B = 2 · A → B → A = 3 · ที่เดิมติดกัน = 1 · ที่ปิดไม่นับ', () => {
    const s = (key: string, closed = false) => ({ key, closed: closed ? ({} as never) : null })
    expect(countTrips([s('A'), s('B')])).toBe(2)
    expect(countTrips([s('A'), s('B'), s('A')])).toBe(3)
    expect(countTrips([s('A'), s('A')])).toBe(1)
    expect(countTrips([s('A', true), s('B')])).toBe(1)
    expect(countTrips([])).toBe(0)
  })
  it('อ่านพิกัดจากลิงก์แผนที่', () => {
    expect(parsePlace('https://www.google.com/maps/place/x/@6.4123,101.8234,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d6.41255!4d101.82411')).toEqual({ lat: 6.41255, lng: 101.82411 })
    expect(parsePlace('https://www.google.com/maps/@6.5,101.7,15z')).toEqual({ lat: 6.5, lng: 101.7 })
    expect(parsePlace('https://maps.google.com/?q=6.41,101.82')).toEqual({ lat: 6.41, lng: 101.82 })
    expect(parsePlace('https://maps.apple.com/?ll=6.41,101.82&q=School')).toEqual({ lat: 6.41, lng: 101.82 })
    expect(parsePlace('6.4123, 101.8234')).toEqual({ lat: 6.4123, lng: 101.8234 })
    expect(parsePlace('https://www.google.com/maps/search/6.4123,+101.8234')).toEqual({ lat: 6.4123, lng: 101.8234 })
    expect(parsePlace('โรงเรียนดรุณ')).toBeNull()
    expect(parsePlace('0,0')).toBeNull()
    expect(navUrl({ lat: 6.4, lng: 101.8, name: 'x' })).toBe('https://maps.apple.com/?daddr=6.4,101.8&dirflg=d')
    expect(navUrl({ lat: null, lng: null, name: 'ดรุณ' })).toBe(`https://maps.apple.com/?daddr=${encodeURIComponent('ดรุณ')}&dirflg=d`)
  })
})

async function setup() {
  const cookie = await loginTeacher()
  const a = await seedClass(db(), { schoolName: 'ดรุณ', name: 'ดรุณ ชั้น 5', grade: 5 })
  const a2 = newId()
  await db().insert(classes).values({ id: a2, schoolId: a.schoolId, grade: 1, name: 'ดรุณ ชั้น 1', joinCode: 'DRN001', createdAt: Date.now() })
  const b = await seedClass(db(), { schoolName: 'บำรุงอิสลาม', name: 'บำรุงอิสลาม ชั้น 3', grade: 3 })
  const slot = async (classId: string, weekday: number, start: string, end: string) => (await json(await postJson('/api/teacher/timetable', { classId, weekday, start, end }, { cookie }))).id as string
  const ids = {
    monA1: await slot(a.classId, 1, '08:30', '10:10'), // 2
    monA2: await slot(a2, 1, '10:20', '11:10'), // 1
    monB: await slot(b.classId, 1, '13:00', '15:30'), // 3
    tueB1: await slot(b.classId, 2, '08:30', '09:20'),
    tueA: await slot(a2, 2, '13:00', '13:50'),
    tueB2: await slot(b.classId, 2, '14:00', '14:50'),
  }
  return { cookie, a, a2, b, ids }
}

describe('ภาระสอน & การเดินทาง', () => {
  it('เป้าคาบต่อสัปดาห์เทียบตาราง · ครูแก้จำนวนคาบของช่วงได้', async () => {
    const { cookie, a, a2, b, ids } = await setup()
    await putJson(`/api/teacher/classes/${a.classId}/weekly-periods`, { weeklyPeriods: 4 }, cookie)
    await putJson(`/api/teacher/classes/${a2}/weekly-periods`, { weeklyPeriods: 3 }, cookie)
    await putJson(`/api/teacher/classes/${b.classId}/weekly-periods`, { weeklyPeriods: 5 }, cookie)
    let r = await json(await getJson('/api/teacher/workload/targets', cookie))
    const darun = r.schools.find((s: { name: string }) => s.name === 'ดรุณ')
    expect(darun.classes.map((c: { name: string; target: number; scheduled: number }) => [c.name, c.target, c.scheduled])).toEqual([
      ['ดรุณ ชั้น 1', 3, 2],
      ['ดรุณ ชั้น 5', 4, 2],
    ])
    expect([r.target, r.scheduled]).toEqual([12, 9])
    expect((await putJson(`/api/teacher/timetable/${ids.monA1}/periods`, { periods: 4 }, cookie)).status).toBe(200)
    r = await json(await getJson('/api/teacher/workload/targets', cookie))
    expect(r.schools.find((s: { name: string }) => s.name === 'ดรุณ').scheduled).toBe(6)
    expect((await putJson(`/api/teacher/classes/${a.classId}/weekly-periods`, { weeklyPeriods: -1 }, cookie)).status).toBe(400)
  })

  it('นับคาบ/การเดินทางรายวัน · ปิดโรงเรียนไม่นับทั้งคาบและการเดินทาง · ปิดทุกโรงเรียน', async () => {
    const { cookie, a } = await setup()
    let w = await json(await getJson('/api/teacher/workload?from=2030-01-07&to=2030-01-13', cookie))
    const mon = w.days[0]
    expect(mon.stops.map((s: { name: string; periods: number; start: string; end: string }) => [s.name, s.periods, s.start, s.end])).toEqual([
      ['ดรุณ', 3, '08:30', '11:10'],
      ['บำรุงอิสลาม', 3, '13:00', '15:30'],
    ])
    expect([mon.periods, mon.trips]).toEqual([6, 2])
    expect([w.days[1].periods, w.days[1].trips]).toEqual([3, 3]) // บำรุง → ดรุณ → บำรุง
    expect(w.planned).toEqual({ periods: 9, trips: 5, closedPeriods: 0 })

    await postJson('/api/teacher/closures', { schoolId: a.schoolId, from: '2030-01-07', to: '2030-01-07', reason: 'school-event', note: 'กีฬาสี' }, { cookie })
    const { id: allId } = await json(await postJson('/api/teacher/closures', { schoolId: null, from: '2030-01-08', to: '2030-01-08', reason: 'holiday', note: '' }, { cookie }))
    w = await json(await getJson('/api/teacher/workload?from=2030-01-07&to=2030-01-13', cookie))
    expect(w.days[0].stops[0].closed).toMatchObject({ reason: 'school-event', note: 'กีฬาสี', allSchools: false })
    expect([w.days[0].periods, w.days[0].closedPeriods, w.days[0].trips]).toEqual([3, 3, 1])
    expect([w.days[1].periods, w.days[1].closedPeriods, w.days[1].trips]).toEqual([0, 3, 0])
    expect(w.planned).toEqual({ periods: 3, trips: 1, closedPeriods: 6 })

    // ยกเลิกการปิด → นับกลับมา
    await del(`/api/teacher/closures/${allId}`, cookie)
    w = await json(await getJson('/api/teacher/workload?from=2030-01-08&to=2030-01-08', cookie))
    expect(w.days[0].trips).toBe(3)
    // ช่วงวันที่ไม่ถูกต้อง
    expect((await getJson('/api/teacher/workload?from=2030-02-01&to=2030-01-01', cookie)).status).toBe(400)
    expect((await postJson('/api/teacher/closures', { schoolId: null, from: '2030-01-09', to: '2030-01-08', reason: 'holiday' }, { cookie })).status).toBe(400)
    expect((await postJson('/api/teacher/closures', { schoolId: null, from: '2030-01-09', to: '2030-01-09', reason: 'ไม่มี' }, { cookie })).status).toBe(400)
  })

  it('นัดพิเศษนับเป็นการเดินทาง · ปิดพร้อมประกาศงดเรียนให้นักเรียน (ลบการปิด = ลบประกาศ)', async () => {
    const { cookie, a } = await setup()
    await postJson('/api/teacher/appointments', { date: '2030-01-07', start: '12:00', title: 'ประชุมเขต', mapUrl: '6.5, 101.5' }, { cookie })
    const w = await json(await getJson('/api/teacher/workload?from=2030-01-07&to=2030-01-07', cookie))
    expect(w.days[0].stops.map((s: { name: string }) => s.name)).toEqual(['ดรุณ', 'ประชุมเขต', 'บำรุงอิสลาม'])
    expect(w.days[0].trips).toBe(3)
    expect(w.days[0].stops[1].nav).toBe('https://maps.apple.com/?daddr=6.5,101.5&dirflg=d')

    const s = await seedStudent(db(), a.classId)
    const { id } = await json(await postJson('/api/teacher/closures', { schoolId: a.schoolId, from: '2030-01-07', to: '2030-01-08', reason: 'disaster', note: 'น้ำท่วม', notifyStudents: true }, { cookie }))
    const anns = await json(await getJson('/api/student/announcements', await studentCookie(s.id)))
    expect(anns[0]).toMatchObject({ title: expect.stringContaining('งดเรียน'), body: 'ดรุณ: ภัยธรรมชาติ · น้ำท่วม', pinned: true })
    const list = await json(await getJson('/api/teacher/closures?from=2030-01-01', cookie))
    expect(list).toMatchObject([{ id, schoolName: 'ดรุณ', reason: 'disaster', note: 'น้ำท่วม' }])
    await del(`/api/teacher/closures/${id}`, cookie)
    expect(await json(await getJson('/api/student/announcements', await studentCookie(s.id)))).toEqual([])
  })
})

describe('นำทาง (CarPlay) และการแจ้งเตือน', () => {
  it('จุดถัดไป: คาบที่ยังไม่เริ่ม ข้ามที่ปิด · ลิงก์ลับสำหรับคำสั่งลัด · ปฏิทิน', async () => {
    const { cookie, a, b } = await setup()
    const p = await json(await putJson(`/api/teacher/places/${a.schoolId}`, { mapUrl: 'https://www.google.com/maps/place/x/data=!3d6.41255!4d101.82411' }, cookie))
    expect(p).toMatchObject({ lat: 6.41255, lng: 101.82411 })
    expect((await json(await getJson('/api/teacher/places', cookie))).map((x: { name: string }) => x.name).sort()).toEqual(['ดรุณ', 'บำรุงอิสลาม'])

    expect((await nextStop(db(), at('2030-01-07', '07:00')))?.nav).toBe('https://maps.apple.com/?daddr=6.41255,101.82411&dirflg=d')
    expect((await nextStop(db(), at('2030-01-07', '09:00')))?.name).toBe('บำรุงอิสลาม') // กำลังสอนที่ดรุณ → ที่ถัดไป
    expect(await nextStop(db(), at('2030-01-07', '16:00'))).toBeNull()
    await postJson('/api/teacher/closures', { schoolId: a.schoolId, from: '2030-01-07', to: '2030-01-07', reason: 'exam', note: '' }, { cookie })
    expect((await nextStop(db(), at('2030-01-07', '07:00')))?.name).toBe('บำรุงอิสลาม')

    // ลิงก์ลับ
    expect((await SELF.fetch('http://x/api/nav/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/next')).status).toBe(404)
    expect(await json(await getJson('/api/teacher/nav-token', cookie))).toEqual({ token: null })
    const { token } = await json(await postJson('/api/teacher/nav-token', {}, { cookie }))
    const res = await SELF.fetch(`http://x/api/nav/${token}/next`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    const ics = await SELF.fetch(`http://x/api/nav/${token}/calendar.ics`)
    expect(ics.headers.get('content-type')).toContain('text/calendar')
    const body = await ics.text()
    expect(body).toContain('BEGIN:VCALENDAR')
    expect(body).toContain('X-WR-CALNAME')
    // ออกลิงก์ใหม่ → ลิงก์เก่าใช้ไม่ได้
    await postJson('/api/teacher/nav-token', {}, { cookie })
    expect((await SELF.fetch(`http://x/api/nav/${token}/next`)).status).toBe(404)
    expect(b).toBeTruthy()
  })

  it('โรงเรียนที่ปิดวันนี้: ไม่เตือนก่อนเข้าคาบ', async () => {
    const { cookie, a } = await setup()
    await postJson('/api/teacher/closures', { schoolId: a.schoolId, from: '2030-01-07', to: '2030-01-07', reason: 'holiday', note: '' }, { cookie })
    await generateTeacherNotifications(db(), at('2030-01-07', '08:22'))
    await generateTeacherNotifications(db(), at('2030-01-07', '12:52'))
    const titles = (await json(await getJson('/api/teacher/notifications', cookie))).items.map((n: { title: string; body: string }) => n.body)
    expect(titles.some((x: string) => x.includes('ดรุณ'))).toBe(false)
    expect(titles.some((x: string) => x.includes('บำรุงอิสลาม'))).toBe(true)
  })
})
