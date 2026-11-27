import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { improvementBonus } from '../src/shared/scores'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

describe('สูตรโบนัสพัฒนาการ', () => {
  it('25% ของส่วนที่ขึ้น · ขั้นต่ำ 10 จุด % · เพดาน 10% · รักษาระดับ ≥80% ได้ 5% · ปัดลง 0.5 · ไม่เกินเต็ม', () => {
    expect(improvementBonus(40, 9, 20)).toBe(0) // +5 จุด
    expect(improvementBonus(40, 12, 20)).toBe(1) // +20 จุด → 5% ของ 20
    expect(improvementBonus(30, 14, 20)).toBe(2) // +40 จุด → ชนเพดาน 10%
    expect(improvementBonus(85, 18, 20)).toBe(1) // รักษาระดับ
    expect(improvementBonus(50, 13, 20)).toBe(0.5) // +15 จุด → 3.75% = 0.75 → ปัดลง 0.5
    expect(improvementBonus(10, 20, 20)).toBe(0) // เต็มแล้ว บวกไม่ได้
    expect(improvementBonus(70, 19.5, 20)).toBe(0.5) // ไม่เกินคะแนนเต็ม
    expect(improvementBonus(null, 20, 20)).toBe(0) // ไม่มีครั้งก่อน
    expect(improvementBonus(80, 12, 20)).toBe(0) // ลดลง
  })
})

describe('API', () => {
  const db = () => getDb(env)
  beforeEach(resetDb)
  it('เปิดโบนัส → คะแนนที่นับ = จริง + โบนัส · ช่องกรอกยังเป็นคะแนนจริง · แก้คะแนนคิดใหม่ · แก้ครั้งก่อนคิดใหม่ · ปิดแล้วคืนคะแนนจริง', async () => {
    const cookie = await loginTeacher()
    const { classId } = await seedClass(db())
    const a = await seedStudent(db(), classId)
    const b = await seedStudent(db(), classId)
    const mk = async (title: string, takenOn: string) => (await json(await postJson('/api/teacher/score-items', { title, category: 'quiz', maxScore: 20, takenOn, classIds: [classId] }, { cookie }))).ids[0] as string
    const put = (item: string, st: string, score: number) => putJson(`/api/teacher/score-items/${item}/scores/${st}`, { score, absent: false, note: '' }, cookie)
    const sheetOf = async (item: string) => json(await getJson(`/api/teacher/score-items/${item}`, cookie))
    const scoreOf = async (item: string, st: string) => (await sheetOf(item)).students.find((r: { id: string }) => r.id === st)

    const q1 = await mk('สอบย่อย 1', '2026-11-01')
    await put(q1, a.id, 8) // 40%
    await put(q1, b.id, 17) // 85%
    const q2 = await mk('สอบย่อย 2', '2026-11-15')
    await put(q2, a.id, 12) // 60% (+20)
    await put(q2, b.id, 18) // 90% รักษาระดับ
    expect(await scoreOf(q2, a.id)).toMatchObject({ score: 12, bonus: 0 })

    expect((await putJson(`/api/teacher/score-items/${q2}/bonus`, { enabled: true }, cookie)).status).toBe(200)
    const sh = await sheetOf(q2)
    expect(sh.item.improvementBonus).toBe(true)
    expect(sh.students.find((r: { id: string }) => r.id === a.id)).toMatchObject({ score: 13, bonus: 1 })
    expect(sh.students.find((r: { id: string }) => r.id === b.id)).toMatchObject({ score: 19, bonus: 1 })
    expect(sh.bonusInfo[a.id]).toEqual({ prevTitle: 'สอบย่อย 1', prevPct: 40, nowPct: 60, bonus: 1 })

    // ครูแก้คะแนนจริง → คิดโบนัสใหม่ (+40 จุด → ชนเพดาน 2)
    await put(q2, a.id, 16)
    expect(await scoreOf(q2, a.id)).toMatchObject({ score: 18, bonus: 2 })
    // แก้คะแนนครั้งก่อน → ครั้งหลังคิดใหม่ (40% → 75%: +5 จุด ไม่ได้)
    await put(q1, a.id, 15)
    expect(await scoreOf(q2, a.id)).toMatchObject({ score: 16, bonus: 0 })

    // นักเรียนเห็นคะแนนรวมโบนัส + บอกว่าเป็นโบนัส
    await putJson(`/api/teacher/score-items/${q2}/published`, { published: true }, cookie)
    const sv = (await json(await getJson('/api/student/scores', await studentCookie(b.id)))).find((x: { id: string }) => x.id === q2)
    expect(sv).toMatchObject({ score: 19, bonus: 1 })

    // ลดคะแนนเต็มต่ำกว่าคะแนนจริง = ไม่ได้ · ปิดโบนัส = คืนคะแนนจริง
    expect((await putJson(`/api/teacher/score-items/${q2}`, { title: 'สอบย่อย 2', category: 'quiz', maxScore: 17, takenOn: '2026-11-15', makeupDays: 14 }, cookie)).status).toBe(409)
    await putJson(`/api/teacher/score-items/${q2}/bonus`, { enabled: false }, cookie)
    expect(await scoreOf(q2, b.id)).toMatchObject({ score: 18, bonus: 0 })
  })
})
