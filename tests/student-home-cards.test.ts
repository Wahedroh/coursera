import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb, newId, now } from '../src/server/db/client'
import { submissions } from '../src/server/db/schema'
import { openDay, setStatus } from '../src/server/attendance/service'
import { todayBangkok } from '../src/shared/attendance'
import { DEFAULT_BANDS } from '../src/shared/grades'
import { addDays } from '../src/shared/leave'
import { pointsForBands } from '../src/shared/studentHome'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedAssignment, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const weekday = (d: string) => ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1

it('คะแนนที่ต้องมีต่อเกรด (อิงกลุ่ม): แซงเพื่อนแต่ละคน', () => {
  // ห้อง 4 คน: เรา 10 · เพื่อน 20 30 40
  const r = pointsForBands(10, [20, 30, 40], [{ grade: '4', min: 76 }, { grade: '3', min: 51 }, { grade: '2', min: 26 }, { grade: '0', min: 0 }])
  expect(r).toEqual([
    { grade: '4', need: 40, gap: 30 }, // ต้องสูงสุด (100%)
    { grade: '3', need: 30, gap: 20 }, // 75%
    { grade: '2', need: 20, gap: 10 }, // 50% (เท่าคนที่ 2 ก็พอ)
  ])
})

it('หน้าแรกนักเรียน: คาบถัดไป + งานที่ครบกำหนดก่อนคาบ · เวลาเรียน (ป่วยไม่นับขาด) · เป้าหมายเกรด · ครูตอบงาน · งานซ่อม', async () => {
  const teacher = await loginTeacher()
  const { classId } = await seedClass(db(), { name: 'ห้องหน้าแรก ชั้น 4' })
  const me = await seedStudent(db(), classId, { firstName: 'มานี' })
  const others = [await seedStudent(db(), classId), await seedStudent(db(), classId), await seedStudent(db(), classId)]
  const sc = await studentCookie(me.id)
  const today = todayBangkok()

  // ยังไม่มีอะไร
  const empty = await json(await getJson('/api/student/home-cards', sc))
  expect(empty).toMatchObject({ next: null, target: null, feedback: [], remedials: [], attendance: { days: 0, pct: null } })

  // ตารางสอนวันนี้ทั้งวัน → กำลังเรียนอยู่ · งานครบกำหนดอีก 1 นาที ยังไม่ส่ง
  await postJson('/api/teacher/timetable', { classId, weekday: weekday(today), start: '00:00', end: '23:59' }, { cookie: teacher })
  await seedAssignment(classId, { title: 'ใบงานด่วน', dueAt: now() + 60_000 })

  // เช็กชื่อ 5 วัน: ขาด 1 ป่วย 1
  for (let d = 1; d <= 5; d++) {
    const day = await openDay(db(), classId, addDays(today, -d))
    if (d === 1) await setStatus(db(), day.day!.id, me.id, 'absent', 'teacher')
    if (d === 2) await setStatus(db(), day.day!.id, me.id, 'sick', 'teacher')
  }

  // งานตรวจแล้ว + คอมเมนต์ · เปิดให้ดูเกรด
  const a1 = await seedAssignment(classId, { title: 'ใบงานแรง', dueAt: now() - 86400_000 })
  await db().insert(submissions).values({ id: newId(), assignmentId: a1, studentId: me.id, status: 'graded', score: 4, comment: 'แสดงวิธีทำดีมาก', submittedAt: now(), gradedAt: now(), updatedAt: now() })
  for (const [i, o] of others.entries()) await db().insert(submissions).values({ id: newId(), assignmentId: a1, studentId: o.id, status: 'graded', score: 6 + i, submittedAt: now(), gradedAt: now(), updatedAt: now() })
  await putJson(`/api/teacher/classes/${classId}/grading`, { bands: DEFAULT_BANDS, visible: true }, teacher)
  await postJson('/api/teacher/remedials', { classId, studentIds: [me.id], reason: 'incomplete', title: 'งานซ่อม 1' }, { cookie: teacher })

  const c = await json(await getJson('/api/student/home-cards', sc))
  expect(c.next).toMatchObject({ now: true, online: false, due: [{ title: 'ใบงานด่วน' }] })
  expect(c.attendance).toMatchObject({ days: 5, absent: 1, sick: 1, pct: 80, left: 0, min: 80 })
  expect(c.target).toEqual(expect.objectContaining({ grade: '1' }))
  expect(c.target.total).toBeUndefined()
  expect(c.target.bands[0]).toEqual({ grade: '4', gap: 4, pct: 50 })
  expect(c.target.pending.map((p: { title: string }) => p.title)).toEqual(['ใบงานด่วน'])
  expect(c.feedback).toEqual([expect.objectContaining({ title: 'ใบงานแรง', status: 'graded', score: 4, maxScore: 10, comment: 'แสดงวิธีทำดีมาก' })])
  expect(c.remedials).toEqual([expect.objectContaining({ title: 'งานซ่อม 1', status: 'assigned' })])

  // ปิดโรงเรียนวันนี้ → คาบถัดไปเป็นสัปดาห์หน้า
  await postJson('/api/teacher/closures', { schoolId: null, from: today, to: today, reason: 'holiday' }, { cookie: teacher })
  const c2 = await json(await getJson('/api/student/home-cards', sc))
  expect(c2.next.now).toBe(false)
  expect(c2.next.start).toBe(Date.parse(`${addDays(today, 7)}T00:00:00+07:00`))
})
