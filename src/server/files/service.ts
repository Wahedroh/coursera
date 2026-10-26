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

/** ครูอ่านได้ทุกไฟล์; นักเรียนอ่านได้เฉพาะรูปที่ตัวเองส่ง รูปประกอบงานในห้องตัวเอง และรูปที่ครูเขียนทับงานของตัวเอง */
export async function canRead(db: Db, session: SessionInfo, key: string): Promise<boolean> {
  if (session.kind === 'teacher') return true
  if (key.startsWith(`sub/${session.studentId}/`)) return true
  const row = await db.get<{ ok: number }>(sql`
    SELECT 1 AS ok WHERE
      EXISTS (SELECT 1 FROM assignments a, json_each(a.attachment_keys) j WHERE a.class_id = ${session.classId} AND j.value = ${key})
      OR EXISTS (SELECT 1 FROM submissions s, json_each(s.annotated_keys) j WHERE s.student_id = ${session.studentId} AND j.value = ${key})`)
  return !!row
}
