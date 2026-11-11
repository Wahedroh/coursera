import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { announcementReads, attendanceRecords, eggs, feeCharges, pointEvents, scores, sessions, studentAvatars, students, submissions, notifications, pushSubscriptions, cardAnswers, studentNotes } from '../db/schema'
import { apiError } from '../http'
import { removeFiles } from '../storage/service'

/** ลบนักเรียนถาวร พร้อมข้อมูลทั้งหมดของคนนั้น (งานที่ส่ง+รูป คะแนน เช็กชื่อ แต้ม ค่าเอกสาร ตัวละคร การล็อกอิน) — กู้คืนไม่ได้ */
export async function deleteStudent(db: Db, bucket: R2Bucket, id: string): Promise<{ name: string }> {
  const [s] = await db.select({ id: students.id, firstName: students.firstName, lastName: students.lastName }).from(students).where(eq(students.id, id))
  if (!s) throw apiError('student_not_found', 'ไม่พบนักเรียน', 404)
  const subs = await db.select({ imageKeys: submissions.imageKeys, annotatedKeys: submissions.annotatedKeys }).from(submissions).where(eq(submissions.studentId, id))
  const keys = subs.flatMap((x) => [...x.imageKeys, ...x.annotatedKeys])
  await db.batch([
    db.delete(sessions).where(eq(sessions.studentId, id)),
    db.delete(submissions).where(eq(submissions.studentId, id)),
    db.delete(pointEvents).where(eq(pointEvents.studentId, id)),
    db.delete(attendanceRecords).where(eq(attendanceRecords.studentId, id)),
    db.delete(eggs).where(eq(eggs.studentId, id)),
    db.delete(scores).where(eq(scores.studentId, id)),
    db.delete(announcementReads).where(eq(announcementReads.studentId, id)),
    db.delete(feeCharges).where(eq(feeCharges.studentId, id)),
    db.delete(studentAvatars).where(eq(studentAvatars.studentId, id)),
    db.delete(notifications).where(eq(notifications.studentId, id)),
    db.delete(pushSubscriptions).where(eq(pushSubscriptions.studentId, id)),
    db.delete(cardAnswers).where(eq(cardAnswers.studentId, id)),
    db.delete(studentNotes).where(eq(studentNotes.studentId, id)),
    db.delete(students).where(eq(students.id, id)),
  ])
  // รูปงานที่ส่ง/รูปที่ครูเขียนทับ — ลบหลังลบข้อมูลแล้ว (ถ้าพลาด "ลบไฟล์ค้าง" จะเก็บให้ภายหลัง)
  await removeFiles(db, bucket, keys)
  return { name: `${s.firstName} ${s.lastName}`.trim() }
}
