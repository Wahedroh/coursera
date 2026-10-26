import { describe, expect, it } from 'vitest'
import { assignGrades, DEFAULT_BANDS, FIVE_LEVEL_BANDS, gradingSchema } from '../src/shared/grades'

const totals = (xs: number[]) => xs.map((total, i) => ({ id: `s${i}`, total }))

describe('assignGrades', () => {
  it('top 25% ได้ 4 (ตัวอย่างของครู)', () => {
    const r = assignGrades(totals([20, 18, 15, 12, 10, 9, 8, 5]), [
      { grade: '4', min: 76 },
      { grade: '3', min: 51 },
      { grade: '2', min: 26 },
      { grade: '1', min: 0 },
    ])
    expect(r.get('s0')).toMatchObject({ grade: '4', percentile: 100, rank: 1 })
    expect(r.get('s1')).toMatchObject({ grade: '4', percentile: 87.5, rank: 2 })
    expect(r.get('s2')).toMatchObject({ grade: '3', percentile: 75, rank: 3 })
    expect(r.get('s7')).toMatchObject({ grade: '1', percentile: 12.5, rank: 8 })
  })
  it('คะแนนเท่ากันได้เปอร์เซ็นไทล์และเกรดเท่ากัน (ได้ฝั่งสูง)', () => {
    const r = assignGrades(totals([10, 10, 5, 1]), DEFAULT_BANDS)
    expect(r.get('s0')).toEqual(r.get('s1'))
    expect(r.get('s1')).toMatchObject({ percentile: 100, rank: 1, grade: '4' })
    expect(r.get('s2')).toMatchObject({ percentile: 50, rank: 3, grade: '2.5' })
  })
  it('40 คน: 10 คนแรกได้ 4 คนที่ 11 ได้ 3.5', () => {
    const r = assignGrades(totals(Array.from({ length: 40 }, (_, i) => 100 - i)), DEFAULT_BANDS)
    expect(r.get('s9')!.grade).toBe('4')
    expect(r.get('s10')!.grade).toBe('3.5')
    expect(r.get('s39')!.grade).toBe('0')
  })
  it('ไม่มีนักเรียน', () => {
    expect(assignGrades([], DEFAULT_BANDS).size).toBe(0)
  })
})

describe('gradingSchema', () => {
  it('ค่าตั้งต้นถูกต้อง', () => {
    expect(gradingSchema.safeParse({ bands: DEFAULT_BANDS, visible: false }).success).toBe(true)
    expect(gradingSchema.safeParse({ bands: FIVE_LEVEL_BANDS, visible: true }).success).toBe(true)
  })
  it('ต้องเรียงจากมากไปน้อย ไม่ซ้ำ และช่วงสุดท้ายเริ่มที่ 0', () => {
    expect(gradingSchema.safeParse({ bands: [{ grade: '4', min: 50 }, { grade: '3', min: 60 }, { grade: '0', min: 0 }], visible: false }).success).toBe(false)
    expect(gradingSchema.safeParse({ bands: [{ grade: '4', min: 50 }, { grade: '4', min: 0 }], visible: false }).success).toBe(false)
    expect(gradingSchema.safeParse({ bands: [{ grade: '4', min: 50 }, { grade: '3', min: 10 }], visible: false }).success).toBe(false)
    expect(gradingSchema.safeParse({ bands: [{ grade: '4', min: 101 }, { grade: '0', min: 0 }], visible: false }).success).toBe(false)
    expect(gradingSchema.safeParse({ bands: [{ grade: '4', min: 0 }], visible: false }).success).toBe(false)
  })
})
