import { eq, sql } from 'drizzle-orm'
import { BATTLE_MIN_SCORED, BATTLE_PASS_PCT, type BattleRow, type ExamBattle } from '../../shared/battle'
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
export async function examBattles(db: Db, onlyClass?: string): Promise<ExamBattle[]> {
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
  const out: ExamBattle[] = []
  for (const [key, xs] of groups) {
    // ห้องเดียวกันมีชื่อซ้ำ: ใช้ครั้งล่าสุด
    const latest = new Map<string, (typeof xs)[number]>()
    for (const x of xs) if (!latest.get(x.classId) || latest.get(x.classId)!.takenOn < x.takenOn) latest.set(x.classId, x)
    const list = [...latest.values()]
    if (list.length < 2 || (onlyClass && !latest.has(onlyClass))) continue
    const rows: BattleRow[] = list
      .map((x) => {
        const p = prevAvg(x)
        return { classId: x.classId, className: x.className, schoolName: x.schoolName, n: x.n, avgPct: r1(x.avg!), passPct: r1((x.pass * 100) / x.n), deltaPct: p === null ? null : r1(x.avg! - p), rank: 0, ...(onlyClass ? { mine: x.classId === onlyClass } : {}) }
      })
      .sort((a, b) => b.avgPct - a.avgPct || b.passPct - a.passPct)
    rows.forEach((r, i) => (r.rank = i > 0 && r.avgPct === rows[i - 1].avgPct && r.passPct === rows[i - 1].passPct ? rows[i - 1].rank : i + 1))
    const up = rows.filter((r) => r.deltaPct !== null && r.deltaPct > 0).sort((a, b) => b.deltaPct! - a.deltaPct!)[0]
    out.push({ key, title: list[0].title.trim(), maxScore: list[0].maxScore, takenOn: list.map((x) => x.takenOn).sort().at(-1)!, rows, mostImproved: up?.classId ?? null })
  }
  return out.sort((a, b) => b.takenOn.localeCompare(a.takenOn))
}
