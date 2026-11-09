import { desc, eq } from 'drizzle-orm'
import { SEASON_COUNT } from '../../shared/characters'
import { OPEN_END, type Term, type TermWindow } from '../../shared/terms'
import { newId, type Db } from '../db/client'
import { terms } from '../db/schema'
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

/** ปิดเทอมปัจจุบันและเปิดเทอมใหม่ — EXP/เลเวลเริ่มนับใหม่ งาน/คะแนนสอบ/เช็กชื่อเริ่มใหม่ · ตัวละคร avatar และไข่ที่ยังไม่เปิดยังอยู่ */
export async function startNewTerm(db: Db, name: string, t: number): Promise<Term> {
  const cur = await currentTerm(db)
  if (t <= cur.startedAt) throw apiError('invalid_term', 'เวลาเริ่มเทอมไม่ถูกต้อง', 400)
  const [dup] = await db.select({ id: terms.id }).from(terms).where(eq(terms.name, name))
  if (dup) throw apiError('term_exists', 'มีเทอมชื่อนี้แล้ว', 409)
  const term: Term = { id: newId(), name, startedAt: t, season: Math.min(cur.season + 1, SEASON_COUNT) }
  await db.insert(terms).values({ ...term, createdAt: t })
  return term
}
