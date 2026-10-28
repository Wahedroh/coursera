import writeXlsxFile, { type SheetData } from 'write-excel-file/browser'
import type { ClassExport } from '../../shared/export'
import type { Gradebook } from '../../shared/assignments'
import type { ScoreBook } from '../../shared/scores'
import type { ClassGrades } from '../../shared/grades'
import { outstanding, type FeeSheet } from '../../shared/fees'
import { ATTENDANCE_STATUSES, STATUS_LABEL, todayBangkok, type AttendanceRange } from '../../shared/attendance'
import { REASON_LABEL, type Watchlist } from '../../shared/watchlist'

/** สมุดคะแนนรวม: คอลัมน์งาน แล้วต่อด้วยคอลัมน์คะแนนสอบ */
export function gradebookSheet(gb: Gradebook, book: ScoreBook): SheetData {
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
  return [header, ...rows]
}

export async function exportGradebook(gb: Gradebook, book: ScoreBook): Promise<void> {
  await writeXlsxFile(gradebookSheet(gb, book), { sheet: 'คะแนน' }).toFile(`สมุดคะแนน-${gb.class.name}.xlsx`)
}

export function attendanceSheet(r: AttendanceRange): SheetData {
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
  return [header, ...rows]
}

export async function exportAttendance(r: AttendanceRange, className: string, from: string, to: string): Promise<void> {
  await writeXlsxFile(attendanceSheet(r), { sheet: 'เช็กชื่อ' }).toFile(`เช็กชื่อ-${className}-${from}-ถึง-${to}.xlsx`)
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
export function gradesSheet(g: ClassGrades): SheetData {
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
  return [header, ...rows]
}

export async function exportGrades(g: ClassGrades, className: string): Promise<void> {
  await writeXlsxFile(gradesSheet(g), { sheet: 'เกรด' }).toFile(`เกรด-${className}.xlsx`)
}

/** นักเรียนที่ต้องติดตาม (ทุกห้องในไฟล์เดียว) */
export async function exportWatchlist(w: Watchlist): Promise<void> {
  const header = ['ห้อง', 'ZipGrade ID', 'ชื่อ-นามสกุล', 'เหตุผล', 'ค้างงาน', 'งานที่ค้าง', `ขาด (ตั้งแต่ ${w.from})`, 'สาย', 'เกรดคาดการณ์'].map((value) => ({ value, fontWeight: 'bold' as const }))
  const rows = w.classes.flatMap((c) =>
    c.students.map((s) => [
      { value: c.name },
      { value: s.zipgradeId },
      { value: s.name },
      { value: s.reasons.map((r) => REASON_LABEL[r]).join(', ') },
      { value: s.missing },
      { value: s.missingTitles.join(', ') },
      { value: s.absent },
      { value: s.late },
      { value: s.grade ?? '' },
    ]),
  )
  await writeXlsxFile([header, ...rows] as SheetData, { sheet: 'ติดตาม' }).toFile(`นักเรียนที่ต้องติดตาม-${todayBangkok()}.xlsx`)
}

/** ค่าเอกสารทุกรายการของห้อง: คอลัมน์ละรายการ (ค้าง/จ่ายครบ/ไม่ต้องจ่าย) แล้วสรุปยอด */
export function classFeesSheet(x: ClassExport): SheetData {
  const { items, charges } = x.fees
  const header = ['ลำดับ', 'ZipGrade ID', 'ชื่อ-นามสกุล', ...items.map((i) => `${i.title} (${i.amount})`), 'ยอดรวม', 'จ่ายแล้ว', 'ค้างรวม'].map((value) => ({ value, fontWeight: 'bold' as const }))
  const by = new Map(charges.map((c) => [`${c.studentId}|${c.itemId}`, c]))
  const rows = x.gradebook.students.map((s, i) => {
    let amount = 0
    let paid = 0
    const cells = items.map((it) => {
      const c = by.get(`${s.id}|${it.id}`)
      if (!c) return { value: '–' }
      amount += c.amount
      paid += c.paid
      const owe = outstanding(c)
      return { value: owe > 0 ? `ค้าง ${owe}` : 'จ่ายครบ' }
    })
    return [
      { value: i + 1 },
      { value: s.zipgradeId },
      { value: `${s.title ?? ''}${s.firstName} ${s.lastName}`.trim() },
      ...cells,
      { value: Math.round(amount * 100) / 100 },
      { value: Math.round(paid * 100) / 100 },
      { value: Math.max(0, Math.round((amount - paid) * 100) / 100) },
    ]
  })
  return [header, ...rows]
}

/** ชื่อชีต Excel: ไม่เกิน 31 ตัวอักษร ห้าม [ ] : * ? / \ และห้ามซ้ำ */
export function sheetName(raw: string, used: Set<string>): string {
  const base = raw.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet'
  let name = base
  for (let n = 2; used.has(name); n++) name = `${base.slice(0, 28)} ${n}`
  used.add(name)
  return name
}

export async function exportWorkbook(sheets: { name: string; data: SheetData }[], fileName: string): Promise<void> {
  const used = new Set<string>()
  await writeXlsxFile(sheets.map((s) => ({ data: s.data, sheet: sheetName(s.name, used) }))).toFile(fileName)
}
