import { sql } from 'drizzle-orm'
import { todayBangkok, type AttendanceStatus } from '../../shared/attendance'
import { QUESTS, STREAK_REWARDS, STREAK_SHIELDS, WHEEL, weekStartBangkok, type Streak, type WheelState } from '../../shared/quests'
import { newId, type Db } from '../db/client'
import { pointEvents } from '../db/schema'
import { apiError } from '../http'
import { termWindow } from '../terms/service'
import { secureRandom } from '../points/service'

/** สตรีคจากลำดับการเช็กชื่อ (เรียงวันที่): มา/สาย = +1 · ป่วย/ลา = ไม่นับแต่ไม่ขาด · ขาด = ใช้โล่ก่อน หมดโล่แล้วเริ่มใหม่ */
export function computeStreak(statuses: AttendanceStatus[], shields = STREAK_SHIELDS): { current: number; best: number; shieldsLeft: number } {
  let current = 0
  let best = 0
  let left = shields
  for (const s of statuses) {
    if (s === 'present' || s === 'late') best = Math.max(best, ++current)
    else if (s === 'absent') {
      if (left > 0) left--
      else current = 0
    }
  }
  return { current, best, shieldsLeft: left }
}

/** สตรีคของเทอมนี้ + ให้รางวัลขั้นที่ถึงแล้ว (ครั้งเดียวต่อขั้นต่อเทอม — ถึงแล้วได้เลยแม้สตรีคขาดทีหลัง) */
export async function studentStreak(db: Db, studentId: string, classId: string, t: number): Promise<Streak> {
  const w = await termWindow(db)
  const rows = await db.all<{ status: AttendanceStatus }>(sql`
    SELECT r.status FROM attendance_records r JOIN attendance_days d ON d.id = r.day_id
    WHERE r.student_id = ${studentId} AND d.class_id = ${classId} AND d.date >= ${todayBangkok(w.start)} AND d.date <= ${todayBangkok(t)}
    ORDER BY d.date`)
  const s = computeStreak(rows.map((r) => r.status))
  const due = STREAK_REWARDS.filter((r) => s.best >= r.at)
  if (due.length)
    await db
      .insert(pointEvents)
      .values(due.map((r) => ({ id: newId(), studentId, delta: r.exp, reason: `🔥 มาเรียนต่อเนื่อง ${r.at} คาบ`, source: 'streak' as const, refId: `${w.term.id}:${r.at}:${studentId}`, createdAt: t })))
      .onConflictDoNothing()
  return {
    ...s,
    next: STREAK_REWARDS.find((r) => s.best < r.at) ?? null,
    rewards: STREAK_REWARDS.map((r) => ({ ...r, got: s.best >= r.at })),
  }
}

const wheelRef = (week: string, studentId: string) => `${week}:${studentId}`

async function weekInfo(db: Db, studentId: string, t: number) {
  const week = todayBangkok(weekStartBangkok(t))
  const [q] = await db.all<{ n: number }>(sql`
    SELECT count(*) AS n FROM point_events WHERE student_id = ${studentId} AND source = 'quest' AND ref_id LIKE ${`${week}:%`}`)
  const [spun] = await db.all<{ delta: number; reason: string }>(sql`
    SELECT delta, reason FROM point_events WHERE source = 'wheel' AND ref_id = ${wheelRef(week, studentId)}`)
  return { week, questsDone: (q?.n ?? 0) >= QUESTS.length, spun }
}

export async function wheelState(db: Db, studentId: string, t: number): Promise<WheelState> {
  const { week, questsDone, spun } = await weekInfo(db, studentId, t)
  const index = spun ? Number(/#(\d+)/.exec(spun.reason)?.[1] ?? -1) : -1
  return { week, canSpin: questsDone && !spun, spun: spun ? { index, exp: spun.delta } : null }
}

/** หมุนวงล้อ (สุ่มที่เซิร์ฟเวอร์ · สัปดาห์ละครั้ง · ต้องทำภารกิจครบ) */
export async function spinWheel(db: Db, studentId: string, t: number, rand = secureRandom): Promise<WheelState> {
  const { week, questsDone, spun } = await weekInfo(db, studentId, t)
  if (spun) return wheelState(db, studentId, t)
  if (!questsDone) throw apiError('quests_not_done', 'ทำภารกิจสัปดาห์นี้ให้ครบก่อนจึงหมุนวงล้อได้', 409)
  const index = Math.floor(rand() * WHEEL.length) % WHEEL.length
  await db
    .insert(pointEvents)
    .values({ id: newId(), studentId, delta: WHEEL[index], reason: `🎡 วงล้อนำโชค #${index}`, source: 'wheel', refId: wheelRef(week, studentId), createdAt: t })
    .onConflictDoNothing()
  return wheelState(db, studentId, t)
}
