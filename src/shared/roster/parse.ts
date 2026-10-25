import Papa from 'papaparse'
import { canonicalZipgradeId } from '../zipgrade'

export type RosterFlag = 'no_title' | 'duplicate_name' | 'unusual_id' | 'missing_field'

export type RosterRow = {
  line: number
  zipgradeId: string
  title: string | null
  firstName: string
  lastName: string
  className: string
  schoolName: string
  grade: number | null
  flags: RosterFlag[]
}

export type ParseResult = { rows: RosterRow[]; errors: { line: number; message: string }[] }

// ลำดับสำคัญ: ตรวจคำยาวก่อน เพื่อไม่ให้ "นาง" จับ "นางสาว"
const TITLES = ['เด็กหญิง', 'เด็กชาย', 'นางสาว', 'นาง', 'นาย']
const REQUIRED = ['ZipGrade ID', 'First Name', 'Last Name', 'Classes']

export function splitThaiName(first: string, last: string): { title: string | null; firstName: string; lastName: string } {
  const f = first.trim()
  const l = last.trim()
  const title = TITLES.find((t) => f.startsWith(t)) ?? null
  if (title === null) return { title: null, firstName: f, lastName: l }
  if (f === title) {
    const [firstName = '', ...rest] = l.split(/\s+/)
    return { title, firstName, lastName: rest.join(' ') }
  }
  return { title, firstName: f.slice(title.length).trim(), lastName: l }
}

export function parseClassName(name: string): { schoolName: string; grade: number | null } {
  const m = /^(.*\S)\s+ชั้น\s*(\d+)$/.exec(name.trim())
  if (!m) return { schoolName: name.trim(), grade: null }
  return { schoolName: m[1], grade: Number(m[2]) }
}

export function parseZipgradeCsv(text: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })
  const fields = parsed.meta.fields ?? []
  const missing = REQUIRED.filter((c) => !fields.includes(c))
  if (missing.length > 0) {
    return { rows: [], errors: [{ line: 1, message: `ไฟล์ไม่มีคอลัมน์ที่ต้องการ: ${missing.join(', ')}` }] }
  }

  const rows: RosterRow[] = []
  const errors: ParseResult['errors'] = []
  const seen = new Map<string, number>()

  parsed.data.forEach((rec, i) => {
    const line = i + 2
    const zipgradeId = canonicalZipgradeId(rec['ZipGrade ID'] ?? '')
    const rawFirst = (rec['First Name'] ?? '').trim()
    const rawLast = (rec['Last Name'] ?? '').trim()
    const className = (rec['Classes'] ?? '').trim()

    if (!zipgradeId) return errors.push({ line, message: `แถว ${line}: ไม่มี ZipGrade ID` })
    if (!rawFirst && !rawLast) return errors.push({ line, message: `แถว ${line}: ไม่มีชื่อ` })
    if (!className) return errors.push({ line, message: `แถว ${line}: ไม่มีห้อง (Classes)` })
    const prev = seen.get(zipgradeId)
    if (prev !== undefined) return errors.push({ line, message: `แถว ${line}: ZipGrade ID ซ้ำกับแถว ${prev}` })
    seen.set(zipgradeId, line)

    const name = splitThaiName(rawFirst, rawLast)
    const flags: RosterFlag[] = []
    if (name.title === null) flags.push('no_title')
    if (!/^\d{1,4}$/.test(zipgradeId)) flags.push('unusual_id')
    if (!name.firstName || !name.lastName) flags.push('missing_field')
    rows.push({ line, zipgradeId, ...name, className, ...parseClassName(className), flags })
  })

  const nameKey = (r: RosterRow) => `${r.className}|${r.firstName} ${r.lastName}`
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(nameKey(r), (counts.get(nameKey(r)) ?? 0) + 1)
  for (const r of rows) if ((counts.get(nameKey(r)) ?? 0) > 1) r.flags.push('duplicate_name')

  return { rows, errors }
}
