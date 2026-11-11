import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { openDay } from '../src/server/attendance/service'
import { charactersOfSeason } from '../src/shared/characters'
import { todayBangkok } from '../src/shared/attendance'
import { weekStartBangkok } from '../src/shared/quests'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedAssignment, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const tick = () => new Promise((r) => setTimeout(r, 5))
const VIDEO = { title: 'ทบทวนบทที่ 1', description: '', url: 'https://youtu.be/dQw4w9WgXcQ' }
const ITEM = { title: 'สอบย่อย 1', category: 'quiz', maxScore: 20, takenOn: '2026-10-20' }

async function setup() {
  const teacher = await loginTeacher()
  const { classId } = await seedClass(db())
  const a = await seedStudent(db(), classId, { firstName: 'เอ' })
  const sa = await studentCookie(a.id)
  const give = async (times: number, delta = 10) => {
    for (let i = 0; i < times; i++) await postJson('/api/teacher/points', { studentIds: [a.id], delta, reason: 'ตอบคำถาม' }, { cookie: teacher })
  }
  return { teacher, classId, a, sa, give }
}

describe('เทอม', () => {
  it('มีเทอมแรกจาก migration · เปิดเทอมใหม่ได้ ชื่อซ้ำไม่ได้ · ต้องเป็นครู', async () => {
    const { teacher, sa } = await setup()
    expect(await json(await getJson('/api/teacher/terms', teacher))).toMatchObject([{ id: 'term-1', name: '2/2569', season: 1 }])
    expect((await postJson('/api/teacher/terms', { name: '1/2570' }, { cookie: sa })).status).toBe(401)
    const t2 = await json(await postJson('/api/teacher/terms', { name: '1/2570' }, { cookie: teacher }))
    expect(t2).toMatchObject({ name: '1/2570', season: 2 })
    expect((await postJson('/api/teacher/terms', { name: '1/2570' }, { cookie: teacher })).status).toBe(409)
    expect((await postJson('/api/teacher/terms', { name: ' ' }, { cookie: teacher })).status).toBe(400)
    const list = await json(await getJson('/api/teacher/terms', teacher))
    expect(list.map((t: { name: string }) => t.name)).toEqual(['1/2570', '2/2569'])
  })

  it('EXP/เลเวลเริ่มใหม่ · ไข่เทอมก่อนยังเปิดได้ (ซีซัน 1) · ไข่เทอมใหม่ได้ตัวซีซัน 2', async () => {
    const { teacher, classId, sa, give } = await setup()
    await give(4) // 40 EXP = LV 1
    const p1 = await json(await getJson('/api/student/progress', sa))
    expect(p1).toMatchObject({ exp: 40, level: 1, term: { name: '2/2569', season: 1 } })
    const oldEgg = p1.eggs[0]
    await tick()
    await postJson('/api/teacher/terms', { name: '1/2570' }, { cookie: teacher })
    const p2 = await json(await getJson('/api/student/progress', sa))
    expect(p2).toMatchObject({ exp: 0, level: 0, history: [], term: { name: '1/2570', season: 2 } })
    expect(p2.eggs).toHaveLength(1) // ไข่ที่ยังไม่เปิดจากเทอม 1
    expect(await json(await getJson('/api/student/exp', sa))).toMatchObject({ exp: 0, level: 0 })
    expect((await json(await getJson(`/api/teacher/classes/${classId}/points`, teacher)))[0].exp).toBe(0)

    await give(4)
    const p3 = await json(await getJson('/api/student/progress', sa))
    expect(p3).toMatchObject({ exp: 40, level: 1 })
    expect(p3.eggs).toHaveLength(2)
    const newEgg = p3.eggs.find((e: { id: string }) => e.id !== oldEgg.id)
    expect(newEgg).toMatchObject({ level: 1, season: 2, termName: '1/2570' })
    const s1 = charactersOfSeason(1).map((c) => c.id)
    const s2 = charactersOfSeason(2).map((c) => c.id)
    expect(s1).toContain((await json(await postJson(`/api/student/eggs/${oldEgg.id}/open`, {}, { cookie: sa }))).characterId)
    expect(s2).toContain((await json(await postJson(`/api/student/eggs/${newEgg.id}/open`, {}, { cookie: sa }))).characterId)
  })

  it('งาน/คะแนนสอบของเทอมก่อนไม่แสดงในเทอมใหม่ แต่ export ย้อนหลังได้', async () => {
    const { teacher, classId, a, sa } = await setup()
    const old = await seedAssignment(classId, { title: 'งานเทอม 1' })
    await postJson('/api/teacher/score-items', { ...ITEM, classIds: [classId] }, { cookie: teacher })
    await putJson(`/api/student/assignments/${old}/submission`, { text: 'ตอบ', imageKeys: [], clientRequestId: 'r1' }, sa)
    await tick()
    await postJson('/api/teacher/terms', { name: '1/2570' }, { cookie: teacher })
    await tick()
    await seedAssignment(classId, { title: 'งานเทอม 2' })

    const titles = (xs: { title: string }[]) => xs.map((x) => x.title)
    expect(titles(await json(await getJson(`/api/teacher/classes/${classId}/assignments`, teacher)))).toEqual(['งานเทอม 2'])
    expect(titles(await json(await getJson('/api/student/assignments', sa)))).toEqual(['งานเทอม 2'])
    expect(await json(await getJson(`/api/teacher/classes/${classId}/score-items`, teacher))).toEqual([])

    const now = await json(await getJson(`/api/teacher/classes/${classId}/export`, teacher))
    expect(now.term).toBe('1/2570')
    expect(titles(now.gradebook.assignments)).toEqual(['งานเทอม 2'])
    const past = await json(await getJson(`/api/teacher/classes/${classId}/export?term=term-1`, teacher))
    expect(past.term).toBe('2/2569')
    expect(titles(past.gradebook.assignments)).toEqual(['งานเทอม 1'])
    expect(past.gradebook.students.find((s: { id: string }) => s.id === a.id).cells[old].status).toBe('submitted')
    expect(past.scoreBook.items).toHaveLength(1)
    expect((await getJson(`/api/teacher/classes/${classId}/export?term=nope`, teacher)).status).toBe(404)
  })
})

describe('ภารกิจประจำสัปดาห์', () => {
  it('weekStartBangkok = จันทร์ 00:00 เวลาไทย', () => {
    // พุธ 11 พ.ย. 2026 10:00 ไทย → จันทร์ 9 พ.ย. 00:00 ไทย = 8 พ.ย. 17:00 UTC
    expect(new Date(weekStartBangkok(Date.UTC(2026, 10, 11, 3))).toISOString()).toBe('2026-11-08T17:00:00.000Z')
    // อาทิตย์ 23:30 ไทย ยังเป็นสัปดาห์เดิม · จันทร์ 00:10 ไทย เป็นสัปดาห์ใหม่
    expect(weekStartBangkok(Date.UTC(2026, 10, 15, 16, 30))).toBe(Date.UTC(2026, 10, 8, 17))
    expect(weekStartBangkok(Date.UTC(2026, 10, 15, 17, 10))).toBe(Date.UTC(2026, 10, 15, 17))
  })

  it('ทำครบแล้วกดรับได้ครั้งเดียว · ยังไม่ครบรับไม่ได้', async () => {
    const { teacher, classId, sa } = await setup()
    const q0 = await json(await getJson('/api/student/quests', sa))
    expect(q0.quests.map((q: { id: string; progress: number; claimed: boolean }) => [q.id, q.progress, q.claimed])).toEqual([
      ['attend', 0, false],
      ['submit', 0, false],
      ['video', 0, false],
    ])
    expect((await postJson('/api/student/quests/attend/claim', {}, { cookie: sa })).status).toBe(409)
    expect((await postJson('/api/student/quests/nope/claim', {}, { cookie: sa })).status).toBe(404)

    // มาเรียน 3 วันในสัปดาห์นี้ (ครูเปิดเช็กชื่อ = ทุกคนมาเรียนเป็นค่าเริ่มต้น) · เรียก service ตรง เพราะ route ห้ามวันในอนาคต
    const mon = weekStartBangkok(Date.now())
    for (let i = 0; i < 3; i++) await openDay(db(), classId, todayBangkok(mon + i * 86400_000))
    // วันของสัปดาห์ก่อนไม่นับ
    await openDay(db(), classId, todayBangkok(mon - 86400_000))
    // ส่งงานตรงเวลา 1 ชิ้น
    const asg = await seedAssignment(classId, { dueAt: Date.now() + 86400_000 })
    await putJson(`/api/student/assignments/${asg}/submission`, { text: 'ตอบ', imageKeys: [], clientRequestId: 'q1' }, sa)
    // ทบทวนคลิป 1 คลิป
    const { ids } = await json(await postJson('/api/teacher/videos', { ...VIDEO, classIds: [classId] }, { cookie: teacher }))
    await postJson(`/api/student/videos/${ids[0]}/watched`, { watchedSeconds: 70, durationSeconds: 100 }, { cookie: sa })

    const q1 = await json(await getJson('/api/student/quests', sa))
    expect(q1.quests.map((q: { progress: number; need: number }) => q.progress === q.need)).toEqual([true, true, true])
    const before = (await json(await getJson('/api/student/exp', sa))).exp
    for (const id of ['attend', 'submit', 'video']) {
      const r = await json(await postJson(`/api/student/quests/${id}/claim`, {}, { cookie: sa }))
      expect(r.quests.find((q: { id: string }) => q.id === id).claimed).toBe(true)
    }
    await postJson('/api/student/quests/attend/claim', {}, { cookie: sa })
    expect((await json(await getJson('/api/student/exp', sa))).exp).toBe(before + 9)
    const hist = (await json(await getJson('/api/student/progress', sa))).history
    expect(hist.filter((h: { reason: string }) => h.reason.startsWith('ภารกิจสัปดาห์'))).toHaveLength(3)
  })

  it('ส่งงานเลยกำหนดไม่นับภารกิจส่งงาน', async () => {
    const { classId, sa } = await setup()
    const asg = await seedAssignment(classId, { dueAt: Date.now() - 1000 })
    await putJson(`/api/student/assignments/${asg}/submission`, { text: 'ตอบ', imageKeys: [], clientRequestId: 'late1' }, sa)
    const q = await json(await getJson('/api/student/quests', sa))
    expect(q.quests.find((x: { id: string }) => x.id === 'submit').progress).toBe(0)
  })
})

describe('คำถามท้ายคลิป', () => {
  const QUIZ = [
    { q: '1+1 = ?', choices: ['1', '2', '3'], answer: 1 },
    { q: 'แรง = มวล × ?', choices: ['ความเร็ว', 'ความเร่ง'], answer: 1 },
  ]

  it('นักเรียนไม่เห็นเฉลย · ตอบผิดไม่ได้ EXP ลองใหม่ได้ · ตอบถูกทุกข้อได้ครั้งเดียว', async () => {
    const { teacher, classId, sa } = await setup()
    const { ids } = await json(await postJson('/api/teacher/videos', { ...VIDEO, questions: QUIZ, classIds: [classId] }, { cookie: teacher }))
    expect((await json(await getJson(`/api/teacher/classes/${classId}/videos`, teacher)))[0].questions).toEqual(QUIZ)
    const v = await json(await getJson(`/api/student/videos/${ids[0]}`, sa))
    expect(v.quiz).toEqual(QUIZ.map(({ q, choices }) => ({ q, choices })))
    expect(JSON.stringify(v)).not.toContain('answer')

    const watch = (answers: number[]) => postJson(`/api/student/videos/${ids[0]}/watched`, { watchedSeconds: 80, durationSeconds: 100, answers }, { cookie: sa })
    expect(await json(await watch([1, 0]))).toEqual({ awarded: false, exp: 5, correct: 1, total: 2 })
    expect(await json(await watch([]))).toMatchObject({ awarded: false, correct: 0 })
    expect((await json(await getJson('/api/student/exp', sa))).exp).toBe(0)
    expect(await json(await watch([1, 1]))).toEqual({ awarded: true, exp: 5, correct: 2, total: 2 })
    expect(await json(await watch([1, 1]))).toMatchObject({ awarded: false })
    expect((await json(await getJson('/api/student/exp', sa))).exp).toBe(5)
    // ดูไม่ถึง 70% ยังได้ 400 เหมือนเดิม
    expect((await postJson(`/api/student/videos/${ids[0]}/watched`, { watchedSeconds: 10, durationSeconds: 100, answers: [1, 1] }, { cookie: sa })).status).toBe(400)
  })

  it('ตรวจรูปแบบคำถาม: เฉลยต้องอยู่ในตัวเลือก · ไม่เกิน 3 ข้อ', async () => {
    const { teacher, classId } = await setup()
    const bad = (questions: unknown) => postJson('/api/teacher/videos', { ...VIDEO, questions, classIds: [classId] }, { cookie: teacher })
    expect((await bad([{ q: 'ข้อ', choices: ['ก', 'ข'], answer: 2 }])).status).toBe(400)
    expect((await bad([{ q: 'ข้อ', choices: ['ก'], answer: 0 }])).status).toBe(400)
    expect((await bad(Array(4).fill(QUIZ[0]))).status).toBe(400)
    // แก้คลิปเอาคำถามออกได้
    const { ids } = await json(await bad([QUIZ[0]]))
    expect((await putJson(`/api/teacher/videos/${ids[0]}`, { ...VIDEO, questions: [] }, teacher)).status).toBe(200)
  })
})

describe('สรุปวันนี้ของครู', () => {
  it('งานรอตรวจ · ขาดเรียนวันนี้ · งานใกล้ครบกำหนด', async () => {
    const { teacher, classId, a, sa } = await setup()
    const b = await seedStudent(db(), classId, { firstName: 'บี', lastName: 'ขาด' })
    const soon = await seedAssignment(classId, { title: 'ใกล้ส่ง', dueAt: Date.now() + 86400_000 })
    await seedAssignment(classId, { title: 'อีกนาน', dueAt: Date.now() + 10 * 86400_000 })
    await putJson(`/api/student/assignments/${soon}/submission`, { text: 'ตอบ', imageKeys: [], clientRequestId: 't1' }, sa)
    const { day } = await json(await postJson(`/api/teacher/classes/${classId}/attendance`, { date: todayBangkok() }, { cookie: teacher }))
    await putJson(`/api/teacher/attendance/${day.id}/records/${b.id}`, { status: 'absent' }, teacher)

    const t = await json(await getJson('/api/teacher/today', teacher))
    expect(t.term).toBe('2/2569')
    expect(t.toGrade).toHaveLength(1)
    expect(t.toGrade[0]).toMatchObject({ assignmentId: soon, title: 'ใกล้ส่ง', waiting: 1 })
    const sub = await json(await getJson(`/api/teacher/submissions/${t.toGrade[0].firstSubmissionId}`, teacher))
    expect(sub.submission.studentId).toBe(a.id)
    expect(t.absent).toEqual([{ classId, className: expect.any(String), names: ['บี ขาด'] }])
    expect(t.dueSoon.map((d: { title: string; missing: number }) => [d.title, d.missing])).toEqual([['ใกล้ส่ง', 1]])
    expect((await getJson('/api/teacher/today', sa)).status).toBe(401)
  })
})
