import { describe, expect, it } from 'vitest'
import { activityInputSchema, aggregate, answerSchemaFor, normalizeWord, toStudentState, type TeacherLiveState } from '../src/shared/live'

describe('activityInputSchema', () => {
  it('ตรวจตามชนิดกิจกรรม', () => {
    expect(activityInputSchema.safeParse({ kind: 'checkin', prompt: 'วันนี้รู้สึกยังไง' }).success).toBe(true)
    expect(activityInputSchema.safeParse({ kind: 'poll', prompt: 'ชอบอะไร', options: ['ก'] }).success).toBe(false)
    expect(activityInputSchema.safeParse({ kind: 'poll', prompt: 'ชอบอะไร', options: ['ก', 'ข'] }).success).toBe(true)
    expect(activityInputSchema.safeParse({ kind: 'quiz', prompt: '1+1', options: ['1', '2'], correct: 1, seconds: 20 }).success).toBe(true)
    expect(activityInputSchema.safeParse({ kind: 'quiz', prompt: '1+1', options: ['1', '2'], correct: 2, seconds: 20 }).success).toBe(false)
    expect(activityInputSchema.safeParse({ kind: 'quiz', prompt: '1+1', options: ['1', '2'], correct: 0, seconds: 2 }).success).toBe(false)
    expect(activityInputSchema.safeParse({ kind: 'poll', prompt: ' ', options: ['ก', 'ข'] }).success).toBe(false)
    expect(activityInputSchema.safeParse({ kind: 'wordcloud', prompt: 'คำแรกที่นึกถึง' }).success).toBe(true)
  })
})

describe('answerSchemaFor', () => {
  it('ตรวจคำตอบตามกิจกรรม', () => {
    const poll = { kind: 'poll' as const, prompt: 'x', options: ['ก', 'ข'] }
    expect(answerSchemaFor(poll).safeParse({ choice: 1 }).success).toBe(true)
    expect(answerSchemaFor(poll).safeParse({ choice: 2 }).success).toBe(false)
    expect(answerSchemaFor({ kind: 'wordcloud', prompt: 'x' }).safeParse({ word: 'ก'.repeat(31) }).success).toBe(false)
    expect(answerSchemaFor({ kind: 'wordcloud', prompt: 'x' }).safeParse({ word: '  ' }).success).toBe(false)
    expect(answerSchemaFor({ kind: 'checkin', prompt: 'x' }).safeParse({ text: 'สบายดี' }).success).toBe(true)
  })
})

describe('aggregate', () => {
  it('โพลนับตามตัวเลือก', () => {
    const r = aggregate({ kind: 'poll', prompt: 'x', options: ['ก', 'ข', 'ค'] }, [{ answer: { choice: 0 } }, { answer: { choice: 2 } }, { answer: { choice: 2 } }].map((x) => ({ ...x, name: 'a', correct: null, elapsedMs: null })))
    expect(r).toEqual({ kind: 'poll', counts: [1, 0, 2] })
  })
  it('WordCloud รวมคำซ้ำ ไม่สนตัวพิมพ์/ช่องว่าง เรียงมากไปน้อย', () => {
    const words = ['แมว', ' แมว ', 'Dog', 'dog  ', 'ปลา', 'dog']
    const r = aggregate({ kind: 'wordcloud', prompt: 'x' }, words.map((word) => ({ answer: { word }, name: 'a', correct: null, elapsedMs: null })))
    expect(r).toEqual({ kind: 'wordcloud', words: [{ word: 'dog', n: 3 }, { word: 'แมว', n: 2 }, { word: 'ปลา', n: 1 }] })
    expect(normalizeWord('  Hello   World ')).toBe('hello world')
  })
  it('ควิซจัดอันดับคนตอบถูกตามความเร็ว', () => {
    const rs = [
      { answer: { choice: 1 }, correct: true, elapsedMs: 3000, name: 'ช้า' },
      { answer: { choice: 0 }, correct: false, elapsedMs: 500, name: 'ผิด' },
      { answer: { choice: 1 }, correct: true, elapsedMs: 1200, name: 'เร็ว' },
    ]
    expect(aggregate({ kind: 'quiz', prompt: 'x', options: ['ก', 'ข'], correct: 1, seconds: 20 }, rs)).toEqual({
      kind: 'quiz',
      counts: [1, 2],
      correct: 1,
      ranking: [{ name: 'เร็ว', ms: 1200 }, { name: 'ช้า', ms: 3000 }],
    })
  })
  it('เช็กอินแสดงข้อความล่าสุด', () => {
    const r = aggregate({ kind: 'checkin', prompt: 'x' }, [{ answer: { text: 'ง่วง' }, name: 'มานี', correct: null, elapsedMs: null }])
    expect(r).toEqual({ kind: 'checkin', entries: [{ name: 'มานี', text: 'ง่วง' }] })
  })
})

describe('toStudentState', () => {
  const base: TeacherLiveState = {
    session: { id: 's', title: 'ไลฟ์', status: 'live', classId: 'c', className: 'ห้อง', joinCode: 'ABC123' },
    activities: [],
    current: {
      activity: { id: 'a', index: 0, kind: 'quiz', prompt: '1+1', options: ['1', '2'], correct: 1, seconds: 20, accepting: true, showResults: false, openedAt: 1, deadline: 20_001 },
      responseCount: 3,
      total: 30,
      results: { kind: 'quiz', counts: [1, 2], correct: 1, ranking: [{ name: 'มานี', ms: 900 }] },
    },
    serverNow: 5,
  }
  it('ซ่อนเฉลยและผลก่อนครูเปิด', () => {
    const s = toStudentState(base)
    expect(s.current?.activity.correct).toBeUndefined()
    expect(s.current?.results).toBeNull()
    expect(JSON.stringify(s)).not.toContain('ABC123')
    expect(s.current?.responseCount).toBe(3)
  })
  it('เปิดผลแล้วเห็นเฉลย', () => {
    const shown = { ...base, current: { ...base.current!, activity: { ...base.current!.activity, showResults: true } } }
    const s = toStudentState(shown)
    expect(s.current?.activity.correct).toBe(1)
    expect(s.current?.results).toEqual(base.current!.results)
  })
})
