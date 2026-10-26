import { and, eq, sql } from 'drizzle-orm'
import { assignGrades, DEFAULT_GRADING, gradingSchema, type ClassGrades, type GradingSettings, type StudentGrade } from '../../shared/grades'
import type { Db } from '../db/client'
import { classes, settings, students } from '../db/schema'
import { apiError } from '../http'

const key = (classId: string) => `grading:${classId}`

export async function getGrading(db: Db, classId: string): Promise<GradingSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key(classId)))
  if (!row) return DEFAULT_GRADING
  const r = gradingSchema.safeParse(JSON.parse(row.value))
  return r.success ? r.data : DEFAULT_GRADING
}

export async function saveGrading(db: Db, classId: string, g: GradingSettings): Promise<void> {
  const [c] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, classId))
  if (!c) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  const value = JSON.stringify(g)
  await db.insert(settings).values({ key: key(classId), value }).onConflictDoUpdate({ target: settings.key, set: { value } })
}

/**
 * คะแนนสะสม = คะแนนงานที่ตรวจแล้ว + คะแนนสอบที่กรอกแล้ว (ไม่ส่ง/ไม่กรอก/ขาดสอบ = 0)
 * คะแนนเต็มสะสม = รวมคะแนนเต็มของงาน/รายการสอบที่มีการให้คะแนนแล้วอย่างน้อย 1 คน
 * จัดอันดับเฉพาะนักเรียนที่ยังอยู่ในห้อง (active)
 */
export async function classGrades(db: Db, classId: string): Promise<ClassGrades> {
  const [c] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, classId))
  if (!c) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  const roster = await db
    .select({ id: students.id, zipgradeId: students.zipgradeId, title: students.title, firstName: students.firstName, lastName: students.lastName })
    .from(students)
    .where(and(eq(students.classId, classId), eq(students.active, true)))
    .orderBy(students.sortOrder, students.zipgradeId)
  const asg = await db.all<{ studentId: string; total: number }>(sql`
    SELECT s.student_id AS studentId, sum(s.score) AS total FROM submissions s JOIN assignments a ON a.id = s.assignment_id
    WHERE a.class_id = ${classId} AND s.status = 'graded' AND s.score IS NOT NULL GROUP BY s.student_id`)
  const exam = await db.all<{ studentId: string; total: number }>(sql`
    SELECT sc.student_id AS studentId, sum(coalesce(sc.score, 0)) AS total FROM scores sc JOIN score_items i ON i.id = sc.item_id
    WHERE i.class_id = ${classId} GROUP BY sc.student_id`)
  const [maxAsg] = await db.all<{ max: number; n: number }>(sql`
    SELECT coalesce(sum(a.max_score), 0) AS max, count(*) AS n FROM assignments a
    WHERE a.class_id = ${classId} AND EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id = a.id AND s.status = 'graded')`)
  const [maxExam] = await db.all<{ max: number; n: number }>(sql`
    SELECT coalesce(sum(i.max_score), 0) AS max, count(*) AS n FROM score_items i
    WHERE i.class_id = ${classId} AND EXISTS (SELECT 1 FROM scores sc WHERE sc.item_id = i.id AND (sc.score IS NOT NULL OR sc.absent = 1))`)
  const settings = await getGrading(db, classId)
  const maxTotal = Math.round((maxAsg.max + maxExam.max) * 100) / 100
  const a = new Map(asg.map((r) => [r.studentId, r.total]))
  const e = new Map(exam.map((r) => [r.studentId, r.total]))
  const rows = roster.map((s) => {
    const assignmentTotal = a.get(s.id) ?? 0
    const examTotal = e.get(s.id) ?? 0
    return { ...s, assignmentTotal, examTotal, total: Math.round((assignmentTotal + examTotal) * 100) / 100 }
  })
  // ยังไม่มีคะแนนเลย = ยังตัดเกรดไม่ได้
  const graded = maxTotal > 0 ? assignGrades(rows, settings.bands) : new Map()
  return {
    settings,
    maxTotal,
    itemCounts: { assignments: maxAsg.n, exams: maxExam.n },
    students: rows.map((r) => ({ ...r, percentile: graded.get(r.id)?.percentile ?? null, rank: graded.get(r.id)?.rank ?? null, grade: graded.get(r.id)?.grade ?? null })),
  }
}

export async function gradeForStudent(db: Db, studentId: string, classId: string): Promise<StudentGrade> {
  const g = await getGrading(db, classId)
  if (!g.visible) return { visible: false }
  const all = await classGrades(db, classId)
  const me = all.students.find((s) => s.id === studentId)
  return { visible: true, total: me?.total ?? 0, maxTotal: all.maxTotal, grade: me?.grade ?? null }
}
