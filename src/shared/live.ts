import { z } from 'zod'

export const LIVE_KINDS = ['checkin', 'poll', 'wordcloud', 'quiz'] as const
export type LiveKind = (typeof LIVE_KINDS)[number]
export const KIND_LABEL: Record<LiveKind, string> = { checkin: 'เช็กอิน', poll: 'โพล', wordcloud: 'WordCloud', quiz: 'ควิซ' }
/** สีตัวเลือกโพล/ควิซ (ใช้ร่วมจอและมือถือ) */
export const OPTION_COLORS = ['#E5484D', '#3E63DD', '#F5A524', '#30A46C', '#8E4EC6', '#12A594'] as const
export const OPTION_SYMBOLS = ['▲', '◆', '●', '■', '★', '♥'] as const

export const LIVE_EXP = { answer: 1, quizCorrect: 2 } as const
/** เผื่อเวลาเครือข่ายหลังหมดเวลาควิซ */
export const QUIZ_GRACE_MS = 1000

const prompt = z.string().trim().min(1).max(300)
const option = z.string().trim().min(1).max(80)

export const activityInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('checkin'), prompt }),
  z.object({ kind: z.literal('poll'), prompt, options: z.array(option).min(2).max(6) }),
  z.object({ kind: z.literal('wordcloud'), prompt }),
  z
    .object({ kind: z.literal('quiz'), prompt, options: z.array(option).min(2).max(4), correct: z.number().int().min(0), seconds: z.number().int().min(5).max(120) })
    .refine((q) => q.correct < q.options.length),
])
export type ActivityInput = z.infer<typeof activityInputSchema>

export const liveTitleSchema = z.object({ title: z.string().trim().min(1).max(200) })

export function answerSchemaFor(a: ActivityInput) {
  switch (a.kind) {
    case 'checkin':
      return z.object({ text: z.string().trim().min(1).max(200) })
    case 'wordcloud':
      return z.object({ word: z.string().trim().min(1).max(30) })
    case 'poll':
    case 'quiz':
      return z.object({ choice: z.number().int().min(0).max(a.options.length - 1) })
  }
}

export const normalizeWord = (w: string) => w.trim().replace(/\s+/g, ' ').toLowerCase()

export type LiveResults =
  | { kind: 'checkin'; entries: { name: string; text: string }[] }
  | { kind: 'poll'; counts: number[] }
  | { kind: 'wordcloud'; words: { word: string; n: number }[] }
  | { kind: 'quiz'; counts: number[]; correct: number; ranking: { name: string; ms: number }[] }

export type ResponseForAggregate = { answer: Record<string, unknown>; correct: boolean | null; elapsedMs: number | null; name: string }

/** รวมคำตอบเป็นผลสำหรับจอ (responses เรียงจากเก่าไปใหม่) */
export function aggregate(a: ActivityInput, rs: ResponseForAggregate[]): LiveResults {
  switch (a.kind) {
    case 'checkin':
      return { kind: 'checkin', entries: rs.slice(-60).reverse().map((r) => ({ name: r.name, text: String(r.answer.text ?? '') })) }
    case 'poll':
      return { kind: 'poll', counts: a.options.map((_, i) => rs.filter((r) => r.answer.choice === i).length) }
    case 'wordcloud': {
      const m = new Map<string, number>()
      for (const r of rs) {
        const w = normalizeWord(String(r.answer.word ?? ''))
        if (w) m.set(w, (m.get(w) ?? 0) + 1)
      }
      const words = [...m].map(([word, n]) => ({ word, n })).sort((x, y) => y.n - x.n || x.word.localeCompare(y.word))
      return { kind: 'wordcloud', words: words.slice(0, 60) }
    }
    case 'quiz': {
      const ranking = rs
        .filter((r) => r.correct)
        .sort((x, y) => (x.elapsedMs ?? Infinity) - (y.elapsedMs ?? Infinity))
        .slice(0, 10)
        .map((r) => ({ name: r.name, ms: r.elapsedMs ?? 0 }))
      return { kind: 'quiz', counts: a.options.map((_, i) => rs.filter((r) => r.answer.choice === i).length), correct: a.correct, ranking }
    }
  }
}

export type LiveActivityView = {
  id: string
  index: number
  kind: LiveKind
  prompt: string
  options?: string[]
  correct?: number
  seconds?: number
  accepting: boolean
  showResults: boolean
  openedAt: number | null
  /** ควิซ: เวลาหมด (epoch ms) */
  deadline: number | null
}

export type LiveStatus = 'draft' | 'live' | 'ended'

export type TeacherLiveState = {
  session: { id: string; title: string; status: LiveStatus; classId: string; className: string; joinCode: string }
  activities: (ActivityInput & { id: string; responseCount: number })[]
  current: { activity: LiveActivityView; responseCount: number; total: number; results: LiveResults } | null
  serverNow: number
}

export type StudentLiveState = {
  session: { id: string; title: string; status: LiveStatus }
  current: { activity: LiveActivityView; responseCount: number; results: LiveResults | null } | null
  serverNow: number
}

/** ตัดสิ่งที่นักเรียนไม่ควรเห็น: เฉลยควิซและผลรวมก่อนครูเปิด, รหัสห้อง, รายการกิจกรรมล่วงหน้า */
export function toStudentState(t: TeacherLiveState): StudentLiveState {
  const c = t.current
  let current: StudentLiveState['current'] = null
  if (c) {
    const { correct, ...rest } = c.activity
    const shown = c.activity.showResults
    current = { activity: shown ? { ...rest, correct } : rest, responseCount: c.responseCount, results: shown ? c.results : null }
  }
  return { session: { id: t.session.id, title: t.session.title, status: t.session.status }, current, serverNow: t.serverNow }
}

export type MyLiveAnswer = { activityId: string; answer: Record<string, unknown>; correct: boolean | null } | null

export type LiveSessionSummary = { id: string; title: string; status: LiveStatus; activityCount: number; createdAt: number; startedAt: number | null }

/** ข้อความที่ LiveRoom ส่งให้ไคลเอนต์ */
export type LiveMessage<S> = { type: 'state'; state: S }
