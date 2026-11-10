import { z } from 'zod'

/** เกมตอบคำถามด้วยการ์ด QR: QR เก็บ "CC:<ZipGrade ID>" · ตัวอักษร A บน · B ขวา · C ล่าง · D ซ้าย
 *  นักเรียนหมุนการ์ดให้ตัวอักษรที่ตอบอยู่ด้านบน */
export const CARD_PREFIX = 'CC:'
export const LETTERS = ['A', 'B', 'C', 'D'] as const
export const MAX_CARD_QUESTIONS = 40
/** EXP: ตอบถูกข้อละ · เข้าร่วม (สแกนได้อย่างน้อย 1 ข้อ) */
export const CARD_EXP = { correct: 1, join: 3 } as const

export const cardPayload = (zipgradeId: string) => `${CARD_PREFIX}${zipgradeId}`
export function parseCard(text: string): string | null {
  return text.startsWith(CARD_PREFIX) && text.length > CARD_PREFIX.length && text.length <= 40 ? text.slice(CARD_PREFIX.length) : null
}

/** มุมของขอบบน QR (จากมุมซ้ายบนไปขวาบน) บนภาพ (องศา, แกน y ชี้ลง) → คำตอบ 0–3
 *  ตั้งตรง = A · หมุนทวนเข็ม 90° (ขอบขวาขึ้นบน) = B · กลับหัว = C · หมุนตามเข็ม 90° (ขอบซ้ายขึ้นบน) = D */
export function answerFromAngle(deg: number): number {
  const a = ((((deg + 180) % 360) + 360) % 360) - 180
  if (a > -45 && a <= 45) return 0
  if (a > -135 && a <= -45) return 1
  if (a > 45 && a <= 135) return 3
  return 2
}

/** โจทย์เป็นข้อความ รูป หรือทั้งสองอย่าง (ต้องมีอย่างน้อย 1) · ตัวเลือกปล่อยว่างได้ถ้าอยู่ในรูปแล้ว (ใช้ A–D แทน) */
export const cardQuestionSchema = z
  .object({
    q: z.string().trim().max(300),
    image: z.string().regex(/^quiz\/[A-Za-z0-9]+\.(jpg|png|webp)$/).optional(),
    choices: z.array(z.string().trim().max(150)).min(2).max(4),
    answer: z.number().int().min(0).max(3),
  })
  .refine((x) => x.answer < x.choices.length)
  .refine((x) => x.q.length > 0 || !!x.image, { message: 'ต้องมีโจทย์เป็นข้อความหรือรูป' })
  .refine((x) => !!x.image || x.choices.every((c) => c.length > 0), { message: 'กรอกตัวเลือกให้ครบ (หรือใส่รูปโจทย์ที่มีตัวเลือกในรูป)' })
export const cardQuizInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  questions: z.array(cardQuestionSchema).min(1).max(MAX_CARD_QUESTIONS),
})
export type CardQuizInput = z.infer<typeof cardQuizInputSchema>
export type CardQuestion = z.infer<typeof cardQuestionSchema>

export const startGameSchema = z.object({ quizId: z.string(), classId: z.string() })
export const scanBatchSchema = z.object({
  qIndex: z.number().int().min(0),
  scans: z.array(z.object({ zipgradeId: z.string().min(1).max(40), answer: z.number().int().min(0).max(3) })).max(200),
})
export const endGameSchema = z.object({ saveScore: z.boolean().default(false), attendance: z.boolean().default(false) })

export type CardQuizSummary = { id: string; title: string; count: number; updatedAt: number }
export type CardGameState = {
  id: string
  quizTitle: string
  class: { id: string; name: string }
  questions: CardQuestion[]
  current: number
  revealed: boolean
  ended: boolean
  /** เลขที่ = ลำดับในห้อง (เริ่ม 1) */
  roster: { id: string; no: number; zipgradeId: string; name: string }[]
  /** คำตอบของข้อปัจจุบัน */
  answers: Record<string, number>
}
export type CardGameResult = {
  total: number
  players: { id: string; no: number; name: string; correct: number; answered: number; exp: number; avatar: Record<string, unknown> | null }[]
  /** ต่อข้อ: จำนวนคนที่ตอบแต่ละตัวเลือก */
  perQuestion: { counts: number[]; correct: number; answered: number }[]
  saved?: { scoreItemId: string | null; attendanceDate: string | null }
}
