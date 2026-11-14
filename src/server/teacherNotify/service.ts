import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { todayBangkok } from '../../shared/attendance'
import { DEFAULT_TEACHER_NOTIFY, inQuietHours, teacherNotifySchema, type TeacherInbox, type TeacherNotification, type TeacherNotifySettings } from '../../shared/teacherNotify'
import { bangkokClock, slotTimes } from '../../shared/timetable'
import { newId, type Db } from '../db/client'
import { settings, teacherNotifications, teacherPushSubscriptions } from '../db/schema'
import { apiError } from '../http'
import { httpPushSender, type PushSender } from '../push/service'
import { isPushEndpoint, vapidAuthorization, vapidKeys } from '../push/vapid'
import { isPaused, listSlots } from '../timetable/service'

const KEY = 'teacher_notify'
const RECENT = 24 * 3600_000
/** ครูได้ไม่เกินนี้ต่อรอบ (แบ่งโควตา subrequest กับของนักเรียน) */
export const TEACHER_PUSH_PER_RUN = 8

export async function getNotifySettings(db: Db): Promise<TeacherNotifySettings> {
  const [r] = await db.select().from(settings).where(eq(settings.key, KEY))
  if (!r) return DEFAULT_TEACHER_NOTIFY
  try {
    const p = teacherNotifySchema.safeParse({ ...DEFAULT_TEACHER_NOTIFY, ...JSON.parse(r.value) })
    return p.success ? p.data : DEFAULT_TEACHER_NOTIFY
  } catch {
    return DEFAULT_TEACHER_NOTIFY
  }
}
export async function saveNotifySettings(db: Db, s: TeacherNotifySettings): Promise<void> {
  const value = JSON.stringify(s)
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
}

type New = { kind: string; title: string; body?: string; url?: string; dedupeKey?: string }
export async function notifyTeacher(db: Db, n: New, t: number): Promise<void> {
  await db
    .insert(teacherNotifications)
    .values({ id: newId(), kind: n.kind, title: n.title.slice(0, 120), body: (n.body ?? '').slice(0, 200), url: n.url ?? '/teacher', dedupeKey: n.dedupeKey ?? null, createdAt: t })
    .onConflictDoNothing()
}

/** นักเรียนส่งงานที่ครูส่งกลับให้แก้แล้ว — รวมเป็นรายการเดียวต่องานต่อวัน (“ส่งแก้แล้ว N คน”) */
export async function notifyResubmitted(db: Db, a: { id: string; title: string; classId: string }, t: number): Promise<void> {
  const s = await getNotifySettings(db)
  if (!s.resubmitted.on) return
  const key = `resub:${a.id}:${todayBangkok(t)}`
  await db.run(sql`
    INSERT INTO teacher_notifications (id, kind, title, body, url, dedupe_key, count, created_at)
    VALUES (${newId()}, 'resubmitted', ${`↩️ ส่งแก้แล้ว 1 คน · ${a.title}`.slice(0, 120)}, 'รอครูตรวจรอบแก้', ${`/teacher/classes/${a.classId}/gradebook`}, ${key}, 1, ${t})
    ON CONFLICT (dedupe_key) DO UPDATE SET count = count + 1, title = substr('↩️ ส่งแก้แล้ว ' || (count + 1) || ' คน · ' || ${a.title}, 1, 120), read_at = NULL`)
}

/** ของที่ตั้งเวลาไว้ เผยแพร่ให้นักเรียนแล้ว */
export async function notifyReleased(db: Db, items: { title: string }[], t: number): Promise<void> {
  if (!items.length) return
  const s = await getNotifySettings(db)
  if (!s.released.on) return
  const title = items.length === 1 ? `📣 เผยแพร่แล้ว: ${items[0].title}` : `📣 เผยแพร่ตามเวลาแล้ว ${items.length} รายการ`
  await notifyTeacher(db, { kind: 'released', title, body: items.map((x) => x.title).join(' · '), url: '/teacher/scheduled' }, t)
}

const selfieKey = (slotId: string, date: string) => `selfie_done:${slotId}:${date}`
export async function markSelfieDone(db: Db, slotId: string, date: string, done: boolean): Promise<void> {
  if (done) await db.insert(settings).values({ key: selfieKey(slotId, date), value: '1' }).onConflictDoNothing()
  else await db.delete(settings).where(eq(settings.key, selfieKey(slotId, date)))
}
export async function selfieDone(db: Db, slotId: string, date: string): Promise<boolean> {
  const [r] = await db.select().from(settings).where(eq(settings.key, selfieKey(slotId, date)))
  return !!r
}

/** สร้างแจ้งเตือนตามเวลา (เรียกจากงานตามเวลาทุก 5 นาที) · แต่ละเรื่องส่งครั้งเดียวด้วย dedupe key */
export async function generateTeacherNotifications(db: Db, t: number): Promise<number> {
  const s = await getNotifySettings(db)
  const date = todayBangkok(t)
  const { weekday, dayStart, minute } = bangkokClock(t)
  let n = 0
  const add = async (x: New) => {
    await notifyTeacher(db, x, t)
    n++
  }

  if (!(await isPaused(db))) {
    const slots = (await listSlots(db)).filter((x) => x.weekday === weekday)
    if (slots.length) {
      const classes = await db.all<{ id: string; name: string }>(sql`SELECT id, name FROM classes`)
      const name = (id: string) => classes.find((c) => c.id === id)?.name ?? ''
      const days = new Set(
        (await db.all<{ classId: string }>(sql`SELECT class_id AS classId FROM attendance_days WHERE date = ${date}`)).map((d) => d.classId),
      )
      for (const sl of slots) {
        const occ = slotTimes(sl, dayStart)
        if (s.beforeClass.on && t >= occ.start - s.beforeClass.minutes * 60_000 && t < occ.start) {
          const [{ due }] = await db.all<{ due: number }>(sql`
            SELECT count(*) AS due FROM assignments WHERE class_id = ${sl.classId} AND published = 1 AND due_at > ${t} AND due_at <= ${occ.end}`)
          await add({
            kind: 'before-class',
            title: `⏰ อีก ${Math.max(1, Math.round((occ.start - t) / 60_000))} นาทีเข้าคาบ`,
            body: `${name(sl.classId)} · ${sl.start}–${sl.end}${due ? ` · มีงานครบกำหนดคาบนี้ ${due} ชิ้น` : ''}`,
            url: `/teacher/classes/${sl.classId}`,
            dedupeKey: `pre:${sl.id}:${date}`,
          })
        }
        if (s.selfie.on && s.selfie.url && t >= occ.start && t < occ.end && !(await selfieDone(db, sl.id, date)))
          await add({ kind: 'selfie', title: '📸 ยืนยันการสอน (เซลฟี + พิกัด)', body: `${name(sl.classId)} · ${sl.start}–${sl.end} · แตะเพื่อเปิดหน้ายืนยัน`, url: s.selfie.url, dedupeKey: `selfie:${sl.id}:${date}` })
        const after = occ.end + s.missedAttendance.afterMinutes * 60_000
        if (s.missedAttendance.on && t >= after && t < after + 3 * 3600_000 && !days.has(sl.classId))
          await add({
            kind: 'missed-attendance',
            title: '📋 ยังไม่เช็กชื่อ',
            body: `${name(sl.classId)} (คาบ ${sl.start}) · แตะเพื่อเช็กชื่อย้อนหลัง`,
            url: `/teacher/classes/${sl.classId}/attendance?date=${date}`,
            dedupeKey: `miss:${sl.id}:${date}`,
          })
      }
    }
  }

  // สรุปงานรอตรวจ วันละครั้ง
  const at = Number(s.toGrade.at.slice(0, 2)) * 60 + Number(s.toGrade.at.slice(3, 5))
  if (s.toGrade.on && minute >= at) {
    const rows = await db.all<{ name: string; n: number }>(sql`
      SELECT c.name, count(*) AS n FROM submissions s JOIN assignments a ON a.id = s.assignment_id JOIN classes c ON c.id = a.class_id
      WHERE s.status IN ('submitted', 'late') GROUP BY c.id ORDER BY n DESC`)
    const total = rows.reduce((x, r) => x + r.n, 0)
    if (total)
      await add({
        kind: 'to-grade',
        title: `✅ งานรอตรวจ ${total} ชิ้น`,
        body: rows
          .slice(0, 3)
          .map((r) => `${r.name} (${r.n})`)
          .join(' · '),
        url: '/teacher/menu/gradebook',
        dedupeKey: `grade:${date}`,
      })
  }

  // ครบกำหนดแล้วยังมีคนค้าง (งานที่เพิ่งครบกำหนดใน 1 วันที่ผ่านมา)
  if (s.overdue.on) {
    const rows = await db.all<{ id: string; title: string; classId: string; name: string; missing: number }>(sql`
      SELECT a.id, a.title, a.class_id AS classId, c.name,
        (SELECT count(*) FROM students st WHERE st.class_id = a.class_id AND st.active = 1
          AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id = a.id AND s.student_id = st.id AND s.status != 'returned')) AS missing
      FROM assignments a JOIN classes c ON c.id = a.class_id
      WHERE a.published = 1 AND a.due_at <= ${t} AND a.due_at > ${t - RECENT}
        AND NOT EXISTS (SELECT 1 FROM teacher_notifications n WHERE n.dedupe_key = 'due:' || a.id)`)
    for (const r of rows)
      if (r.missing > 0)
        await add({ kind: 'overdue', title: `📮 ครบกำหนด “${r.title}” · ค้าง ${r.missing} คน`, body: r.name, url: `/teacher/classes/${r.classId}/gradebook`, dedupeKey: `due:${r.id}` })
  }
  return n
}

/** ส่ง push ไปทุกเครื่องของครูเมื่อมีแจ้งเตือนใหม่ (ช่วงห้ามรบกวนเก็บไว้ส่งทีหลัง) */
export async function drainTeacher(db: Db, t: number, send: PushSender = httpPushSender): Promise<number> {
  const [pending] = await db.all<{ n: number }>(sql`SELECT count(*) AS n FROM teacher_notifications WHERE pushed_at IS NULL AND created_at >= ${t - RECENT}`)
  if (!pending?.n) return 0
  const s = await getNotifySettings(db)
  if (inQuietHours(s.quiet, bangkokClock(t).minute)) return 0
  const subs = await db.select().from(teacherPushSubscriptions).limit(TEACHER_PUSH_PER_RUN)
  const gone: string[] = []
  if (subs.length) {
    const keys = await vapidKeys(db)
    for (const sub of subs) {
      try {
        const status = await send(sub.endpoint, await vapidAuthorization(keys, sub.endpoint, t))
        if (status === 404 || status === 410) gone.push(sub.id)
      } catch {
        /* เครือข่ายพลาด: ข้อความยังอยู่ในกระดิ่ง */
      }
    }
  }
  await db.update(teacherNotifications).set({ pushedAt: t }).where(and(isNull(teacherNotifications.pushedAt), gte(teacherNotifications.createdAt, t - RECENT)))
  if (gone.length) await db.delete(teacherPushSubscriptions).where(inArray(teacherPushSubscriptions.id, gone))
  return subs.length
}

export async function subscribeTeacher(db: Db, endpoint: string, t: number): Promise<void> {
  if (!isPushEndpoint(endpoint)) throw apiError('invalid_endpoint', 'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน', 400)
  await db.insert(teacherPushSubscriptions).values({ id: newId(), endpoint, createdAt: t }).onConflictDoNothing()
}
export async function unsubscribeTeacher(db: Db, endpoint: string): Promise<void> {
  await db.delete(teacherPushSubscriptions).where(eq(teacherPushSubscriptions.endpoint, endpoint))
}

const cols = { id: teacherNotifications.id, kind: teacherNotifications.kind, title: teacherNotifications.title, body: teacherNotifications.body, url: teacherNotifications.url, createdAt: teacherNotifications.createdAt }

/** service worker ดึงข้อความที่ยังไม่แสดง (สูงสุด 5) */
export async function takeTeacherUnshown(db: Db, t: number): Promise<Omit<TeacherNotification, 'read' | 'kind'>[]> {
  const rows = await db
    .select(cols)
    .from(teacherNotifications)
    .where(and(isNull(teacherNotifications.shownAt), gte(teacherNotifications.createdAt, t - RECENT)))
    .orderBy(teacherNotifications.createdAt)
    .limit(5)
  if (rows.length)
    await db
      .update(teacherNotifications)
      .set({ shownAt: t })
      .where(
        inArray(
          teacherNotifications.id,
          rows.map((r) => r.id),
        ),
      )
  return rows.map(({ kind: _k, ...r }) => r)
}

export async function teacherInbox(db: Db, t: number): Promise<TeacherInbox> {
  const rows = await db
    .select({ ...cols, readAt: teacherNotifications.readAt })
    .from(teacherNotifications)
    .where(gte(teacherNotifications.createdAt, t - 14 * 86400_000))
    .orderBy(desc(teacherNotifications.createdAt))
    .limit(40)
  const items = rows.map(({ readAt, ...r }) => ({ ...r, read: readAt !== null }))
  return { unread: items.filter((x) => !x.read).length, items }
}
export async function markTeacherRead(db: Db, t: number): Promise<void> {
  await db.update(teacherNotifications).set({ readAt: t }).where(isNull(teacherNotifications.readAt))
}
