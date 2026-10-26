import { and, eq, inArray, sql } from 'drizzle-orm'
import type { AssignmentInput, AssignmentSummary, StudentAssignment, StudentStatus, SubmissionInput } from '../../shared/assignments'
import { newId, now, type Db } from '../db/client'
import { assignments, classes, students, submissions } from '../db/schema'
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
    .where(and(inArray(submissions.assignmentId, rows.map((r) => r.id)), eq(students.classId, classId), eq(students.active, true)))
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

  const status = a.dueAt !== null && p.now > a.dueAt ? 'late' : 'submitted'
  const values = { text, imageKeys, status, submittedAt: p.now, clientRequestId, updatedAt: p.now } as const
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
