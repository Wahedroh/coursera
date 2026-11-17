import { desc, eq, sql } from 'drizzle-orm'
import { SEASON_COUNT } from '../../shared/characters'
import { OPEN_END, parseTermName, seasonOfSemester, termName, type NewTermInput, type Term, type TermWindow } from '../../shared/terms'
import { todayBangkok } from '../../shared/attendance'
import { newId, type Db } from '../db/client'
import { terms, timetableSlots } from '../db/schema'
import { apiError } from '../http'

const cols = { id: terms.id, name: terms.name, startedAt: terms.startedAt, season: terms.season }
/** ฐานข้อมูลที่ยังไม่มีแถวเทอม (ไม่ควรเกิด — migration ใส่เทอมแรกไว้) */
const FALLBACK: Term = { id: 'term-1', name: '1', startedAt: 0, season: 1 }

/** ใหม่ → เก่า */
export async function listTerms(db: Db): Promise<Term[]> {
  return db.select(cols).from(terms).orderBy(desc(terms.startedAt))
}

export async function currentTerm(db: Db): Promise<Term> {
  const [t] = await db.select(cols).from(terms).orderBy(desc(terms.startedAt)).limit(1)
  return t ?? FALLBACK
}

/** ช่วงเวลาของเทอม (ไม่ระบุ = เทอมปัจจุบัน) */
export async function termWindow(db: Db, termId?: string): Promise<TermWindow> {
  if (!termId) {
    const term = await currentTerm(db)
    return { term, start: term.startedAt, end: OPEN_END }
  }
  const all = await listTerms(db)
  const i = all.findIndex((t) => t.id === termId)
  if (i < 0) throw apiError('term_not_found', 'ไม่พบเทอมนี้', 404)
  return { term: all[i], start: all[i].startedAt, end: i === 0 ? OPEN_END : all[i - 1].startedAt }
}

/** ปิดเทอมปัจจุบันและเปิดเทอมใหม่ — EXP/เลเวลเริ่มนับใหม่ งาน/คะแนนสอบ/เช็กชื่อเริ่มใหม่ · ตัวละคร avatar และไข่ที่ยังไม่เปิดยังอยู่
 *  ซีซัน = เลขเทอม · ขึ้นเทอม 2: คาบในตารางสอนเลิกใช้ตั้งแต่วันเปิดเทอม (ยอดเทอม 1 ไม่เพี้ยน) และคัดลอกคาบเดิมได้ */
export async function startNewTerm(db: Db, input: NewTermInput, t: number): Promise<Term & { endedSlots: number; copiedSlots: number }> {
  const cur = await currentTerm(db)
  if (t <= cur.startedAt) throw apiError('invalid_term', 'เวลาเริ่มเทอมไม่ถูกต้อง', 400)
  const c = parseTermName(cur.name)
  if (c && (input.year < c.year || (input.year === c.year && input.semester <= c.semester))) throw apiError('invalid_term', `เทอมใหม่ต้องอยู่หลังเทอม ${cur.name}`, 400)
  const name = termName(input.semester, input.year)
  const [dup] = await db.select({ id: terms.id }).from(terms).where(eq(terms.name, name))
  if (dup) throw apiError('term_exists', 'มีเทอมชื่อนี้แล้ว', 409)
  const term: Term = { id: newId(), name, startedAt: t, season: Math.min(seasonOfSemester(input.semester), SEASON_COUNT) }
  let endedSlots = 0
  let copiedSlots = 0
  if (input.semester === 2) {
    const from = input.from ?? todayBangkok(t)
    const before = new Date(Date.parse(`${from}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10)
    // คาบที่ยังใช้อยู่ ณ วันเปิดเทอม (และเริ่มก่อนวันนั้น) → เลิกใช้ตั้งแต่วันเปิดเทอม
    const live = await db.all<{ id: string; classId: string; weekday: number; start: string; end: string; periods: number | null }>(sql`
      SELECT s.id, s.class_id AS classId, s.weekday, s.start, s."end" AS "end", s.periods FROM timetable_slots s JOIN classes c ON c.id = s.class_id
      WHERE c.archived = 0 AND (s.valid_from IS NULL OR s.valid_from < ${from}) AND (s.valid_to IS NULL OR s.valid_to >= ${from})`)
    for (const sl of live) {
      await db.update(timetableSlots).set({ validTo: before }).where(eq(timetableSlots.id, sl.id))
      if (input.copyTimetable) await db.insert(timetableSlots).values({ id: newId(), classId: sl.classId, weekday: sl.weekday, start: sl.start, end: sl.end, periods: sl.periods, validFrom: from, createdAt: t })
    }
    endedSlots = live.length
    copiedSlots = input.copyTimetable ? live.length : 0
  }
  await db.insert(terms).values({ ...term, createdAt: t })
  return { ...term, endedSlots, copiedSlots }
}
