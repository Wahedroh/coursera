import { and, eq, sql } from 'drizzle-orm'
import { assignGrades, DEFAULT_GRADING, finalGrade, fullSetEligible, gradingSchema, type ClassGrades, type GradingSettings, type StudentGrade } from '../../shared/grades'
import type { Db } from '../db/client'
import { classes, settings, students } from '../db/schema'
import { apiError } from '../http'
import { termWindow } from '../terms/service'
import type { TermWindow } from '../../shared/terms'
import { charactersOfSeason } from '../../shared/characters'

/** นักเรียนที่มีตัวละครครบชุดของซีซันนี้ (ทั้งห้อง หรือทุกห้องถ้าไม่ระบุ) */
export async function fullSetOwners(db: Db, season: number, classId?: string): Promise<Set<string>> {
  const ids = charactersOfSeason(season).map((c) => c.id)
  if (!ids.length) return new Set()
  const rows = await db.all<{ studentId: string; n: number }>(sql`
    SELECT e.student_id AS studentId, count(DISTINCT e.character_id) AS n FROM eggs e JOIN students st ON st.id = e.student_id
    WHERE e.character_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) ${classId ? sql`AND st.class_id = ${classId}` : sql``}
    GROUP BY e.student_id`)
  return new Set(rows.filter((r) => r.n >= ids.length).map((r) => r.studentId))
}

/** % ต่ำสุดของการสอบในเทอมของนักเรียนแต่ละคน (นับเฉพาะรายการสอบที่กรอกคะแนนแล้วอย่างน้อย 1 คน · ไม่ได้กรอก/ขาดสอบ = 0) */
export async function examMinPcts(db: Db, start: number, end: number, roster: { id: string; classId: string }[], classId?: string): Promise<Map<string, number | null>> {
  const cls = classId ? sql`AND i.class_id = ${classId}` : sql``
  const items = await db.all<{ id: string; classId: string; max: number }>(sql`
    SELECT i.id, i.class_id AS classId, i.max_score AS max FROM score_items i
    WHERE i.created_at >= ${start} AND i.created_at < ${end} AND i.max_score > 0 ${cls}
      AND EXISTS (SELECT 1 FROM scores sc WHERE sc.item_id = i.id AND (sc.score IS NOT NULL OR sc.absent = 1))`)
  const scores = items.length
    ? await db.all<{ itemId: string; studentId: string; score: number }>(sql`
        SELECT sc.item_id AS itemId, sc.student_id AS studentId, coalesce(sc.score, 0) AS score FROM scores sc JOIN score_items i ON i.id = sc.item_id
        WHERE i.created_at >= ${start} AND i.created_at < ${end} ${cls}`)
    : []
  const got = new Map(scores.map((r) => [`${r.studentId}|${r.itemId}`, r.score]))
  const byClass = new Map<string, typeof items>()
  for (const it of items) (byClass.get(it.classId) ?? byClass.set(it.classId, []).get(it.classId)!).push(it)
  return new Map(
    roster.map((st) => {
      const mine = byClass.get(st.classId) ?? []
      if (!mine.length) return [st.id, null]
      return [st.id, Math.round(Math.min(...mine.map((it) => ((got.get(`${st.id}|${it.id}`) ?? 0) / it.max) * 100)) * 100) / 100]
    }),
  )
}

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
export async function classGrades(db: Db, classId: string, win?: TermWindow): Promise<ClassGrades> {
  const w = win ?? (await termWindow(db))
  const { start, end } = w
  const [c] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, classId))
  if (!c) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  const roster = await db
    .select({ id: students.id, zipgradeId: students.zipgradeId, title: students.title, firstName: students.firstName, lastName: students.lastName })
    .from(students)
    .where(and(eq(students.classId, classId), eq(students.active, true)))
    .orderBy(students.sortOrder, students.zipgradeId)
  const asg = await db.all<{ studentId: string; total: number }>(sql`
    SELECT s.student_id AS studentId, sum(s.score) AS total FROM submissions s JOIN assignments a ON a.id = s.assignment_id
    WHERE a.class_id = ${classId} AND a.created_at >= ${start} AND a.created_at < ${end} AND s.status = 'graded' AND s.score IS NOT NULL GROUP BY s.student_id`)
  const exam = await db.all<{ studentId: string; total: number }>(sql`
    SELECT sc.student_id AS studentId, sum(coalesce(sc.score, 0)) AS total FROM scores sc JOIN score_items i ON i.id = sc.item_id
    WHERE i.class_id = ${classId} AND i.created_at >= ${start} AND i.created_at < ${end} GROUP BY sc.student_id`)
  const [maxAsg] = await db.all<{ max: number; n: number }>(sql`
    SELECT coalesce(sum(a.max_score), 0) AS max, count(*) AS n FROM assignments a
    WHERE a.class_id = ${classId} AND a.created_at >= ${start} AND a.created_at < ${end} AND EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id = a.id AND s.status = 'graded')`)
  const [maxExam] = await db.all<{ max: number; n: number }>(sql`
    SELECT coalesce(sum(i.max_score), 0) AS max, count(*) AS n FROM score_items i
    WHERE i.class_id = ${classId} AND i.created_at >= ${start} AND i.created_at < ${end} AND EXISTS (SELECT 1 FROM scores sc WHERE sc.item_id = i.id AND (sc.score IS NOT NULL OR sc.absent = 1))`)
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
  const full = await fullSetOwners(db, w.term.season, classId)
  const examMin = await examMinPcts(db, start, end, roster.map((r) => ({ id: r.id, classId })), classId)
  const bonus = (id: string) => fullSetEligible(full.has(id), examMin.get(id) ?? null, settings)
  return {
    settings,
    maxTotal,
    itemCounts: { assignments: maxAsg.n, exams: maxExam.n },
    students: rows.map((r) => ({
      ...r,
      percentile: graded.get(r.id)?.percentile ?? null,
      rank: graded.get(r.id)?.rank ?? null,
      grade: finalGrade(graded.get(r.id)?.grade ?? null, bonus(r.id), settings),
      fullSet: full.has(r.id),
      examMinPct: examMin.get(r.id) ?? null,
      fullSetBonus: bonus(r.id),
    })),
  }
}

export async function gradeForStudent(db: Db, studentId: string, classId: string): Promise<StudentGrade> {
  const g = await getGrading(db, classId)
  if (!g.visible) return { visible: false }
  const all = await classGrades(db, classId)
  const me = all.students.find((s) => s.id === studentId)
  return {
    visible: true,
    total: me?.total ?? 0,
    maxTotal: all.maxTotal,
    grade: me?.grade ?? null,
    fullSet: me?.fullSet ?? false,
    fullSetBonus: me?.fullSetBonus ?? false,
    examMinPct: me?.examMinPct ?? null,
    minExamPct: g.fullSetMinExamPct,
  }
}

/** เกรดคาดการณ์ทุกห้องในคำสั่งไม่กี่ครั้ง (D1 แพ็กเกจฟรีจำกัด 50 คำสั่งต่อคำขอ) — วิธีคิดเดียวกับ classGrades */
export async function allClassGrades(db: Db): Promise<Map<string, Map<string, string | null>>> {
  const w = await termWindow(db)
  const { start } = w
  const roster = await db.all<{ id: string; classId: string }>(sql`SELECT id, class_id AS classId FROM students WHERE active = 1`)
  const asg = await db.all<{ studentId: string; total: number }>(sql`
    SELECT s.student_id AS studentId, sum(s.score) AS total FROM submissions s JOIN assignments a ON a.id = s.assignment_id
    WHERE a.created_at >= ${start} AND s.status = 'graded' AND s.score IS NOT NULL GROUP BY s.student_id`)
  const exam = await db.all<{ studentId: string; total: number }>(sql`
    SELECT sc.student_id AS studentId, sum(coalesce(sc.score, 0)) AS total FROM scores sc JOIN score_items i ON i.id = sc.item_id
    WHERE i.created_at >= ${start} GROUP BY sc.student_id`)
  const maxes = await db.all<{ classId: string; max: number }>(sql`
    SELECT class_id AS classId, sum(max) AS max FROM (
      SELECT a.class_id, a.max_score AS max FROM assignments a WHERE a.created_at >= ${start} AND EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id = a.id AND s.status = 'graded')
      UNION ALL
      SELECT i.class_id, i.max_score FROM score_items i WHERE i.created_at >= ${start} AND EXISTS (SELECT 1 FROM scores sc WHERE sc.item_id = i.id AND (sc.score IS NOT NULL OR sc.absent = 1))
    ) GROUP BY class_id`)
  const settingRows = await db.all<{ key: string; value: string }>(sql`SELECT key, value FROM settings WHERE key LIKE 'grading:%'`)
  const bandsOf = new Map(
    settingRows.map((r) => {
      let g = DEFAULT_GRADING
      try {
        const p = gradingSchema.safeParse(JSON.parse(r.value))
        if (p.success) g = p.data
      } catch {}
      return [r.key.slice('grading:'.length), g]
    }),
  )
  const full = await fullSetOwners(db, w.term.season)
  const examMin = await examMinPcts(db, start, w.end, roster)
  const a = new Map(asg.map((r) => [r.studentId, r.total]))
  const e = new Map(exam.map((r) => [r.studentId, r.total]))
  const maxBy = new Map(maxes.map((m) => [m.classId, m.max]))
  const byClass = new Map<string, { id: string; total: number }[]>()
  for (const s of roster) {
    const total = Math.round(((a.get(s.id) ?? 0) + (e.get(s.id) ?? 0)) * 100) / 100
    ;(byClass.get(s.classId) ?? byClass.set(s.classId, []).get(s.classId)!).push({ id: s.id, total })
  }
  const out = new Map<string, Map<string, string | null>>()
  for (const [classId, rows] of byClass) {
    const g = bandsOf.get(classId) ?? DEFAULT_GRADING
    const graded = (maxBy.get(classId) ?? 0) > 0 ? assignGrades(rows, g.bands) : new Map()
    out.set(classId, new Map(rows.map((r) => [r.id, finalGrade(graded.get(r.id)?.grade ?? null, fullSetEligible(full.has(r.id), examMin.get(r.id) ?? null, g), g)])))
  }
  return out
}
