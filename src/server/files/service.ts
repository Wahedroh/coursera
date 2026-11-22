import { sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { SessionInfo } from '../env'
import { apiError } from '../http'

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const EXT: Record<(typeof ALLOWED_IMAGE_TYPES)[number], string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export const invalidImage = () => apiError('invalid_image', 'รองรับเฉพาะรูป JPG/PNG/WebP ขนาดไม่เกิน 5MB', 400)

export function checkImage(body: ArrayBuffer, contentType: string): (typeof ALLOWED_IMAGE_TYPES)[number] {
  const type = contentType.split(';')[0].trim().toLowerCase()
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(type) || body.byteLength === 0 || body.byteLength > MAX_IMAGE_BYTES) {
    throw invalidImage()
  }
  return type as (typeof ALLOWED_IMAGE_TYPES)[number]
}

export async function putImage(bucket: R2Bucket, key: string, body: ArrayBuffer, contentType: string): Promise<void> {
  await bucket.put(key, body, { httpMetadata: { contentType } })
}

/** ครูอ่านได้ทุกไฟล์; นักเรียนอ่านได้เฉพาะรูปที่ตัวเองส่ง รูปประกอบงานในห้องตัวเอง รูปที่ครูเขียนทับงานของตัวเอง เอกสารเรียนที่แสดงในห้องตัวเอง และรูปโจทย์ข้อปัจจุบันของเกมการ์ดในห้องตัวเอง */
export async function canRead(db: Db, session: SessionInfo, key: string): Promise<boolean> {
  if (session.kind === 'teacher') return true
  if (key.startsWith(`sub/${session.studentId}/`)) return true
  const row = await db.get<{ ok: number }>(sql`
    SELECT 1 AS ok WHERE
      EXISTS (SELECT 1 FROM assignments a, json_each(a.attachment_keys) j WHERE a.class_id = ${session.classId} AND j.value = ${key})
      OR EXISTS (SELECT 1 FROM submissions s, json_each(s.annotated_keys) j WHERE s.student_id = ${session.studentId} AND j.value = ${key})
      OR EXISTS (SELECT 1 FROM materials m WHERE m.class_id = ${session.classId} AND m.published = 1 AND m.file_key = ${key})
      OR EXISTS (SELECT 1 FROM settings st WHERE st.key = 'payment_info' AND (st.value ->> 'qrKey') = ${key})
      OR EXISTS (SELECT 1 FROM videos v, json_each(v.questions) j WHERE v.class_id = ${session.classId} AND v.published = 1 AND (j.value ->> 'image') = ${key})
      OR EXISTS (SELECT 1 FROM card_games g, json_each(g.questions) j WHERE g.class_id = ${session.classId} AND j.key = g.current AND (j.value ->> 'image') = ${key})
      OR EXISTS (SELECT 1 FROM makeup_exams m JOIN exam_sets e ON e.id = m.exam_set_id, json_each(e.page_keys) j WHERE m.student_id = ${session.studentId} AND m.status = 'in_progress' AND j.value = ${key})`)
  if (row) return true
  // รูปประกอบโจทย์ของข้อสอบที่กำลังทำ (D1 จำกัด UNION/OR ซ้อน จึงแยกคำสั่ง)
  const exam = await db.get<{ ok: number }>(sql`
    SELECT 1 AS ok FROM makeup_exams m JOIN exam_sets e ON e.id = m.exam_set_id, json_each(e.questions) j
    WHERE m.student_id = ${session.studentId} AND m.status = 'in_progress' AND (j.value ->> 'image') = ${key}`)
  return !!exam
}
