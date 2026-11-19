import { sql } from 'drizzle-orm'
import type { TeacherInsights } from '../../shared/teacherInsights'
import type { Db } from '../db/client'
import { atRiskCounts } from '../remedial/service'

export async function teacherInsights(db: Db, t: number): Promise<TeacherInsights> {
  const atRisk = { attendance: 0, incomplete: 0, zero: 0 }
  for (const c of (await atRiskCounts(db, t)).values()) {
    atRisk.attendance += c.attendance
    atRisk.incomplete += c.incomplete
    atRisk.zero += c.zero
  }
  const [r] = await db.all<{ remedial: number; leaves: number }>(sql`
    SELECT (SELECT count(*) FROM remedials WHERE status = 'submitted') AS remedial, (SELECT count(*) FROM leave_requests WHERE status = 'pending') AS leaves`)
  const [f] = await db.all<{ students: number; baht: number }>(sql`
    SELECT count(DISTINCT fc.student_id) AS students, coalesce(sum(fc.amount - fc.paid), 0) AS baht
    FROM fee_charges fc JOIN fee_items fi ON fi.id = fc.item_id JOIN classes c ON c.id = fi.class_id JOIN students st ON st.id = fc.student_id
    WHERE c.archived = 0 AND st.active = 1 AND fc.amount - fc.paid > 0.004`)
  return { atRisk, remedialToReview: r.remedial, leavesPending: r.leaves, fees: { students: f.students, baht: Math.round(f.baht * 100) / 100 } }
}
