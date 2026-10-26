import { and, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { assignments, storageStats, storedFiles, submissions } from '../db/schema'
import { apiError } from '../http'

/** R2 แพ็กเกจฟรีได้ 10 GB — หยุดรับอัปโหลดก่อนเต็มจริงเล็กน้อย */
export const STORAGE_FREE_BYTES = 10 * 1024 ** 3
export const STORAGE_LIMIT_BYTES = Math.floor(9.5 * 1024 ** 3)
const ORPHAN_AGE_MS = 24 * 3600_000

export type StorageUsage = { bytes: number; files: number; limitBytes: number; freeBytes: number; syncedAt: number | null }

async function ensureStats(db: Db) {
  await db.insert(storageStats).values({ id: 'main' }).onConflictDoNothing()
}

export async function usage(db: Db): Promise<StorageUsage> {
  const [row] = await db.select().from(storageStats).where(eq(storageStats.id, 'main'))
  return { bytes: row?.bytes ?? 0, files: row?.files ?? 0, limitBytes: STORAGE_LIMIT_BYTES, freeBytes: STORAGE_FREE_BYTES, syncedAt: row?.syncedAt ?? null }
}

/** เรียกก่อนอัปโหลด: พื้นที่ใกล้เต็มแล้วไม่รับ (ดีกว่าให้อัปโหลดพังกลางคาบ) */
export async function assertRoom(db: Db, size: number, isTeacher: boolean): Promise<void> {
  const u = await usage(db)
  if (u.bytes + size > STORAGE_LIMIT_BYTES) {
    throw apiError(
      'storage_full',
      isTeacher ? 'พื้นที่เก็บรูปใกล้เต็ม กรุณาลบรูปงานที่ตรวจแล้วในหน้า "พื้นที่ไฟล์"' : 'พื้นที่เก็บรูปของห้องเรียนเต็มชั่วคราว กรุณาแจ้งครู (ส่งเป็นข้อความไปก่อนได้)',
      507,
    )
  }
}

export async function recordFile(db: Db, key: string, size: number, t: number): Promise<void> {
  await ensureStats(db)
  await db.batch([
    db.insert(storedFiles).values({ key, size, createdAt: t }).onConflictDoNothing(),
    db.update(storageStats).set({ bytes: sql`${storageStats.bytes} + ${size}`, files: sql`${storageStats.files} + 1` }).where(eq(storageStats.id, 'main')),
  ])
}

/** ลบไฟล์ทั้งใน R2 และในบัญชีพื้นที่ คืนจำนวนไบต์ที่คืนได้ (เท่าที่รู้ขนาด) */
export async function removeFiles(db: Db, bucket: R2Bucket, keys: string[]): Promise<number> {
  const unique = [...new Set(keys)]
  for (let i = 0; i < unique.length; i += 1000) await bucket.delete(unique.slice(i, i + 1000))
  let bytes = 0
  let files = 0
  for (let i = 0; i < unique.length; i += 90) {
    const chunk = unique.slice(i, i + 90)
    const rows = await db.delete(storedFiles).where(inArray(storedFiles.key, chunk)).returning({ size: storedFiles.size })
    bytes += rows.reduce((n, r) => n + r.size, 0)
    files += rows.length
  }
  if (files) {
    await ensureStats(db)
    await db
      .update(storageStats)
      .set({ bytes: sql`max(${storageStats.bytes} - ${bytes}, 0)`, files: sql`max(${storageStats.files} - ${files}, 0)` })
      .where(eq(storageStats.id, 'main'))
  }
  return bytes
}

/** นับพื้นที่ใหม่จาก R2 จริง (รวมไฟล์เก่าก่อนมีระบบนับ) */
export async function syncFromBucket(db: Db, bucket: R2Bucket, t: number): Promise<StorageUsage> {
  const seen = new Map<string, { size: number; uploaded: number }>()
  let cursor: string | undefined
  do {
    const page = await bucket.list({ cursor, limit: 1000 })
    for (const o of page.objects) seen.set(o.key, { size: o.size, uploaded: o.uploaded.getTime() })
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  const known = new Set((await db.select({ key: storedFiles.key }).from(storedFiles)).map((r) => r.key))
  const toAdd = [...seen].filter(([k]) => !known.has(k)).map(([key, v]) => ({ key, size: v.size, createdAt: v.uploaded }))
  for (let i = 0; i < toAdd.length; i += 30) await db.insert(storedFiles).values(toAdd.slice(i, i + 30)).onConflictDoNothing()
  const gone = [...known].filter((k) => !seen.has(k))
  for (let i = 0; i < gone.length; i += 90) await db.delete(storedFiles).where(inArray(storedFiles.key, gone.slice(i, i + 90)))
  let bytes = 0
  for (const v of seen.values()) bytes += v.size
  await ensureStats(db)
  await db.update(storageStats).set({ bytes, files: seen.size, syncedAt: t }).where(eq(storageStats.id, 'main'))
  return usage(db)
}

export type PurgeCandidate = { assignmentId: string; title: string; className: string; submissions: number; files: number; bytes: number; lastGradedAt: number }

/** งานที่ตรวจแล้วและยังมีรูป จัดกลุ่มตามงาน (ขนาดจากไฟล์ที่ระบบรู้จัก) */
export async function purgeCandidates(db: Db): Promise<PurgeCandidate[]> {
  return db.all<PurgeCandidate>(sql`
    SELECT a.id AS assignmentId, a.title AS title, c.name AS className,
      count(DISTINCT s.id) AS submissions, count(j.value) AS files, coalesce(sum(f.size), 0) AS bytes, max(s.graded_at) AS lastGradedAt
    FROM submissions s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN classes c ON c.id = a.class_id
    JOIN (SELECT s2.id AS sid, j2.value AS value FROM submissions s2, json_each(s2.image_keys) j2 WHERE s2.status = 'graded'
          UNION ALL SELECT s3.id, j3.value FROM submissions s3, json_each(s3.annotated_keys) j3 WHERE s3.status = 'graded') j ON j.sid = s.id
    LEFT JOIN stored_files f ON f.key = j.value
    WHERE s.status = 'graded'
    GROUP BY a.id
    ORDER BY lastGradedAt ASC`)
}

/** ลบรูปของงานที่ตรวจแล้ว (เก็บข้อความ คะแนน คอมเมนต์ไว้) — ตามงาน หรือทุกงานที่ตรวจก่อนวันที่กำหนด */
export async function purgeGraded(
  db: Db,
  bucket: R2Bucket,
  scope: { assignmentId: string } | { gradedBefore: number },
  t: number,
): Promise<{ submissions: number; files: number; bytes: number }> {
  if ('assignmentId' in scope) {
    const [a] = await db.select({ id: assignments.id }).from(assignments).where(eq(assignments.id, scope.assignmentId))
    if (!a) throw apiError('assignment_not_found', 'ไม่พบงานนี้', 404)
  }
  const rows = await db
    .select({ id: submissions.id, imageKeys: submissions.imageKeys, annotatedKeys: submissions.annotatedKeys })
    .from(submissions)
    .where(
      and(
        eq(submissions.status, 'graded'),
        'assignmentId' in scope ? eq(submissions.assignmentId, scope.assignmentId) : and(isNotNull(submissions.gradedAt), lt(submissions.gradedAt, scope.gradedBefore)),
        sql`(json_array_length(${submissions.imageKeys}) > 0 OR json_array_length(${submissions.annotatedKeys}) > 0)`,
      ),
    )
  const keys = rows.flatMap((r) => [...r.imageKeys, ...r.annotatedKeys])
  // ล้างใน DB ก่อน แล้วค่อยลบไฟล์ — ถ้าลบไฟล์พลาด ไฟล์ค้างจะถูกเก็บโดย "ลบไฟล์ค้าง" ภายหลัง
  const ids = rows.map((r) => r.id)
  for (let i = 0; i < ids.length; i += 90) {
    await db
      .update(submissions)
      .set({ imageKeys: [], annotatedKeys: [], imagesPurgedAt: t, updatedAt: t })
      .where(and(inArray(submissions.id, ids.slice(i, i + 90)), eq(submissions.status, 'graded')))
  }
  const bytes = await removeFiles(db, bucket, keys)
  return { submissions: rows.length, files: keys.length, bytes }
}

/** ไฟล์ที่ไม่มีงานไหนอ้างถึงแล้ว (อัปโหลดแต่ไม่ได้ส่ง, รูปที่ครูเขียนทับรอบก่อน) อายุเกิน 1 วัน */
export async function purgeOrphans(db: Db, bucket: R2Bucket, t: number): Promise<{ files: number; bytes: number }> {
  const refs = await db.all<{ k: string }>(sql`
    SELECT j.value AS k FROM submissions s, json_each(s.image_keys) j
    UNION SELECT j.value FROM submissions s, json_each(s.annotated_keys) j
    UNION SELECT j.value FROM assignments a, json_each(a.attachment_keys) j
    UNION SELECT m.file_key FROM materials m`)
  const used = new Set(refs.map((r) => r.k))
  const orphans: { key: string; size: number }[] = []
  let cursor: string | undefined
  do {
    const page = await bucket.list({ cursor, limit: 1000 })
    for (const o of page.objects) if (!used.has(o.key) && t - o.uploaded.getTime() > ORPHAN_AGE_MS) orphans.push({ key: o.key, size: o.size })
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  await removeFiles(db, bucket, orphans.map((o) => o.key))
  return { files: orphans.length, bytes: orphans.reduce((n, o) => n + o.size, 0) }
}
