import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb, newId, now } from '../src/server/db/client'
import { submissions } from '../src/server/db/schema'
import { openDay, setStatus } from '../src/server/attendance/service'
import { absencesLeft, attendancePct } from '../src/shared/remedial'
import { del, getJson, json, loginTeacher, postJson, putJson, resetDb, seedAssignment, seedClass, seedStudent, studentCookie, TINY_JPEG, uploadFile } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

it('% เวลาเรียน: ขาดเท่านั้นที่ลด · ขาดได้อีกกี่ครั้ง', () => {
  expect(attendancePct(0, 0)).toBeNull()
  expect(attendancePct(10, 2)).toBe(80)
  expect(attendancePct(30, 4)).toBe(86.7)
  expect(absencesLeft(30, 4)).toBe(2) // 26/32 = 81.25% · 26/33 = 78.8%
  expect(absencesLeft(10, 2)).toBe(0)
  expect(absencesLeft(10, 5)).toBe(0)
})

async function setup() {
  const teacher = await loginTeacher()
  const { classId } = await seedClass(db(), { name: 'ห้องซ่อม ชั้น 3' })
  const ss = []
  for (let i = 0; i < 7; i++) ss.push(await seedStudent(db(), classId, { firstName: `คน${i}`, lastName: 'ทดสอบ', sortOrder: i }))
  // งานที่ตรวจแล้ว: คน0 ได้น้อยสุด → เกรด 0 (อิงกลุ่ม 7 คน)
  const graded = await seedAssignment(classId, { title: 'ใบงานตรวจแล้ว', dueAt: now() - 86400_000 })
  for (const [i, s] of ss.entries())
    await db().insert(submissions).values({ id: newId(), assignmentId: graded, studentId: s.id, status: 'graded', score: i + 1, submittedAt: now(), gradedAt: now(), updatedAt: now() })
  // งานเลยกำหนด: คน1 ไม่ส่ง → ร
  const late = await seedAssignment(classId, { title: 'ใบงานค้าง', dueAt: now() - 3600_000 })
  for (const s of ss.filter((_, i) => i !== 1)) await db().insert(submissions).values({ id: newId(), assignmentId: late, studentId: s.id, status: 'submitted', submittedAt: now(), updatedAt: now() })
  // เช็กชื่อ 5 วัน: คน2 ขาด 2 (60%) → มส · คน3 ป่วย 2 (ไม่นับขาด)
  for (let d = 1; d <= 5; d++) {
    const date = new Date(Date.now() - d * 86400_000 + 7 * 3600_000).toISOString().slice(0, 10)
    const day = await openDay(db(), classId, date)
    if (d <= 2) {
      await setStatus(db(), day.day!.id, ss[2].id, 'absent', 'teacher')
      await setStatus(db(), day.day!.id, ss[3].id, 'sick', 'teacher')
    }
  }
  return { teacher, classId, ss }
}

it('รายชื่อเฝ้าระวัง: 0 · ร · มส (ป่วยไม่นับขาด) → สั่งงานซ่อมเฉพาะคน → นักเรียนส่ง → ครูส่งกลับ/ผ่าน พร้อมผลหลังซ่อม', async () => {
  const { teacher, classId, ss } = await setup()
  const r = await json(await getJson(`/api/teacher/classes/${classId}/at-risk`, teacher))
  expect(r.total).toBe(7)
  const by = Object.fromEntries(r.students.map((s: { id: string; flags: string[] }) => [s.id, s]))
  expect(by[ss[0].id].flags).toEqual(['zero'])
  expect(by[ss[1].id].flags).toEqual(['incomplete'])
  expect(by[ss[1].id].incomplete.titles).toEqual(['ใบงานค้าง'])
  expect(by[ss[2].id].flags).toEqual(['attendance'])
  expect(by[ss[2].id].attendance).toEqual({ days: 5, absent: 2, pct: 60 })
  expect(by[ss[3].id]).toBeUndefined()
  expect(r.students).toHaveLength(3)

  // สั่งงานซ่อมให้ คน0 คนเดียว → คนอื่นไม่เห็น
  const res = await postJson('/api/teacher/remedials', { classId, studentIds: [ss[0].id], reason: 'zero', title: 'งานซ่อมบทที่ 1', instructions: 'ทำแบบฝึกหัด 10 ข้อ' }, { cookie: teacher })
  expect(res.status).toBe(201)
  const s0 = await studentCookie(ss[0].id)
  const s4 = await studentCookie(ss[4].id)
  expect(await json(await getJson('/api/student/remedials', s4))).toEqual([])
  const [mine] = await json(await getJson('/api/student/remedials', s0))
  expect(mine).toMatchObject({ title: 'งานซ่อมบทที่ 1', status: 'assigned', reason: 'zero' })
  expect((await getJson(`/api/student/remedials/${mine.id}`, s4)).status).toBe(404)
  const box = await json(await getJson('/api/student/push/notifications', s0))
  expect(box.items[0]).toMatchObject({ title: '📝 งานซ่อม: งานซ่อมบทที่ 1', url: `/me/remedial/${mine.id}` })

  // ส่งงาน (รูปของตัวเอง) → ครูได้แจ้งเตือน
  expect((await putJson(`/api/student/remedials/${mine.id}/submission`, { text: '', imageKeys: [] }, s0)).status).toBe(400)
  const other = (await json(await uploadFile('kind=submission', TINY_JPEG, 'image/jpeg', s4))).key
  expect((await putJson(`/api/student/remedials/${mine.id}/submission`, { text: 'x', imageKeys: [other] }, s0)).status).toBe(400)
  const { key } = await json(await uploadFile('kind=submission', TINY_JPEG, 'image/jpeg', s0))
  const sub = await json(await putJson(`/api/student/remedials/${mine.id}/submission`, { text: 'คำตอบ', imageKeys: [key] }, s0))
  expect(sub.status).toBe('submitted')
  const tbox = await json(await getJson('/api/teacher/notifications', teacher))
  expect(tbox.items[0].title).toMatch(/^📝 ส่งงานซ่อม: คน0 ทดสอบ/)

  // ส่งกลับ → แก้ → ผ่าน (ต้องเลือกผลหลังซ่อม)
  await putJson(`/api/teacher/remedials/${mine.id}/decision`, { pass: false, comment: 'ข้อ 3 ยังผิด' }, teacher)
  expect((await json(await getJson(`/api/student/remedials/${mine.id}`, s0))).status).toBe('returned')
  await putJson(`/api/student/remedials/${mine.id}/submission`, { text: 'แก้แล้ว', imageKeys: [key] }, s0)
  expect((await putJson(`/api/teacher/remedials/${mine.id}/decision`, { pass: true, comment: '' }, teacher)).status).toBe(400)
  await putJson(`/api/teacher/remedials/${mine.id}/decision`, { pass: true, resultGrade: '1', comment: 'ผ่าน' }, teacher)
  const after = await json(await getJson(`/api/teacher/classes/${classId}/at-risk`, teacher))
  const row = after.students.find((s: { id: string }) => s.id === ss[0].id)
  expect(row.remedials[0]).toMatchObject({ status: 'passed', resultGrade: '1', text: 'แก้แล้ว' })
  expect((await putJson(`/api/student/remedials/${mine.id}/submission`, { text: 'อีก', imageKeys: [] }, s0)).status).toBe(409)

  // หน้าภาพรวม
  const ov = await json(await getJson('/api/teacher/overview/at-risk', teacher))
  expect(ov.classes.find((c: { classId: string }) => c.classId === classId).stat).toBe('มส 1 · ร 1 · 0: 1 · งานซ่อมผ่าน 1/1')

  // ลบได้ · นักเรียนห้องอื่นสั่งไม่ได้
  expect((await del(`/api/teacher/remedials/${mine.id}`, teacher)).status).toBe(200)
  const { classId: other2 } = await seedClass(db())
  const x = await seedStudent(db(), other2)
  expect((await postJson('/api/teacher/remedials', { classId, studentIds: [x.id], reason: 'zero', title: 'x' }, { cookie: teacher })).status).toBe(400)
  expect((await getJson(`/api/teacher/classes/${classId}/at-risk`, s0)).status).toBe(401)
})
