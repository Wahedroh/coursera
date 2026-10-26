import { and, eq, inArray, sql } from 'drizzle-orm'
import type { AssignmentInput, AssignmentSummary, StudentStatus } from '../../shared/assignments'
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
