import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { purgeProctorPhotos, sweepMakeups } from '../src/server/makeupExam/service'
import { todayBangkok } from '../src/shared/attendance'
import { addDays } from '../src/shared/leave'
import { examLayout, gradeMakeup, makeupDeadline, recheckAt } from '../src/shared/makeupExam'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie, TINY_JPEG, uploadFile } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const DEV = 'device-aaaaaaaa'
const DEV2 = 'device-bbbbbbbb'

describe('หลักการ', () => {
  it('กำหนดสุดท้าย = สิ้นวันสอบ (เวลาไทย) + N วัน · 0 = ไม่เปิด', () => {
    expect(makeupDeadline('2026-11-20', 14)).toBe(Date.parse('2026-12-04T23:59:59+07:00'))
    expect(makeupDeadline('2026-11-20', 0)).toBeNull()
  })
  it('สลับข้อ/ตัวเลือกแบบคงที่ตาม seed · ไม่สลับเมื่อไม่มี seed', () => {
    const qs = Array.from({ length: 8 }, () => ({ choices: ['a', 'b', 'c', 'd'] }))
    const a = examLayout(qs, 12345)
    expect(examLayout(qs, 12345)).toEqual(a)
    expect([...a.order].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(a.order).not.toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(examLayout(qs, null).order).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })
  it('ตรวจ + เพดานคะแนน', () => {
    expect(gradeMakeup([0, 1, -1, 3], [0, 1, 2, 3], 20, 100)).toEqual({ correct: 3, total: 4, raw: 15, capped: 15 })
    expect(gradeMakeup([0, 1, 2, 3], [0, 1, 2, 3], 20, 80)).toEqual({ correct: 4, total: 4, raw: 20, capped: 16 })
  })
})

const QUESTIONS = [
  { q: '1+1', choices: ['1', '2', '3', '4'], answer: 1 },
  { q: '2+2', choices: ['4', '5', '6', '7'], answer: 0 },
  { q: '3+3', choices: ['5', '6', '7', '8'], answer: 1 },
  { q: 'หน่วยแรง', choices: ['จูล', 'วัตต์', 'นิวตัน', 'ปาสคาล'], answer: 2 },
]

async function setup(takenOn = todayBangkok(), makeupDays = 14) {
  const teacher = await loginTeacher()
  const { classId } = await seedClass(db(), { name: 'ห้องสอบย้อน ชั้น 4' })
  const s = await seedStudent(db(), classId, { firstName: 'มานี', lastName: 'มีนา', zipgradeId: '33' })
  const other = await seedStudent(db(), classId)
  const { ids } = await json(await postJson('/api/teacher/score-items', { title: 'สอบย่อย 3', category: 'quiz', maxScore: 20, takenOn, makeupDays, classIds: [classId] }, { cookie: teacher }))
  const itemId = ids[0]
  await putJson(`/api/teacher/score-items/${itemId}/published`, { published: true }, teacher)
  await putJson(`/api/teacher/score-items/${itemId}/scores/${s.id}`, { score: null, absent: true, note: '' }, teacher)
  await putJson(`/api/teacher/score-items/${itemId}/scores/${other.id}`, { score: 12, absent: false, note: '' }, teacher)
  const { id: setId } = await json(await postJson('/api/teacher/exam-sets', { kind: 'typed', title: 'ชุด B', questions: QUESTIONS }, { cookie: teacher }))
  return { teacher, classId, s, sc: await studentCookie(s.id), other, oc: await studentCookie(other.id), itemId, setId }
}
const window = () => ({ opensAt: Date.now() - 60_000, closesAt: Date.now() + 3600_000, durationMin: 30 })
const dev = (cookie: string, d = DEV) => ({ cookie, headers: { 'x-exam-device': d } })
async function req(method: string, path: string, body: unknown, o: { cookie: string; headers?: Record<string, string> }) {
  const { SELF } = await import('cloudflare:test')
  return SELF.fetch(`http://x${path}`, { method, headers: { 'content-type': 'application/json', cookie: o.cookie, ...(o.headers ?? {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
}

it('ขอ → ครูอนุมัติ (ออนไลน์ · สลับข้อ · เพดาน 80%) → รหัสเริ่มสอบ → เครื่องเดียว → ตอบ → ส่ง → ครูตรวจ → คะแนนลงช่องเดิม', async () => {
  const { teacher, sc, oc, itemId, setId, s } = await setup()
  // คนที่ไม่ได้ขาดสอบขอไม่ได้
  expect((await postJson('/api/student/makeups', { scoreItemId: itemId, reason: 'x' }, { cookie: oc })).status).toBe(400)
  const list0 = await json(await getJson('/api/student/makeups', sc))
  expect(list0).toEqual([expect.objectContaining({ scoreItemId: itemId, title: 'สอบย่อย 3', request: null, deadline: makeupDeadline(todayBangkok(), 14) })])
  const { key } = await json(await uploadFile('kind=submission', TINY_JPEG, 'image/jpeg', sc))
  const { id } = await json(await postJson('/api/student/makeups', { scoreItemId: itemId, reason: 'ป่วย มีใบรับรองแพทย์', imageKey: key }, { cookie: sc }))
  expect((await postJson('/api/student/makeups', { scoreItemId: itemId, reason: 'ซ้ำ' }, { cookie: sc })).status).toBe(409)
  const inbox = await json(await getJson('/api/teacher/notifications', teacher))
  expect(inbox.items[0].title).toMatch(/^📝 ขอสอบย้อนหลังออนไลน์: .*มานี มีนา · สอบย่อย 3/)

  const t0 = await json(await getJson('/api/teacher/makeup-exams', teacher))
  expect(t0.pending).toEqual([expect.objectContaining({ id, reason: 'ป่วย มีใบรับรองแพทย์', student: expect.objectContaining({ name: expect.stringContaining('มานี มีนา') }) })])
  const { code } = await json(await putJson(`/api/teacher/makeup-exams/${id}/approve`, { mode: 'online', ...window(), capPct: 80, examSetId: setId, shuffle: true }, teacher))
  expect(code).toMatch(/^\d{6}$/)
  const mine = (await json(await getJson('/api/student/makeups', sc)))[0]
  expect(mine.request).toMatchObject({ status: 'approved', mode: 'online', durationMin: 30 })
  expect(JSON.stringify(mine)).not.toContain(code)

  // รหัสผิด · รหัสถูก → ข้อสอบไม่มีเฉลย
  const wrong = code === '000000' ? '111111' : '000000'
  expect((await postJson(`/api/student/makeups/${id}/start`, { code: wrong, deviceId: DEV }, { cookie: sc })).status).toBe(400)
  const paper = await json(await postJson(`/api/student/makeups/${id}/start`, { code, deviceId: DEV, consent: true }, { cookie: sc }))
  expect(paper).toMatchObject({ count: 4, kind: 'typed', leaves: 0, leaveLimit: 3, status: 'in_progress', zipgradeId: '33' })
  expect(JSON.stringify(paper.questions)).not.toContain('answer')
  expect(paper.answers).toEqual([-1, -1, -1, -1])
  // เครื่องอื่น = ไม่ให้ทำ + ครูเห็น
  expect((await req('GET', `/api/student/makeups/${id}/exam`, undefined, dev(sc, DEV2))).status).toBe(403)

  // ตอบถูก 3 ข้อ (ข้อ "หน่วยแรง" ตอบผิด) ตามลำดับที่สลับให้
  const answers = paper.questions.map((q: { q: string; choices: string[] }) => {
    const orig = QUESTIONS.find((x) => x.q === q.q)!
    const right = orig.choices[orig.answer]
    return q.q === 'หน่วยแรง' ? q.choices.findIndex((c) => c !== right) : q.choices.indexOf(right)
  })
  expect((await req('PUT', `/api/student/makeups/${id}/answers`, { answers }, dev(sc))).status).toBe(200)
  const again = await json(await req('GET', `/api/student/makeups/${id}/exam`, undefined, dev(sc)))
  expect(again.answers).toEqual(answers)
  expect((await req('POST', `/api/student/makeups/${id}/submit`, {}, dev(sc))).status).toBe(200)
  expect((await req('PUT', `/api/student/makeups/${id}/answers`, { answers }, dev(sc))).status).toBe(409)

  const d = await json(await getJson(`/api/teacher/makeup-exams/${id}`, teacher))
  expect(d.graded).toEqual({ correct: 3, total: 4, raw: 15, capped: 15 })
  expect(d.autoScore).toBe(15)
  expect(d.answers.filter((a: number, i: number) => a === QUESTIONS[i].answer)).toHaveLength(3)
  expect(d.events.map((e: { kind: string }) => e.kind)).toEqual(['start', 'device', 'submit'])
  expect((await json(await getJson('/api/teacher/makeup-exams', teacher))).toReview).toHaveLength(1)

  expect((await putJson(`/api/teacher/makeup-exams/${id}/grade`, { score: 21, note: '' }, teacher)).status).toBe(400)
  await putJson(`/api/teacher/makeup-exams/${id}/grade`, { score: 15, note: '' }, teacher)
  const sheet = await json(await getJson(`/api/teacher/score-items/${itemId}`, teacher))
  expect(sheet.students.find((r: { id: string }) => r.id === s.id)).toMatchObject({ score: 15, absent: false, note: 'สอบย้อนหลัง' })
  const box = await json(await getJson('/api/student/push/notifications', sc))
  expect(box.items[0].title).toMatch(/^📊 ครูให้คะแนนสอบย้อนหลังแล้ว/)
})

it('ออกจากหน้าจอครบ 3 ครั้ง → ส่งอัตโนมัติ', async () => {
  const { teacher, sc, itemId, setId } = await setup()
  const { id } = await json(await postJson('/api/student/makeups', { scoreItemId: itemId, reason: 'ป่วย' }, { cookie: sc }))
  const { code } = await json(await putJson(`/api/teacher/makeup-exams/${id}/approve`, { mode: 'online', ...window(), capPct: 100, examSetId: setId, shuffle: false }, teacher))
  await postJson(`/api/student/makeups/${id}/start`, { code, deviceId: DEV, consent: true }, { cookie: sc })
  for (const [i, want] of [[1, false], [2, false], [3, true]] as const) {
    const r = await json(await req('POST', `/api/student/makeups/${id}/event`, { kind: 'leave' }, dev(sc)))
    expect(r).toEqual({ leaves: i, submitted: want })
    if (!want) await req('POST', `/api/student/makeups/${id}/event`, { kind: 'return', ms: 4000 }, dev(sc))
  }
  const d = await json(await getJson(`/api/teacher/makeup-exams/${id}`, teacher))
  expect(d).toMatchObject({ status: 'submitted', leaves: 3, autoScore: 0 })
  expect(d.events.at(-1).kind).toBe('auto-submit')

})

it('หมดเวลาทำ → cron ส่งให้ · เลยกำหนดสอบย้อนหลัง → ขาดสอบได้ 0 · ครูให้สิทธิ์ใหม่ (กระดาษ) แล้วให้คะแนนได้', async () => {
  const { teacher, sc, itemId, setId, s } = await setup(addDays(todayBangkok(), -20), 14)
  // เลยกำหนดแล้ว: ขอไม่ได้ · cron ให้ 0
  expect((await postJson('/api/student/makeups', { scoreItemId: itemId, reason: 'x' }, { cookie: sc })).status).toBe(409)
  expect((await sweepMakeups(db(), Date.now())).zeroed).toBe(1)
  let sheet = await json(await getJson(`/api/teacher/score-items/${itemId}`, teacher))
  expect(sheet.students.find((r: { id: string }) => r.id === s.id)).toMatchObject({ score: 0, absent: false, note: 'หมดสิทธิ์สอบย้อนหลัง' })
  const t0 = await json(await getJson('/api/teacher/makeup-exams', teacher))
  if (!t0.absent) throw new Error(JSON.stringify(t0))
  expect(t0.absent).toEqual([expect.objectContaining({ zeroed: true, student: expect.objectContaining({ id: s.id }) })])

  // ครูคืนสิทธิ์: ออนไลน์ แล้วปล่อยหมดเวลา
  const g = await json(await postJson('/api/teacher/makeup-exams', { scoreItemId: itemId, studentId: s.id, mode: 'online', ...window(), durationMin: 5, capPct: 100, examSetId: setId, shuffle: true }, { cookie: teacher }))
  await postJson(`/api/student/makeups/${g.id}/start`, { code: g.code, deviceId: DEV, consent: true }, { cookie: sc })
  expect((await sweepMakeups(db(), Date.now() + 6 * 60_000)).submitted).toBe(1)
  expect((await json(await getJson(`/api/teacher/makeup-exams/${g.id}`, teacher))).events.at(-1).kind).toBe('timeout')

  // ให้สิทธิ์อีกครั้งแบบกระดาษ → ครูใส่คะแนนเอง
  const p = await json(await postJson('/api/teacher/makeup-exams', { scoreItemId: itemId, studentId: s.id, mode: 'paper', ...window(), capPct: 100, examSetId: null }, { cookie: teacher }))
  await putJson(`/api/teacher/makeup-exams/${p.id}/grade`, { score: 18, note: 'สอบต่อหน้าครู' }, teacher)
  sheet = await json(await getJson(`/api/teacher/score-items/${itemId}`, teacher))
  expect(sheet.students.find((r: { id: string }) => r.id === s.id)).toMatchObject({ score: 18, absent: false, note: 'สอบย้อนหลัง · สอบต่อหน้าครู' })
})

it('ข้อสอบแบบรูปหน้า (จาก PDF): นักเรียนเปิดรูปได้เฉพาะตอนกำลังสอบ · ชุดที่มีคนสอบแล้วแก้/ลบไม่ได้', async () => {
  const { teacher, sc, oc, itemId } = await setup()
  const { key: page } = await json(await uploadFile('kind=exam', TINY_JPEG, 'image/jpeg', teacher))
  expect(page).toMatch(/^exam\//)
  expect((await uploadFile('kind=exam', TINY_JPEG, 'image/jpeg', sc)).status).toBe(401)
  const body = { kind: 'pages', title: 'PDF ชุด A', pageKeys: [page], choiceCount: 4, answers: [0, 1, 2, 3, 0] }
  expect((await postJson('/api/teacher/exam-sets', { ...body, answers: [4] }, { cookie: teacher })).status).toBe(400)
  const { id: setId } = await json(await postJson('/api/teacher/exam-sets', body, { cookie: teacher }))
  const { SELF } = await import('cloudflare:test')
  const open = (c: string) => SELF.fetch(`http://x/api/files/${page}`, { headers: { cookie: c } })
  expect((await open(sc)).status).toBe(404)
  const { id } = await json(await postJson('/api/student/makeups', { scoreItemId: itemId, reason: 'ป่วย' }, { cookie: sc }))
  const { code } = await json(await putJson(`/api/teacher/makeup-exams/${id}/approve`, { mode: 'online', ...window(), capPct: 100, examSetId: setId, shuffle: true }, teacher))
  const paper = await json(await postJson(`/api/student/makeups/${id}/start`, { code, deviceId: DEV, consent: true }, { cookie: sc }))
  expect(paper).toMatchObject({ kind: 'pages', pageKeys: [page], count: 5, choiceCount: 4, questions: [] })
  expect((await open(sc)).status).toBe(200)
  expect((await open(oc)).status).toBe(404)
  expect((await putJson(`/api/teacher/exam-sets/${setId}`, body, teacher)).status).toBe(409)
  await req('POST', `/api/student/makeups/${id}/submit`, {}, dev(sc))
  expect((await open(sc)).status).toBe(404)
})

it('ยังไม่มีคะแนน (เผยแพร่แล้วแต่ช่องว่าง) ขอสอบได้ · นักเรียนเลือกออนไซต์ · ชุดข้อสอบของรายการสอบเป็นค่าเริ่มต้น · ไม่ถูกให้ 0', async () => {
  const { teacher, classId, itemId, setId } = await setup()
  const blank = await seedStudent(db(), classId, { firstName: 'ว่าง', lastName: 'เปล่า', zipgradeId: '44' })
  const bc = await studentCookie(blank.id)
  // ครูเลือกชุดข้อสอบให้รายการสอบ (ไม่ส่ง = คงเดิม · ชุดที่ไม่มีอยู่ = 400)
  const base = { title: 'สอบย่อย 3', category: 'quiz', maxScore: 20, takenOn: todayBangkok(), makeupDays: 14 }
  expect((await putJson(`/api/teacher/score-items/${itemId}`, { ...base, examSetId: 'nope' }, teacher)).status).toBe(400)
  await putJson(`/api/teacher/score-items/${itemId}`, { ...base, examSetId: setId }, teacher)
  await putJson(`/api/teacher/score-items/${itemId}`, base, teacher)
  expect((await json(await getJson(`/api/teacher/score-items/${itemId}`, teacher))).item.examSetId).toBe(setId)
  // สร้างรายการใหม่พร้อมเลือกชุดข้อสอบได้เลย
  const created = await json(await postJson('/api/teacher/score-items', { ...base, title: 'สอบย่อย 4', examSetId: setId, classIds: [classId] }, { cookie: teacher }))
  expect((await json(await getJson(`/api/teacher/score-items/${created.ids[0]}`, teacher))).item.examSetId).toBe(setId)
  expect((await postJson('/api/teacher/score-items', { ...base, examSetId: 'nope', classIds: [classId] }, { cookie: teacher })).status).toBe(400)

  const list = await json(await getJson('/api/student/makeups', bc))
  expect(list).toEqual([expect.objectContaining({ scoreItemId: itemId, absent: false, request: null })])
  const t0 = await json(await getJson('/api/teacher/makeup-exams', teacher))
  expect(t0.absent.find((a: { student: { id: string } }) => a.student.id === blank.id)).toMatchObject({ blank: true, zeroed: false, item: { examSetId: setId } })

  const { id } = await json(await postJson('/api/student/makeups', { scoreItemId: itemId, reason: 'วันนั้นไปแข่งกีฬา', mode: 'paper' }, { cookie: bc }))
  const inbox = await json(await getJson('/api/teacher/notifications', teacher))
  expect(inbox.items[0].title).toMatch(/^📝 ขอสอบย้อนหลังออนไซต์: /)
  const t1 = await json(await getJson('/api/teacher/makeup-exams', teacher))
  expect(t1.pending.find((r: { id: string }) => r.id === id)).toMatchObject({ mode: 'paper', item: { examSetId: setId } })

  // เลยกำหนด: คนที่ "ยังไม่มีคะแนน" ไม่ถูกให้ 0 (ให้ 0 เฉพาะที่ครูบันทึกว่าขาด)
  await env.DB.prepare("UPDATE score_items SET taken_on = '2020-01-01' WHERE id = ?").bind(itemId).run()
  await sweepMakeups(db(), Date.now())
  const sheet = await json(await getJson(`/api/teacher/score-items/${itemId}`, teacher))
  expect(sheet.students.find((r: { id: string }) => r.id === blank.id)).toMatchObject({ score: null, absent: false })

  // ลบชุดข้อสอบ → รายการสอบกลับเป็นไม่ระบุ
  const { id: set2 } = await json(await postJson('/api/teacher/exam-sets', { kind: 'typed', title: 'ชุด C', questions: QUESTIONS }, { cookie: teacher }))
  await putJson(`/api/teacher/score-items/${itemId}`, { ...base, takenOn: '2020-01-01', examSetId: set2 }, teacher)
  const { SELF } = await import('cloudflare:test')
  expect((await SELF.fetch(`http://x/api/teacher/exam-sets/${set2}`, { method: 'DELETE', headers: { cookie: teacher } })).status).toBe(200)
  expect((await json(await getJson(`/api/teacher/score-items/${itemId}`, teacher))).item.examSetId).toBeNull()
})

it('คุมสอบด้วยกล้อง: สแกนโต๊ะ/ภาพหน้า อัปโหลดได้เฉพาะตอนสอบ เครื่องเดิม · กล้องดับนับเป็นออกจากหน้าจอ · ครูเห็นภาพ นักเรียนเปิดไม่ได้ · ลบเองหลังให้คะแนน 30 วัน', async () => {
  const { teacher, sc, oc, itemId, setId } = await setup()
  const { SELF } = await import('cloudflare:test')
  const photo = (id: string, kind: string, cookie: string, d = DEV) =>
    SELF.fetch(`http://x/api/student/makeups/${id}/photo?kind=${kind}`, { method: 'POST', headers: { cookie, 'content-type': 'image/jpeg', 'x-exam-device': d }, body: TINY_JPEG })
  const { id } = await json(await postJson('/api/student/makeups', { scoreItemId: itemId, reason: 'ป่วย' }, { cookie: sc }))
  const { code } = await json(await putJson(`/api/teacher/makeup-exams/${id}/approve`, { mode: 'online', ...window(), capPct: 100, examSetId: setId, shuffle: false, proctor: true }, teacher))
  expect((await json(await getJson('/api/student/makeups', sc)))[0].request.proctor).toBe(true)
  // ยังไม่เริ่มสอบ = อัปโหลดไม่ได้
  expect((await photo(id, 'room', sc)).status).toBe(409)
  // ไม่ติ๊กยินยอม PDPA = เริ่มไม่ได้ (ยังไม่เริ่มจับเวลา)
  const noConsent = await postJson(`/api/student/makeups/${id}/start`, { code, deviceId: DEV }, { cookie: sc })
  expect(noConsent.status).toBe(400)
  expect((await json(noConsent)).error.code).toBe('pdpa_required')
  const paper = await json(await postJson(`/api/student/makeups/${id}/start`, { code, deviceId: DEV, consent: true }, { cookie: sc }))
  expect(paper).toMatchObject({ proctor: true, roomDone: false, recheckDone: false, durationMin: 30 })
  expect(recheckAt(id, paper.startedAt, 30)).toBeGreaterThanOrEqual(paper.startedAt + 0.3 * 30 * 60_000)
  expect(recheckAt(id, paper.startedAt, 30)).toBeLessThanOrEqual(paper.startedAt + 0.7 * 30 * 60_000)

  expect((await photo(id, 'selfie', sc)).status).toBe(400)
  expect((await photo(id, 'room', sc, DEV2)).status).toBe(403)
  expect((await photo(id, 'room', oc)).status).toBe(404)
  const { key } = await json(await photo(id, 'room', sc))
  expect(key).toMatch(new RegExp(`^proctor/${id}/`))
  await photo(id, 'face', sc)
  expect(await json(await req('GET', `/api/student/makeups/${id}/exam`, undefined, dev(sc)))).toMatchObject({ roomDone: true, recheckDone: false })

  // กล้องดับ = ออกจากหน้าจอ 1 ครั้ง
  expect(await json(await req('POST', `/api/student/makeups/${id}/event`, { kind: 'camera-off' }, dev(sc)))).toEqual({ leaves: 1, submitted: false })

  // ภาพ: ครูเปิดได้ · นักเรียน (แม้เจ้าของ) เปิดไม่ได้
  const open = (c: string) => SELF.fetch(`http://x/api/files/${key}`, { headers: { cookie: c } })
  expect((await open(teacher)).status).toBe(200)
  expect((await open(sc)).status).toBe(404)
  await req('POST', `/api/student/makeups/${id}/submit`, {}, dev(sc))
  expect((await photo(id, 'face', sc)).status).toBe(409)
  const detail = await json(await getJson(`/api/teacher/makeup-exams/${id}`, teacher))
  expect(detail.proctor).toBe(true)
  expect(detail.consentAt).toBeGreaterThan(0)
  expect(detail.photos.map((p: { kind: string }) => p.kind)).toEqual(['room', 'face'])
  expect(detail.events.map((e: { kind: string }) => e.kind)).toContain('camera-off')

  // ให้คะแนนแล้ว: ยังไม่ครบ 30 วันไม่ลบ · ครบแล้วลบทั้งแถวและไฟล์
  await putJson(`/api/teacher/makeup-exams/${id}/grade`, { score: 15, note: '' }, teacher)
  expect(await purgeProctorPhotos(db(), env.BUCKET, Date.now())).toBe(0)
  expect(await purgeProctorPhotos(db(), env.BUCKET, Date.now() + 31 * 86400_000)).toBe(2)
  expect((await json(await getJson(`/api/teacher/makeup-exams/${id}`, teacher))).photos).toEqual([])
  expect(await env.BUCKET.get(key)).toBeNull()
})

it('คุมสอบด้วยกล้องใช้ได้เฉพาะออนไลน์ · ครูปิดได้', async () => {
  const { teacher, sc, itemId, setId, s } = await setup()
  const { id } = await json(await postJson('/api/student/makeups', { scoreItemId: itemId, reason: 'ป่วย' }, { cookie: sc }))
  await putJson(`/api/teacher/makeup-exams/${id}/approve`, { mode: 'paper', ...window(), capPct: 100, examSetId: null, proctor: true }, teacher)
  expect((await json(await getJson(`/api/teacher/makeup-exams/${id}`, teacher))).proctor).toBe(false)
  const g = await json(await postJson('/api/teacher/makeup-exams', { scoreItemId: itemId, studentId: s.id, mode: 'online', ...window(), capPct: 100, examSetId: setId, proctor: false }, { cookie: teacher }))
  const paper = await json(await postJson(`/api/student/makeups/${g.id}/start`, { code: g.code, deviceId: DEV }, { cookie: sc }))
  expect(paper.proctor).toBe(false)
  const { SELF } = await import('cloudflare:test')
  const r = await SELF.fetch(`http://x/api/student/makeups/${g.id}/photo?kind=face`, { method: 'POST', headers: { cookie: sc, 'content-type': 'image/jpeg', 'x-exam-device': DEV }, body: TINY_JPEG })
  expect(r.status).toBe(400)
})
