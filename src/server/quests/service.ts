import { sql } from 'drizzle-orm'
import { todayBangkok } from '../../shared/attendance'
import { QUESTS, weekStartBangkok, type QuestId, type WeeklyQuests } from '../../shared/quests'
import { newId, type Db } from '../db/client'
import { pointEvents } from '../db/schema'
import { apiError } from '../http'

const WEEK = 7 * 86400_000
const refOf = (week: string, id: QuestId, studentId: string) => `${week}:${id}:${studentId}`

export async function weeklyQuests(db: Db, studentId: string, classId: string, t: number): Promise<WeeklyQuests> {
  const start = weekStartBangkok(t)
  const end = start + WEEK
  const week = todayBangkok(start)
  const [att] = await db.all<{ n: number }>(sql`
    SELECT count(*) AS n FROM attendance_records r JOIN attendance_days d ON d.id = r.day_id
    WHERE r.student_id = ${studentId} AND d.class_id = ${classId} AND d.date >= ${week} AND d.date <= ${todayBangkok(end - 1)}
      AND r.status IN ('present', 'late')`)
  const [sub] = await db.all<{ n: number }>(sql`
    SELECT count(*) AS n FROM submissions s JOIN assignments a ON a.id = s.assignment_id
    WHERE s.student_id = ${studentId} AND s.submitted_at >= ${start} AND s.submitted_at < ${end}
      AND s.status != 'returned' AND (a.due_at IS NULL OR s.submitted_at <= a.due_at)`)
  const [vid] = await db.all<{ n: number }>(sql`
    SELECT count(*) AS n FROM point_events WHERE student_id = ${studentId} AND source = 'video' AND created_at >= ${start} AND created_at < ${end}`)
  const claimed = new Set(
    (
      await db.all<{ ref: string }>(sql`
        SELECT ref_id AS ref FROM point_events WHERE student_id = ${studentId} AND source = 'quest' AND ref_id LIKE ${`${week}:%`}`)
    ).map((r) => r.ref),
  )
  const progress: Record<QuestId, number> = { attend: att?.n ?? 0, submit: sub?.n ?? 0, video: vid?.n ?? 0 }
  return {
    week,
    endsAt: end,
    quests: QUESTS.map((q) => ({ ...q, progress: Math.min(q.need, progress[q.id]), claimed: claimed.has(refOf(week, q.id, studentId)) })),
  }
}

export async function claimQuest(db: Db, studentId: string, classId: string, id: string, t: number): Promise<WeeklyQuests> {
  const all = await weeklyQuests(db, studentId, classId, t)
  const q = all.quests.find((x) => x.id === id)
  if (!q) throw apiError('quest_not_found', 'ไม่พบภารกิจนี้', 404)
  if (q.claimed) return all
  if (q.progress < q.need) throw apiError('quest_not_done', 'ยังทำภารกิจนี้ไม่ครบ', 409)
  await db
    .insert(pointEvents)
    .values({ id: newId(), studentId, delta: q.exp, reason: `ภารกิจสัปดาห์: ${q.title}`, source: 'quest', refId: refOf(all.week, q.id, studentId), createdAt: t })
    .onConflictDoNothing()
  return weeklyQuests(db, studentId, classId, t)
}
