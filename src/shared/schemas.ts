import { z } from 'zod'

export const teacherLoginSchema = z.object({ password: z.string().min(1).max(200) })

export const MAX_CSV_CHARS = 1_000_000
export const rosterPreviewSchema = z.object({ csv: z.string() })
export const rosterApplySchema = z.object({ csv: z.string(), deactivateMissing: z.boolean() })

export const PIN_RE = /^\d{4}$/
export const studentLookupSchema = z.object({ zipgradeId: z.string().max(32) })
export const studentPinSchema = z.object({ zipgradeId: z.string().max(32), pin: z.string().max(32) })
