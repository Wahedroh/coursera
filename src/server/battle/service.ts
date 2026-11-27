import { eq, sql } from 'drizzle-orm'
import { BATTLE_MIN_SCORED, BATTLE_PASS_PCT, BATTLE_TOP, NO_NICKNAME, type BattleRow, type ExamBattle } from '../../shared/battle'
import type { Db } from '../db/client'
import { settings } from '../db/schema'
import { termWindow } from '../terms/service'

const offKey = (classId: string) => `battle_off:${classId}`
const r1 = (x: number) => Math.round(x * 10) / 10

export async function battleEnabled(db: Db, classId: string): Promise<boolean> {
  const [row] = await db.select().from(settings).where(eq(settings.key, offKey(classId)))
  return !row || JSON.parse(row.value) !== true
}
export async function setBattle(db: Db, classId: string, enabled: boolean): Promise<void> {
  const value = JSON.stringify(!enabled)
  await db.insert(settings).values({ key: offKey(classId), value }).onConflictDoUpdate({ target: settings.key, set: { value } })
}

/** ศึกสอบของเทอมนี้ (ใหม่สุดก่อน) · onlyClass = เฉพาะศึกที่ห้องนี้อยู่ (มุมนักเรียน) */
export async function examBattles(db: Db, onlyClass?: string, studentId?: string): Promise<ExamBattle[]> {
  const { start } = await termWindow(db)
  // สถิติทุกรายการสอบที่เผยแพร่แล้วของเทอมนี้ (ไม่นับเกมการ์ด/อื่น ๆ · ห้องที่ไม่เก็บถาวร · ห้องที่ไม่ได้ปิดศึกสอบ)
  const items = await db.all<{ id: string; title: string; maxScore: number; takenOn: string; classId: string; className: string; schoolName: string; n: number; avg: number | null; pass: number }>(sql`
    SELECT i.id, i.title, i.max_score AS maxScore, i.taken_on AS takenOn, c.id AS classId, c.name AS className, sc.name AS schoolName,
      count(s.score) AS n, avg(s.score * 100.0 / i.max_score) AS avg,
      sum(CASE WHEN s.score * 100.0 / i.max_score >= ${BATTLE_PASS_PCT} THEN 1 ELSE 0 END) AS pass
    FROM score_items i JOIN classes c ON c.id = i.class_id JOIN schools sc ON sc.id = c.school_id
      LEFT JOIN scores s ON s.item_id = i.id AND s.absent = 0 AND s.score IS NOT NULL
    WHERE i.published = 1 AND i.category != 'other' AND i.created_at >= ${start} AND c.archived = 0
      AND NOT EXISTS (SELECT 1 FROM settings st WHERE st.key = 'battle_off:' || c.id AND st.value = 'true')
    GROUP BY i.id`)
  // ครั้งก่อนของแต่ละห้อง = รายการที่เผยแพร่ก่อนหน้า (ตามวันสอบ)
  const byClass = new Map<string, typeof items>()
  for (const it of items) byClass.set(it.classId, [...(byClass.get(it.classId) ?? []), it])
  for (const xs of byClass.values()) xs.sort((a, b) => a.takenOn.localeCompare(b.takenOn) || a.id.localeCompare(b.id))
  const prevAvg = (it: (typeof items)[number]) => {
    const xs = byClass.get(it.classId)!
    const before = xs.slice(0, xs.indexOf(it)).filter((x) => x.n >= BATTLE_MIN_SCORED && x.avg !== null)
    return before.length ? before[before.length - 1].avg : null
  }

  const groups = new Map<string, typeof items>()
  for (const it of items) {
    if (it.n < BATTLE_MIN_SCORED || it.avg === null) continue
    const key = `${it.title.trim().toLowerCase()}|${it.maxScore}`
    groups.set(key, [...(groups.get(key) ?? []), it])
  }
  // ศึกที่มีจริง (≥ 2 ห้อง) ก่อน แล้วค่อยดึงคะแนนรายคนของรายการในศึกเหล่านั้น
  const picked: { key: string; list: (typeof items)[number][] }[] = []
  for (const [key, xs] of groups) {
    const latest = new Map<string, (typeof xs)[number]>()
    for (const x of xs) if (!latest.get(x.classId) || latest.get(x.classId)!.takenOn < x.takenOn) latest.set(x.classId, x)
    if (latest.size >= 2 && (!onlyClass || latest.has(onlyClass))) picked.push({ key, list: [...latest.values()] })
  }
  const ids = picked.flatMap((p) => p.list.map((x) => x.id))
  type P = { itemId: string; studentId: string; score: number; schoolName: string; nickname: string | null; config: string | null }
  const people: P[] = []
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80)
    people.push(
      ...(await db.all<P>(sql`
        SELECT s.item_id AS itemId, s.student_id AS studentId, s.score, sc.name AS schoolName, a.nickname, a.config
        FROM scores s JOIN students st ON st.id = s.student_id JOIN score_items i ON i.id = s.item_id JOIN classes c ON c.id = i.class_id JOIN schools sc ON sc.id = c.school_id
          LEFT JOIN student_avatars a ON a.student_id = s.student_id
        WHERE s.item_id IN (${sql.join(chunk.map((x) => sql`${x}`), sql`, `)}) AND s.absent = 0 AND s.score IS NOT NULL AND st.active = 1`)),
    )
  }

  const out: ExamBattle[] = []
  for (const { key, list: xs } of picked) {
    const list = xs
    const rows: BattleRow[] = list
      .map((x) => {
        const p = prevAvg(x)
        return { classId: x.classId, className: x.className, schoolName: x.schoolName, n: x.n, avgPct: r1(x.avg!), passPct: r1((x.pass * 100) / x.n), deltaPct: p === null ? null : r1(x.avg! - p), rank: 0, ...(onlyClass ? { mine: x.classId === onlyClass } : {}) }
      })
      .sort((a, b) => b.avgPct - a.avgPct || b.passPct - a.passPct)
    rows.forEach((r, i) => (r.rank = i > 0 && r.avgPct === rows[i - 1].avgPct && r.passPct === rows[i - 1].passPct ? rows[i - 1].rank : i + 1))
    const up = rows.filter((r) => r.deltaPct !== null && r.deltaPct > 0).sort((a, b) => b.deltaPct! - a.deltaPct!)[0]
    // อันดับรายคน: คะแนนเท่ากันได้อันดับเดียวกัน · แสดงแค่ชื่อเล่น + โรงเรียน
    const inBattle = new Set(list.map((x) => x.id))
    const ps = people.filter((p) => inBattle.has(p.itemId)).sort((a, b) => b.score - a.score || a.schoolName.localeCompare(b.schoolName) || (a.nickname ?? '').localeCompare(b.nickname ?? '') || a.studentId.localeCompare(b.studentId))
    const ranked = ps.map((p, i) => ({ p, rank: 0, i }))
    ranked.forEach((r, i) => (r.rank = i > 0 && r.p.score === ranked[i - 1].p.score ? ranked[i - 1].rank : i + 1))
    const max = list[0].maxScore
    const view = (r: (typeof ranked)[number]) => ({
      rank: r.rank,
      nickname: (r.p.nickname ?? '').trim() || NO_NICKNAME,
      schoolName: r.p.schoolName,
      score: r.p.score,
      pct: r1((r.p.score * 100) / max),
      avatar: r.p.config ? JSON.parse(r.p.config) : null,
      ...(studentId ? { mine: r.p.studentId === studentId } : {}),
    })
    const meRow = studentId ? ranked.find((r) => r.p.studentId === studentId) : undefined
    out.push({
      key,
      title: list[0].title.trim(),
      maxScore: max,
      takenOn: list.map((x) => x.takenOn).sort().at(-1)!,
      rows,
      mostImproved: up?.classId ?? null,
      top: ranked.slice(0, BATTLE_TOP).map(view),
      players: ranked.length,
      me: meRow ? { rank: meRow.rank, score: meRow.p.score, pct: r1((meRow.p.score * 100) / max) } : null,
    })
  }
  return out.sort((a, b) => b.takenOn.localeCompare(a.takenOn))
}
