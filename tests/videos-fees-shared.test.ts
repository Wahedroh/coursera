import { describe, expect, it } from 'vitest'
import { chargeInputSchema, feeItemInputSchema } from '../src/shared/fees'
import { parseYouTubeId, videoInputSchema } from '../src/shared/videos'

describe('parseYouTubeId', () => {
  const ID = 'dQw4w9WgXcQ'
  it.each([
    ID,
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?feature=share&v=${ID}&t=42s`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}?si=abc123`,
    `youtu.be/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=shared`,
    `  https://www.youtube.com/watch?v=${ID}  `,
  ])('รับ %s', (url) => expect(parseYouTubeId(url)).toBe(ID))
  it.each(['', 'hello', 'https://vimeo.com/12345', `https://evil.com/watch?v=${ID}`, 'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/@channel'])('ปฏิเสธ %s', (url) =>
    expect(parseYouTubeId(url)).toBeNull(),
  )
})

describe('schemas', () => {
  it('คลิป: ต้องมีชื่อและลิงก์ YouTube ที่ถูก', () => {
    expect(videoInputSchema.safeParse({ title: 'บทที่ 1', description: '', url: 'https://youtu.be/dQw4w9WgXcQ' }).success).toBe(true)
    expect(videoInputSchema.safeParse({ title: ' ', description: '', url: 'https://youtu.be/dQw4w9WgXcQ' }).success).toBe(false)
    expect(videoInputSchema.safeParse({ title: 'x', description: '', url: 'https://vimeo.com/1' }).success).toBe(false)
  })
  it('ค่าเอกสาร: ราคา > 0 ทศนิยม ≤ 2', () => {
    expect(feeItemInputSchema.safeParse({ title: 'ชีทบทที่ 1', amount: 35.5 }).success).toBe(true)
    for (const amount of [0, -5, 10.001, 100001]) expect(feeItemInputSchema.safeParse({ title: 'x', amount }).success).toBe(false)
  })
  it('ยอดจ่ายแล้วต้องไม่เกินยอดที่ต้องจ่าย', () => {
    expect(chargeInputSchema.safeParse({ amount: 50, paid: 20, note: '' }).success).toBe(true)
    expect(chargeInputSchema.safeParse({ amount: 50, paid: 50, note: '' }).success).toBe(true)
    expect(chargeInputSchema.safeParse({ amount: 50, paid: 60, note: '' }).success).toBe(false)
    expect(chargeInputSchema.safeParse({ amount: 50, paid: -1, note: '' }).success).toBe(false)
    expect(chargeInputSchema.safeParse({ amount: 0, paid: 0, note: '' }).success).toBe(false)
  })
})
