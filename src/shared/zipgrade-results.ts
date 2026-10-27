import Papa from 'papaparse'
import { z } from 'zod'
import { canonicalZipgradeId } from './zipgrade'

/** แถวผลสอบจากไฟล์ export ของ ZipGrade (ข้อมูลต่อการสแกน 1 ใบ) */
export type ZipgradeResult = { line: number; zipgradeId: string; earned: number; possible: number | null }
export type ZipgradeResultsParse = { rows: ZipgradeResult[]; duplicates: string[]; errors: string[] }

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, ' ')
// ชื่อคอลัมน์ต่างกันตามรุ่น/ภาษาของ ZipGrade — เรียงจากที่น่าเชื่อถือที่สุด
const ID_COLS = ['zipgrade id', 'student id', 'external id', 'id', 'รหัสนักเรียน']
const EARNED_COLS = ['earned points', 'points earned', 'earned', 'score', 'คะแนนที่ได้', 'คะแนน']
const POSSIBLE_COLS = ['possible points', 'points possible', 'possible', 'คะแนนเต็ม']
const PERCENT_COLS = ['percent correct', 'percent', 'percentage']

const pick = (fields: string[], names: string[]) => names.map((n) => fields.find((f) => norm(f) === n)).find(Boolean)
const num = (v: string | undefined) => {
  const t = (v ?? '').trim().replace('%', '').replace(',', '.')
  return t !== '' && /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null
}

export function parseZipgradeResults(text: string): ZipgradeResultsParse {
  if (text.includes('�')) return { rows: [], duplicates: [], errors: ['ไฟล์ไม่ได้บันทึกเป็น UTF-8 กรุณา export ใหม่จาก ZipGrade หรือบันทึกเป็น "CSV UTF-8"'] }
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() })
  const fields = parsed.meta.fields ?? []
  const idCol = pick(fields, ID_COLS)
  const earnedCol = pick(fields, EARNED_COLS)
  const possibleCol = pick(fields, POSSIBLE_COLS)
  const percentCol = pick(fields, PERCENT_COLS)
  if (!idCol || (!earnedCol && !percentCol)) {
    return { rows: [], duplicates: [], errors: ['ไม่พบคอลัมน์รหัสนักเรียน (ZipGrade ID / Student ID) หรือคะแนน (Earned Points) — ใช้ไฟล์ผลสอบที่ export จาก ZipGrade'] }
  }
  const byId = new Map<string, ZipgradeResult>()
  const duplicates = new Set<string>()
  const errors: string[] = []
  parsed.data.forEach((r, i) => {
    const line = i + 2
    const raw = (r[idCol] ?? '').trim()
    if (!raw) return
    const zipgradeId = canonicalZipgradeId(raw)
    const possible = possibleCol ? num(r[possibleCol]) : null
    let earned = earnedCol ? num(r[earnedCol]) : null
    // ไม่มีคะแนนดิบ ใช้เปอร์เซ็นต์ (คิดเทียบคะแนนเต็มทีหลัง)
    if (earned === null && percentCol) {
      const p = num(r[percentCol])
      if (p !== null) return void store({ line, zipgradeId, earned: p, possible: 100 })
    }
    if (earned === null || earned < 0) return void errors.push(`แถว ${line}: คะแนนของรหัส ${raw} อ่านไม่ได้`)
    store({ line, zipgradeId, earned, possible })
  })
  // สแกนซ้ำ (เช่น สแกนใหม่หลังแก้) — ใช้ใบที่อยู่ล่างสุดของไฟล์
  function store(row: ZipgradeResult) {
    if (byId.has(row.zipgradeId)) duplicates.add(row.zipgradeId)
    byId.set(row.zipgradeId, row)
  }
  return { rows: [...byId.values()], duplicates: [...duplicates], errors }
}

/** คะแนนที่จะบันทึก: ใช้คะแนนดิบ หรือเทียบสัดส่วนกับคะแนนเต็มของรายการ · ปัดทศนิยม 2 ตำแหน่ง */
export function toItemScore(r: Pick<ZipgradeResult, 'earned' | 'possible'>, maxScore: number, scale: boolean): number {
  const v = scale && r.possible ? (r.earned / r.possible) * maxScore : r.earned
  return Math.round(v * 100) / 100
}

export const scoreImportSchema = z.object({
  rows: z.array(z.object({ zipgradeId: z.string().trim().min(1).max(50), score: z.number() })).min(1).max(1000),
  overwrite: z.boolean(),
  absentMissing: z.boolean(),
})
export type ScoreImportInput = z.infer<typeof scoreImportSchema>
export type ScoreImportResult = { saved: number; keptExisting: number; markedAbsent: number; notInClass: string[]; invalid: string[] }
