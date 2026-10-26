import writeXlsxFile, { type SheetData } from 'write-excel-file/browser'
import type { Gradebook } from '../../shared/assignments'

export async function exportGradebook(gb: Gradebook): Promise<void> {
  const header = ['ลำดับ', 'ZipGrade ID', 'ชื่อ-นามสกุล', ...gb.assignments.map((a) => `${a.title} (${a.maxScore})`)].map((value) => ({
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
  ])
  const data: SheetData = [header, ...rows]
  await writeXlsxFile(data, { sheet: 'คะแนน' }).toFile(`สมุดคะแนน-${gb.class.name}.xlsx`)
}
