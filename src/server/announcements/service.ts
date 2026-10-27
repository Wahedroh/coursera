import { and, desc, eq, gte, isNull, or } from 'drizzle-orm'
import type { AnnouncementInput, StudentAnnouncement, TeacherAnnouncement } from '../../shared/announcements'
import { todayBangkok } from '../../shared/attendance'
import { newId, type Db } from '../db/client'
import { announcementReads, announcements, classes, students } from '../db/schema'
import { apiError } from '../http'

export const announcementNotFound = () => apiError('announcement_not_found', 'ไม่พบประกาศนี้', 404)

export async function createAnnouncements(db: Db, classIds: string[], input: AnnouncementInput, t: number): Promise<string[]> {
  const unique = [...new Set(classIds)]
  for (const id of unique) {
    const [c] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, id))
    if (!c) throw apiError('class_not_found', 'ไม่พบห้องเรียนนี้', 404)
  }
  const rows = unique.map((classId) => ({ id: newId(), classId, ...input, createdAt: t }))
  for (const r of rows) await db.insert(announcements).values(r)
  return rows.map((r) => r.id)
}

/** ประกาศทั้งหมดของห้อง (รวมที่หมดอายุ) พร้อมจำนวนคนอ่านและรายชื่อคนที่ยังไม่อ่าน */
export async function listAnnouncements(db: Db, classId: string, t: number): Promise<TeacherAnnouncement[]> {
  const list = await db.select().from(announcements).where(eq(announcements.classId, classId)).orderBy(desc(announcements.pinned), desc(announcements.createdAt))
  if (!list.length) return []
  const roster = await db
    .select({ id: students.id, firstName: students.firstName, lastName: students.lastName })
    .from(students)
    .where(and(eq(students.classId, classId), eq(students.active, true)))
    .orderBy(students.sortOrder, students.zipgradeId)
  const reads = await db
    .select({ announcementId: announcementReads.announcementId, studentId: announcementReads.studentId })
    .from(announcementReads)
    .innerJoin(announcements, eq(announcements.id, announcementReads.announcementId))
    .where(eq(announcements.classId, classId))
  const readBy = new Map<string, Set<string>>()
  for (const r of reads) (readBy.get(r.announcementId) ?? readBy.set(r.announcementId, new Set()).get(r.announcementId)!).add(r.studentId)
  const today = todayBangkok(t)
  return list.map((a) => {
    const seen = readBy.get(a.id) ?? new Set()
    const unread = roster.filter((s) => !seen.has(s.id))
    return {
      id: a.id,
      title: a.title,
      body: a.body,
      pinned: a.pinned,
      expiresOn: a.expiresOn,
      createdAt: a.createdAt,
      readCount: roster.length - unread.length,
      total: roster.length,
      unread: unread.map((s) => `${s.firstName} ${s.lastName}`),
      expired: a.expiresOn !== null && a.expiresOn < today,
    }
  })
}

async function getAnnouncement(db: Db, id: string) {
  const [a] = await db.select().from(announcements).where(eq(announcements.id, id))
  if (!a) throw announcementNotFound()
  return a
}

export async function updateAnnouncement(db: Db, id: string, input: AnnouncementInput): Promise<void> {
  await getAnnouncement(db, id)
  await db.update(announcements).set(input).where(eq(announcements.id, id))
}

export async function deleteAnnouncement(db: Db, id: string): Promise<void> {
  await getAnnouncement(db, id)
  await db.batch([db.delete(announcementReads).where(eq(announcementReads.announcementId, id)), db.delete(announcements).where(eq(announcements.id, id))])
}

const activeFor = (classId: string, t: number) => and(eq(announcements.classId, classId), or(isNull(announcements.expiresOn), gte(announcements.expiresOn, todayBangkok(t))))

export async function announcementsForStudent(db: Db, studentId: string, classId: string, t: number): Promise<StudentAnnouncement[]> {
  const rows = await db
    .select({ a: announcements, readAt: announcementReads.readAt })
    .from(announcements)
    .leftJoin(announcementReads, and(eq(announcementReads.announcementId, announcements.id), eq(announcementReads.studentId, studentId)))
    .where(activeFor(classId, t))
    .orderBy(desc(announcements.pinned), desc(announcements.createdAt))
  return rows.map(({ a, readAt }) => ({ id: a.id, title: a.title, body: a.body, pinned: a.pinned, createdAt: a.createdAt, read: readAt !== null }))
}

export async function markRead(db: Db, id: string, studentId: string, classId: string, t: number): Promise<void> {
  const [a] = await db.select({ id: announcements.id }).from(announcements).where(and(eq(announcements.id, id), activeFor(classId, t)))
  if (!a) throw announcementNotFound()
  await db.insert(announcementReads).values({ announcementId: id, studentId, readAt: t }).onConflictDoNothing()
}
