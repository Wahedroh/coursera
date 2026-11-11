import { RULES, type ClassAnalysis, type RiskLevel, type StudentAnalysis } from '../../shared/analysis'
import { type Db } from '../db/client'
import { studentNotes, students } from '../db/schema'
import { apiError } from '../http'
import { termWindow } from '../terms/service'
import { loadClassTerm, studentMetrics, type ClassTerm, type StudentMetrics } from './data'
import { eq } from 'drizzle-orm'

const DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const dowOf = (date: string) => new Date(`${date}T12:00:00+07:00`).getUTCDay()

/** แนวโน้มจากคะแนนสอบ 3 ครั้งล่าสุด */
function trendOf(pcts: number[]): 'up' | 'down' | 'flat' | null {
  const last = pcts.slice(-3)
  if (last.length < 2) return null
  const diff = last[last.length - 1] - last[0]
  return diff >= 8 ? 'up' : diff <= -8 ? 'down' : 'flat'
}
/** ลดลงติดกันกี่ครั้ง (จากครั้งล่าสุดย้อนไป) */
function declining(pcts: number[]): number {
  let n = 0
  for (let i = pcts.length - 1; i > 0 && pcts[i] < pcts[i - 1]; i--) n++
  return n
}

export function analyse(d: ClassTerm, studentId: string, t: number, classExamAvg: number | null): StudentAnalysis {
  const r = d.roster.find((x) => x.id === studentId)!
  const m: StudentMetrics = studentMetrics(d, studentId, t)
  const pcts = m.exams.list.filter((e) => e.pct !== null).map((e) => e.pct!)
  const trend = trendOf(pcts)
  const dec = declining(pcts)
  const issues: string[] = []
  const focus: string[] = []
  const strengths: string[] = []
  let level: RiskLevel = 'good'
  const bump = (l: RiskLevel) => (level = l === 'urgent' || level === 'urgent' ? 'urgent' : l === 'watch' || level === 'watch' ? 'watch' : 'good')

  // การมาเรียน
  const a = m.attendance
  if (a.records >= 3 && a.pct !== null) {
    if (a.pct < RULES.urgent.attendancePct) bump('urgent')
    else if (a.pct < RULES.watch.attendancePct) bump('watch')
    if (a.absent > 0) {
      const byDow = new Map<number, number>()
      for (const x of a.absentDates) byDow.set(dowOf(x), (byDow.get(dowOf(x)) ?? 0) + 1)
      const [dow, n] = [...byDow].sort((x, y) => y[1] - x[1])[0]
      const pattern = a.absent >= 3 && n >= 2 && n / a.absent >= 0.5
      issues.push(`ขาดเรียน ${a.absent} ครั้ง${pattern ? ` (${n} ครั้งเป็นวัน${DOW[dow]})` : ''}${a.late ? ` · มาสาย ${a.late} ครั้ง` : ''} · มาเรียน ${a.pct}%`)
      if (pattern) focus.push(`ติดตามสาเหตุที่ขาดวัน${DOW[dow]}บ่อย (คุยกับนักเรียน/ผู้ปกครอง)`)
      else if (a.pct < RULES.watch.attendancePct) focus.push('ติดตามการมาเรียน และให้ตามงาน/เนื้อหาของวันที่ขาด')
    } else if (a.late >= 3) issues.push(`มาสาย ${a.late} ครั้ง`)
    if (a.pct >= 95) strengths.push(`มาเรียนสม่ำเสมอ (${a.pct}%)`)
  }

  // งาน
  const s = m.assignments
  if (s.missing.length >= RULES.urgent.missing) bump('urgent')
  else if (s.missing.length >= RULES.watch.missing) bump('watch')
  if (s.late >= RULES.watch.late) bump('watch')
  if (s.missing.length) {
    issues.push(`งานค้าง ${s.missing.length} ชิ้น (ส่งแล้ว ${s.done}/${s.due})`)
    const top = [...s.missing].sort((x, y) => y.maxScore - x.maxScore).slice(0, 3)
    focus.push(`ให้ส่งงานค้างที่คะแนนมากที่สุดก่อน: ${top.map((x) => `${x.title} (${x.maxScore})`).join(' · ')}`)
  }
  if (s.late >= RULES.watch.late) {
    issues.push(`ส่งงานช้า ${s.late} ครั้ง`)
    focus.push('ช่วยวางแผนเวลาส่งงาน · แนะนำให้เปิดการแจ้งเตือนในแอป')
  }
  if (s.due >= 3 && s.missing.length === 0 && s.late === 0) strengths.push('ส่งงานครบและตรงเวลาทุกชิ้น')
  if (s.avgPct !== null && s.avgPct >= 80) strengths.push(`งานที่ส่งได้คะแนนเฉลี่ย ${s.avgPct}%`)

  // สอบ
  const e = m.exams
  if (e.avgPct !== null) {
    if (e.avgPct < RULES.urgent.examPct) bump('urgent')
    if (dec >= RULES.watch.declining) {
      bump('watch')
      issues.push(`คะแนนสอบลดลงต่อเนื่อง ${dec} ครั้ง`)
    }
    const weak = e.list.filter((x) => x.pct !== null && x.pct < 50 && (x.classAvg === null || x.pct < x.classAvg - 10))
    if (weak.length) {
      issues.push(`คะแนนต่ำกว่าห้องชัดเจน: ${weak.map((x) => `${x.title} ${x.pct}% (ห้อง ${x.classAvg ?? '–'}%)`).join(' · ')}`)
      focus.push(`ทบทวนเนื้อหา: ${weak.map((x) => x.title).join(' · ')}`)
    } else if (e.avgPct < 60) focus.push('ทบทวนพื้นฐานก่อนสอบครั้งถัดไป และฝึกโจทย์เพิ่ม')
    if (e.avgPct >= RULES.excellent.examPct) {
      strengths.push(`คะแนนสอบเฉลี่ย ${e.avgPct}%${classExamAvg !== null ? ` (ห้อง ${classExamAvg}%)` : ''}`)
      focus.push('ต่อยอดด้วยโจทย์ท้าทาย หรือให้ช่วยติวเพื่อน')
    }
    if (trend === 'up') strengths.push('คะแนนสอบมีแนวโน้มดีขึ้น')
  }
  if (e.absent) {
    bump('watch')
    issues.push(`ขาดสอบ ${e.absent} ครั้ง`)
    focus.push('นัดสอบชดเชยรายการที่ขาดสอบ')
  }

  // เกรด
  if (m.grade?.grade != null && Number(m.grade.grade) <= RULES.urgent.grade) {
    bump('urgent')
    issues.push(`เกรดคาดการณ์ ${m.grade.grade}`)
  }

  // การทบทวน/กิจกรรม
  if (m.videos.total >= 3 && m.videos.watched === 0 && level !== 'good') {
    issues.push(`ยังไม่ทบทวนคลิปเลย (0/${m.videos.total})`)
    focus.push('แนะนำคลิปย้อนหลังของบทที่อ่อน')
  } else if (m.videos.total && m.videos.watched >= Math.min(5, m.videos.total)) strengths.push(`ทบทวนคลิป ${m.videos.watched}/${m.videos.total} คลิป`)
  if (m.cards.answered >= 5 && m.cards.pct !== null && m.cards.pct < 50) issues.push(`เกมการ์ดตอบถูก ${m.cards.pct}%`)
  if (m.quests >= 6) strengths.push(`ทำภารกิจสัปดาห์ ${m.quests} ครั้ง`)

  if (!issues.length && level === 'good' && !focus.length) focus.push('รักษาความสม่ำเสมอ')
  const headline = issues[0] ?? strengths[0] ?? 'ยังมีข้อมูลน้อย'
  return {
    id: r.id,
    zipgradeId: r.zipgradeId,
    name: `${r.firstName} ${r.lastName}`.trim(),
    level,
    attendancePct: a.pct,
    absent: a.absent,
    late: a.late,
    done: s.done,
    due: s.due,
    missing: s.missing.length,
    examAvg: e.avgPct,
    classExamAvg,
    trend,
    grade: m.grade?.grade ?? null,
    rank: m.grade?.rank ?? null,
    headline,
    issues,
    focus,
    strengths,
    exams: e.list.map((x) => ({ title: x.title, pct: x.pct, classAvg: x.classAvg, absent: x.absent })),
    videos: m.videos,
    cardsPct: m.cards.pct,
    note: m.note,
  }
}

const ORDER: Record<RiskLevel, number> = { urgent: 0, watch: 1, good: 2 }

export async function classAnalysis(db: Db, classId: string, t: number, termId?: string): Promise<ClassAnalysis> {
  const w = await termWindow(db, termId)
  const d = await loadClassTerm(db, classId, w, t)
  const all = d.scores.flatMap((s) => {
    const i = d.items.find((x) => x.id === s.itemId)
    return s.score !== null && i && i.maxScore > 0 ? [(s.score / i.maxScore) * 100] : []
  })
  const classAvg = all.length ? Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 10) / 10 : null
  const list = d.roster.map((r) => analyse(d, r.id, t, classAvg))
  list.sort((a, b) => ORDER[a.level] - ORDER[b.level] || (a.attendancePct ?? 100) + (a.examAvg ?? 100) - ((b.attendancePct ?? 100) + (b.examAvg ?? 100)))
  const counts = { urgent: 0, watch: 0, good: 0 }
  for (const s of list) counts[s.level]++
  return { class: d.cls, term: { id: w.term.id, name: w.term.name }, students: list, counts }
}

export async function saveNote(db: Db, studentId: string, note: string, t: number, termId?: string): Promise<void> {
  const [st] = await db.select({ id: students.id }).from(students).where(eq(students.id, studentId))
  if (!st) throw apiError('student_not_found', 'ไม่พบนักเรียน', 404)
  const w = await termWindow(db, termId)
  await db
    .insert(studentNotes)
    .values({ studentId, termId: w.term.id, note, updatedAt: t })
    .onConflictDoUpdate({ target: [studentNotes.studentId, studentNotes.termId], set: { note, updatedAt: t } })
}
