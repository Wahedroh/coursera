import { z } from 'zod'

/** ใบสรุปผลปลายเทอม: ครูเปิดให้พิมพ์รายห้องรายเทอม */
export const reportReleaseSchema = z.object({
  released: z.boolean(),
  showGrade: z.boolean().default(true),
  showRank: z.boolean().default(true),
  showComment: z.boolean().default(true),
})
export type ReportRelease = z.infer<typeof reportReleaseSchema> & { releasedAt: number | null }
export const DEFAULT_RELEASE: ReportRelease = { released: false, showGrade: true, showRank: true, showComment: true, releasedAt: null }

export type ReportCard = {
  term: string
  className: string
  student: { id: string; zipgradeId: string; name: string; nickname: string; avatar: Record<string, unknown> | null }
  total: { total: number; maxTotal: number; grade: string | null; rank: number | null; of: number } | null
  attendance: { present: number; late: number; sick: number; leave: number; absent: number; pct: number | null }
  assignments: { title: string; dueAt: number | null; status: string; score: number | null; maxScore: number }[]
  exams: { title: string; takenOn: string; score: number | null; maxScore: number; absent: boolean; pct: number | null }[]
  activity: { level: number; exp: number; characters: string[]; badges: string[]; videos: number; quests: number }
  comment: string | null
  issuedAt: number
}
