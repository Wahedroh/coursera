import { and, asc, eq, gte, isNotNull, lt, or, sql } from 'drizzle-orm'
import type { ScoreImportInput, ScoreImportResult } from '../../shared/zipgrade-results'
import { canonicalZipgradeId } from '../../shared/zipgrade'
import { improvementBonus, validScore, type BonusInfo, type ScoreBook, type ScoreInput, type ScoreItemInput, type ScoreItemSummary, type ScoreSheet, type StudentScore } from '../../shared/scores'
import { newId, now, type Db } from '../db/client'
import { classes, examSets, scoreItems, scores, students } from '../db/schema'
import { apiError } from '../http'
import { termWindow } from '../terms/service'
import type { TermWindow } from '../../shared/terms'

/** รายการคะแนนของเทอม = รายการที่สร้างในช่วงเทอมนั้น */
const itemInTerm = (w: TermWindow) => and(gte(scoreItems.createdAt, w.start), lt(scoreItems.createdAt, w.end))

export const scoreItemNotFound = () => apiError('score_item_not_found', 'ไม่พบรายการคะแนนนี้', 404)
const classNotFound = () => apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)

export async function createScoreItems(db: Db, classIds: string[], input: ScoreItemInput): Promise<string[]> {
  const unique = [...new Set(classIds)]
  for (const id of unique) {
    const [c] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, id))
    if (!c) throw classNotFound()
  }
  if (input.examSetId) {
    const [set] = await db.select({ id: examSets.id }).from(examSets).where(eq(examSets.id, input.examSetId))
    if (!set) throw apiError('exam_set_not_found', 'ไม่พบชุดข้อสอบนี้', 400)
  }
  const t = now()
  const rows = unique.map((classId) => ({ id: newId(), classId, ...input, createdAt: t, updatedAt: t }))
  for (const r of rows) await db.insert(scoreItems).values(r)
  return rows.map((r) => r.id)
}

const activeIn = (classId: string) => and(eq(students.classId, classId), eq(students.active, true))

export async function listScoreItems(db: Db, classId: string): Promise<ScoreItemSummary[]> {
  const w = await termWindow(db)
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
    .where(and(eq(scoreItems.classId, classId), itemInTerm(w)))
    .orderBy(asc(scoreItems.takenOn), asc(scoreItems.createdAt))
  if (items.length === 0) return []
  const counts = await db
    .select({ itemId: scores.itemId, n: sql<number>`count(*)` })
    .from(scores)
    .innerJoin(students, eq(scores.studentId, students.id))
    .innerJoin(scoreItems, eq(scores.itemId, scoreItems.id))
    .where(and(eq(scoreItems.classId, classId), itemInTerm(w), activeIn(classId), or(isNotNull(scores.score), eq(scores.absent, true))))
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
      bonus: scores.bonus,
    })
    .from(students)
    .leftJoin(scores, and(eq(scores.studentId, students.id), eq(scores.itemId, id)))
    .where(activeIn(item.classId))
    .orderBy(students.sortOrder, students.zipgradeId)
  return {
    item: { id: item.id, classId: item.classId, title: item.title, category: item.category, maxScore: item.maxScore, takenOn: item.takenOn, published: item.published, makeupDays: item.makeupDays, examSetId: item.examSetId, improvementBonus: item.improvementBonus },
    class: cls,
    students: rows.map((r) => ({ ...r, score: r.score ?? null, absent: r.absent ?? false, note: r.note ?? '', bonus: r.bonus ?? 0 })),
    ...(item.improvementBonus ? { bonusInfo: await bonusInfo(db, item, rows.filter((r) => r.score !== null && !r.absent).map((r) => ({ studentId: r.id, raw: r.score! - (r.bonus ?? 0) }))) } : {}),
  }
}

export async function updateScoreItem(db: Db, id: string, input: ScoreItemInput): Promise<void> {
  await getItem(db, id)
  if (input.examSetId) {
    const [set] = await db.select({ id: examSets.id }).from(examSets).where(eq(examSets.id, input.examSetId))
    if (!set) throw apiError('exam_set_not_found', 'ไม่พบชุดข้อสอบนี้', 400)
  }
  // ตรวจและแก้ในคำสั่งเดียว: คะแนนที่บันทึกพร้อมกันจะไม่หลุดเกินคะแนนเต็มใหม่
  const r = await db.$client
    .prepare(
      `UPDATE score_items SET title = ?, category = ?, max_score = ?, taken_on = ?, makeup_days = ?, exam_set_id = iif(?, ?, exam_set_id), updated_at = ?
       WHERE id = ? AND NOT EXISTS (SELECT 1 FROM scores WHERE item_id = ? AND score - bonus > ?)`,
    )
    .bind(input.title, input.category, input.maxScore, input.takenOn, input.makeupDays, input.examSetId === undefined ? 0 : 1, input.examSetId ?? null, now(), id, id, input.maxScore)
    .run()
  if (r.meta.changes === 0) throw apiError('scores_exceed_max', 'มีคะแนนที่กรอกแล้วเกินคะแนนเต็มใหม่ กรุณาแก้คะแนนก่อน', 409)
  await recomputeBonus(db, id)
}

export async function setPublished(db: Db, id: string, published: boolean): Promise<void> {
  await getItem(db, id)
  await db.update(scoreItems).set({ published, updatedAt: now() }).where(eq(scoreItems.id, id))
}

export async function deleteScoreItem(db: Db, id: string): Promise<void> {
  await getItem(db, id)
  // สอบย้อนหลังของรายการนี้หายไปด้วย
  await db.run(sql`DELETE FROM makeup_events WHERE exam_id IN (SELECT id FROM makeup_exams WHERE score_item_id = ${id})`)
  // ภาพคุมสอบ: ลบแถว (ไฟล์ที่ค้าง "ลบไฟล์ค้าง" เก็บให้)
  await db.run(sql`DELETE FROM makeup_photos WHERE exam_id IN (SELECT id FROM makeup_exams WHERE score_item_id = ${id})`)
  await db.run(sql`DELETE FROM makeup_exams WHERE score_item_id = ${id}`)
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
  // บันทึกคะแนนสอบจริง แล้วค่อยคิดโบนัสพัฒนาการ (ถ้าเปิดไว้)
  const values = { score, absent: input.absent, note: input.note, bonus: 0, updatedAt: t }
  await db
    .insert(scores)
    .values({ id: newId(), itemId, studentId, ...values })
    .onConflictDoUpdate({ target: [scores.itemId, scores.studentId], set: values })
  if (item.improvementBonus) await recomputeBonus(db, itemId, [studentId])
  // สอบครั้งหลัง ๆ ที่เปิดโบนัสไว้ ใช้ครั้งนี้เป็นฐาน → คิดใหม่ให้คนนี้
  const later = await db.all<{ id: string }>(sql`
    SELECT id FROM score_items WHERE class_id = ${item.classId} AND improvement_bonus = 1 AND id != ${item.id}
      AND (taken_on > ${item.takenOn} OR (taken_on = ${item.takenOn} AND created_at > ${item.createdAt})) ORDER BY taken_on LIMIT 5`)
  for (const l of later) await recomputeBonus(db, l.id, [studentId])
}

export async function scoresForStudent(db: Db, studentId: string, classId: string): Promise<StudentScore[]> {
  const w = await termWindow(db)
  const rows = await db
    .select({ i: scoreItems, s: scores })
    .from(scoreItems)
    .leftJoin(scores, and(eq(scores.itemId, scoreItems.id), eq(scores.studentId, studentId)))
    .where(and(eq(scoreItems.classId, classId), eq(scoreItems.published, true), itemInTerm(w)))
    .orderBy(asc(scoreItems.takenOn), asc(scoreItems.createdAt))
  return rows.map(({ i, s }) => ({
    id: i.id,
    title: i.title,
    category: i.category,
    maxScore: i.maxScore,
    takenOn: i.takenOn,
    score: s?.score ?? null,
    absent: s?.absent ?? false,
    bonus: s?.bonus ?? 0,
  }))
}

export async function scoreBook(db: Db, classId: string, win?: TermWindow): Promise<ScoreBook> {
  const w = win ?? (await termWindow(db))
  const items = await db
    .select({ id: scoreItems.id, title: scoreItems.title, maxScore: scoreItems.maxScore, takenOn: scoreItems.takenOn })
    .from(scoreItems)
    .where(and(eq(scoreItems.classId, classId), itemInTerm(w)))
    .orderBy(asc(scoreItems.takenOn), asc(scoreItems.createdAt))
  const rows = items.length
    ? await db
        .select({ itemId: scores.itemId, studentId: scores.studentId, score: scores.score, absent: scores.absent })
        .from(scores)
        .innerJoin(scoreItems, eq(scores.itemId, scoreItems.id))
        .where(and(eq(scoreItems.classId, classId), itemInTerm(w)))
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
      const values = { score: w.score, absent: w.absent, note: w.note, bonus: 0, updatedAt: t }
      return db
        .insert(scores)
        .values({ id: newId(), itemId, studentId: w.studentId, ...values })
        .onConflictDoUpdate({ target: [scores.itemId, scores.studentId], set: values })
    })
    await db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]])
  }
  if (item.improvementBonus) await recomputeBonus(db, itemId)
  return result
}

// ---------- โบนัสพัฒนาการ ----------
type Item = typeof scoreItems.$inferSelect
/** คะแนนสอบจริงครั้งก่อน (%) ของแต่ละคน: รายการก่อนหน้าในห้องเดียวกัน หมวดเดียวกันก่อน แล้วค่อยหมวดอื่น (ไม่นับเกมการ์ด/อื่น ๆ) */
async function previousPct(db: Db, item: Item, studentIds: string[]): Promise<Map<string, { title: string; pct: number }>> {
  const out = new Map<string, { title: string; pct: number }>()
  if (!studentIds.length) return out
  const prev = await db.all<{ id: string; title: string; maxScore: number }>(sql`
    SELECT id, title, max_score AS maxScore FROM score_items
    WHERE class_id = ${item.classId} AND id != ${item.id} AND category != 'other'
      AND (taken_on < ${item.takenOn} OR (taken_on = ${item.takenOn} AND created_at < ${item.createdAt}))
    ORDER BY (category = ${item.category}) DESC, taken_on DESC, created_at DESC LIMIT 30`)
  if (!prev.length) return out
  const rows = await db.all<{ itemId: string; studentId: string; raw: number }>(sql`
    SELECT item_id AS itemId, student_id AS studentId, score - bonus AS raw FROM scores
    WHERE item_id IN (${sql.join(prev.map((p) => sql`${p.id}`), sql`, `)}) AND absent = 0 AND score IS NOT NULL`)
  const want = new Set(studentIds)
  for (const p of prev)
    for (const r of rows)
      if (r.itemId === p.id && want.has(r.studentId) && !out.has(r.studentId)) out.set(r.studentId, { title: p.title, pct: (r.raw / p.maxScore) * 100 })
  return out
}

async function bonusInfo(db: Db, item: Item, people: { studentId: string; raw: number }[]): Promise<Record<string, BonusInfo>> {
  const prev = await previousPct(db, item, people.map((p) => p.studentId))
  const out: Record<string, BonusInfo> = {}
  for (const p of people) {
    const pr = prev.get(p.studentId)
    if (pr) out[p.studentId] = { prevTitle: pr.title, prevPct: Math.round(pr.pct * 10) / 10, nowPct: Math.round((p.raw / item.maxScore) * 1000) / 10, bonus: improvementBonus(pr.pct, p.raw, item.maxScore) }
  }
  return out
}

/** คิดโบนัสพัฒนาการใหม่ (ทั้งรายการ หรือเฉพาะบางคน) · ปิดโบนัสอยู่ = ถอดโบนัสออกคืนคะแนนจริง */
export async function recomputeBonus(db: Db, itemId: string, only?: string[]): Promise<void> {
  const item = await getItem(db, itemId)
  const rows = (await db.select({ studentId: scores.studentId, score: scores.score, bonus: scores.bonus, absent: scores.absent }).from(scores).where(eq(scores.itemId, itemId))).filter(
    (r) => !only || only.includes(r.studentId),
  )
  const on = item.improvementBonus && item.category !== 'other'
  const people = rows.filter((r) => r.score !== null && !r.absent).map((r) => ({ studentId: r.studentId, raw: r.score! - r.bonus, old: r.bonus }))
  const prev = on ? await previousPct(db, item, people.map((p) => p.studentId)) : new Map<string, { title: string; pct: number }>()
  const stmts = people
    .map((p) => ({ ...p, bonus: on ? improvementBonus(prev.get(p.studentId)?.pct ?? null, p.raw, item.maxScore) : 0 }))
    .filter((p) => p.bonus !== p.old)
    .map((p) => db.update(scores).set({ score: Math.round((p.raw + p.bonus) * 100) / 100, bonus: p.bonus }).where(and(eq(scores.itemId, itemId), eq(scores.studentId, p.studentId))))
  for (let i = 0; i < stmts.length; i += 40) {
    const chunk = stmts.slice(i, i + 40)
    await db.batch(chunk as [(typeof chunk)[number], ...(typeof chunk)[number][]])
  }
}

export async function setImprovementBonus(db: Db, itemId: string, enabled: boolean): Promise<void> {
  const item = await getItem(db, itemId)
  if (enabled && item.category === 'other') throw apiError('bonus_not_allowed', 'โบนัสพัฒนาการใช้ได้กับรายการสอบเท่านั้น', 400)
  await db.update(scoreItems).set({ improvementBonus: enabled, updatedAt: now() }).where(eq(scoreItems.id, itemId))
  await recomputeBonus(db, itemId)
}
