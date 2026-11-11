import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { openDay } from '../src/server/attendance/service'
import { computeStreak, spinWheel } from '../src/server/quests/streak'
import { todayBangkok } from '../src/shared/attendance'
import { WHEEL, weekStartBangkok } from '../src/shared/quests'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedAssignment, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

describe('สตรีค', () => {
  it('มา/สาย นับต่อ · ป่วย/ลา ไม่ขาด · ขาดครั้งแรกใช้โล่ · ขาดอีกเริ่มใหม่', () => {
    expect(computeStreak(['present', 'late', 'sick', 'leave', 'present'])).toEqual({ current: 3, best: 3, shieldsLeft: 1 })
    expect(computeStreak(['present', 'present', 'absent', 'present'])).toEqual({ current: 3, best: 3, shieldsLeft: 0 })
    expect(computeStreak(['present', 'absent', 'present', 'absent', 'present', 'present'])).toEqual({ current: 2, best: 2, shieldsLeft: 0 })
    expect(computeStreak([])).toEqual({ current: 0, best: 0, shieldsLeft: 1 })
  })

  it('ครบ 5 คาบได้รางวัลครั้งเดียว · ได้แล้วไม่หายแม้สตรีคขาดทีหลัง', async () => {
    const teacher = await loginTeacher()
    const { classId } = await seedClass(db())
    const s = await seedStudent(db(), classId)
    const c = await studentCookie(s.id)
    const t = Date.now()
    const days = Array.from({ length: 7 }, (_, i) => todayBangkok(t - (7 - i) * 86400_000))
    for (const d of days.slice(0, 5)) await openDay(db(), classId, d)
    const r1 = await json(await getJson('/api/student/quests/streak', c))
    expect(r1).toMatchObject({ current: 5, best: 5, shieldsLeft: 1, next: { at: 10 } })
    expect(r1.rewards[0]).toMatchObject({ at: 5, got: true })
    await getJson('/api/student/quests/streak', c)
    const hist = (await json(await getJson('/api/student/progress', c))).history
    expect(hist.filter((h: { reason: string }) => h.reason === '🔥 มาเรียนต่อเนื่อง 5 คาบ')).toHaveLength(1)
    // ขาด 2 วัน: วันแรกใช้โล่ วันที่สองเริ่มใหม่ · รางวัล 5 คาบยังอยู่
    for (const d of days.slice(5)) {
      const { day } = await openDay(db(), classId, d)
      await putJson(`/api/teacher/attendance/${day!.id}/records/${s.id}`, { status: 'absent' }, teacher)
    }
    expect(await json(await getJson('/api/student/quests/streak', c))).toMatchObject({ current: 0, best: 5, shieldsLeft: 0 })
    expect((await json(await getJson('/api/student/progress', c))).history.some((h: { reason: string }) => h.reason.startsWith('🔥'))).toBe(true)
  })
})

describe('วงล้อนำโชค', () => {
  it('ทำภารกิจไม่ครบหมุนไม่ได้ · ครบแล้วหมุนได้ครั้งเดียวต่อสัปดาห์ · ได้ EXP ตามช่อง', async () => {
    const teacher = await loginTeacher()
    const { classId } = await seedClass(db())
    const s = await seedStudent(db(), classId, { zipgradeId: '777' })
    const c = await studentCookie(s.id)
    expect(await json(await getJson('/api/student/quests/wheel', c))).toMatchObject({ canSpin: false, spun: null })
    expect((await postJson('/api/student/quests/wheel/spin', {}, { cookie: c })).status).toBe(409)

    const mon = weekStartBangkok(Date.now())
    for (let i = 0; i < 3; i++) await openDay(db(), classId, todayBangkok(mon + i * 86400_000))
    const asg = await seedAssignment(classId, { dueAt: Date.now() + 86400_000 })
    await putJson(`/api/student/assignments/${asg}/submission`, { text: 'ตอบ', imageKeys: [], clientRequestId: 'w1' }, c)
    const { ids } = await json(await postJson('/api/teacher/videos', { title: 'v', description: '', url: 'https://youtu.be/dQw4w9WgXcQ', classIds: [classId] }, { cookie: teacher }))
    await postJson(`/api/student/videos/${ids[0]}/watched`, { watchedSeconds: 80, durationSeconds: 100 }, { cookie: c })
    for (const q of ['attend', 'submit', 'video']) await postJson(`/api/student/quests/${q}/claim`, {}, { cookie: c })
    expect(await json(await getJson('/api/student/quests/wheel', c))).toMatchObject({ canSpin: true })

    const before = (await json(await getJson('/api/student/exp', c))).exp
    const r = await spinWheel(db(), s.id, Date.now(), () => 0.99) // ช่องสุดท้าย
    expect(r).toMatchObject({ canSpin: false, spun: { index: WHEEL.length - 1, exp: WHEEL[WHEEL.length - 1] } })
    const again = await json(await postJson('/api/student/quests/wheel/spin', {}, { cookie: c }))
    expect(again.spun).toEqual(r.spun)
    expect((await json(await getJson('/api/student/exp', c))).exp).toBe(before + WHEEL[WHEEL.length - 1])
  })
})
