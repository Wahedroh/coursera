import { and, asc, desc, eq, isNotNull, or, sql } from 'drizzle-orm'
import { outstanding, type ChargeInput, type FeeItemInput, type FeeItemSummary, type FeeSheet, type StudentFee } from '../../shared/fees'
import { newId, type Db } from '../db/client'
import { classes, feeCharges, feeItems, students } from '../db/schema'
import { apiError } from '../http'

export const feeItemNotFound = () => apiError('fee_item_not_found', 'ไม่พบรายการค่าเอกสารนี้', 404)
const studentNotFound = () => apiError('student_not_found', 'ไม่พบนักเรียนในห้องนี้', 404)

export async function createFeeItems(db: Db, classIds: string[], input: FeeItemInput, t: number): Promise<string[]> {
  const unique = [...new Set(classIds)]
  for (const id of unique) {
    const [c] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, id))
    if (!c) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  }
  const rows = unique.map((classId) => ({ id: newId(), classId, ...input, createdAt: t }))
  for (const r of rows) await db.insert(feeItems).values(r)
  return rows.map((r) => r.id)
}

export async function listFeeItems(db: Db, classId: string): Promise<FeeItemSummary[]> {
  return db
    .select({
      id: feeItems.id,
      title: feeItems.title,
      amount: feeItems.amount,
      charged: sql<number>`count(${feeCharges.id})`,
      paidInFull: sql<number>`coalesce(sum(case when ${feeCharges.paid} >= ${feeCharges.amount} then 1 else 0 end), 0)`,
      outstanding: sql<number>`coalesce(round(sum(max(${feeCharges.amount} - ${feeCharges.paid}, 0)), 2), 0)`,
    })
    .from(feeItems)
    .leftJoin(feeCharges, eq(feeCharges.itemId, feeItems.id))
    .where(eq(feeItems.classId, classId))
    .groupBy(feeItems.id)
    .orderBy(desc(feeItems.createdAt))
}

async function getItem(db: Db, id: string) {
  const [item] = await db.select().from(feeItems).where(eq(feeItems.id, id))
  if (!item) throw feeItemNotFound()
  return item
}

export async function getFeeSheet(db: Db, id: string): Promise<FeeSheet> {
  const item = await getItem(db, id)
  const [cls] = await db.select({ id: classes.id, name: classes.name }).from(classes).where(eq(classes.id, item.classId))
  // คนที่ปิดใช้งานแล้วแต่ยังมียอดในรายการนี้ ยังต้องเห็น (ตามเก็บเงิน)
  const rows = await db
    .select({
      id: students.id,
      zipgradeId: students.zipgradeId,
      title: students.title,
      firstName: students.firstName,
      lastName: students.lastName,
      active: students.active,
      chargeId: feeCharges.id,
      amount: feeCharges.amount,
      paid: feeCharges.paid,
      note: feeCharges.note,
    })
    .from(students)
    .leftJoin(feeCharges, and(eq(feeCharges.studentId, students.id), eq(feeCharges.itemId, id)))
    .where(and(eq(students.classId, item.classId), or(eq(students.active, true), isNotNull(feeCharges.id))))
    .orderBy(asc(students.sortOrder), asc(students.zipgradeId))
  return {
    item: { id: item.id, classId: item.classId, title: item.title, amount: item.amount },
    class: cls,
    students: rows.map(({ chargeId, amount, paid, note, ...s }) => ({ ...s, charge: chargeId ? { amount: amount!, paid: paid!, note: note! } : null })),
  }
}

export async function updateFeeItem(db: Db, id: string, input: FeeItemInput): Promise<void> {
  await getItem(db, id)
  // ราคาใหม่ใช้กับคนที่เพิ่มทีหลัง ยอดของคนที่มีอยู่แล้วไม่เปลี่ยน
  await db.update(feeItems).set(input).where(eq(feeItems.id, id))
}

export async function deleteFeeItem(db: Db, id: string): Promise<void> {
  await getItem(db, id)
  await db.batch([db.delete(feeCharges).where(eq(feeCharges.itemId, id)), db.delete(feeItems).where(eq(feeItems.id, id))])
}

async function studentInClass(db: Db, studentId: string, classId: string) {
  const [s] = await db.select({ id: students.id }).from(students).where(and(eq(students.id, studentId), eq(students.classId, classId)))
  if (!s) throw studentNotFound()
}

export async function saveCharge(db: Db, itemId: string, studentId: string, input: ChargeInput, t: number): Promise<void> {
  const item = await getItem(db, itemId)
  await studentInClass(db, studentId, item.classId)
  const values = { amount: input.amount, paid: input.paid, note: input.note, updatedAt: t }
  await db
    .insert(feeCharges)
    .values({ id: newId(), itemId, studentId, ...values })
    .onConflictDoUpdate({ target: [feeCharges.itemId, feeCharges.studentId], set: values })
}

export async function removeCharge(db: Db, itemId: string, studentId: string): Promise<void> {
  await getItem(db, itemId)
  await db.delete(feeCharges).where(and(eq(feeCharges.itemId, itemId), eq(feeCharges.studentId, studentId)))
}

/** เพิ่มหลายคนด้วยราคาของรายการ (คนที่มีอยู่แล้วไม่แตะ) — insert ทีละ 10 แถวเพื่อไม่ให้เกิน 100 ตัวแปร */
export async function addCharges(db: Db, itemId: string, studentIds: string[], t: number): Promise<number> {
  const item = await getItem(db, itemId)
  // คนในห้องนี้ (รวมคนที่ออกแล้ว — ครูอาจติ๊กคืนให้คนที่ยังค้างจ่าย)
  const roster = await db.select({ id: students.id }).from(students).where(eq(students.classId, item.classId))
  const allowed = new Set(roster.map((r) => r.id))
  const ids = [...new Set(studentIds)]
  if (ids.some((id) => !allowed.has(id))) throw studentNotFound()
  let added = 0
  for (let i = 0; i < ids.length; i += 10) {
    const rows = ids.slice(i, i + 10).map((studentId) => ({ id: newId(), itemId, studentId, amount: item.amount, paid: 0, note: '', updatedAt: t }))
    added += (await db.insert(feeCharges).values(rows).onConflictDoNothing().returning({ id: feeCharges.id })).length
  }
  return added
}

export async function feesForStudent(db: Db, studentId: string): Promise<StudentFee[]> {
  const rows = await db
    .select({ id: feeItems.id, title: feeItems.title, amount: feeCharges.amount, paid: feeCharges.paid })
    .from(feeCharges)
    .innerJoin(feeItems, eq(feeCharges.itemId, feeItems.id))
    .where(eq(feeCharges.studentId, studentId))
    .orderBy(desc(feeItems.createdAt))
  return rows.map((r) => ({ ...r, outstanding: outstanding(r) }))
}
