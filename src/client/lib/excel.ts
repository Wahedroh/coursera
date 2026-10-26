import writeXlsxFile, { type SheetData } from 'write-excel-file/browser'
import type { Gradebook } from '../../shared/assignments'
import type { ScoreBook } from '../../shared/scores'
import type { ClassGrades } from '../../shared/grades'
import { outstanding, type FeeSheet } from '../../shared/fees'
import { ATTENDANCE_STATUSES, STATUS_LABEL, type AttendanceRange } from '../../shared/attendance'

/** สมุดคะแนนรวม: คอลัมน์งาน แล้วต่อด้วยคอลัมน์คะแนนสอบ */
export async function exportGradebook(gb: Gradebook, book: ScoreBook): Promise<void> {
  const header = [
    'ลำดับ',
    'ZipGrade ID',
    'ชื่อ-นามสกุล',
    ...gb.assignments.map((a) => `${a.title} (${a.maxScore})`),
    ...book.items.map((it) => `${it.title} ${it.takenOn} (${it.maxScore})`),
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

/** ค่าเอกสาร: เฉพาะคนที่ต้องจ่าย */
export async function exportFees(sheet: FeeSheet): Promise<void> {
  const header = ['ลำดับ', 'ZipGrade ID', 'ชื่อ-นามสกุล', 'ยอด', 'จ่ายแล้ว', 'ค้าง', 'หมายเหตุ'].map((value) => ({ value, fontWeight: 'bold' as const }))
  const rows = sheet.students
    .filter((s) => s.charge)
    .map((s, i) => [
      { value: i + 1 },
      { value: s.zipgradeId },
      { value: `${s.title ?? ''}${s.firstName} ${s.lastName}`.trim() },
      { value: s.charge!.amount },
      { value: s.charge!.paid },
      { value: outstanding(s.charge!) },
      { value: s.charge!.note },
    ])
  const data: SheetData = [header, ...rows]
  await writeXlsxFile(data, { sheet: 'ค่าเอกสาร' }).toFile(`ค่าเอกสาร-${sheet.item.title}-${sheet.class.name}.xlsx`)
}

/** เกรดอิงกลุ่มของห้อง */
export async function exportGrades(g: ClassGrades, className: string): Promise<void> {
  const header = ['ลำดับ', 'ZipGrade ID', 'ชื่อ-นามสกุล', 'คะแนนงาน', 'คะแนนสอบ', `รวม (${g.maxTotal})`, 'อันดับ', 'เปอร์เซ็นไทล์', 'เกรด'].map((value) => ({ value, fontWeight: 'bold' as const }))
  const rows = g.students.map((s, i) => [
    { value: i + 1 },
    { value: s.zipgradeId },
    { value: `${s.title ?? ''}${s.firstName} ${s.lastName}`.trim() },
    { value: s.assignmentTotal },
    { value: s.examTotal },
    { value: s.total },
    { value: s.rank ?? undefined },
    { value: s.percentile ?? undefined },
    { value: s.grade ?? undefined },
  ])
  const data: SheetData = [header, ...rows]
  await writeXlsxFile(data, { sheet: 'เกรด' }).toFile(`เกรด-${className}.xlsx`)
}
