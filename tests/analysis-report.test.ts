import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { openDay } from '../src/server/attendance/service'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedAssignment, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const DAY = 86400_000
/** วันที่ (เวลาไทย) ย้อนหลัง n สัปดาห์ จากวันจันทร์ที่ 2 พ.ย. 2026 */
const monday = (weeksAgo: number) => new Date(Date.UTC(2026, 10, 2) - weeksAgo * 7 * DAY).toISOString().slice(0, 10)

async function setup() {
  const teacher = await loginTeacher()
  const { classId } = await seedClass(db(), { name: 'ม.5/1' })
  const good = await seedStudent(db(), classId, { firstName: 'ฟ้าใส', zipgradeId: '34101', sortOrder: 1 })
  const risk = await seedStudent(db(), classId, { firstName: 'ภูมิ', zipgradeId: '34102', sortOrder: 2 })
  // มาเรียน 6 วัน (จันทร์ 4 ครั้ง) · ภูมิขาดทุกวันจันทร์
  const days: string[] = []
  for (let w = 0; w < 4; w++) days.push(monday(w))
  days.push('2026-11-03', '2026-11-04')
  for (const d of days) {
    const { day } = await openDay(db(), classId, d)
    if (new Date(`${d}T12:00:00+07:00`).getUTCDay() === 1) await putJson(`/api/teacher/attendance/${day!.id}/records/${risk.id}`, { status: 'absent' }, teacher)
  }
  // งาน 6 ชิ้น เลยกำหนดแล้ว · ฟ้าใสส่งครบตรงเวลา · ภูมิไม่ส่งเลย
  const sg = await studentCookie(good.id)
  for (let i = 0; i < 6; i++) {
    const id = await seedAssignment(classId, { title: `ใบงาน ${i + 1}`, maxScore: 10 + i, dueAt: Date.now() + DAY })
    await putJson(`/api/student/assignments/${id}/submission`, { text: 'ตอบ', imageKeys: [], clientRequestId: `g${i}` }, sg)
  }
  // กำหนดส่ง = หลังเวลาที่ฟ้าใสส่งเล็กน้อย (ตรงเวลา) และเลยไปแล้ว (ภูมิ = ค้าง)
  await new Promise((r) => setTimeout(r, 5))
  await env.DB.prepare(`UPDATE assignments SET due_at = (SELECT max(s.submitted_at) + 1 FROM submissions s WHERE s.assignment_id = assignments.id) WHERE class_id = ?`).bind(classId).run()
  // สอบ 3 ครั้ง: ภูมิลดลงต่อเนื่อง
  for (const [k, [g, r]] of [
    [90, 60],
    [92, 45],
    [95, 30],
  ].entries()) {
    const { ids } = await json(await postJson('/api/teacher/score-items', { title: `สอบบทที่ ${k + 1}`, category: 'quiz', maxScore: 100, takenOn: `2026-10-0${k + 1}`, classIds: [classId] }, { cookie: teacher }))
    await putJson(`/api/teacher/score-items/${ids[0]}/scores/${good.id}`, { score: g, absent: false, note: '' }, teacher)
    await putJson(`/api/teacher/score-items/${ids[0]}/scores/${risk.id}`, { score: r, absent: false, note: '' }, teacher)
    await putJson(`/api/teacher/score-items/${ids[0]}/published`, { published: k < 2 }, teacher)
  }
  return { teacher, classId, good, risk }
}

describe('วิเคราะห์นักเรียนรายคน', () => {
  it('จัดระดับ · ประเด็น (ขาดวันจันทร์ งานค้าง คะแนนลด) · สิ่งที่ครูควรเน้น · จุดแข็ง · เรียงคนต้องดูแลก่อน', async () => {
    const { teacher, classId } = await setup()
    const a = await json(await getJson(`/api/teacher/classes/${classId}/analysis`, teacher))
    expect(a.counts).toEqual({ urgent: 1, watch: 0, good: 1 })
    const [risk, good] = a.students
    expect(risk).toMatchObject({ name: expect.stringContaining('ภูมิ'), level: 'urgent', missing: 6, absent: 4, trend: 'down' })
    expect(risk.issues.join('\n')).toMatch(/ขาดเรียน 4 ครั้ง \(4 ครั้งเป็นวันจันทร์\)/)
    expect(risk.issues.join('\n')).toMatch(/งานค้าง 6 ชิ้น/)
    expect(risk.issues.join('\n')).toMatch(/คะแนนสอบลดลงต่อเนื่อง 2 ครั้ง|คะแนนต่ำกว่าห้องชัดเจน/)
    expect(risk.focus.join('\n')).toMatch(/ติดตามสาเหตุที่ขาดวันจันทร์บ่อย/)
    expect(risk.focus.join('\n')).toMatch(/ใบงาน 6 \(15\) · ใบงาน 5 \(14\) · ใบงาน 4 \(13\)/)
    expect(good).toMatchObject({ level: 'good', missing: 0, attendancePct: 100 })
    expect(good.strengths.join('\n')).toMatch(/ส่งงานครบและตรงเวลาทุกชิ้น/)
    expect(good.focus.join('\n')).toMatch(/โจทย์ท้าทาย/)
    expect((await getJson(`/api/teacher/classes/${classId}/analysis`, await studentCookie(good.id))).status).toBe(401)
  })

  it('โน้ตครูบันทึกได้ และขึ้นในการวิเคราะห์', async () => {
    const { teacher, classId, risk } = await setup()
    expect((await putJson(`/api/teacher/students/${risk.id}/note`, { note: '  นัดคุยผู้ปกครอง  ' }, teacher)).status).toBe(200)
    const a = await json(await getJson(`/api/teacher/classes/${classId}/analysis`, teacher))
    expect(a.students.find((s: { id: string }) => s.id === risk.id).note).toBe('นัดคุยผู้ปกครอง')
  })
})

describe('ใบสรุปผลปลายเทอม', () => {
  it('ครูยังไม่เปิด = นักเรียนไม่เห็น · เปิดแล้วได้ข้อมูลของตัวเอง · คะแนนสอบที่ยังไม่เผยแพร่ไม่แสดง · ตัวเลือกซ่อนเกรด/อันดับ/ความเห็น', async () => {
    const { teacher, classId, good, risk } = await setup()
    const sg = await studentCookie(good.id)
    expect(await json(await getJson('/api/student/report-card', sg))).toEqual({ available: false })
    await putJson(`/api/teacher/students/${good.id}/note`, { note: 'ตั้งใจเรียนดีมาก' }, teacher)
    const rel = await json(await putJson(`/api/teacher/classes/${classId}/report-release`, { released: true, showGrade: true, showRank: true, showComment: true }, teacher))
    expect(rel).toMatchObject({ released: true, releasedAt: expect.any(Number) })

    const r = await json(await getJson('/api/student/report-card', sg))
    expect(r.available).toBe(true)
    expect(r.card.student).toMatchObject({ id: good.id, zipgradeId: '34101' })
    expect(r.card.assignments).toHaveLength(6)
    expect(r.card.exams.map((e: { title: string }) => e.title)).toEqual(['สอบบทที่ 1', 'สอบบทที่ 2'])
    expect(r.card.total).toMatchObject({ rank: 1, of: 2 })
    expect(r.card.total.grade).not.toBeNull()
    expect(r.card.comment).toBe('ตั้งใจเรียนดีมาก')
    expect(r.card.attendance).toMatchObject({ present: 6, absent: 0, pct: 100 })
    // อีกคนเห็นของตัวเอง
    expect((await json(await getJson('/api/student/report-card', await studentCookie(risk.id)))).card.student.id).toBe(risk.id)

    await putJson(`/api/teacher/classes/${classId}/report-release`, { released: true, showGrade: false, showRank: false, showComment: false }, teacher)
    const r2 = (await json(await getJson('/api/student/report-card', sg))).card
    expect(r2.total).toMatchObject({ grade: null, rank: null })
    expect(r2.comment).toBeNull()
    await putJson(`/api/teacher/classes/${classId}/report-release`, { released: false }, teacher)
    expect(await json(await getJson('/api/student/report-card', sg))).toEqual({ available: false })
  })

  it('ครูดูใบสรุปผลทั้งห้องได้ (พิมพ์รวด) แม้ยังไม่เปิดให้นักเรียน · นักเรียนเรียกไม่ได้', async () => {
    const { teacher, classId, good } = await setup()
    const all = await json(await getJson(`/api/teacher/classes/${classId}/report-cards`, teacher))
    expect(all.release.released).toBe(false)
    expect(all.cards.map((c: { student: { zipgradeId: string } }) => c.student.zipgradeId)).toEqual(['34101', '34102'])
    expect((await getJson(`/api/teacher/classes/${classId}/report-cards`, await studentCookie(good.id))).status).toBe(401)
  })
})
