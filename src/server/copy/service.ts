import { inArray, sql } from 'drizzle-orm'
import type { CopyInput, CopyType, LibraryItem } from '../../shared/copy'
import { newId, type Db } from '../db/client'
import { announcements, assignments, classes, materials, scoreItems, videos } from '../db/schema'
import { apiError } from '../http'
import { listSlots, resolvePublish } from '../timetable/service'
import { nextClassStart } from '../../shared/timetable'

/**
 * คัดลอกงาน/สอบ/คลิป/เอกสาร/ประกาศ ไปห้องอื่น (ได้แต่ตัวรายการ ไม่รวมงานที่ส่ง คะแนน หรือการดูคลิป)
 * คืนรายการที่สร้าง และห้องที่เผยแพร่ทันที (ไว้แจ้งเตือน)
 */
export async function copyItems(db: Db, input: CopyInput, t: number): Promise<{ created: { id: string; classId: string; title: string; body?: string; published: boolean }[] }> {
  const classIds = [...new Set(input.classIds)]
  // D1 จำกัดจำนวนคำสั่งต่อคำขอ — คัดลอกทีละไม่เกิน 40 ชิ้น (รายการ × ห้อง)
  if (input.ids.length * classIds.length > MAX_COPIES) throw apiError('too_many', `คัดลอกได้ครั้งละไม่เกิน ${MAX_COPIES} ชิ้น (รายการ × ห้อง) กรุณาแบ่งเป็นหลายครั้ง`, 400)
  const found = await db.select({ id: classes.id }).from(classes).where(inArray(classes.id, classIds))
  if (found.length !== classIds.length) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  const sched = input.type === 'score-item' ? null : await resolvePublish(db, classIds, input, t)
  const slots = input.due === 'next-period' ? await listSlots(db) : []
  const created: { id: string; classId: string; title: string; body?: string; published: boolean }[] = []
  const pub = (classId: string) => sched?.get(classId) ?? { published: true, publishAt: null }

  if (input.type === 'assignment') {
    const src = await db.select().from(assignments).where(inArray(assignments.id, input.ids))
    if (!src.length) throw notFound()
    for (const a of src)
      for (const classId of classIds) {
        const p = pub(classId)
        const after = p.publishAt ?? t
        const dueAt = input.due === 'none' ? null : input.due === 'next-period' ? (nextClassStart(slots, classId, after) ?? a.dueAt) : a.dueAt
        const id = newId()
        await db.insert(assignments).values({
          id,
          classId,
          title: a.title,
          instructions: a.instructions,
          attachmentKeys: a.attachmentKeys,
          dueAt,
          maxScore: a.maxScore,
          expReward: a.expReward,
          submitMode: a.submitMode,
          ...p,
          createdAt: t,
          updatedAt: t,
        })
        created.push({ id, classId, title: a.title, published: p.published })
      }
  } else if (input.type === 'score-item') {
    const src = await db.select().from(scoreItems).where(inArray(scoreItems.id, input.ids))
    if (!src.length) throw notFound()
    for (const s of src)
      for (const classId of classIds) {
        const id = newId()
        await db.insert(scoreItems).values({ id, classId, title: s.title, category: s.category, maxScore: s.maxScore, takenOn: s.takenOn, published: false, sortOrder: s.sortOrder, createdAt: t, updatedAt: t })
        created.push({ id, classId, title: s.title, published: false })
      }
  } else if (input.type === 'video') {
    const src = await db.select().from(videos).where(inArray(videos.id, input.ids))
    if (!src.length) throw notFound()
    for (const v of src)
      for (const classId of classIds) {
        const id = newId()
        const p = pub(classId)
        await db.insert(videos).values({ id, classId, title: v.title, description: v.description, youtubeId: v.youtubeId, questions: v.questions, ...p, createdAt: t })
        created.push({ id, classId, title: v.title, published: p.published })
      }
  } else if (input.type === 'material') {
    const src = await db.select().from(materials).where(inArray(materials.id, input.ids))
    if (!src.length) throw notFound()
    for (const m of src)
      for (const classId of classIds) {
        const id = newId()
        const p = pub(classId)
        // ใช้ไฟล์เดียวกัน (ลบห้องใดห้องหนึ่ง ไฟล์ยังอยู่จนกว่าจะไม่มีห้องไหนใช้)
        await db.insert(materials).values({ id, classId, title: m.title, topic: m.topic, kind: m.kind, lessonDate: m.lessonDate, fileKey: m.fileKey, fileName: m.fileName, size: m.size, ...p, createdAt: t })
        created.push({ id, classId, title: m.title, published: p.published })
      }
  } else {
    const src = await db.select().from(announcements).where(inArray(announcements.id, input.ids))
    if (!src.length) throw notFound()
    for (const a of src)
      for (const classId of classIds) {
        const id = newId()
        const p = pub(classId)
        await db.insert(announcements).values({ id, classId, title: a.title, body: a.body, pinned: a.pinned, expiresOn: a.expiresOn, ...p, createdAt: t })
        created.push({ id, classId, title: a.title, body: a.body, published: p.published })
      }
  }
  return { created }
}

export const MAX_COPIES = 40
const notFound = () => apiError('not_found', 'ไม่พบรายการที่จะคัดลอก', 404)

const LIB_SQL: Record<CopyType, ReturnType<typeof sql>> = {
  assignment: sql`SELECT title, id, class_id AS classId, created_at AS createdAt, (max_score || ' คะแนน') AS detail FROM assignments`,
  'score-item': sql`SELECT title, id, class_id AS classId, created_at AS createdAt, (max_score || ' คะแนน') AS detail FROM score_items`,
  video: sql`SELECT title, id, class_id AS classId, created_at AS createdAt, CASE WHEN json_array_length(questions) > 0 THEN 'คำถาม ' || json_array_length(questions) || ' ข้อ' ELSE '' END AS detail FROM videos`,
  material: sql`SELECT title, id, class_id AS classId, created_at AS createdAt, CASE kind WHEN 'notes' THEN 'จดในห้อง' ELSE 'เอกสารเปล่า' END AS detail FROM materials`,
  announcement: sql`SELECT title, id, class_id AS classId, created_at AS createdAt, '' AS detail FROM announcements`,
}

/** คลังของครู: ทุกเทอม จัดกลุ่มตามชื่อ เรียงที่ใช้ล่าสุดก่อน */
export async function library(db: Db, type: CopyType): Promise<LibraryItem[]> {
  const rows = await db.all<{ title: string; id: string; classId: string; createdAt: number; detail: string }>(sql`${LIB_SQL[type]} ORDER BY created_at DESC LIMIT 2000`)
  const by = new Map<string, LibraryItem & { classes: Set<string> }>()
  for (const r of rows) {
    const g = by.get(r.title)
    if (g) g.classes.add(r.classId)
    else by.set(r.title, { title: r.title, latestId: r.id, lastUsed: r.createdAt, classCount: 0, detail: r.detail ?? '', classes: new Set([r.classId]) })
  }
  return [...by.values()].slice(0, 300).map(({ classes: cs, ...g }) => ({ ...g, classCount: cs.size }))
}
