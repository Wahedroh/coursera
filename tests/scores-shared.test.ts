import { describe, expect, it } from 'vitest'
import { parsePastedColumn, parseScore, scoreInputSchema, scoreItemInputSchema, scoreStats } from '../src/shared/scores'

describe('parseScore', () => {
  it('ว่าง = ยังไม่กรอก', () => {
    expect(parseScore('', 10)).toEqual({ ok: true, value: null })
    expect(parseScore('   ', 10)).toEqual({ ok: true, value: null })
  })
  it('รับทศนิยม 2 ตำแหน่งและคอมมา', () => {
    expect(parseScore(' 7.5 ', 10)).toEqual({ ok: true, value: 7.5 })
    expect(parseScore('7,25', 10)).toEqual({ ok: true, value: 7.25 })
    expect(parseScore('0', 10)).toEqual({ ok: true, value: 0 })
    expect(parseScore('10', 10)).toEqual({ ok: true, value: 10 })
  })
  it('ปฏิเสธค่าผิด', () => {
    for (const v of ['1,000', '10.001', '-1', '11', 'abc', '1e1', '5.', '.5.5', 'Infinity']) expect(parseScore(v, 10)).toEqual({ ok: false })
  })
})

describe('parsePastedColumn', () => {
  it('แยกบรรทัด เก็บบรรทัดว่าง ตัดบรรทัดท้าย', () => {
    expect(parsePastedColumn('8\r\n\r\n9.5\r\n')).toEqual(['8', '', '9.5'])
    expect(parsePastedColumn('8\n9')).toEqual(['8', '9'])
  })
  it('เอาคอลัมน์แรกเมื่อวางหลายคอลัมน์', () => {
    expect(parsePastedColumn('8\tก\n9\tข\n')).toEqual(['8', '9'])
  })
})

describe('scoreStats', () => {
  it('สรุปเฉพาะช่องที่กรอก', () => {
    expect(scoreStats([8, null, 6, 10])).toEqual({ filled: 3, avg: 8, max: 10, min: 6 })
    expect(scoreStats([null])).toEqual({ filled: 0, avg: null, max: null, min: null })
  })
})

describe('schemas', () => {
  it('รายการคะแนน', () => {
    const ok = { title: 'สอบย่อย 1', category: 'quiz', maxScore: 20, takenOn: '2026-10-20' }
    expect(scoreItemInputSchema.safeParse(ok).success).toBe(true)
    expect(scoreItemInputSchema.safeParse({ ...ok, maxScore: 0 }).success).toBe(false)
    expect(scoreItemInputSchema.safeParse({ ...ok, maxScore: 10.005 }).success).toBe(false)
    expect(scoreItemInputSchema.safeParse({ ...ok, takenOn: '2026-02-30' }).success).toBe(false)
    expect(scoreItemInputSchema.safeParse({ ...ok, category: 'x' }).success).toBe(false)
    expect(scoreItemInputSchema.safeParse({ ...ok, title: ' ' }).success).toBe(false)
  })
  it('คะแนนรายคน', () => {
    expect(scoreInputSchema.safeParse({ score: null, absent: true, note: '' }).success).toBe(true)
    expect(scoreInputSchema.safeParse({ score: 5, absent: false, note: 'x'.repeat(501) }).success).toBe(false)
  })
})
