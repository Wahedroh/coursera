import { and, eq, inArray, sql } from 'drizzle-orm'
import { ASSIGNMENT_EXP, type AssignmentInput, type AssignmentSummary, type Gradebook, type StudentAssignment, type StudentStatus, type SubmissionInput } from '../../shared/assignments'
import { newId, now, type Db } from '../db/client'
import { assignments, classes, pointEvents, students, submissions } from '../db/schema'
import { apiError } from '../http'

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

export async function listForClass(db: Db, classId: string): Promise<AssignmentSummary[]> {
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
    .where(eq(assignments.classId, classId))
  if (rows.length === 0) return []
  const counts = await db
    .select({ assignmentId: submissions.assignmentId, status: submissions.status, n: sql<number>`count(*)` })
    .from(submissions)
    .innerJoin(students, eq(submissions.studentId, students.id))
    .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
    // กรองด้วยห้อง ไม่ใช่ list ของ id — D1 รับตัวแปรได้ไม่เกิน 100 ตัวต่อคำสั่ง
    .where(and(eq(assignments.classId, classId), eq(students.classId, classId), eq(students.active, true)))
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

export async function deleteAssignment(db: Db, id: string): Promise<void> {
  await getAssignment(db, id)
  const [has] = await db.select({ id: submissions.id }).from(submissions).where(eq(submissions.assignmentId, id)).limit(1)
  if (has) throw apiError('has_submissions', 'มีนักเรียนส่งงานแล้ว ลบไม่ได้', 409)
  await db.delete(assignments).where(eq(assignments.id, id))
}

const PENDING: StudentStatus[] = ['missing', 'returned']

export async function listForStudent(db: Db, studentId: string, classId: string): Promise<StudentAssignment[]> {
  const rows = await db
    .select({ a: assignments, s: submissions })
    .from(assignments)
    .leftJoin(submissions, and(eq(submissions.assignmentId, assignments.id), eq(submissions.studentId, studentId)))
    .where(and(eq(assignments.classId, classId), eq(assignments.published, true)))
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
      ? { text: s.text, imageKeys: s.imageKeys, annotatedKeys: s.annotatedKeys, score: s.score, comment: s.comment, submittedAt: s.submittedAt }
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
  const values = { text, imageKeys, status, submittedAt: p.now, clientRequestId, updatedAt: p.now, annotatedKeys: [], score: null, gradedAt: null }
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

export async function gradebook(db: Db, classId: string): Promise<Gradebook> {
  const [cls] = await db.select({ id: classes.id, name: classes.name }).from(classes).where(eq(classes.id, classId))
  if (!cls) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  const list = (await listForClass(db, classId)).map(({ id, title, dueAt, maxScore }) => ({ id, title, dueAt, maxScore }))
  const roster = await db
    .select({ id: students.id, zipgradeId: students.zipgradeId, title: students.title, firstName: students.firstName, lastName: students.lastName })
    .from(students)
    .where(and(eq(students.classId, classId), eq(students.active, true)))
    .orderBy(students.sortOrder, students.zipgradeId)
  const subs = list.length
    ? await db
        .select({ id: submissions.id, assignmentId: submissions.assignmentId, studentId: submissions.studentId, status: submissions.status, score: submissions.score })
        .from(submissions)
        .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
        .where(eq(assignments.classId, classId))
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
          return [a.id, s ? { status: s.status, score: s.score, submissionId: s.id } : { status: 'missing' as const, score: null, submissionId: null }]
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
        delta: late ? ASSIGNMENT_EXP.late : ASSIGNMENT_EXP.onTime,
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
