import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { answerFromAngle, cardPayload, parseCard } from '../src/shared/cardgame'
import { todayBangkok } from '../src/shared/attendance'
import { del, getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie, TINY_JPEG, uploadFile } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const QUIZ = {
  title: 'กฎของนิวตัน',
  questions: [
    { q: 'แรงลัพธ์ศูนย์ วัตถุจะ?', choices: ['คงสภาพ', 'เร่ง', 'ช้าลง', 'วน'], answer: 0 },
    { q: 'F = ?', choices: ['ma', 'mv'], answer: 0 },
    { q: 'หน่วยของแรง', choices: ['จูล', 'นิวตัน', 'วัตต์'], answer: 1 },
  ],
}

describe('การ์ดและการหมุน', () => {
  it('payload และการอ่าน', () => {
    expect(cardPayload('34101')).toBe('CC:34101')
    expect(parseCard('CC:34101')).toBe('34101')
    expect(parseCard('https://evil.example')).toBeNull()
    expect(parseCard('CC:')).toBeNull()
  })
  it('มุมขอบบน QR → คำตอบ: ตั้งตรง A · ขอบขวาขึ้น B · กลับหัว C · ขอบซ้ายขึ้น D · เอียงเล็กน้อยยังอ่านถูก', () => {
    expect([0, -90, 180, 90].map(answerFromAngle)).toEqual([0, 1, 2, 3])
    expect([30, -30, -60, -120, 170, -170, 60, 120, 270, -270].map(answerFromAngle)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 1, 3])
  })
})

async function setup() {
  const teacher = await loginTeacher()
  const { classId } = await seedClass(db(), { name: 'ม.5/1' })
  const st = [
    await seedStudent(db(), classId, { firstName: 'ฟ้าใส', zipgradeId: '34101', sortOrder: 1 }),
    await seedStudent(db(), classId, { firstName: 'ภูมิ', zipgradeId: '34102', sortOrder: 2 }),
    await seedStudent(db(), classId, { firstName: 'ขาด', zipgradeId: '34103', sortOrder: 3 }),
  ]
  const other = await seedClass(db(), { name: 'ม.5/2' })
  await seedStudent(db(), other.classId, { zipgradeId: '99999' })
  const { id: quizId } = await json(await postJson('/api/teacher/card-quizzes', QUIZ, { cookie: teacher }))
  return { teacher, classId, st, quizId }
}

describe('ชุดคำถาม', () => {
  it('สร้าง/แก้/ลบ · ตรวจรูปแบบ · ลบชุดที่เคยเล่นไม่ได้', async () => {
    const { teacher, classId, quizId } = await setup()
    expect(await json(await getJson('/api/teacher/card-quizzes', teacher))).toMatchObject([{ id: quizId, title: 'กฎของนิวตัน', count: 3 }])
    expect((await putJson(`/api/teacher/card-quizzes/${quizId}`, { ...QUIZ, title: 'นิวตัน (แก้)' }, teacher)).status).toBe(200)
    expect((await postJson('/api/teacher/card-quizzes', { title: 'ว่าง', questions: [] }, { cookie: teacher })).status).toBe(400)
    expect((await postJson('/api/teacher/card-quizzes', { title: 'ผิด', questions: [{ q: 'x', choices: ['a', 'b'], answer: 3 }] }, { cookie: teacher })).status).toBe(400)
    await postJson('/api/teacher/card-games', { quizId, classId }, { cookie: teacher })
    expect((await del(`/api/teacher/card-quizzes/${quizId}`, teacher)).status).toBe(409)
    const { id: q2 } = await json(await postJson('/api/teacher/card-quizzes', QUIZ, { cookie: teacher }))
    expect((await del(`/api/teacher/card-quizzes/${q2}`, teacher)).status).toBe(200)
    expect((await getJson('/api/teacher/card-quizzes', await studentCookie((await seedStudent(db(), classId)).id))).status).toBe(401)
  })

  it('การ์ดของห้องสำหรับพิมพ์: เลขที่เรียงตามลำดับในห้อง', async () => {
    const { teacher, classId } = await setup()
    const c = await json(await getJson(`/api/teacher/classes/${classId}/cards`, teacher))
    expect(c.students.map((s: { no: number; zipgradeId: string }) => [s.no, s.zipgradeId])).toEqual([
      [1, '34101'],
      [2, '34102'],
      [3, '34103'],
    ])
  })
})

describe('เล่นเกม', () => {
  it('สแกน → เฉลย (ล็อก) → ข้อถัดไป → จบเกม: EXP · คะแนนเก็บ · เช็กชื่อ', async () => {
    const { teacher, classId, st, quizId } = await setup()
    const { id } = await json(await postJson('/api/teacher/card-games', { quizId, classId }, { cookie: teacher }))
    const scan = (qIndex: number, scans: { zipgradeId: string; answer: number }[]) => postJson(`/api/teacher/card-games/${id}/scans`, { qIndex, scans }, { cookie: teacher })

    // ข้อ 1: ฟ้าใสสแกนผิดก่อนแล้วเปลี่ยนเป็นถูก · การ์ดห้องอื่นข้ามไป
    expect(await json(await scan(0, [{ zipgradeId: '34101', answer: 1 }, { zipgradeId: '99999', answer: 0 }]))).toEqual({ accepted: 1, unknown: ['99999'], locked: false })
    await scan(0, [{ zipgradeId: '34101', answer: 0 }, { zipgradeId: '34102', answer: 2 }])
    let s = await json(await getJson(`/api/teacher/card-games/${id}`, teacher))
    expect(s).toMatchObject({ current: 0, revealed: false, ended: false, quizTitle: 'กฎของนิวตัน' })
    expect(s.answers).toEqual({ [st[0].id]: 0, [st[1].id]: 2 })
    await postJson(`/api/teacher/card-games/${id}/reveal`, {}, { cookie: teacher })
    expect(await json(await scan(0, [{ zipgradeId: '34102', answer: 0 }]))).toMatchObject({ accepted: 0, locked: true })

    // ข้อ 2 (มี 2 ตัวเลือก): ด้าน C/D ไม่นับ
    await postJson(`/api/teacher/card-games/${id}/goto`, { index: 1 }, { cookie: teacher })
    expect(await json(await scan(1, [{ zipgradeId: '34101', answer: 0 }, { zipgradeId: '34102', answer: 3 }]))).toMatchObject({ accepted: 1 })
    // สแกนข้อเก่าที่ไม่ใช่ข้อปัจจุบัน = ไม่รับ
    expect(await json(await scan(0, [{ zipgradeId: '34102', answer: 0 }]))).toMatchObject({ locked: true })
    await postJson(`/api/teacher/card-games/${id}/goto`, { index: 2 }, { cookie: teacher })
    await scan(2, [{ zipgradeId: '34101', answer: 1 }, { zipgradeId: '34102', answer: 1 }])
    s = await json(await getJson(`/api/teacher/card-games/${id}`, teacher))
    expect(s.roster.map((r: { no: number; name: string }) => [r.no, r.name.split(' ')[0]])).toEqual([
      [1, 'ฟ้าใส'],
      [2, 'ภูมิ'],
      [3, 'ขาด'],
    ])
    expect((await postJson(`/api/teacher/card-games/${id}/goto`, { index: 3 }, { cookie: teacher })).status).toBe(400)

    const r = await json(await postJson(`/api/teacher/card-games/${id}/end`, { saveScore: true, attendance: true }, { cookie: teacher }))
    expect(r.total).toBe(3)
    expect(r.players.map((p: { name: string; correct: number; answered: number; exp: number }) => [p.name.split(' ')[0], p.correct, p.answered, p.exp])).toEqual([
      ['ฟ้าใส', 3, 3, 6],
      ['ภูมิ', 1, 2, 4],
      ['ขาด', 0, 0, 0],
    ])
    expect(r.perQuestion[0]).toEqual({ counts: [1, 0, 1, 0], correct: 1, answered: 2 })
    expect(r.saved.scoreItemId).toBeTruthy()
    expect((await postJson(`/api/teacher/card-games/${id}/end`, {}, { cookie: teacher })).status).toBe(409)
    expect((await scan(2, [{ zipgradeId: '34103', answer: 1 }])).status).toBe(409)

    // EXP ครั้งเดียว
    expect((await json(await getJson('/api/student/exp', await studentCookie(st[0].id)))).exp).toBe(6 + 5) // + มาเรียน 5
    expect((await json(await getJson('/api/student/exp', await studentCookie(st[2].id)))).exp).toBe(0)
    // คะแนนเก็บ
    const sheet = await json(await getJson(`/api/teacher/score-items/${r.saved.scoreItemId}`, teacher))
    expect(sheet.item).toMatchObject({ title: 'เกมการ์ด: กฎของนิวตัน', maxScore: 3, category: 'other' })
    const byId = Object.fromEntries(sheet.students.map((x: { id: string; score: number | null; absent: boolean }) => [x.id, [x.score, x.absent]]))
    expect(byId[st[0].id]).toEqual([3, false])
    expect(byId[st[2].id]).toEqual([null, true])
    // เช็กชื่อ: เล่น = มา · ไม่เล่น = ขาด (วันใหม่)
    const day = await json(await getJson(`/api/teacher/classes/${classId}/attendance?date=${todayBangkok()}`, teacher))
    expect(Object.fromEntries(day.records.map((x: { studentId: string; status: string }) => [x.studentId, x.status]))).toEqual({ [st[0].id]: 'present', [st[1].id]: 'present', [st[2].id]: 'absent' })
  })

  it('เช็กชื่อในวันที่ครูเช็กไว้แล้ว: ไม่แตะคนที่ไม่ได้เล่น · คนที่เล่นเป็นมา', async () => {
    const { teacher, classId, st, quizId } = await setup()
    const { day } = await json(await postJson(`/api/teacher/classes/${classId}/attendance`, { date: todayBangkok() }, { cookie: teacher }))
    await putJson(`/api/teacher/attendance/${day.id}/records/${st[0].id}`, { status: 'absent' }, teacher)
    await putJson(`/api/teacher/attendance/${day.id}/records/${st[2].id}`, { status: 'sick' }, teacher)
    const { id } = await json(await postJson('/api/teacher/card-games', { quizId, classId }, { cookie: teacher }))
    await postJson(`/api/teacher/card-games/${id}/scans`, { qIndex: 0, scans: [{ zipgradeId: '34101', answer: 0 }] }, { cookie: teacher })
    await postJson(`/api/teacher/card-games/${id}/end`, { attendance: true }, { cookie: teacher })
    const d = await json(await getJson(`/api/teacher/classes/${classId}/attendance?date=${todayBangkok()}`, teacher))
    expect(Object.fromEntries(d.records.map((x: { studentId: string; status: string }) => [x.studentId, x.status]))).toEqual({ [st[0].id]: 'present', [st[1].id]: 'present', [st[2].id]: 'sick' })
  })
})

describe('รูปโจทย์', () => {
  it('ครูอัปโหลดรูปโจทย์ได้ (นักเรียนไม่ได้) · โจทย์เป็นรูปอย่างเดียว ตัวเลือกว่างได้ · รูปไม่ถูกลบเป็นไฟล์ค้าง', async () => {
    const { teacher, classId } = await setup()
    const sc = await studentCookie((await seedStudent(db(), classId)).id)
    expect((await uploadFile('kind=quiz', TINY_JPEG, 'image/jpeg', sc)).status).toBe(401)
    const { key } = await json(await uploadFile('kind=quiz', TINY_JPEG, 'image/jpeg', teacher))
    expect(key).toMatch(/^quiz\/.+\.jpg$/)
    const res = await postJson('/api/teacher/card-quizzes', { title: 'จากหนังสือ', questions: [{ q: '', image: key, choices: ['', '', '', ''], answer: 2 }] }, { cookie: teacher })
    expect(res.status).toBe(200)
    const { id } = await json(res)
    expect((await json(await getJson(`/api/teacher/card-quizzes/${id}`, teacher))).questions[0]).toMatchObject({ image: key, answer: 2 })
    // ไม่มีทั้งข้อความและรูป / ไม่มีรูปแต่ตัวเลือกว่าง / key แปลกปลอม
    const bad = (q: unknown) => postJson('/api/teacher/card-quizzes', { title: 'x', questions: [q] }, { cookie: teacher })
    expect((await bad({ q: '', choices: ['ก', 'ข'], answer: 0 })).status).toBe(400)
    expect((await bad({ q: 'ข้อ', choices: ['', ''], answer: 0 })).status).toBe(400)
    expect((await bad({ q: 'ข้อ', image: 'sub/x/y.jpg', choices: ['ก', 'ข'], answer: 0 })).status).toBe(400)
    // ลบไฟล์ค้าง: รูปโจทย์ที่ใช้อยู่ยังอยู่
    const { purgeOrphans } = await import('../src/server/storage/service')
    await purgeOrphans(db(), env.BUCKET, Date.now() + 3 * 86400_000)
    expect(await env.BUCKET.get(key)).not.toBeNull()
    expect((await getJson(`/api/files/${key}`, teacher)).status).toBe(200)
  })
})
