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
    await postJson(`/api/teacher/card-games/${id}/goto`, { index: 0 }, { cookie: teacher }) // เริ่มเลย (ข้ามนับถอยหลัง)
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
    // เกมการ์ดไม่ใช่ข้อสอบ: ไม่เปิดสอบย้อนหลัง · ไม่โผล่ในรายการสอบย้อนหลัง · เก่าแค่ไหนก็ไม่ถูกให้ 0
    expect(sheet.item.makeupDays).toBe(0)
    await putJson(`/api/teacher/score-items/${r.saved.scoreItemId}/published`, { published: true }, teacher)
    await env.DB.prepare("UPDATE score_items SET taken_on = '2020-01-01' WHERE id = ?").bind(r.saved.scoreItemId).run()
    const mk = await json(await getJson('/api/teacher/makeup-exams', teacher))
    expect(mk.absent.filter((a: { item: { id: string } }) => a.item.id === r.saved.scoreItemId)).toEqual([])
    expect(await json(await getJson('/api/student/makeups', await studentCookie(st[2].id)))).toEqual([])
    const after = await json(await getJson(`/api/teacher/score-items/${r.saved.scoreItemId}`, teacher))
    expect(after.students.find((x: { id: string }) => x.id === st[2].id)).toMatchObject({ score: null, absent: true })
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
    await postJson(`/api/teacher/card-games/${id}/goto`, { index: 0 }, { cookie: teacher }) // เริ่มเลย (ข้ามนับถอยหลัง)
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

describe('ลบเกม', () => {
  it('ลบเกมที่เล่นแล้ว: คำตอบ EXP และคะแนนเก็บหายไป · ชุดคำถามลบได้อีกครั้ง', async () => {
    const { teacher, classId, st, quizId } = await setup()
    const { id } = await json(await postJson('/api/teacher/card-games', { quizId, classId }, { cookie: teacher }))
    await postJson(`/api/teacher/card-games/${id}/goto`, { index: 0 }, { cookie: teacher }) // เริ่มเลย (ข้ามนับถอยหลัง)
    await postJson(`/api/teacher/card-games/${id}/scans`, { qIndex: 0, scans: [{ zipgradeId: '34101', answer: 0 }] }, { cookie: teacher })
    const r = await json(await postJson(`/api/teacher/card-games/${id}/end`, { saveScore: true }, { cookie: teacher }))
    const sc = await studentCookie(st[0].id)
    expect((await json(await getJson('/api/student/exp', sc))).exp).toBe(4)
    expect(await json(await del(`/api/teacher/card-games/${id}`, teacher))).toEqual({ removedExp: 1, removedScoreItem: true })
    expect((await json(await getJson('/api/student/exp', sc))).exp).toBe(0)
    expect((await getJson(`/api/teacher/score-items/${r.saved.scoreItemId}`, teacher)).status).toBe(404)
    expect((await getJson(`/api/teacher/card-games/${id}`, teacher)).status).toBe(404)
    expect(await json(await getJson('/api/teacher/card-games', teacher))).toEqual([])
    expect((await del(`/api/teacher/card-games/${id}`, teacher)).status).toBe(404)
    expect((await del(`/api/teacher/card-quizzes/${quizId}`, teacher)).status).toBe(200)
  })
})

describe('ตั้งเวลารายข้อ', () => {
  it('นับถอยหลังจากเริ่มข้อ · หมดเวลา (+2 วินาที) ไม่รับคำตอบ · ข้อไม่ตั้งเวลา = ไม่จำกัด · ข้อถัดไปเริ่มนับใหม่', async () => {
    const { recordScans, gameState } = await import('../src/server/cardgame/service')
    const teacher = await loginTeacher()
    const { classId } = await seedClass(db())
    await seedStudent(db(), classId, { zipgradeId: '501' })
    const quiz = { title: 'จับเวลา', questions: [{ q: 'ข้อ 1', choices: ['ก', 'ข'], answer: 0, seconds: 20 }, { q: 'ข้อ 2', choices: ['ก', 'ข'], answer: 1 }] }
    expect((await postJson('/api/teacher/card-quizzes', { ...quiz, questions: [{ ...quiz.questions[0], seconds: 999 }] }, { cookie: teacher })).status).toBe(400)
    const { id: quizId } = await json(await postJson('/api/teacher/card-quizzes', quiz, { cookie: teacher }))
    const { id } = await json(await postJson('/api/teacher/card-games', { quizId, classId }, { cookie: teacher }))
    await postJson(`/api/teacher/card-games/${id}/goto`, { index: 0 }, { cookie: teacher }) // เริ่มเลย (ข้ามนับถอยหลัง)
    const s0 = await json(await getJson(`/api/teacher/card-games/${id}`, teacher))
    expect(s0.remainingMs).toBeGreaterThan(18_000)
    expect(s0.remainingMs).toBeLessThanOrEqual(20_000)
    const t0 = Date.now()
    expect((await gameState(db(), id, t0 + 21_000)).remainingMs).toBe(0)
    expect(await recordScans(db(), id, 0, [{ zipgradeId: '501', answer: 0 }], t0 + 21_000)).toMatchObject({ accepted: 1 }) // ยังอยู่ในเวลาเผื่อ
    expect(await recordScans(db(), id, 0, [{ zipgradeId: '501', answer: 1 }], t0 + 25_000)).toMatchObject({ accepted: 0, locked: true })
    expect((await gameState(db(), id)).answers).toEqual({ [Object.keys((await gameState(db(), id)).answers)[0]]: 0 })
    await postJson(`/api/teacher/card-games/${id}/goto`, { index: 1 }, { cookie: teacher })
    expect((await json(await getJson(`/api/teacher/card-games/${id}`, teacher))).remainingMs).toBeNull()
    expect(await recordScans(db(), id, 1, [{ zipgradeId: '501', answer: 1 }], t0 + 10 * 60_000)).toMatchObject({ accepted: 1 })
  })
})

describe('ตอบในเครื่องตัวเอง (iPad/มือถือ)', () => {
  it('เห็นเกมของห้องตัวเอง · ไม่เห็นเฉลยก่อนครูกด · เปลี่ยนคำตอบได้ · การ์ดไม่ทับคำตอบในเครื่อง · รวมผลกับการ์ด', async () => {
    const { teacher, classId, st, quizId } = await setup()
    const [fa, phum] = [await studentCookie(st[0].id), await studentCookie(st[1].id)]
    const outsider = await studentCookie((await seedStudent(db(), (await seedClass(db(), { name: 'ห้องอื่น' })).classId)).id)
    expect(await json(await getJson('/api/student/card-games/active', fa))).toBeNull()
    const { id } = await json(await postJson('/api/teacher/card-games', { quizId, classId }, { cookie: teacher }))
    await postJson(`/api/teacher/card-games/${id}/goto`, { index: 0 }, { cookie: teacher }) // เริ่มเลย (ข้ามนับถอยหลัง)
    expect(await json(await getJson('/api/student/card-games/active', fa))).toEqual({ id, quizTitle: 'กฎของนิวตัน' })
    expect(await json(await getJson('/api/student/card-games/active', outsider))).toBeNull()
    expect((await getJson(`/api/student/card-games/${id}`, outsider)).status).toBe(404)

    const v = await json(await getJson(`/api/student/card-games/${id}`, fa))
    expect(v).toMatchObject({ current: 0, total: 3, revealed: false, correct: null, mine: null, ended: false, question: { choices: ['คงสภาพ', 'เร่ง', 'ช้าลง', 'วน'] } })
    expect(JSON.stringify(v)).not.toContain('"answer"')

    const answer = (c: string, qIndex: number, a: number) => putJson(`/api/student/card-games/${id}/answer`, { qIndex, answer: a }, c)
    expect((await answer(fa, 0, 1)).status).toBe(200)
    expect((await answer(fa, 0, 0)).status).toBe(200) // เปลี่ยนใจ
    expect((await answer(fa, 1, 0)).status).toBe(409) // ไม่ใช่ข้อปัจจุบัน
    expect((await answer(outsider, 0, 0)).status).toBe(404)
    // ครูสแกนการ์ดของฟ้าใส (ตอบ D) → ไม่ทับ · ภูมิตอบด้วยการ์ด
    await postJson(`/api/teacher/card-games/${id}/scans`, { qIndex: 0, scans: [{ zipgradeId: '34101', answer: 3 }, { zipgradeId: '34102', answer: 2 }] }, { cookie: teacher })
    const s = await json(await getJson(`/api/teacher/card-games/${id}`, teacher))
    expect(s.answers).toEqual({ [st[0].id]: 0, [st[1].id]: 2 })
    expect(s.devices).toEqual([st[0].id])
    // ภูมิเปิดเครื่องทีหลัง → คำตอบในเครื่องแทนการ์ด
    expect((await answer(phum, 0, 0)).status).toBe(200)
    expect((await json(await getJson(`/api/teacher/card-games/${id}`, teacher))).devices.sort()).toEqual([st[0].id, st[1].id].sort())

    await postJson(`/api/teacher/card-games/${id}/reveal`, {}, { cookie: teacher })
    expect((await answer(fa, 0, 2)).status).toBe(409)
    expect(await json(await getJson(`/api/student/card-games/${id}`, fa))).toMatchObject({ revealed: true, correct: 0, mine: 0 })

    await postJson(`/api/teacher/card-games/${id}/goto`, { index: 1 }, { cookie: teacher })
    expect(await json(await getJson(`/api/student/card-games/${id}`, fa))).toMatchObject({ current: 1, revealed: false, correct: null, mine: null })
    expect((await answer(fa, 1, 3)).status).toBe(400) // ข้อนี้มี 2 ตัวเลือก
    await answer(fa, 1, 1)

    const r = await json(await postJson(`/api/teacher/card-games/${id}/end`, { saveScore: false, attendance: false }, { cookie: teacher }))
    expect(r.players.find((p: { id: string }) => p.id === st[0].id)).toMatchObject({ correct: 1, answered: 2 })
    expect(await json(await getJson(`/api/student/card-games/${id}`, fa))).toMatchObject({ ended: true, summary: { correct: 1, answered: 2, exp: 4 } })
    expect(await json(await getJson('/api/student/card-games/active', fa))).toBeNull()
    expect((await answer(fa, 1, 0)).status).toBe(409)
  })

  it('รูปโจทย์ข้อปัจจุบัน: นักเรียนในห้องเปิดได้ · ห้องอื่นเปิดไม่ได้ · หมดเวลาแล้วไม่รับ', async () => {
    const { teacher, classId, st } = await setup()
    const { key } = await json(await uploadFile('kind=quiz', TINY_JPEG, 'image/jpeg', teacher))
    const { id: quizId } = await json(await postJson('/api/teacher/card-quizzes', { title: 'รูป', questions: [{ q: '', image: key, choices: ['', ''], answer: 1, seconds: 10 }] }, { cookie: teacher }))
    const fa = await studentCookie(st[0].id)
    const outsider = await studentCookie((await seedStudent(db(), (await seedClass(db(), { name: 'ห้องอื่น' })).classId)).id)
    expect((await getJson(`/api/files/${key}`, fa)).status).toBe(404)
    const { id } = await json(await postJson('/api/teacher/card-games', { quizId, classId }, { cookie: teacher }))
    await postJson(`/api/teacher/card-games/${id}/goto`, { index: 0 }, { cookie: teacher }) // เริ่มเลย (ข้ามนับถอยหลัง)
    expect((await getJson(`/api/files/${key}`, fa)).status).toBe(200)
    expect((await getJson(`/api/files/${key}`, outsider)).status).toBe(404)
    const { answerOnDevice } = await import('../src/server/cardgame/service')
    const me = { studentId: st[0].id, classId }
    await expect(answerOnDevice(db(), id, me, 0, 1, Date.now() + 13_000)).rejects.toMatchObject({ status: 409 })
    expect(await answerOnDevice(db(), id, me, 0, 1, Date.now() + 5_000)).toEqual({ ok: true })
  })
})

describe('นับถอยหลังก่อนเริ่มเกม', () => {
  it('ครูกดเริ่ม → นับ 10 วินาที: ยังไม่เห็นโจทย์ ยังไม่รับคำตอบ · ครบเวลา/กด "เริ่มเลย" แล้วเล่นได้ · ข้อที่ตั้งเวลาเริ่มนับหลังนับถอยหลัง', async () => {
    const teacher = await loginTeacher()
    const { classId } = await seedClass(db())
    const s = await seedStudent(db(), classId, { zipgradeId: '601' })
    const sc = await studentCookie(s.id)
    const { recordScans, gameState } = await import('../src/server/cardgame/service')
    const { id: quizId } = await json(await postJson('/api/teacher/card-quizzes', { title: 'นับถอยหลัง', questions: [{ q: 'ข้อ 1', choices: ['ก', 'ข'], answer: 0, seconds: 20 }] }, { cookie: teacher }))
    const { id } = await json(await postJson('/api/teacher/card-games', { quizId, classId }, { cookie: teacher }))
    const t0 = Date.now()
    const st = await json(await getJson(`/api/teacher/card-games/${id}`, teacher))
    expect(st.startsInMs).toBeGreaterThan(8_000)
    expect(st.startsInMs).toBeLessThanOrEqual(10_000)
    expect(st.remainingMs).toBe(20_000)
    const sv = await json(await getJson(`/api/student/card-games/${id}`, sc))
    expect(sv).toMatchObject({ startsInMs: expect.any(Number), question: { q: '', choices: [] } })
    expect((await putJson(`/api/student/card-games/${id}/answer`, { qIndex: 0, answer: 0 }, sc)).status).toBe(409)
    expect(await recordScans(db(), id, 0, [{ zipgradeId: '601', answer: 0 }], t0 + 1_000)).toMatchObject({ locked: true })
    // ครบ 10 วินาที → เริ่มเอง: เวลาข้อแรกเต็ม 20 วินาที
    expect((await gameState(db(), id, t0 + 10_500)).startsInMs).toBe(0)
    expect(await recordScans(db(), id, 0, [{ zipgradeId: '601', answer: 1 }], t0 + 11_000)).toMatchObject({ accepted: 1 })
    expect((await gameState(db(), id, t0 + 11_000)).remainingMs).toBeGreaterThan(18_000)
    // เกมใหม่ → ครูกด "เริ่มเลย"
    const { id: g2 } = await json(await postJson('/api/teacher/card-games', { quizId, classId }, { cookie: teacher }))
    await postJson(`/api/teacher/card-games/${g2}/goto`, { index: 0 }, { cookie: teacher })
    expect((await json(await getJson(`/api/student/card-games/${g2}`, sc))).question.q).toBe('ข้อ 1')
    expect((await putJson(`/api/student/card-games/${g2}/answer`, { qIndex: 0, answer: 0 }, sc)).status).toBe(200)
  })
})
