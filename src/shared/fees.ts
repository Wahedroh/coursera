import { z } from 'zod'

/** ทศนิยมไม่เกิน 2 ตำแหน่ง (เผื่อ error ของ floating point) */
const twoDecimals = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6
const money = z.number().max(100_000).refine(twoDecimals)

export const feeItemInputSchema = z.object({ title: z.string().trim().min(1).max(200), amount: money.refine((v) => v > 0) })
export type FeeItemInput = z.infer<typeof feeItemInputSchema>
export const createFeeItemsSchema = feeItemInputSchema.extend({ classIds: z.array(z.string()).min(1).max(50) })

export const chargeInputSchema = z
  .object({ amount: money.refine((v) => v > 0), paid: money.refine((v) => v >= 0), note: z.string().max(500) })
  .refine((c) => c.paid <= c.amount + 1e-9)
export type ChargeInput = z.infer<typeof chargeInputSchema>
export const bulkChargeSchema = z.object({ studentIds: z.array(z.string()).min(1).max(200) })

export const outstanding = (c: { amount: number; paid: number }) => Math.max(0, Math.round((c.amount - c.paid) * 100) / 100)
export const baht = (v: number) => `฿${v.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

export type FeeItemSummary = { id: string; title: string; amount: number; charged: number; paidInFull: number; outstanding: number }
export type FeeRow = {
  id: string
  zipgradeId: string
  title: string | null
  firstName: string
  lastName: string
  active: boolean
  charge: { amount: number; paid: number; note: string } | null
}
export type FeeSheet = { item: { id: string; classId: string; title: string; amount: number }; class: { id: string; name: string }; students: FeeRow[] }
export type StudentFee = { id: string; title: string; amount: number; paid: number; outstanding: number }

/** ช่องทางโอนจ่ายค่าเอกสาร (ครูตั้งครั้งเดียว ใช้ทุกห้อง) — นักเรียนเห็นเมื่อมียอดค้าง */
export const paymentInfoSchema = z.object({
  bank: z.string().trim().max(60).default(''),
  accountNumber: z.string().trim().max(40).default(''),
  accountName: z.string().trim().max(100).default(''),
  note: z.string().trim().max(300).default(''),
  /** รูป QR รับเงิน (อัปโหลดด้วย kind=payment) */
  qrKey: z.string().regex(/^pay\/[A-Za-z0-9]+\.(jpg|png|webp)$/).nullable().default(null),
})
export type PaymentInfo = z.infer<typeof paymentInfoSchema>
export const EMPTY_PAYMENT: PaymentInfo = { bank: '', accountNumber: '', accountName: '', note: '', qrKey: null }
export const hasPayment = (p: PaymentInfo) => !!(p.accountNumber || p.qrKey)
