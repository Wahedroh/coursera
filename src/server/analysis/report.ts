import { eq, sql } from 'drizzle-orm'
import { BADGES } from '../../shared/badges'
import { levelOf } from '../../shared/points'
import { DEFAULT_RELEASE, type ReportCard, type ReportRelease } from '../../shared/report'
import type { TermWindow } from '../../shared/terms'
import type { Db } from '../db/client'
import { settings } from '../db/schema'
import { apiError } from '../http'
import { studentBadges } from '../points/badges'
import { listTerms, termWindow } from '../terms/service'
import { loadClassTerm, studentMetrics, type ClassTerm } from './data'

const key = (classId: string, termId: string) => `report:${classId}:${termId}`

export async function getRelease(db: Db, classId: string, termId: string): Promise<ReportRelease> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key(classId, termId)))
  return row ? { ...DEFAULT_RELEASE, ...(JSON.parse(row.value) as Partial<ReportRelease>) } : DEFAULT_RELEASE
}
export async function setRelease(db: Db, classId: string, termId: string, r: Omit<ReportRelease, 'releasedAt'>, t: number): Promise<ReportRelease> {
  const prev = await getRelease(db, classId, termId)
  const value: ReportRelease = { ...r, releasedAt: r.released ? (prev.released ? prev.releasedAt : t) : null }
  await db.insert(settings).values({ key: key(classId, termId), value: JSON.stringify(value) }).onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value) } })
  return value
}

/** ตัวละครที่สะสมได้ (ทุกเทอม) ของนักเรียนในห้อง */
async function charactersOf(db: Db, classId: string) {
  const rows = await db.all<{ studentId: string; c: string }>(sql`
    SELECT DISTINCT e.student_id AS studentId, e.character_id AS c FROM eggs e JOIN students s ON s.id = e.student_id
    WHERE s.class_id = ${classId} AND e.character_id IS NOT NULL`)
  const m = new Map<string, string[]>()
  for (const r of rows) (m.get(r.studentId) ?? m.set(r.studentId, []).get(r.studentId)!).push(r.c)
  return m
}

function build(d: ClassTerm, studentId: string, r: ReportRelease, chars: string[], badges: string[], t: number): ReportCard {
  const st = d.roster.find((x) => x.id === studentId)!
  const m = studentMetrics(d, studentId, t)
  let avatar: Record<string, unknown> | null = null
  try {
    avatar = st.avatar ? (JSON.parse(st.avatar) as Record<string, unknown>) : null
  } catch {}
  return {
    term: d.w.term.name,
    className: d.cls.name,
    student: { id: st.id, zipgradeId: st.zipgradeId, name: `${st.title ?? ''}${st.firstName} ${st.lastName}`.trim(), nickname: st.nickname ?? '', avatar },
    total: m.grade
      ? { total: m.grade.total, maxTotal: m.grade.maxTotal, grade: r.showGrade ? m.grade.grade : null, rank: r.showRank ? m.grade.rank : null, of: d.roster.length }
      : null,
    attendance: { present: m.attendance.present, late: m.attendance.late, sick: m.attendance.sick, leave: m.attendance.leave, absent: m.attendance.absent, pct: m.attendance.pct },
    assignments: m.assignments.list.map((a) => ({ title: a.title, dueAt: a.dueAt, status: a.status, score: a.score, maxScore: a.maxScore })),
    // คะแนนสอบที่ครูยังไม่เผยแพร่ ไม่แสดง
    exams: m.exams.list.filter((e) => e.published).map((e) => ({ title: e.title, takenOn: e.takenOn, score: e.score, maxScore: e.maxScore, absent: e.absent, pct: e.pct })),
    activity: { level: levelOf(m.exp), exp: m.exp, characters: chars, badges, videos: m.videos.watched, quests: m.quests },
    comment: r.showComment ? m.note || null : null,
    issuedAt: t,
  }
}

/** ใบสรุปผลทั้งห้อง (ครูดูตัวอย่าง/พิมพ์รวด) */
export async function classReportCards(db: Db, classId: string, t: number, termId?: string) {
  const w = await termWindow(db, termId)
  const release = await getRelease(db, classId, w.term.id)
  const d = await loadClassTerm(db, classId, w, t)
  const chars = await charactersOf(db, classId)
  // ครูดูได้ทุกตัวเลือกเสมอ (ตามที่ตั้งไว้) · เหรียญตรา: ไม่แสดงในฉบับพิมพ์ทั้งห้อง (คำนวณรายคนหนัก)
  return { release, term: { id: w.term.id, name: w.term.name }, cards: d.roster.map((r) => build(d, r.id, release, chars.get(r.id) ?? [], [], t)) }
}

/** ใบสรุปผลของนักเรียน: เทอมล่าสุดที่ครูเปิดให้พิมพ์ */
export async function studentReportCard(db: Db, studentId: string, classId: string, t: number): Promise<{ available: false } | { available: true; card: ReportCard; releasedAt: number | null }> {
  for (const term of (await listTerms(db)).slice(0, 4)) {
    const r = await getRelease(db, classId, term.id)
    if (!r.released) continue
    const w: TermWindow = await termWindow(db, term.id)
    const d = await loadClassTerm(db, classId, w, t)
    if (!d.roster.some((x) => x.id === studentId)) throw apiError('student_not_found', 'ไม่พบนักเรียน', 404)
    const chars = (await charactersOf(db, classId)).get(studentId) ?? []
    const badges = (await studentBadges(db, studentId)).filter((b) => b.earned).map((b) => BADGES.find((x) => x.id === b.id)!.icon + ' ' + b.title)
    return { available: true, card: build(d, studentId, r, chars, badges, t), releasedAt: r.releasedAt }
  }
  return { available: false }
}

/** เช็กเร็ว ๆ ว่ามีใบสรุปผลที่ครูเปิดให้หรือไม่ (ไม่โหลดข้อมูลทั้งห้อง) */
export async function reportStatus(db: Db, classId: string): Promise<{ available: boolean; term: string | null; releasedAt: number | null }> {
  for (const term of (await listTerms(db)).slice(0, 4)) {
    const r = await getRelease(db, classId, term.id)
    if (r.released) return { available: true, term: term.name, releasedAt: r.releasedAt }
  }
  return { available: false, term: null, releasedAt: null }
}
