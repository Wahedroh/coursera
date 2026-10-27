import { sql } from 'drizzle-orm'
import { todayBangkok } from '../../shared/attendance'
import type { WatchReason, Watchlist, WatchlistQuery, WatchStudent } from '../../shared/watchlist'
import type { Db } from '../db/client'
import { classGrades } from '../grades/service'

/** นักเรียนที่ต้องติดตาม ทุกห้อง — ค้างงานที่เลยกำหนด (รวมงานที่ครูส่งกลับให้แก้) · ขาดเรียนในช่วง N วัน · เกรดคาดการณ์ต่ำ · ยังไม่ตั้ง PIN */
export async function watchlist(db: Db, q: WatchlistQuery, t: number): Promise<Watchlist> {
  const from = todayBangkok(t - (q.days - 1) * 86400_000)
  const cls = await db.all<{ id: string; name: string }>(sql`SELECT id, name FROM classes ORDER BY name`)
  const roster = await db.all<{ id: string; classId: string; zipgradeId: string; title: string | null; firstName: string; lastName: string; hasPin: number }>(sql`
    SELECT id, class_id AS classId, zipgrade_id AS zipgradeId, title, first_name AS firstName, last_name AS lastName, pin_hash IS NOT NULL AS hasPin
    FROM students WHERE active = 1 ORDER BY sort_order, zipgrade_id`)
  const missing = await db.all<{ studentId: string; title: string }>(sql`
    SELECT st.id AS studentId, a.title AS title FROM students st
    JOIN assignments a ON a.class_id = st.class_id
    LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = st.id
    WHERE st.active = 1 AND a.due_at IS NOT NULL AND a.due_at < ${t} AND (s.id IS NULL OR s.status = 'returned')
    ORDER BY a.due_at`)
  const att = await db.all<{ studentId: string; absent: number; late: number }>(sql`
    SELECT r.student_id AS studentId, sum(r.status = 'absent') AS absent, sum(r.status = 'late') AS late
    FROM attendance_records r JOIN attendance_days d ON d.id = r.day_id
    WHERE d.date >= ${from} GROUP BY r.student_id`)
  const missingBy = new Map<string, string[]>()
  for (const m of missing) (missingBy.get(m.studentId) ?? missingBy.set(m.studentId, []).get(m.studentId)!).push(m.title)
  const attBy = new Map(att.map((a) => [a.studentId, a]))
  const out: Watchlist['classes'] = []
  for (const c of cls) {
    const members = roster.filter((s) => s.classId === c.id)
    if (!members.length) continue
    const grades = new Map((await classGrades(db, c.id)).students.map((g) => [g.id, g.grade]))
    const flagged: WatchStudent[] = []
    for (const s of members) {
      const titles = missingBy.get(s.id) ?? []
      const a = attBy.get(s.id)
      const grade = grades.get(s.id) ?? null
      const reasons: WatchReason[] = []
      if (titles.length >= q.missing) reasons.push('missing')
      if ((a?.absent ?? 0) >= q.absent) reasons.push('absent')
      if (grade !== null && Number(grade) <= q.grade) reasons.push('grade')
      if (!s.hasPin) reasons.push('no_pin')
      if (!reasons.length) continue
      flagged.push({
        id: s.id,
        zipgradeId: s.zipgradeId,
        name: `${s.title ?? ''}${s.firstName} ${s.lastName}`.trim(),
        reasons,
        missing: titles.length,
        missingTitles: titles,
        absent: a?.absent ?? 0,
        late: a?.late ?? 0,
        grade,
      })
    }
    out.push({ id: c.id, name: c.name, total: members.length, students: flagged })
  }
  return { query: q, from, classes: out }
}
