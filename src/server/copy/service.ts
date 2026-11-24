import { inArray, sql } from 'drizzle-orm'
import type { CopyInput, CopyType, LibraryItem, LibraryPreview } from '../../shared/copy'
import { newId, type Db } from '../db/client'
import { announcements, assignments, classes, examSets, materials, scoreItems, videos } from '../db/schema'
import { eq } from 'drizzle-orm'
import { CATEGORY_LABEL } from '../../shared/scores'
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
        await db.insert(scoreItems).values({ id, classId, title: s.title, category: s.category, maxScore: s.maxScore, takenOn: s.takenOn, makeupDays: s.makeupDays, examSetId: s.examSetId, published: false, sortOrder: s.sortOrder, createdAt: t, updatedAt: t })
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

const TABLE: Record<CopyType, string> = { assignment: 'assignments', 'score-item': 'score_items', video: 'videos', material: 'materials', announcement: 'announcements' }
const thDate = (t: number) => new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(t)
const thDay = (d: string) => new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short', year: '2-digit' }).format(Date.parse(`${d}T00:00:00Z`))
const MODE: Record<string, string> = { text: 'พิมพ์ตอบ', image: 'ส่งรูป', both: 'พิมพ์ + รูป' }

export async function libraryPreview(db: Db, type: CopyType, id: string): Promise<LibraryPreview> {
  const base: Omit<LibraryPreview, 'title' | 'usedIn'> = { type, facts: [], text: '', images: [], file: null, youtubeId: null, questions: [] }
  let title = ''
  if (type === 'assignment') {
    const [a] = await db.select().from(assignments).where(eq(assignments.id, id))
    if (!a) throw apiError('not_found', 'ไม่พบรายการนี้', 404)
    title = a.title
    base.facts = [
      { label: 'คะแนนเต็ม', value: String(a.maxScore) },
      { label: 'ส่งแบบ', value: MODE[a.submitMode] ?? a.submitMode },
      { label: 'กำหนดส่ง (ต้นแบบ)', value: a.dueAt ? thDate(a.dueAt) : 'ไม่มี' },
      { label: 'EXP', value: String(a.expReward) },
    ]
    base.text = a.instructions
    base.images = a.attachmentKeys
  } else if (type === 'score-item') {
    const [i] = await db.select().from(scoreItems).where(eq(scoreItems.id, id))
    if (!i) throw apiError('not_found', 'ไม่พบรายการนี้', 404)
    title = i.title
    const [set] = i.examSetId ? await db.select({ title: examSets.title }).from(examSets).where(eq(examSets.id, i.examSetId)) : []
    base.facts = [
      { label: 'หมวด', value: CATEGORY_LABEL[i.category] },
      { label: 'คะแนนเต็ม', value: String(i.maxScore) },
      { label: 'วันที่สอบ (ต้นแบบ)', value: thDay(i.takenOn) },
      { label: 'สอบย้อนหลัง', value: i.makeupDays > 0 ? `${i.makeupDays} วัน${set ? ` · ชุด ${set.title}` : ''}` : 'ไม่เปิด' },
    ]
  } else if (type === 'video') {
    const [v] = await db.select().from(videos).where(eq(videos.id, id))
    if (!v) throw apiError('not_found', 'ไม่พบรายการนี้', 404)
    title = v.title
    base.text = v.description
    base.youtubeId = v.youtubeId
    base.questions = v.questions
    base.facts = [{ label: 'คำถามท้ายคลิป', value: v.questions.length ? `${v.questions.length} ข้อ` : 'ไม่มี' }]
  } else if (type === 'material') {
    const [m] = await db.select().from(materials).where(eq(materials.id, id))
    if (!m) throw apiError('not_found', 'ไม่พบรายการนี้', 404)
    title = m.title
    base.file = { key: m.fileKey, fileName: m.fileName }
    base.facts = [
      { label: 'ประเภท', value: m.kind === 'notes' ? 'เอกสารที่จดในห้อง' : 'เอกสารเปล่า (ใบงาน/ใบความรู้)' },
      ...(m.topic ? [{ label: 'หัวข้อ', value: m.topic }] : []),
      ...(m.lessonDate ? [{ label: 'วันที่สอน', value: thDay(m.lessonDate) }] : []),
      { label: 'ไฟล์', value: m.fileName },
    ]
  } else {
    const [a] = await db.select().from(announcements).where(eq(announcements.id, id))
    if (!a) throw apiError('not_found', 'ไม่พบรายการนี้', 404)
    title = a.title
    base.text = a.body
    base.facts = [{ label: 'ปักหมุด', value: a.pinned ? 'ใช่' : 'ไม่' }, ...(a.expiresOn ? [{ label: 'หมดอายุ', value: thDay(a.expiresOn) }] : [])]
  }
  const usedIn = await db.all<{ classId: string; className: string; schoolName: string; createdAt: number; published: number }>(sql`
    SELECT t.class_id AS classId, c.name AS className, s.name AS schoolName, t.created_at AS createdAt, t.published AS published
    FROM ${sql.raw(TABLE[type])} t JOIN classes c ON c.id = t.class_id JOIN schools s ON s.id = c.school_id
    WHERE t.title = ${title} ORDER BY t.created_at DESC LIMIT 100`)
  return { ...base, title, usedIn: usedIn.map((u) => ({ ...u, published: !!u.published })) }
}
