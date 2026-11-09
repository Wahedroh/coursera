import { sql } from 'drizzle-orm'
import { BADGES, type BadgeId, type StudentBadge } from '../../shared/badges'
import { characterById, SEASONS, charactersOfSeason } from '../../shared/characters'
import type { Db } from '../db/client'

export async function studentBadges(db: Db, studentId: string): Promise<StudentBadge[]> {
  const [c] = await db.all<Record<Exclude<BadgeId, 'collect8' | 'fullSet'>, number>>(sql`
    SELECT
      (SELECT count(*) FROM attendance_records WHERE student_id = ${studentId} AND status IN ('present', 'late')) AS attend20,
      (SELECT count(*) FROM (
        SELECT substr(d.date, 1, 7) AS m FROM attendance_records r JOIN attendance_days d ON d.id = r.day_id
        WHERE r.student_id = ${studentId} GROUP BY m HAVING count(*) >= 4 AND sum(r.status NOT IN ('present', 'late')) = 0)) AS fullMonth,
      (SELECT count(*) FROM submissions s JOIN assignments a ON a.id = s.assignment_id
        WHERE s.student_id = ${studentId} AND s.status != 'returned' AND (a.due_at IS NULL OR s.submitted_at <= a.due_at)) AS onTime10,
      (SELECT count(*) FROM submissions s JOIN assignments a ON a.id = s.assignment_id
        WHERE s.student_id = ${studentId} AND s.status = 'graded' AND a.max_score > 0 AND s.score >= a.max_score) AS perfect3,
      (SELECT count(*) FROM scores sc JOIN score_items i ON i.id = sc.item_id
        WHERE sc.student_id = ${studentId} AND i.published = 1 AND i.max_score > 0 AND sc.score >= 0.8 * i.max_score) AS exam80,
      (SELECT count(*) FROM point_events WHERE student_id = ${studentId} AND source = 'video') AS video10,
      (SELECT count(*) FROM (
        SELECT substr(ref_id, 1, 10) AS w FROM point_events WHERE student_id = ${studentId} AND source = 'quest' GROUP BY w HAVING count(*) >= 3)) AS quest4`)
  const owned = new Set(
    (await db.all<{ c: string }>(sql`SELECT DISTINCT character_id AS c FROM eggs WHERE student_id = ${studentId} AND character_id IS NOT NULL`))
      .map((r) => r.c)
      .filter((id) => characterById(id)),
  )
  const fullSets = SEASONS.filter(({ season }) => charactersOfSeason(season).every((ch) => owned.has(ch.id))).length
  const count: Record<BadgeId, number> = { ...c, collect8: owned.size, fullSet: fullSets }
  return BADGES.map((b) => {
    const n = Number(count[b.id] ?? 0)
    return { ...b, progress: Math.min(b.need, n), earned: n >= b.need }
  })
}
