import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { newId, type Db } from '../db/client'
import { notifications, pushSubscriptions, students } from '../db/schema'
import { apiError } from '../http'
import type { StudentNotification } from '../../shared/push'
import { isPushEndpoint, vapidAuthorization, vapidKeys } from './vapid'

/** ส่ง push 1 ครั้งไปที่ endpoint — คืนสถานะ HTTP (แยกออกมาเพื่อให้เทสต์แทนที่ได้) */
export type PushSender = (endpoint: string, authorization: string) => Promise<number>
export const httpPushSender: PushSender = async (endpoint, authorization) =>
  (await fetch(endpoint, { method: 'POST', headers: { Authorization: authorization, TTL: '86400', Urgency: 'normal', 'Content-Length': '0' } })).status

/** ส่งได้ไม่เกินนี้ต่อรอบ (Workers แพ็กเกจฟรีจำกัด 50 subrequest ต่อคำขอ) — ที่เหลือส่งรอบถัดไป */
export const PUSH_PER_RUN = 40
const RECENT = 3 * 86400_000

export async function subscribe(db: Db, studentId: string, endpoint: string, t: number): Promise<void> {
  if (!isPushEndpoint(endpoint)) throw apiError('invalid_endpoint', 'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน', 400)
  // เครื่องเดียวกันเปลี่ยนคนล็อกอิน: ย้ายไปเป็นของคนล่าสุด
  await db
    .insert(pushSubscriptions)
    .values({ id: newId(), studentId, endpoint, createdAt: t })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { studentId, createdAt: t } })
}

export async function unsubscribe(db: Db, studentId: string, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.studentId, studentId)))
}

export type NewNotification = { studentId: string; title: string; body?: string; url?: string; dedupeKey?: string }

export async function enqueue(db: Db, rows: NewNotification[], t: number): Promise<void> {
  const values = rows.map((r) => ({ id: newId(), studentId: r.studentId, title: r.title.slice(0, 120), body: (r.body ?? '').slice(0, 200), url: r.url ?? '/me', dedupeKey: r.dedupeKey ?? null, createdAt: t }))
  for (let i = 0; i < values.length; i += 10) await db.insert(notifications).values(values.slice(i, i + 10)).onConflictDoNothing()
}

/** แจ้งนักเรียนทุกคน (ที่ใช้งานอยู่) ในห้องเหล่านี้ */
export async function enqueueForClasses(db: Db, classIds: string[], n: Omit<NewNotification, 'studentId'>, t: number): Promise<void> {
  if (!classIds.length) return
  const roster = await db
    .select({ id: students.id })
    .from(students)
    .where(and(inArray(students.classId, classIds), eq(students.active, true)))
  await enqueue(db, roster.map((s) => ({ ...n, studentId: s.id, dedupeKey: n.dedupeKey ? `${n.dedupeKey}:${s.id}` : undefined })), t)
}

/** ส่ง push ให้นักเรียนที่มีการแจ้งเตือนรอส่ง (1 push ต่ออุปกรณ์ ไม่ว่ามีกี่ข้อความ) */
export async function drain(db: Db, t: number, send: PushSender = httpPushSender, limit = PUSH_PER_RUN): Promise<{ pushed: number; removed: number }> {
  const pending = await db.all<{ studentId: string }>(sql`
    SELECT DISTINCT student_id AS studentId FROM notifications WHERE pushed_at IS NULL AND created_at >= ${t - RECENT} LIMIT 200`)
  if (!pending.length) return { pushed: 0, removed: 0 }
  const ids = pending.map((p) => p.studentId)
  const subs: { id: string; studentId: string; endpoint: string }[] = []
  for (let i = 0; i < ids.length; i += 50) {
    subs.push(
      ...(await db
        .select({ id: pushSubscriptions.id, studentId: pushSubscriptions.studentId, endpoint: pushSubscriptions.endpoint })
        .from(pushSubscriptions)
        .where(inArray(pushSubscriptions.studentId, ids.slice(i, i + 50)))),
    )
  }
  // เรียงตามนักเรียน แล้วตัดตามโควตา — นักเรียนที่ส่งไม่ครบทุกเครื่องเก็บไว้ส่งรอบหน้า
  const byStudent = new Map<string, typeof subs>()
  for (const s of subs) (byStudent.get(s.studentId) ?? byStudent.set(s.studentId, []).get(s.studentId)!).push(s)
  const done: string[] = []
  const gone: string[] = []
  let pushed = 0
  const keys = subs.length ? await vapidKeys(db) : null
  for (const studentId of ids) {
    const mine = byStudent.get(studentId) ?? []
    if (pushed + mine.length > limit) break
    for (const s of mine) {
      try {
        const status = await send(s.endpoint, await vapidAuthorization(keys!, s.endpoint, t))
        if (status === 404 || status === 410) gone.push(s.id)
      } catch {
        // เครือข่ายพลาด: ข้ามเครื่องนี้ไป ข้อความยังอยู่ในแอป
      }
      pushed++
    }
    done.push(studentId)
  }
  for (let i = 0; i < done.length; i += 50)
    await db
      .update(notifications)
      .set({ pushedAt: t })
      .where(and(inArray(notifications.studentId, done.slice(i, i + 50)), isNull(notifications.pushedAt)))
  for (let i = 0; i < gone.length; i += 50) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone.slice(i, i + 50)))
  return { pushed, removed: gone.length }
}

/** service worker ได้ push แล้วมาดึงข้อความที่ยังไม่แสดง (สูงสุด 5) และบันทึกว่าแสดงแล้ว */
export async function takeUnshown(db: Db, studentId: string, t: number): Promise<StudentNotification[]> {
  const rows = await db
    .select({ id: notifications.id, title: notifications.title, body: notifications.body, url: notifications.url, createdAt: notifications.createdAt })
    .from(notifications)
    .where(and(eq(notifications.studentId, studentId), isNull(notifications.shownAt), gte(notifications.createdAt, t - RECENT)))
    .orderBy(notifications.createdAt)
    .limit(5)
  if (rows.length)
    await db
      .update(notifications)
      .set({ shownAt: t })
      .where(
        inArray(
          notifications.id,
          rows.map((r) => r.id),
        ),
      )
  return rows
}

/** การแจ้งเตือนล่าสุดของนักเรียน (แสดงในแอป) */
export async function recentNotifications(db: Db, studentId: string, t: number): Promise<StudentNotification[]> {
  return db
    .select({ id: notifications.id, title: notifications.title, body: notifications.body, url: notifications.url, createdAt: notifications.createdAt })
    .from(notifications)
    .where(and(eq(notifications.studentId, studentId), gte(notifications.createdAt, t - 14 * 86400_000)))
    .orderBy(sql`${notifications.createdAt} DESC`)
    .limit(20)
}
