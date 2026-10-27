import { and, asc, eq, isNotNull, or, sql } from 'drizzle-orm'
import type { ScoreImportInput, ScoreImportResult } from '../../shared/zipgrade-results'
import { canonicalZipgradeId } from '../../shared/zipgrade'
import { validScore, type ScoreBook, type ScoreInput, type ScoreItemInput, type ScoreItemSummary, type ScoreSheet, type StudentScore } from '../../shared/scores'
import { newId, now, type Db } from '../db/client'
import { classes, scoreItems, scores, students } from '../db/schema'
import { apiError } from '../http'

export const scoreItemNotFound = () => apiError('score_item_not_found', 'ไม่พบรายการคะแนนนี้', 404)
const classNotFound = () => apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)

export async function createScoreItems(db: Db, classIds: string[], input: ScoreItemInput): Promise<string[]> {
  const unique = [...new Set(classIds)]
  for (const id of unique) {
    const [c] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, id))
    if (!c) throw classNotFound()
  }
  const t = now()
  const rows = unique.map((classId) => ({ id: newId(), classId, ...input, createdAt: t, updatedAt: t }))
  for (const r of rows) await db.insert(scoreItems).values(r)
  return rows.map((r) => r.id)
}

const activeIn = (classId: string) => and(eq(students.classId, classId), eq(students.active, true))

export async function listScoreItems(db: Db, classId: string): Promise<ScoreItemSummary[]> {
  const items = await db
    .select({
      id: scoreItems.id,
      title: scoreItems.title,
      category: scoreItems.category,
      maxScore: scoreItems.maxScore,
      takenOn: scoreItems.takenOn,
      published: scoreItems.published,
    })
    .from(scoreItems)
    .where(eq(scoreItems.classId, classId))
    .orderBy(asc(scoreItems.takenOn), asc(scoreItems.createdAt))
  if (items.length === 0) return []
  const counts = await db
    .select({ itemId: scores.itemId, n: sql<number>`count(*)` })
    .from(scores)
    .innerJoin(students, eq(scores.studentId, students.id))
    .innerJoin(scoreItems, eq(scores.itemId, scoreItems.id))
    .where(and(eq(scoreItems.classId, classId), activeIn(classId), or(isNotNull(scores.score), eq(scores.absent, true))))
    .groupBy(scores.itemId)
  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(students).where(activeIn(classId))
  return items.map((i) => ({ ...i, filled: counts.find((c) => c.itemId === i.id)?.n ?? 0, total }))
}

async function getItem(db: Db, id: string) {
  const [item] = await db.select().from(scoreItems).where(eq(scoreItems.id, id))
  if (!item) throw scoreItemNotFound()
  return item
}

export async function getScoreSheet(db: Db, id: string): Promise<ScoreSheet> {
  const item = await getItem(db, id)
  const [cls] = await db.select({ id: classes.id, name: classes.name }).from(classes).where(eq(classes.id, item.classId))
  const rows = await db
    .select({
      id: students.id,
      zipgradeId: students.zipgradeId,
      title: students.title,
      firstName: students.firstName,
      lastName: students.lastName,
      score: scores.score,
      absent: scores.absent,
      note: scores.note,
    })
    .from(students)
    .leftJoin(scores, and(eq(scores.studentId, students.id), eq(scores.itemId, id)))
    .where(activeIn(item.classId))
    .orderBy(students.sortOrder, students.zipgradeId)
  return {
    item: { id: item.id, classId: item.classId, title: item.title, category: item.category, maxScore: item.maxScore, takenOn: item.takenOn, published: item.published },
    class: cls,
    students: rows.map((r) => ({ ...r, score: r.score ?? null, absent: r.absent ?? false, note: r.note ?? '' })),
  }
}

export async function updateScoreItem(db: Db, id: string, input: ScoreItemInput): Promise<void> {
  await getItem(db, id)
  // ตรวจและแก้ในคำสั่งเดียว: คะแนนที่บันทึกพร้อมกันจะไม่หลุดเกินคะแนนเต็มใหม่
  const r = await db.$client
    .prepare(
      `UPDATE score_items SET title = ?, category = ?, max_score = ?, taken_on = ?, updated_at = ?
       WHERE id = ? AND NOT EXISTS (SELECT 1 FROM scores WHERE item_id = ? AND score > ?)`,
    )
    .bind(input.title, input.category, input.maxScore, input.takenOn, now(), id, id, input.maxScore)
    .run()
  if (r.meta.changes === 0) throw apiError('scores_exceed_max', 'มีคะแนนที่กรอกแล้วเกินคะแนนเต็มใหม่ กรุณาแก้คะแนนก่อน', 409)
}

export async function setPublished(db: Db, id: string, published: boolean): Promise<void> {
  await getItem(db, id)
  await db.update(scoreItems).set({ published, updatedAt: now() }).where(eq(scoreItems.id, id))
}

export async function deleteScoreItem(db: Db, id: string): Promise<void> {
  await getItem(db, id)
  await db.batch([db.delete(scores).where(eq(scores.itemId, id)), db.delete(scoreItems).where(eq(scoreItems.id, id))])
}

export async function saveScore(db: Db, itemId: string, studentId: string, input: ScoreInput, t: number): Promise<void> {
  const item = await getItem(db, itemId)
  const [st] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.id, studentId), activeIn(item.classId)))
  if (!st) throw apiError('student_not_found', 'ไม่พบนักเรียนในห้องนี้', 404)
  const score = input.absent ? null : input.score
  if (score !== null && !validScore(score, item.maxScore)) {
    throw apiError('invalid_score', `คะแนนต้องอยู่ระหว่าง 0 ถึง ${item.maxScore} (ทศนิยมไม่เกิน 2 ตำแหน่ง)`, 400)
  }
  const values = { score, absent: input.absent, note: input.note, updatedAt: t }
  await db
    .insert(scores)
    .values({ id: newId(), itemId, studentId, ...values })
    .onConflictDoUpdate({ target: [scores.itemId, scores.studentId], set: values })
}

export async function scoresForStudent(db: Db, studentId: string, classId: string): Promise<StudentScore[]> {
  const rows = await db
    .select({ i: scoreItems, s: scores })
    .from(scoreItems)
    .leftJoin(scores, and(eq(scores.itemId, scoreItems.id), eq(scores.studentId, studentId)))
    .where(and(eq(scoreItems.classId, classId), eq(scoreItems.published, true)))
    .orderBy(asc(scoreItems.takenOn), asc(scoreItems.createdAt))
  return rows.map(({ i, s }) => ({
    id: i.id,
    title: i.title,
    category: i.category,
    maxScore: i.maxScore,
    takenOn: i.takenOn,
    score: s?.score ?? null,
    absent: s?.absent ?? false,
  }))
}

export async function scoreBook(db: Db, classId: string): Promise<ScoreBook> {
  const items = await db
    .select({ id: scoreItems.id, title: scoreItems.title, maxScore: scoreItems.maxScore, takenOn: scoreItems.takenOn })
    .from(scoreItems)
    .where(eq(scoreItems.classId, classId))
    .orderBy(asc(scoreItems.takenOn), asc(scoreItems.createdAt))
  const rows = items.length
    ? await db
        .select({ itemId: scores.itemId, studentId: scores.studentId, score: scores.score, absent: scores.absent })
        .from(scores)
        .innerJoin(scoreItems, eq(scores.itemId, scoreItems.id))
        .where(eq(scoreItems.classId, classId))
    : []
  const cells: ScoreBook['cells'] = {}
  for (const r of rows) (cells[r.studentId] ??= {})[r.itemId] = { score: r.score, absent: r.absent }
  return { items, cells }
}

/** นำเข้าคะแนนจาก ZipGrade ลงรายการเดิม — จับคู่ด้วย ZipGrade ID เฉพาะนักเรียนที่ใช้งานในห้องนี้
 *  overwrite=false ไม่แตะคนที่กรอก/ติ๊กขาดสอบไว้แล้ว · absentMissing ติ๊กขาดสอบให้คนที่ไม่มีในไฟล์และยังไม่มีคะแนน
 *  หมายเหตุของครูคงเดิมเสมอ · ครูแก้คะแนนรายคนต่อได้ตามปกติ */
export async function importScores(db: Db, itemId: string, input: ScoreImportInput, t: number): Promise<ScoreImportResult> {
  const item = await getItem(db, itemId)
  const roster = await db
    .select({ id: students.id, zipgradeId: students.zipgradeId, score: scores.score, absent: scores.absent, note: scores.note })
    .from(students)
    .leftJoin(scores, and(eq(scores.studentId, students.id), eq(scores.itemId, itemId)))
    .where(activeIn(item.classId))
  const byZip = new Map(roster.map((r) => [canonicalZipgradeId(r.zipgradeId), r]))
  const result: ScoreImportResult = { saved: 0, keptExisting: 0, markedAbsent: 0, notInClass: [], invalid: [] }
  const writes: { studentId: string; score: number | null; absent: boolean; note: string }[] = []
  const inFile = new Set<string>()
  for (const row of input.rows) {
    const st = byZip.get(canonicalZipgradeId(row.zipgradeId))
    if (!st) {
      result.notInClass.push(row.zipgradeId)
      continue
    }
    if (inFile.has(st.id)) continue
    inFile.add(st.id)
    if (!validScore(row.score, item.maxScore)) {
      result.invalid.push(row.zipgradeId)
      continue
    }
    const hasValue = st.score !== null || st.absent === true
    if (hasValue && !input.overwrite) {
      result.keptExisting++
      continue
    }
    writes.push({ studentId: st.id, score: row.score, absent: false, note: st.note ?? '' })
    result.saved++
  }
  if (input.absentMissing) {
    for (const st of roster) {
      if (inFile.has(st.id) || st.score !== null || st.absent === true) continue
      writes.push({ studentId: st.id, score: null, absent: true, note: st.note ?? '' })
      result.markedAbsent++
    }
  }
  for (let i = 0; i < writes.length; i += 40) {
    const stmts = writes.slice(i, i + 40).map((w) => {
      const values = { score: w.score, absent: w.absent, note: w.note, updatedAt: t }
      return db
        .insert(scores)
        .values({ id: newId(), itemId, studentId: w.studentId, ...values })
        .onConflictDoUpdate({ target: [scores.itemId, scores.studentId], set: values })
    })
    await db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]])
  }
  return result
}
