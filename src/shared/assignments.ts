import { z } from 'zod'

export type SubmitMode = 'text' | 'image' | 'both'
export type SubmissionStatus = 'submitted' | 'late' | 'graded' | 'returned'
export type StudentStatus = SubmissionStatus | 'missing'

export const assignmentInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  instructions: z.string().max(5000),
  attachmentKeys: z.array(z.string().startsWith('asg/')).max(5),
  dueAt: z.number().int().nullable(),
  maxScore: z.number().positive().max(1000),
  submitMode: z.enum(['text', 'image', 'both']),
})
export type AssignmentInput = z.infer<typeof assignmentInputSchema>

export const createAssignmentsSchema = assignmentInputSchema.extend({ classIds: z.array(z.string()).min(1).max(50) })

export type AssignmentSummary = {
  id: string
  title: string
  dueAt: number | null
  maxScore: number
  submitMode: SubmitMode
  counts: Record<StudentStatus, number>
}

export type StudentAssignment = {
  id: string
  title: string
  instructions: string
  attachmentKeys: string[]
  dueAt: number | null
  maxScore: number
  submitMode: SubmitMode
  status: StudentStatus
  submission: { text: string; imageKeys: string[]; annotatedKeys: string[]; score: number | null; comment: string; submittedAt: number } | null
}

export const submissionInputSchema = z.object({
  text: z.string().max(5000),
  imageKeys: z.array(z.string()).max(10),
  clientRequestId: z.string().min(1).max(64),
})
export type SubmissionInput = z.infer<typeof submissionInputSchema>

export type GradebookCell = { status: StudentStatus; score: number | null; submissionId: string | null }
export type Gradebook = {
  class: { id: string; name: string }
  assignments: { id: string; title: string; dueAt: number | null; maxScore: number }[]
  students: { id: string; zipgradeId: string; title: string | null; firstName: string; lastName: string; cells: Record<string, GradebookCell> }[]
}

/** ข้อความรายชื่อคนยังไม่ส่ง (รวมคนที่ครูส่งกลับให้แก้) สำหรับวางในกลุ่มแชตของห้อง */
export function missingText(gb: Gradebook, assignmentId: string): string {
  const a = gb.assignments.find((x) => x.id === assignmentId)
  const pending = gb.students.filter((s) => ['missing', 'returned'].includes(s.cells[assignmentId]?.status ?? 'missing'))
  const lines = pending.map(
    (s, i) =>
      `${i + 1}. ${s.title ?? ''}${s.firstName} ${s.lastName} (${s.zipgradeId})${s.cells[assignmentId]?.status === 'returned' ? ' — ครูส่งกลับให้แก้' : ''}`,
  )
  return [`${a?.title ?? ''} — ยังไม่ส่ง ${pending.length} คน`, ...lines].join('\n')
}

export const gradeInputSchema = z.object({
  score: z.number(),
  comment: z.string().max(2000),
  annotatedKeys: z.array(z.string()).max(10),
})
export const returnInputSchema = z.object({ comment: z.string().max(2000) })

export const ASSIGNMENT_EXP = { onTime: 10, late: 5 } as const
