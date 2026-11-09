import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { type AssignmentInput, type AssignmentSummary, type Gradebook, type StudentAssignment, type StudentStatus, type SubmissionInput } from '../../shared/assignments'
import { lateExp } from '../../shared/points'
import { newId, now, type Db } from '../db/client'
import { assignments, classes, notifications, pointEvents, students, submissions } from '../db/schema'
import { removeFiles } from '../storage/service'
import { apiError } from '../http'
import { termWindow } from '../terms/service'
import type { TermWindow } from '../../shared/terms'

/** งานของเทอม = งานที่สร้างในช่วงเทอมนั้น */
const asgInTerm = (w: TermWindow) => and(gte(assignments.createdAt, w.start), lt(assignments.createdAt, w.end))

export const assignmentNotFound = () => apiError('assignment_not_found', 'ไม่พบงานนี้', 404)

export async function createAssignments(db: Db, classIds: string[], input: AssignmentInput): Promise<string[]> {
  const unique = [...new Set(classIds)]
  const found = await db.select({ id: classes.id }).from(classes).where(inArray(classes.id, unique))
  if (found.length !== unique.length) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  const t = now()
  const rows = unique.map((classId) => ({ id: newId(), classId, ...input, createdAt: t, updatedAt: t }))
  for (const r of rows) await db.insert(assignments).values(r)
  return rows.map((r) => r.id)
}

export async function listForClass(db: Db, classId: string, win?: TermWindow): Promise<AssignmentSummary[]> {
  const w = win ?? (await termWindow(db))
  const rows = await db
    .select({
      id: assignments.id,
      title: assignments.title,
      dueAt: assignments.dueAt,
      maxScore: assignments.maxScore,
      submitMode: assignments.submitMode,
      createdAt: assignments.createdAt,
    })
    .from(assignments)
    .where(and(eq(assignments.classId, classId), asgInTerm(w)))
  if (rows.length === 0) return []
  const counts = await db
    .select({ assignmentId: submissions.assignmentId, status: submissions.status, n: sql<number>`count(*)` })
    .from(submissions)
    .innerJoin(students, eq(submissions.studentId, students.id))
    .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
    // กรองด้วยห้อง ไม่ใช่ list ของ id — D1 รับตัวแปรได้ไม่เกิน 100 ตัวต่อคำสั่ง
    .where(and(eq(assignments.classId, classId), asgInTerm(w), eq(students.classId, classId), eq(students.active, true)))
    .groupBy(submissions.assignmentId, submissions.status)
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(students)
    .where(and(eq(students.classId, classId), eq(students.active, true)))
  return rows
    .sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.createdAt - b.createdAt)
    .map(({ createdAt: _c, ...r }) => {
      const c: Record<StudentStatus, number> = { submitted: 0, late: 0, graded: 0, returned: 0, missing: 0 }
      for (const x of counts) if (x.assignmentId === r.id) c[x.status] = x.n
      c.missing = total - c.submitted - c.late - c.graded - c.returned
      return { ...r, counts: c }
    })
}

export async function getAssignment(db: Db, id: string) {
  const [row] = await db.select().from(assignments).where(eq(assignments.id, id))
  if (!row) throw assignmentNotFound()
  return row
}

export async function updateAssignment(db: Db, id: string, input: AssignmentInput): Promise<void> {
  await getAssignment(db, id)
  await db.update(assignments).set({ ...input, updatedAt: now() }).where(eq(assignments.id, id))
}

/** ลบงาน — ถ้ามีนักเรียนส่งแล้วต้องยืนยัน (force) จึงลบพร้อมงานที่ส่ง รูป คะแนน และ EXP ที่ได้จากงานนี้ — กู้คืนไม่ได้ */
export async function deleteAssignment(db: Db, bucket: R2Bucket, id: string, force = false): Promise<{ removedSubmissions: number }> {
  await getAssignment(db, id)
  const subs = await db.select({ id: submissions.id, imageKeys: submissions.imageKeys, annotatedKeys: submissions.annotatedKeys }).from(submissions).where(eq(submissions.assignmentId, id))
  if (subs.length && !force) throw apiError('has_submissions', `มีนักเรียนส่งงานนี้แล้ว ${subs.length} คน`, 409)
  const ids = subs.map((x) => x.id)
  for (let i = 0; i < ids.length; i += 90)
    await db.delete(pointEvents).where(and(eq(pointEvents.source, 'assignment'), inArray(pointEvents.refId, ids.slice(i, i + 90))))
  await db.batch([
    db.delete(submissions).where(eq(submissions.assignmentId, id)),
    db.delete(notifications).where(eq(notifications.url, `/me/assignments/${id}`)),
    db.delete(assignments).where(eq(assignments.id, id)),
  ])
  // รูปงานที่ส่ง/รูปที่ครูเขียนทับ — ลบหลังลบข้อมูลแล้ว
  await removeFiles(db, bucket, subs.flatMap((x) => [...x.imageKeys, ...x.annotatedKeys]))
  return { removedSubmissions: subs.length }
}

const PENDING: StudentStatus[] = ['missing', 'returned']

/** งานของเทอมปัจจุบัน (งานเทอมก่อนไม่แสดงในรายการ) */
export async function listForStudent(db: Db, studentId: string, classId: string): Promise<StudentAssignment[]> {
  const w = await termWindow(db)
  const rows = await db
    .select({ a: assignments, s: submissions })
    .from(assignments)
    .leftJoin(submissions, and(eq(submissions.assignmentId, assignments.id), eq(submissions.studentId, studentId)))
    .where(and(eq(assignments.classId, classId), eq(assignments.published, true), asgInTerm(w)))
  return rows
    .map(({ a, s }) => toStudentAssignment(a, s))
    .sort((x, y) => {
      const px = PENDING.includes(x.status) ? 0 : 1
      const py = PENDING.includes(y.status) ? 0 : 1
      return px - py || (x.dueAt ?? Infinity) - (y.dueAt ?? Infinity)
    })
}

export async function getForStudent(db: Db, id: string, studentId: string, classId: string): Promise<StudentAssignment> {
  const [row] = await db
    .select({ a: assignments, s: submissions })
    .from(assignments)
    .leftJoin(submissions, and(eq(submissions.assignmentId, assignments.id), eq(submissions.studentId, studentId)))
    .where(and(eq(assignments.id, id), eq(assignments.classId, classId), eq(assignments.published, true)))
  if (!row) throw assignmentNotFound()
  return toStudentAssignment(row.a, row.s)
}

function toStudentAssignment(a: typeof assignments.$inferSelect, s: typeof submissions.$inferSelect | null): StudentAssignment {
  return {
    id: a.id,
    title: a.title,
    instructions: a.instructions,
    attachmentKeys: a.attachmentKeys,
    dueAt: a.dueAt,
    maxScore: a.maxScore,
    submitMode: a.submitMode,
    status: s ? s.status : 'missing',
    submission: s
      ? { text: s.text, imageKeys: s.imageKeys, annotatedKeys: s.annotatedKeys, score: s.score, comment: s.comment, submittedAt: s.submittedAt, imagesPurged: s.imagesPurgedAt !== null, onPaper: s.onPaper }
      : null,
  }
}

export async function upsertSubmission(
  db: Db,
  p: { assignmentId: string; studentId: string; classId: string; input: SubmissionInput; now: number },
): Promise<StudentAssignment> {
  const a = await getForStudent(db, p.assignmentId, p.studentId, p.classId)
  const { text, imageKeys, clientRequestId } = p.input
  const hasText = text.trim().length > 0
  const hasImages = imageKeys.length > 0
  const ok = a.submitMode === 'text' ? hasText : a.submitMode === 'image' ? hasImages : hasText || hasImages
  if (!ok) throw apiError('empty_submission', 'กรุณาใส่ข้อความหรือรูปงาน', 400)
  if (imageKeys.some((k) => !k.startsWith(`sub/${p.studentId}/`))) throw apiError('invalid_image', 'รูปไม่ถูกต้อง กรุณาอัปโหลดใหม่', 400)

  const [existing] = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.assignmentId, p.assignmentId), eq(submissions.studentId, p.studentId)))
  if (existing?.clientRequestId === clientRequestId) return a
  if (existing?.status === 'graded') throw apiError('already_graded', 'ครูตรวจแล้ว แก้ไขไม่ได้', 409)

  const status: 'late' | 'submitted' = a.dueAt !== null && p.now > a.dueAt ? 'late' : 'submitted'
  // ส่งใหม่ (รวมหลังครูส่งกลับ) = งานชิ้นใหม่: ล้างผลตรวจเดิม ไม่ให้ครูเห็นรูปที่ตรวจไว้รอบก่อน
  const values = { text, imageKeys, status, submittedAt: p.now, clientRequestId, updatedAt: p.now, annotatedKeys: [], score: null, gradedAt: null, onPaper: false }
  if (existing) {
    await db.update(submissions).set(values).where(eq(submissions.id, existing.id))
  } else {
    await db
      .insert(submissions)
      .values({ id: newId(), assignmentId: p.assignmentId, studentId: p.studentId, ...values })
      .onConflictDoNothing()
  }
  return getForStudent(db, p.assignmentId, p.studentId, p.classId)
}

export async function gradebook(db: Db, classId: string, win?: TermWindow): Promise<Gradebook> {
  const [cls] = await db.select({ id: classes.id, name: classes.name }).from(classes).where(eq(classes.id, classId))
  if (!cls) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  const w = win ?? (await termWindow(db))
  const list = (await listForClass(db, classId, w)).map(({ id, title, dueAt, maxScore }) => ({ id, title, dueAt, maxScore }))
  const roster = await db
    .select({ id: students.id, zipgradeId: students.zipgradeId, title: students.title, firstName: students.firstName, lastName: students.lastName })
    .from(students)
    .where(and(eq(students.classId, classId), eq(students.active, true)))
    .orderBy(students.sortOrder, students.zipgradeId)
  const subs = list.length
    ? await db
        .select({ id: submissions.id, assignmentId: submissions.assignmentId, studentId: submissions.studentId, status: submissions.status, score: submissions.score, onPaper: submissions.onPaper })
        .from(submissions)
        .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
        .where(and(eq(assignments.classId, classId), asgInTerm(w)))
    : []
  const byKey = new Map(subs.map((s) => [`${s.studentId}|${s.assignmentId}`, s]))
  return {
    class: cls,
    assignments: list,
    students: roster.map((st) => ({
      ...st,
      cells: Object.fromEntries(
        list.map((a) => {
          const s = byKey.get(`${st.id}|${a.id}`)
          return [a.id, s ? { status: s.status, score: s.score, submissionId: s.id, onPaper: s.onPaper } : { status: 'missing' as const, score: null, submissionId: null }]
        }),
      ),
    })),
  }
}

export const submissionNotFound = () => apiError('submission_not_found', 'ไม่พบงานที่ส่ง', 404)

export async function getSubmission(db: Db, id: string) {
  const [row] = await db
    .select({ s: submissions, a: assignments, st: students })
    .from(submissions)
    .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
    .innerJoin(students, eq(submissions.studentId, students.id))
    .where(eq(submissions.id, id))
  if (!row) throw submissionNotFound()
  const order = await db
    .select({ id: submissions.id })
    .from(submissions)
    .innerJoin(students, eq(submissions.studentId, students.id))
    .where(and(eq(submissions.assignmentId, row.a.id), eq(students.classId, row.a.classId)))
    .orderBy(students.sortOrder, students.zipgradeId)
  const i = order.findIndex((o) => o.id === id)
  const { pinHash: _p, failedAttempts: _f, lockedUntil: _l, ...student } = row.st
  return {
    submission: row.s,
    assignment: row.a,
    student,
    neighbors: { prevId: order[i - 1]?.id ?? null, nextId: order[i + 1]?.id ?? null },
  }
}

export async function gradeSubmission(
  db: Db,
  id: string,
  input: { score: number; comment: string; annotatedKeys: string[] },
  t: number,
): Promise<void> {
  const { submission, assignment } = await getSubmission(db, id)
  if (!(input.score >= 0 && input.score <= assignment.maxScore)) {
    throw apiError('invalid_score', `คะแนนต้องอยู่ระหว่าง 0 ถึง ${assignment.maxScore}`, 400)
  }
  if (input.annotatedKeys.some((k) => !k.startsWith(`ann/${id}/`))) throw apiError('invalid_image', 'รูปไม่ถูกต้อง กรุณาบันทึกใหม่', 400)
  const late = assignment.dueAt !== null && submission.submittedAt > assignment.dueAt
  await db.batch([
    db
      .update(submissions)
      .set({ status: 'graded', score: input.score, comment: input.comment, annotatedKeys: input.annotatedKeys, gradedAt: t, updatedAt: t })
      .where(eq(submissions.id, id)),
    db
      .insert(pointEvents)
      .values({
        id: newId(),
        studentId: submission.studentId,
        delta: late ? lateExp(assignment.expReward) : assignment.expReward,
        reason: `ส่งงาน: ${assignment.title}`,
        source: 'assignment',
        refId: id,
        createdAt: t,
      })
      .onConflictDoNothing(),
  ])
}

export async function returnSubmission(db: Db, id: string, comment: string, t: number): Promise<void> {
  await getSubmission(db, id)
  await db.update(submissions).set({ status: 'returned', comment, updatedAt: t }).where(eq(submissions.id, id))
}

/** ครูบันทึกการส่งงานแบบกระดาษ (นักเรียนไม่ได้อัปโหลด) — ให้คะแนนเลยหรือตรวจทีหลังก็ได้
 *  ใช้ได้กับคนที่ยังไม่ส่ง / ครูส่งกลับให้แก้ / ส่งกระดาษไว้แล้ว · ถ้านักเรียนส่งในระบบแล้ว ให้ตรวจตามปกติ */
export async function recordPaper(db: Db, assignmentId: string, studentId: string, input: { score: number | null; late: boolean; comment: string }, t: number): Promise<{ submissionId: string }> {
  const a = await getAssignment(db, assignmentId)
  const [st] = await db.select({ id: students.id }).from(students).where(and(eq(students.id, studentId), eq(students.classId, a.classId)))
  if (!st) throw apiError('student_not_found', 'ไม่พบนักเรียนในห้องนี้', 404)
  if (input.score !== null && !(input.score >= 0 && input.score <= a.maxScore)) throw apiError('invalid_score', `คะแนนต้องอยู่ระหว่าง 0 ถึง ${a.maxScore}`, 400)
  const [existing] = await db.select().from(submissions).where(and(eq(submissions.assignmentId, assignmentId), eq(submissions.studentId, studentId)))
  if (existing && !existing.onPaper && existing.status !== 'returned') throw apiError('already_submitted', 'นักเรียนส่งงานนี้ในระบบแล้ว — เปิดงานเพื่อตรวจตามปกติ', 409)
  // ส่งตรงเวลา = นับเป็นเวลาก่อนกำหนด (ครูบันทึกทีหลังได้ไม่เสียแต้ม)
  const submittedAt = input.late || a.dueAt === null ? t : Math.min(t, a.dueAt)
  const late = a.dueAt !== null && submittedAt > a.dueAt
  const status = input.score !== null ? ('graded' as const) : late ? ('late' as const) : ('submitted' as const)
  const values = {
    text: '',
    imageKeys: [],
    annotatedKeys: [],
    onPaper: true,
    status,
    submittedAt,
    score: input.score,
    comment: input.comment,
    gradedAt: input.score !== null ? t : null,
    clientRequestId: null,
    updatedAt: t,
  }
  const id = existing?.id ?? newId()
  if (existing) await db.update(submissions).set(values).where(eq(submissions.id, id))
  else await db.insert(submissions).values({ id, assignmentId, studentId, ...values })
  if (input.score !== null) {
    await db
      .insert(pointEvents)
      .values({ id: newId(), studentId, delta: late ? lateExp(a.expReward) : a.expReward, reason: `ส่งงาน: ${a.title}`, source: 'assignment', refId: id, createdAt: t })
      .onConflictDoNothing()
  }
  return { submissionId: id }
}

/** ยกเลิกการส่งกระดาษที่ครูบันทึกผิด — กลับเป็นยังไม่ส่ง และหัก EXP ที่ได้จากงานนี้ */
export async function undoPaper(db: Db, submissionId: string): Promise<void> {
  const [s] = await db.select().from(submissions).where(eq(submissions.id, submissionId))
  if (!s) throw submissionNotFound()
  if (!s.onPaper) throw apiError('not_paper', 'งานนี้นักเรียนส่งในระบบ ยกเลิกไม่ได้', 409)
  await db.batch([
    db.delete(pointEvents).where(and(eq(pointEvents.source, 'assignment'), eq(pointEvents.refId, submissionId))),
    db.delete(submissions).where(eq(submissions.id, submissionId)),
  ])
}
