import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { todayBangkok } from '../../shared/attendance'
import { attendancePct, MIN_ATTENDANCE_PCT, type AtRisk, type AtRiskCounts, type AtRiskStudent, type RemedialInput, type RemedialItem, type RiskReason } from '../../shared/remedial'
import { newId, type Db } from '../db/client'
import { classes, remedials, students } from '../db/schema'
import { allClassGrades } from '../grades/service'
import { apiError } from '../http'
import { enqueue } from '../push/service'
import { notifyTeacher } from '../teacherNotify/service'
import { termWindow } from '../terms/service'

const cols = {
  id: remedials.id,
  studentId: remedials.studentId,
  reason: remedials.reason,
  title: remedials.title,
  instructions: remedials.instructions,
  dueAt: remedials.dueAt,
  status: remedials.status,
  text: remedials.text,
  imageKeys: remedials.imageKeys,
  submittedAt: remedials.submittedAt,
  comment: remedials.comment,
  resultGrade: remedials.resultGrade,
  createdAt: remedials.createdAt,
}

type Base = { classId: string; id: string; zipgradeId: string; name: string; grade: string | null; days: number; absent: number; titles: string[] }

/** ข้อมูลเฝ้าระวังของนักเรียนทุกห้อง (หรือห้องเดียว) ในเทอมปัจจุบัน — คำสั่งรวมไม่กี่คำสั่ง (D1 จำกัด 50 คำสั่ง/คำขอ) */
async function base(db: Db, t: number, classId?: string): Promise<Base[]> {
  const { start } = await termWindow(db)
  const from = todayBangkok(start)
  const only = classId ? sql`AND st.class_id = ${classId}` : sql``
  const roster = await db.all<{ id: string; classId: string; zipgradeId: string; title: string | null; firstName: string; lastName: string }>(sql`
    SELECT st.id, st.class_id AS classId, st.zipgrade_id AS zipgradeId, st.title, st.first_name AS firstName, st.last_name AS lastName
    FROM students st JOIN classes c ON c.id = st.class_id WHERE st.active = 1 AND c.archived = 0 ${only} ORDER BY st.sort_order, st.zipgrade_id`)
  // ขาดเท่านั้นที่ลดเวลาเรียน (ป่วย/ลาที่ครูบันทึกหรืออนุมัติไม่นับขาด)
  const att = await db.all<{ studentId: string; days: number; absent: number }>(sql`
    SELECT r.student_id AS studentId, count(*) AS days, sum(r.status = 'absent') AS absent
    FROM attendance_records r JOIN attendance_days d ON d.id = r.day_id JOIN students st ON st.id = r.student_id
    WHERE d.date >= ${from} AND d.class_id = st.class_id ${only} GROUP BY r.student_id`)
  // งานไม่ครบ: งานที่เผยแพร่แล้วเลยกำหนด แต่ยังไม่ส่ง / ครูส่งกลับให้แก้ / ครูบันทึกว่าไม่ส่ง
  const missing = await db.all<{ studentId: string; title: string }>(sql`
    SELECT st.id AS studentId, a.title FROM students st
    JOIN assignments a ON a.class_id = st.class_id
    LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = st.id
    WHERE st.active = 1 ${only} AND a.published = 1 AND a.created_at >= ${start} AND a.due_at IS NOT NULL AND a.due_at < ${t} AND (s.id IS NULL OR s.status = 'returned')
    ORDER BY a.due_at`)
  const grades = await allClassGrades(db)
  const attBy = new Map(att.map((a) => [a.studentId, a]))
  const missBy = new Map<string, string[]>()
  for (const m of missing) (missBy.get(m.studentId) ?? missBy.set(m.studentId, []).get(m.studentId)!).push(m.title)
  return roster.map((s) => ({
    classId: s.classId,
    id: s.id,
    zipgradeId: s.zipgradeId,
    name: `${s.title ?? ''}${s.firstName} ${s.lastName}`.trim(),
    grade: grades.get(s.classId)?.get(s.id) ?? null,
    days: attBy.get(s.id)?.days ?? 0,
    absent: attBy.get(s.id)?.absent ?? 0,
    titles: missBy.get(s.id) ?? [],
  }))
}

function flagsOf(b: Base): RiskReason[] {
  const f: RiskReason[] = []
  if (b.grade === '0') f.push('zero')
  if (b.titles.length > 0) f.push('incomplete')
  const pct = attendancePct(b.days, b.absent)
  if (pct !== null && pct < MIN_ATTENDANCE_PCT) f.push('attendance')
  return f
}

/** รายชื่อเฝ้าระวังของห้อง: ติด 0/ร/มส หรือมีงานซ่อม */
export async function atRisk(db: Db, classId: string, t: number): Promise<AtRisk> {
  const [c] = await db.select({ id: classes.id, name: classes.name }).from(classes).where(eq(classes.id, classId))
  if (!c) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  const rows = await base(db, t, classId)
  const rems = await db.select(cols).from(remedials).where(eq(remedials.classId, classId)).orderBy(desc(remedials.createdAt))
  const remBy = new Map<string, RemedialItem[]>()
  for (const r of rems) (remBy.get(r.studentId) ?? remBy.set(r.studentId, []).get(r.studentId)!).push(r)
  const out: AtRiskStudent[] = []
  for (const b of rows) {
    const flags = flagsOf(b)
    const mine = remBy.get(b.id) ?? []
    if (!flags.length && !mine.length) continue
    out.push({
      id: b.id,
      zipgradeId: b.zipgradeId,
      name: b.name,
      flags,
      grade: b.grade,
      attendance: { days: b.days, absent: b.absent, pct: attendancePct(b.days, b.absent) },
      incomplete: { count: b.titles.length, titles: b.titles },
      remedials: mine,
    })
  }
  return { class: c, total: rows.length, students: out }
}

/** จำนวนต่อห้อง (หน้าภาพรวมเมนูครู) */
export async function atRiskCounts(db: Db, t: number): Promise<Map<string, AtRiskCounts>> {
  const rows = await base(db, t)
  const rem = await db.all<{ classId: string; open: number; passed: number }>(sql`
    SELECT class_id AS classId, sum(status != 'passed') AS open, sum(status = 'passed') AS passed FROM remedials GROUP BY class_id`)
  const out = new Map<string, AtRiskCounts>()
  for (const b of rows) {
    const c = out.get(b.classId) ?? out.set(b.classId, { zero: 0, incomplete: 0, attendance: 0, remedialOpen: 0, remedialPassed: 0 }).get(b.classId)!
    for (const f of flagsOf(b)) c[f]++
  }
  for (const r of rem) {
    const c = out.get(r.classId)
    if (c) Object.assign(c, { remedialOpen: r.open, remedialPassed: r.passed })
  }
  return out
}

export async function createRemedials(db: Db, input: RemedialInput, t: number): Promise<{ created: number }> {
  const members = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.classId, input.classId), inArray(students.id, input.studentIds), eq(students.active, true)))
  if (members.length !== new Set(input.studentIds).size) throw apiError('student_not_found', 'มีนักเรียนที่ไม่อยู่ในห้องนี้', 400)
  const rows = members.map((s) => ({ id: newId(), classId: input.classId, studentId: s.id, reason: input.reason, title: input.title, instructions: input.instructions, dueAt: input.dueAt, createdAt: t, updatedAt: t }))
  for (let i = 0; i < rows.length; i += 6) await db.insert(remedials).values(rows.slice(i, i + 6))
  await enqueue(db, rows.map((r) => ({ studentId: r.studentId, title: `📝 งานซ่อม: ${input.title}`, body: 'ทำแล้วส่งในแอปได้เลย', url: `/me/remedial/${r.id}` })), t)
  return { created: rows.length }
}

export async function decideRemedial(db: Db, id: string, d: { pass: boolean; resultGrade: string | null; comment: string }, t: number): Promise<void> {
  const [r] = await db.select({ studentId: remedials.studentId, title: remedials.title }).from(remedials).where(eq(remedials.id, id))
  if (!r) throw apiError('remedial_not_found', 'ไม่พบงานซ่อม', 404)
  await db
    .update(remedials)
    .set(d.pass ? { status: 'passed', resultGrade: d.resultGrade, comment: d.comment, decidedAt: t, updatedAt: t } : { status: 'returned', comment: d.comment, decidedAt: t, updatedAt: t })
    .where(eq(remedials.id, id))
  await enqueue(db, [{ studentId: r.studentId, title: d.pass ? `✅ งานซ่อมผ่านแล้ว: ${r.title}` : `↩️ ครูส่งงานซ่อมกลับให้แก้: ${r.title}`, body: d.comment, url: `/me/remedial/${id}` }], t)
}

export async function deleteRemedial(db: Db, id: string): Promise<void> {
  const res = await db.delete(remedials).where(eq(remedials.id, id)).returning({ id: remedials.id })
  if (!res.length) throw apiError('remedial_not_found', 'ไม่พบงานซ่อม', 404)
}

// ---------- ฝั่งนักเรียน ----------
export async function studentRemedials(db: Db, studentId: string): Promise<RemedialItem[]> {
  return db.select(cols).from(remedials).where(eq(remedials.studentId, studentId)).orderBy(desc(remedials.createdAt))
}

export async function getStudentRemedial(db: Db, studentId: string, id: string): Promise<RemedialItem> {
  const [r] = await db.select(cols).from(remedials).where(and(eq(remedials.id, id), eq(remedials.studentId, studentId)))
  if (!r) throw apiError('remedial_not_found', 'ไม่พบงานซ่อม', 404)
  return r
}

export async function submitRemedial(db: Db, studentId: string, id: string, input: { text: string; imageKeys: string[] }, t: number): Promise<RemedialItem> {
  const r = await getStudentRemedial(db, studentId, id)
  if (r.status === 'passed') throw apiError('remedial_passed', 'งานซ่อมนี้ผ่านแล้ว', 409)
  if (input.imageKeys.some((k) => !k.startsWith(`sub/${studentId}/`))) throw apiError('invalid_image', 'รูปไม่ถูกต้อง', 400)
  if (!input.text.trim() && !input.imageKeys.length) throw apiError('empty_submission', 'กรุณาพิมพ์คำตอบหรือแนบรูปอย่างน้อย 1 รูป', 400)
  await db.update(remedials).set({ status: 'submitted', text: input.text, imageKeys: input.imageKeys, submittedAt: t, updatedAt: t }).where(eq(remedials.id, id))
  const [st] = await db.select({ firstName: students.firstName, lastName: students.lastName, classId: students.classId }).from(students).where(eq(students.id, studentId))
  await notifyTeacher(db, { kind: 'remedial', title: `📝 ส่งงานซ่อม: ${st?.firstName ?? ''} ${st?.lastName ?? ''} · ${r.title}`, url: `/teacher/classes/${st?.classId}/at-risk` }, t)
  return getStudentRemedial(db, studentId, id)
}
