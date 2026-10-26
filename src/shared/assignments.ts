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
