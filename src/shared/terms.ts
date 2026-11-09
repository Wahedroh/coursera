import { z } from 'zod'

export type Term = { id: string; name: string; startedAt: number; season: number }
/** ช่วงเวลาของเทอม [start, end) — end ของเทอมปัจจุบัน = ไม่มีที่สิ้นสุด */
export type TermWindow = { term: Term; start: number; end: number }
export const OPEN_END = Number.MAX_SAFE_INTEGER

export const newTermSchema = z.object({ name: z.string().trim().min(1).max(30) })
