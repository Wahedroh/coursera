import { and, eq, isNull, lte, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { students } from '../db/schema'

const notLocked = (t: number) => or(isNull(students.lockedUntil), lte(students.lockedUntil, t))

/**
 * จองสิทธิ์ลอง PIN แบบ atomic ก่อนตรวจ PIN — คำขอพร้อมกันได้เลขลำดับต่างกันเสมอ
 * คืนลำดับครั้งที่ลอง (1, 2, …) หรือ null ถ้ากำลังถูกล็อก
 */
export async function reserveLoginAttempt(db: Db, studentId: string, t: number): Promise<number | null> {
  const rows = await db
    .update(students)
    .set({ failedAttempts: sql`${students.failedAttempts} + 1` })
    .where(and(eq(students.id, studentId), notLocked(t)))
    .returning({ failedAttempts: students.failedAttempts })
  return rows.length ? rows[0].failedAttempts : null
}

export async function lockStudent(db: Db, studentId: string, until: number): Promise<void> {
  await db.update(students).set({ failedAttempts: 0, lockedUntil: until }).where(eq(students.id, studentId))
}

/** ล้างตัวนับหลัง PIN ถูก — ไม่ทับการล็อกที่คำขออื่นเพิ่งตั้ง คืน false ถ้าถูกล็อกไปแล้ว */
export async function clearLoginAttempts(db: Db, studentId: string, t: number): Promise<boolean> {
  const rows = await db
    .update(students)
    .set({ failedAttempts: 0, lockedUntil: null })
    .where(and(eq(students.id, studentId), notLocked(t)))
    .returning({ id: students.id })
  return rows.length > 0
}
