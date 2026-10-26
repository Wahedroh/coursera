import writeXlsxFile, { type SheetData } from 'write-excel-file/browser'
import type { Gradebook } from '../../shared/assignments'
import type { ScoreBook } from '../../shared/scores'
import { ATTENDANCE_STATUSES, STATUS_LABEL, type AttendanceRange } from '../../shared/attendance'

/** สมุดคะแนนรวม: คอลัมน์งาน แล้วต่อด้วยคอลัมน์คะแนนสอบ */
export async function exportGradebook(gb: Gradebook, book: ScoreBook): Promise<void> {
  const header = [
    'ลำดับ',
    'ZipGrade ID',
    'ชื่อ-นามสกุล',
    ...gb.assignments.map((a) => `${a.title} (${a.maxScore})`),
    ...book.items.map((it) => `${it.title} (${it.maxScore})`),
  ].map((value) => ({
    value,
    fontWeight: 'bold' as const,
  }))
  const rows = gb.students.map((s, i) => [
    { value: i + 1 },
    { value: s.zipgradeId },
    { value: `${s.title ?? ''}${s.firstName} ${s.lastName}`.trim() },
    ...gb.assignments.map((a) => {
      const c = s.cells[a.id]
      if (c.status === 'graded' && c.score !== null) return { value: c.score }
      if (c.status === 'submitted' || c.status === 'late') return { value: 'ส่งแล้ว' }
      if (c.status === 'returned') return { value: 'ส่งกลับแก้' }
      return { value: undefined }
    }),
    ...book.items.map((it) => {
      const c = book.cells[s.id]?.[it.id]
      if (c?.absent) return { value: 'ขาดสอบ' }
      return { value: c?.score ?? undefined }
    }),
  ])
  const data: SheetData = [header, ...rows]
  await writeXlsxFile(data, { sheet: 'คะแนน' }).toFile(`สมุดคะแนน-${gb.class.name}.xlsx`)
}

export async function exportAttendance(r: AttendanceRange, className: string, from: string, to: string): Promise<void> {
  const header = ['ลำดับ', 'ZipGrade ID', 'ชื่อ-นามสกุล', ...r.days, ...ATTENDANCE_STATUSES.map((s) => `รวม${STATUS_LABEL[s]}`)].map((value) => ({
    value,
    fontWeight: 'bold' as const,
  }))
  const rows = r.students.map((s, i) => [
    { value: i + 1 },
    { value: s.zipgradeId },
    { value: `${s.title ?? ''}${s.firstName} ${s.lastName}`.trim() },
    ...r.days.map((d) => ({ value: r.cells[s.id]?.[d] ? STATUS_LABEL[r.cells[s.id][d]] : undefined })),
    ...ATTENDANCE_STATUSES.map((st) => ({ value: r.totals[s.id]?.[st] ?? 0 })),
  ])
  const data: SheetData = [header, ...rows]
  await writeXlsxFile(data, { sheet: 'เช็กชื่อ' }).toFile(`เช็กชื่อ-${className}-${from}-ถึง-${to}.xlsx`)
}
