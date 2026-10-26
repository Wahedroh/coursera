import { and, desc, eq } from 'drizzle-orm'
import { MATERIAL_TYPES, MAX_MATERIAL_BYTES, materialExt, type MaterialMeta, type StudentMaterial, type TeacherMaterial } from '../../shared/materials'
import { newId, type Db } from '../db/client'
import { classes, materials } from '../db/schema'
import { apiError } from '../http'
import { assertRoom, recordFile, removeFiles } from '../storage/service'

export const materialNotFound = () => apiError('material_not_found', 'ไม่พบเอกสารนี้', 404)
export const invalidMaterial = () => apiError('invalid_material', 'รองรับเฉพาะไฟล์ PDF, Word, PowerPoint หรือรูป ขนาดไม่เกิน 25MB', 400)

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v)
const ZIP = [0x50, 0x4b, 0x03, 0x04]
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
const MAGIC: Record<string, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46],
  docx: ZIP,
  pptx: ZIP,
  doc: OLE,
  ppt: OLE,
  jpg: [0xff, 0xd8, 0xff],
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47],
  webp: [0x52, 0x49, 0x46, 0x46],
}

/** ตรวจนามสกุล + ไบต์หัวไฟล์ (กันไฟล์อื่นเปลี่ยนชื่อมา) คืนนามสกุลและชนิดไฟล์ */
export function checkMaterial(body: ArrayBuffer, fileName: string) {
  const ext = materialExt(fileName)
  if (!ext || body.byteLength === 0 || body.byteLength > MAX_MATERIAL_BYTES || !startsWith(new Uint8Array(body, 0, Math.min(8, body.byteLength)), MAGIC[ext])) {
    throw invalidMaterial()
  }
  return { ext, type: MATERIAL_TYPES[ext] }
}

/** อัปโหลดไฟล์ครั้งเดียว แล้วผูกกับหลายห้องได้ (ทุกห้องใช้ไฟล์เดียวกัน) */
export async function createMaterials(db: Db, bucket: R2Bucket, classIds: string[], meta: MaterialMeta, fileName: string, body: ArrayBuffer, t: number): Promise<string[]> {
  const unique = [...new Set(classIds)]
  if (!unique.length) throw apiError('invalid_request', 'กรุณาเลือกห้องเรียน', 400)
  for (const id of unique) {
    const [c] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, id))
    if (!c) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  }
  const { ext, type } = checkMaterial(body, fileName)
  await assertRoom(db, body.byteLength, true)
  const key = `mat/${newId()}.${ext}`
  await bucket.put(key, body, { httpMetadata: { contentType: type } })
  await recordFile(db, key, body.byteLength, t)
  const name = fileName.trim().slice(-200)
  const rows = unique.map((classId) => ({ id: newId(), classId, ...meta, fileKey: key, fileName: name, size: body.byteLength, createdAt: t }))
  for (const r of rows) await db.insert(materials).values(r)
  return rows.map((r) => r.id)
}

const cols = { id: materials.id, title: materials.title, topic: materials.topic, fileKey: materials.fileKey, fileName: materials.fileName, size: materials.size, published: materials.published, createdAt: materials.createdAt }

export async function listMaterials(db: Db, classId: string): Promise<TeacherMaterial[]> {
  return db.select(cols).from(materials).where(eq(materials.classId, classId)).orderBy(desc(materials.createdAt))
}

async function getMaterial(db: Db, id: string) {
  const [m] = await db.select().from(materials).where(eq(materials.id, id))
  if (!m) throw materialNotFound()
  return m
}

export async function updateMaterial(db: Db, id: string, meta: MaterialMeta): Promise<void> {
  await getMaterial(db, id)
  await db.update(materials).set(meta).where(eq(materials.id, id))
}

export async function setMaterialPublished(db: Db, id: string, published: boolean): Promise<void> {
  await getMaterial(db, id)
  await db.update(materials).set({ published }).where(eq(materials.id, id))
}

/** ลบเอกสาร; ถ้าไม่มีห้องอื่นใช้ไฟล์นี้แล้ว ลบไฟล์ออกจากพื้นที่ด้วย */
export async function deleteMaterial(db: Db, bucket: R2Bucket, id: string): Promise<void> {
  const m = await getMaterial(db, id)
  await db.delete(materials).where(eq(materials.id, id))
  const [other] = await db.select({ id: materials.id }).from(materials).where(eq(materials.fileKey, m.fileKey)).limit(1)
  if (!other) await removeFiles(db, bucket, [m.fileKey])
}

export async function materialsForStudent(db: Db, classId: string): Promise<StudentMaterial[]> {
  const { published: _p, ...studentCols } = cols
  return db.select(studentCols).from(materials).where(and(eq(materials.classId, classId), eq(materials.published, true))).orderBy(desc(materials.createdAt))
}
