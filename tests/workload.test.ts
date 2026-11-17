import { env, SELF } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, newId } from '../src/server/db/client'
import { classes } from '../src/server/db/schema'
import { generateTeacherNotifications } from '../src/server/teacherNotify/service'
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
    // ไม่นับการเดินทางไปที่ B: เที่ยวไป B ไม่นับ แต่เที่ยวกลับ A ยังนับ
    expect(countTrips([s('A'), { key: 'B', closed: null, countTrips: false }, s('A')])).toBe(2)
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
    expect(w.planned).toMatchObject({ periods: 9, trips: 5, closedPeriods: 0 })

    await postJson('/api/teacher/closures', { schoolId: a.schoolId, from: '2030-01-07', to: '2030-01-07', reason: 'school-event', note: 'กีฬาสี' }, { cookie })
    const { id: allId } = await json(await postJson('/api/teacher/closures', { schoolId: null, from: '2030-01-08', to: '2030-01-08', reason: 'holiday', note: '' }, { cookie }))
    w = await json(await getJson('/api/teacher/workload?from=2030-01-07&to=2030-01-13', cookie))
    expect(w.days[0].stops[0].closed).toMatchObject({ reason: 'school-event', note: 'กีฬาสี', allSchools: false })
    expect([w.days[0].periods, w.days[0].closedPeriods, w.days[0].trips]).toEqual([3, 3, 1])
    expect([w.days[1].periods, w.days[1].closedPeriods, w.days[1].trips]).toEqual([0, 3, 0])
    expect(w.planned).toMatchObject({ periods: 3, trips: 1, closedPeriods: 6 })

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

describe('ตั้งรายโรงเรียน: นับคาบ / นับการเดินทาง', () => {
  it('ปิดนับคาบ → ไม่รวมในยอดคาบและเป้ารวม · ปิดนับการเดินทาง → ไม่นับเที่ยวที่ไปที่นั้น', async () => {
    const { cookie, a, b } = await setup()
    const get = async () => json(await getJson('/api/teacher/workload?from=2030-01-07&to=2030-01-08', cookie))
    let w = await get()
    expect([w.days[0].periods, w.days[0].trips, w.days[1].periods, w.days[1].trips]).toEqual([6, 2, 3, 3])

    // บำรุงอิสลาม: ไม่นับการเดินทาง (ยังนับคาบ)
    expect((await putJson(`/api/teacher/schools/${b.schoolId}/counting`, { countPeriods: true, countTrips: false }, cookie)).status).toBe(200)
    w = await get()
    expect([w.days[0].periods, w.days[0].trips]).toEqual([6, 1]) // ดรุณ → บำรุง(ไม่นับ)
    expect([w.days[1].periods, w.days[1].trips]).toEqual([3, 1]) // บำรุง(ไม่นับ) → ดรุณ → บำรุง(ไม่นับ)
    expect(w.days[0].stops[1]).toMatchObject({ name: 'บำรุงอิสลาม', countPeriods: true, countTrips: false })

    // ดรุณ: ไม่นับคาบ (ยังนับการเดินทาง)
    await putJson(`/api/teacher/classes/${a.classId}/weekly-periods`, { weeklyPeriods: 4 }, cookie)
    await putJson(`/api/teacher/classes/${b.classId}/weekly-periods`, { weeklyPeriods: 5 }, cookie)
    await putJson(`/api/teacher/schools/${a.schoolId}/counting`, { countPeriods: false, countTrips: true }, cookie)
    w = await get()
    expect([w.days[0].periods, w.days[0].trips]).toEqual([3, 1])
    expect(w.planned).toMatchObject({ periods: 5, trips: 2, closedPeriods: 0 })
    const tg = await json(await getJson('/api/teacher/workload/targets', cookie))
    expect(tg.schools.find((x: { name: string }) => x.name === 'ดรุณ')).toMatchObject({ countPeriods: false, countTrips: true })
    expect([tg.target, tg.scheduled]).toEqual([5, 5]) // เฉพาะบำรุงอิสลาม
    expect((await putJson(`/api/teacher/schools/${a.schoolId}/counting`, { countPeriods: 'no' }, cookie)).status).toBe(400)
  })
})

describe('ตำแหน่งและการแจ้งเตือน', () => {
  it('ตำแหน่งโรงเรียนจากลิงก์แผนที่ → ปุ่มนำทางของจุดนั้น', async () => {
    const { cookie, a } = await setup()
    const p = await json(await putJson(`/api/teacher/places/${a.schoolId}`, { mapUrl: 'https://www.google.com/maps/place/x/data=!3d6.41255!4d101.82411' }, cookie))
    expect(p).toMatchObject({ lat: 6.41255, lng: 101.82411 })
    expect((await json(await getJson('/api/teacher/places', cookie))).map((x: { name: string }) => x.name).sort()).toEqual(['ดรุณ', 'บำรุงอิสลาม'])
    const d = await json(await getJson('/api/teacher/route/day?date=2030-01-07', cookie))
    expect(d.stops[0].nav).toBe('https://maps.apple.com/?daddr=6.41255,101.82411&dirflg=d')
    expect((await SELF.fetch('http://x/api/nav/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/next')).status).toBe(404)
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

describe('ตารางสอนตามช่วงเวลา', () => {
  it('เลิกใช้คาบตั้งแต่วันที่ → ยอดก่อนหน้ายังนับ · คาบใหม่ช่วงเดียวกันไม่ชน · ช่วงซ้อนกัน = ชน', async () => {
    const cookie = await loginTeacher()
    const k = await seedClass(db(), { schoolName: 'คัมภีร์', name: 'คัมภีร์ ชั้น 4', grade: 4 })
    const add = (body: Record<string, unknown>) => postJson('/api/teacher/timetable', { classId: k.classId, ...body }, { cookie })
    const { id: oldId } = await json(await add({ weekday: 2, start: '13:00', end: '14:40', validFrom: '2030-01-01' })) // อังคาร 2 คาบ
    const month = async () => json(await getJson('/api/teacher/workload?from=2030-01-01&to=2030-01-31', cookie))
    expect((await month()).planned.periods).toBe(10) // 5 วันอังคาร

    expect(await json(await putJson(`/api/teacher/timetable/${oldId}/end`, { from: '2030-01-16' }, cookie))).toEqual({ result: 'ended' })
    expect((await add({ weekday: 3, start: '13:00', end: '16:20', validFrom: '2030-01-16' })).status).toBe(200) // พุธ 4 คาบ
    const w = await month()
    // อังคาร 1, 8, 15 = 6 · พุธ 16, 23, 30 = 12
    expect(w.planned.periods).toBe(18)
    expect(w.days.find((d: { date: string }) => d.date === '2030-01-15').periods).toBe(2)
    expect(w.days.find((d: { date: string }) => d.date === '2030-01-22').periods).toBe(0)

    // คาบอังคารเดิมเลิกใช้แล้ว → ใส่คาบใหม่เวลาเดิมตั้งแต่ 16 ได้ · แต่ซ้อนช่วงเดิมไม่ได้
    expect((await add({ weekday: 2, start: '13:00', end: '13:50', validFrom: '2030-01-20' })).status).toBe(200)
    expect((await add({ weekday: 2, start: '13:00', end: '13:50', validFrom: '2030-01-10' })).status).toBe(409)
    // ตารางสอนแสดงทุกช่วง (หน้าเว็บกรองตามวันที่เลือก)
    const all = (await json(await getJson('/api/teacher/timetable', cookie))).slots
    expect(all.find((x: { id: string }) => x.id === oldId)).toMatchObject({ validFrom: '2030-01-01', validTo: '2030-01-15' })
    // เลิกใช้ก่อนวันเริ่ม = ลบทิ้ง
    const { id: future } = await json(await add({ weekday: 5, start: '08:30', end: '09:20', validFrom: '2030-03-01' }))
    expect(await json(await putJson(`/api/teacher/timetable/${future}/end`, { from: '2030-02-01' }, cookie))).toEqual({ result: 'deleted' })
  })
})

describe('สอนชดเชย', () => {
  it('ค้างชดเชย → นัดที่โรงเรียน (นับเดินทาง) + ออนไลน์ Meet (ไม่นับเดินทาง) → ครบ · วันหยุดราชการไม่ต้องชดเชย', async () => {
    const { cookie, a, a2, b } = await setup()
    const s1 = await seedStudent(db(), a2)
    const { id: cid } = await json(await postJson('/api/teacher/closures', { schoolId: a.schoolId, from: '2030-01-07', to: '2030-01-07', reason: 'school-event', note: 'กีฬาสี' }, { cookie }))
    const summary = async () => json(await getJson('/api/teacher/workload/makeup?from=2030-01-01&to=2030-01-31', cookie))
    let m = await summary()
    expect(m.closures[0]).toMatchObject({ id: cid, schoolName: 'ดรุณ', makeupNeeded: true })
    expect(m.closures[0].classes.map((c: { name: string; closed: number }) => [c.name, c.closed])).toEqual([
      ['ดรุณ ชั้น 1', 1],
      ['ดรุณ ชั้น 5', 2],
    ])
    expect(m.totals).toMatchObject({ closed: 3, madeUp: 0, owed: 3 })

    // ส. 12 ม.ค.: ม.5 ที่โรงเรียน 2 คาบ · ม.1 ออนไลน์ 1 คาบ (ประกาศให้นักเรียน พร้อมลิงก์ Meet)
    expect((await postJson('/api/teacher/makeups', { closureId: cid, classIds: [a.classId], date: '2030-01-12', start: '09:00', end: '10:40', mode: 'onsite' }, { cookie })).status).toBe(200)
    expect((await postJson('/api/teacher/makeups', { closureId: cid, classIds: [a2], date: '2030-01-12', start: '19:00', end: '19:50', mode: 'online', meetUrl: 'http://meet' }, { cookie })).status).toBe(400)
    const { ids } = await json(await postJson('/api/teacher/makeups', { closureId: cid, classIds: [a2], date: '2030-01-12', start: '19:00', end: '19:50', mode: 'online', meetUrl: 'https://meet.google.com/abc-defg-hij', notifyStudents: true }, { cookie }))
    const ann = await json(await getJson('/api/student/announcements', await studentCookie(s1.id)))
    expect(ann[0]).toMatchObject({ title: expect.stringContaining('สอนชดเชย'), body: expect.stringContaining('https://meet.google.com/abc-defg-hij') })

    const w = await json(await getJson('/api/teacher/workload?from=2030-01-12&to=2030-01-12', cookie))
    const sat = w.days[0]
    expect(sat.stops.map((s: { kind: string; makeup: { mode: string } }) => [s.kind, s.makeup.mode])).toEqual([
      ['makeup', 'onsite'],
      ['makeup', 'online'],
    ])
    expect(sat.stops[1].nav).toBe('https://meet.google.com/abc-defg-hij')
    expect([sat.periods, sat.trips]).toEqual([3, 1])
    expect(w.planned).toMatchObject({ makeupPeriods: 3, onlinePeriods: 1 })
    m = await summary()
    expect(m.totals).toMatchObject({ closed: 3, madeUp: 3, online: 1, owed: 0 })

    // ลบคาบชดเชยออนไลน์ → ประกาศหายด้วย · ค้าง 1
    await del(`/api/teacher/makeups/${ids[0]}`, cookie)
    expect(await json(await getJson('/api/student/announcements', await studentCookie(s1.id)))).toEqual([])
    expect((await summary()).totals.owed).toBe(1)
    // ไม่ต้องชดเชย
    await putJson(`/api/teacher/closures/${cid}/makeup`, { needed: false }, cookie)
    expect((await summary()).totals).toMatchObject({ owed: 0, notNeeded: 3 })

    // วันหยุดราชการ = ไม่ต้องชดเชยโดยปริยาย
    await postJson('/api/teacher/closures', { schoolId: b.schoolId, from: '2030-01-14', to: '2030-01-14', reason: 'holiday', note: '' }, { cookie })
    const h = (await summary()).closures.find((c: { schoolName: string }) => c.schoolName === 'บำรุงอิสลาม')
    expect(h).toMatchObject({ makeupNeeded: false })
    // ลบการปิด → คาบชดเชยที่สอนไปยังนับอยู่
    await del(`/api/teacher/closures/${cid}`, cookie)
    expect((await json(await getJson('/api/teacher/workload?from=2030-01-12&to=2030-01-12', cookie))).days[0].periods).toBe(2)
  })

  it('คาบชดเชยวันนี้: เตือนก่อนเข้าคาบ', async () => {
    const { cookie, a } = await setup()
    await postJson('/api/teacher/makeups', { closureId: null, classIds: [a.classId], date: '2030-01-12', start: '09:00', end: '10:40', mode: 'onsite' }, { cookie })
    await generateTeacherNotifications(db(), at('2030-01-12', '08:52'))
    const items = (await json(await getJson('/api/teacher/notifications', cookie))).items
    expect(items[0]).toMatchObject({ title: expect.stringMatching(/^⏰ อีก/), body: expect.stringContaining('ดรุณ ชั้น 5') })
  })
})

describe('ห้องที่เก็บถาวรแล้ว', () => {
  it('ยอดคาบ/การเดินทางก่อนวันเก็บถาวรยังนับห้องเก่า · หลังจากนั้นไม่นับ · ไม่อยู่ในเป้าคาบปัจจุบัน', async () => {
    const { cookie, a, a2 } = await setup()
    await env.DB.prepare(`UPDATE classes SET archived = 1, archived_on = '2030-01-08' WHERE school_id = ?`).bind(a.schoolId).run()
    expect([a.classId, a2].length).toBe(2)
    const w = await json(await getJson('/api/teacher/workload?from=2030-01-07&to=2030-01-14', cookie))
    const day = (d: string) => w.days.find((x: { date: string }) => x.date === d)
    expect(day('2030-01-07').stops.map((s: { name: string }) => s.name)).toEqual(['ดรุณ', 'บำรุงอิสลาม'])
    expect(day('2030-01-14').stops.map((s: { name: string }) => s.name)).toEqual(['บำรุงอิสลาม'])
    const tg = await json(await getJson('/api/teacher/workload/targets', cookie))
    expect(tg.schools.map((s: { name: string }) => s.name)).toEqual(['บำรุงอิสลาม'])
  })
})
