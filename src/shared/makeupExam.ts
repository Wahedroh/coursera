import { z } from 'zod'

/** ออกจากหน้าจอครบกี่ครั้งส่งคำตอบอัตโนมัติ */
export const MAKEUP_LEAVE_LIMIT = 3
export const DEFAULT_MAKEUP_DAYS = 14
export const MAX_EXAM_QUESTIONS = 100
/** เผื่อเวลาส่งคำตอบช่วงท้าย (เน็ตช้า) */
export const ANSWER_GRACE_MS = 5_000
export const EXAM_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const

export type MakeupStatus = 'pending' | 'approved' | 'rejected' | 'in_progress' | 'submitted' | 'graded' | 'expired'
export const MAKEUP_STATUS_LABEL: Record<MakeupStatus, string> = {
  pending: 'รอครูอนุมัติ',
  approved: 'อนุมัติแล้ว รอสอบ',
  rejected: 'ไม่อนุมัติ',
  in_progress: 'กำลังสอบ',
  submitted: 'ส่งแล้ว รอครูตรวจ',
  graded: 'ครูให้คะแนนแล้ว',
  expired: 'หมดสิทธิ์',
}

/** กำหนดสุดท้ายของสิทธิ์สอบย้อนหลัง: สิ้นวัน (เวลาไทย) ของวันสอบ + N วัน · null = ไม่เปิดสอบย้อนหลัง */
export function makeupDeadline(takenOn: string, days: number): number | null {
  if (days <= 0) return null
  return Date.parse(`${takenOn}T23:59:59+07:00`) + days * 86400_000
}

/** เหลือเวลาอีกเท่าไร (ข้อความสั้น) */
export function leftText(ms: number): string {
  if (ms <= 0) return 'หมดเวลาแล้ว'
  const d = Math.floor(ms / 86400_000)
  const h = Math.floor((ms % 86400_000) / 3600_000)
  const m = Math.floor((ms % 3600_000) / 60_000)
  return d ? `${d} วัน ${h} ชม.` : h ? `${h} ชม. ${m} นาที` : `${m} นาที`
}

// ---------- ชุดข้อสอบ ----------
export const examQuestionSchema = z
  .object({
    q: z.string().trim().max(1000),
    image: z.string().regex(/^quiz\/[A-Za-z0-9]+\.(jpg|png|webp)$/).optional(),
    choices: z.array(z.string().trim().max(300)).min(2).max(5),
    answer: z.number().int().min(0).max(4),
  })
  .refine((x) => x.answer < x.choices.length, { message: 'เฉลยต้องเป็นหนึ่งในตัวเลือก' })
  .refine((x) => x.q.length > 0 || !!x.image, { message: 'ต้องมีโจทย์เป็นข้อความหรือรูป' })
export type ExamQuestion = z.infer<typeof examQuestionSchema>

export const examSetInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('typed'), title: z.string().trim().min(1).max(120), questions: z.array(examQuestionSchema).min(1).max(MAX_EXAM_QUESTIONS) }),
  z
    .object({
      kind: z.literal('pages'),
      title: z.string().trim().min(1).max(120),
      pageKeys: z.array(z.string().regex(/^exam\/[A-Za-z0-9]+\.(jpg|png|webp)$/)).min(1).max(40),
      choiceCount: z.number().int().min(2).max(5),
      answers: z.array(z.number().int().min(0).max(4)).min(1).max(MAX_EXAM_QUESTIONS),
    })
    .refine((x) => x.answers.every((a) => a < x.choiceCount), { message: 'เฉลยเกินจำนวนตัวเลือก' }),
])
export type ExamSetInput = z.infer<typeof examSetInputSchema>
export type ExamSet = { id: string; title: string; kind: 'typed' | 'pages'; questions: ExamQuestion[]; pageKeys: string[]; answers: number[]; choiceCount: number; updatedAt: number }
export type ExamSetSummary = { id: string; title: string; kind: 'typed' | 'pages'; count: number; updatedAt: number }

/** เฉลยต่อข้อ (ลำดับต้นฉบับ) */
export const answerKey = (s: Pick<ExamSet, 'kind' | 'questions' | 'answers'>) => (s.kind === 'typed' ? s.questions.map((q) => q.answer) : s.answers)

// ---------- สลับข้อ/ตัวเลือก (เฉพาะข้อสอบที่พิมพ์ในระบบ) ----------
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function shuffled(n: number, rand: () => number): number[] {
  const xs = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }
  return xs
}
/** ลำดับที่นักเรียนเห็น: order[ตำแหน่ง] = ข้อต้นฉบับ · choices[ตำแหน่ง][ตัวเลือกที่เห็น] = ตัวเลือกต้นฉบับ */
export function examLayout(questions: { choices: string[] }[], seed: number | null): { order: number[]; choices: number[][] } {
  if (seed === null) return { order: questions.map((_, i) => i), choices: questions.map((q) => q.choices.map((_, i) => i)) }
  const rand = mulberry32(seed)
  const order = shuffled(questions.length, rand)
  return { order, choices: order.map((qi) => shuffled(questions[qi].choices.length, rand)) }
}

/** ตรวจ: คะแนน = ถูก/ทั้งหมด × คะแนนเต็ม (ทศนิยม 2 ตำแหน่ง) แล้วไม่เกินเพดาน */
export function gradeMakeup(answers: number[], key: number[], maxScore: number, capPct: number): { correct: number; total: number; raw: number; capped: number } {
  const correct = key.filter((k, i) => answers[i] === k).length
  const raw = Math.round((correct / key.length) * maxScore * 100) / 100
  const cap = Math.round(((maxScore * capPct) / 100) * 100) / 100
  return { correct, total: key.length, raw, capped: Math.min(raw, cap) }
}

// ---------- คำขอ / อนุมัติ ----------
export const makeupRequestSchema = z.object({
  scoreItemId: z.string().min(1),
  reason: z.string().trim().min(1, 'กรุณาเขียนเหตุผล').max(300),
  imageKey: z.string().max(200).nullable().default(null),
})
const approveBase = z.object({
  mode: z.enum(['online', 'paper']),
  /** ช่วงเวลาที่เปิดให้เริ่มสอบ */
  opensAt: z.number().int().positive(),
  closesAt: z.number().int().positive(),
  durationMin: z.number().int().min(5).max(240),
  capPct: z.number().int().min(0).max(100),
  examSetId: z.string().min(1).nullable().default(null),
  /** สลับข้อ/ตัวเลือกรายคน (ข้อสอบที่พิมพ์ในระบบ) */
  shuffle: z.boolean().default(true),
})
export const makeupApproveSchema = approveBase
  .refine((x) => x.closesAt > x.opensAt, { message: 'เวลาปิดต้องหลังเวลาเปิด' })
  .refine((x) => x.mode === 'paper' || !!x.examSetId, { message: 'กรุณาเลือกชุดข้อสอบ' })
export type MakeupApprove = z.infer<typeof makeupApproveSchema>
/** ครูให้สิทธิ์สอบเอง (นักเรียนยังไม่ได้ขอ / ขยายเวลา / คืนสิทธิ์หลังได้ 0) */
export const makeupGrantSchema = approveBase
  .extend({ scoreItemId: z.string().min(1), studentId: z.string().min(1) })
  .refine((x) => x.closesAt > x.opensAt, { message: 'เวลาปิดต้องหลังเวลาเปิด' })
  .refine((x) => x.mode === 'paper' || !!x.examSetId, { message: 'กรุณาเลือกชุดข้อสอบ' })
export const makeupRejectSchema = z.object({ note: z.string().trim().max(200).default('') })
export const makeupGradeSchema = z.object({ score: z.number().min(0).max(1000), note: z.string().trim().max(200).default('') })
export const makeupStartSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'รหัส 6 หลัก'), deviceId: z.string().min(8).max(80) })
export const makeupAnswersSchema = z.object({ answers: z.array(z.number().int().min(-1).max(4)).max(MAX_EXAM_QUESTIONS) })
export const makeupEventSchema = z.object({ kind: z.enum(['leave', 'return']), ms: z.number().int().min(0).max(86_400_000).optional() })

// ---------- มุมมองนักเรียน ----------
export type StudentMakeup = {
  scoreItemId: string
  title: string
  maxScore: number
  takenOn: string
  /** กำหนดสุดท้าย (ms) · null = ไม่เปิดสอบย้อนหลัง */
  deadline: number | null
  request: {
    id: string
    status: MakeupStatus
    mode: 'online' | 'paper' | null
    opensAt: number | null
    closesAt: number | null
    durationMin: number | null
    teacherNote: string
  } | null
}
/** ข้อสอบที่ส่งให้เครื่องนักเรียน — ไม่มีเฉลย · ลำดับตามที่สลับแล้ว */
export type StudentExamPaper = {
  id: string
  title: string
  studentName: string
  zipgradeId: string
  kind: 'typed' | 'pages'
  questions: { q: string; image?: string; choices: string[] }[]
  pageKeys: string[]
  count: number
  choiceCount: number
  /** คำตอบที่บันทึกไว้ ตามลำดับที่นักเรียนเห็น */
  answers: number[]
  endsAt: number
  leaves: number
  leaveLimit: number
  status: MakeupStatus
}

// ---------- มุมมองครู ----------
export type TeacherMakeupRow = {
  id: string
  status: MakeupStatus
  student: { id: string; name: string; zipgradeId: string }
  className: string
  item: { id: string; title: string; maxScore: number; takenOn: string }
  deadline: number | null
  reason: string
  imageKey: string | null
  mode: 'online' | 'paper' | null
  opensAt: number | null
  closesAt: number | null
  durationMin: number | null
  capPct: number
  examSetId: string | null
  code: string | null
  startedAt: number | null
  submittedAt: number | null
  leaves: number
  autoScore: number | null
  finalScore: number | null
  teacherNote: string
  createdAt: number
}
export type TeacherMakeups = {
  pending: TeacherMakeupRow[]
  active: TeacherMakeupRow[]
  toReview: TeacherMakeupRow[]
  recent: TeacherMakeupRow[]
  /** ขาดสอบแต่ยังไม่มีคำขอ (ยังไม่หมดสิทธิ์ หรือหมดแล้วได้ 0 — ครูให้สิทธิ์ใหม่ได้) */
  absent: { student: { id: string; name: string; zipgradeId: string }; className: string; item: { id: string; title: string; maxScore: number; takenOn: string }; deadline: number | null; zeroed: boolean }[]
}
export type TeacherMakeupDetail = TeacherMakeupRow & {
  examSet: ExamSet | null
  key: number[]
  /** คำตอบตามลำดับต้นฉบับ */
  answers: number[]
  graded: { correct: number; total: number; raw: number; capped: number } | null
  events: { at: number; kind: string; ms: number | null }[]
}

