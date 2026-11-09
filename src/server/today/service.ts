import { sql } from 'drizzle-orm'
import { todayBangkok } from '../../shared/attendance'
import { DUE_SOON_DAYS, type TeacherToday } from '../../shared/today'
import type { Db } from '../db/client'
import { termWindow } from '../terms/service'

export async function teacherToday(db: Db, t: number): Promise<TeacherToday> {
  const { term, start } = await termWindow(db)
  const date = todayBangkok(t)
  const toGrade = await db.all<TeacherToday['toGrade'][number]>(sql`
    SELECT a.id AS assignmentId, a.title AS title, c.id AS classId, c.name AS className, count(*) AS waiting,
      (SELECT s2.id FROM submissions s2 JOIN students st2 ON st2.id = s2.student_id
        WHERE s2.assignment_id = a.id AND s2.status IN ('submitted', 'late') AND st2.active = 1
        ORDER BY st2.sort_order, st2.zipgrade_id LIMIT 1) AS firstSubmissionId
    FROM submissions s JOIN assignments a ON a.id = s.assignment_id JOIN students st ON st.id = s.student_id JOIN classes c ON c.id = a.class_id
    WHERE s.status IN ('submitted', 'late') AND st.active = 1 AND st.class_id = a.class_id AND a.created_at >= ${start}
    GROUP BY a.id ORDER BY c.name, coalesce(a.due_at, a.created_at)`)
  const absentRows = await db.all<{ classId: string; className: string; name: string }>(sql`
    SELECT c.id AS classId, c.name AS className, st.first_name || ' ' || st.last_name AS name
    FROM attendance_records r JOIN attendance_days d ON d.id = r.day_id JOIN students st ON st.id = r.student_id JOIN classes c ON c.id = d.class_id
    WHERE d.date = ${date} AND r.status = 'absent' AND st.active = 1
    ORDER BY c.name, st.sort_order, st.zipgrade_id`)
  const absent: TeacherToday['absent'] = []
  for (const r of absentRows) {
    const last = absent[absent.length - 1]
    if (last?.classId === r.classId) last.names.push(r.name)
    else absent.push({ classId: r.classId, className: r.className, names: [r.name] })
  }
  const dueSoon = await db.all<TeacherToday['dueSoon'][number]>(sql`
    SELECT a.id AS assignmentId, a.title AS title, c.id AS classId, c.name AS className, a.due_at AS dueAt,
      (SELECT count(*) FROM students st WHERE st.class_id = a.class_id AND st.active = 1
        AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id = a.id AND s.student_id = st.id AND s.status != 'returned')) AS missing
    FROM assignments a JOIN classes c ON c.id = a.class_id
    WHERE a.published = 1 AND a.created_at >= ${start} AND a.due_at >= ${t} AND a.due_at < ${t + DUE_SOON_DAYS * 86400_000}
    ORDER BY a.due_at`)
  return { date, term: term.name, toGrade, absent, dueSoon }
}
