import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { DEFAULT_BANDS } from '../src/shared/grades'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedAssignment, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

async function setup() {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const ss = []
  for (let i = 0; i < 4; i++) ss.push(await seedStudent(db(), classId, { sortOrder: i, firstName: `คน${i}` }))
  const inactive = await seedStudent(db(), classId, { active: false })
  const { ids } = await json(await postJson('/api/teacher/score-items', { title: 'สอบย่อย', category: 'quiz', maxScore: 10, takenOn: '2026-10-20', classIds: [classId] }, { cookie }))
  const setScore = (sid: string, score: number | null, absent = false) =>
    putJson(`/api/teacher/score-items/${ids[0]}/scores/${sid}`, { score, absent, note: '' }, cookie)
  return { cookie, classId, ss, inactive, itemId: ids[0] as string, setScore }
}

it('ยังไม่มีคะแนนเลย → ยังไม่ตัดเกรด', async () => {
  const { cookie, classId } = await setup()
  const g = await json(await getJson(`/api/teacher/classes/${classId}/grades`, cookie))
  expect(g.maxTotal).toBe(0)
  expect(g.settings).toEqual({ bands: DEFAULT_BANDS, visible: false, fullSetTopGrade: true, fullSetMinExamPct: 80 })
  expect(g.students.every((s: { grade: string | null }) => s.grade === null)).toBe(true)
  expect(g.students).toHaveLength(4)
})

it('รวมคะแนนงานที่ตรวจแล้ว + คะแนนสอบ แล้วตัดเกรดตามเปอร์เซ็นไทล์ในห้อง', async () => {
  const { cookie, classId, ss, setScore } = await setup()
  await setScore(ss[0].id, 10)
  await setScore(ss[1].id, 7)
  await setScore(ss[2].id, 5)
  await setScore(ss[3].id, null, true)
  // งาน 1 ชิ้น ตรวจแล้ว 1 คน
  const asg = await seedAssignment(classId, { maxScore: 10 })
  const sc = await studentCookie(ss[2].id)
  await putJson(`/api/student/assignments/${asg}/submission`, { text: 'ส่ง', imageKeys: [], clientRequestId: 'r1' }, sc)
  const { submissions } = await import('../src/server/db/schema')
  const [sub] = await db().select().from(submissions)
  await postJson(`/api/teacher/submissions/${sub.id}/grade`, { score: 9, comment: '', annotatedKeys: [] }, { cookie })

  await putJson(`/api/teacher/classes/${classId}/grading`, { bands: [{ grade: '4', min: 76 }, { grade: '3', min: 51 }, { grade: '2', min: 26 }, { grade: '1', min: 0 }], visible: false }, cookie)
  const g = await json(await getJson(`/api/teacher/classes/${classId}/grades`, cookie))
  expect(g.maxTotal).toBe(20)
  expect(g.itemCounts).toEqual({ assignments: 1, exams: 1 })
  const by = Object.fromEntries(g.students.map((s: { firstName: string }) => [s.firstName, s]))
  expect(by['คน2']).toMatchObject({ assignmentTotal: 9, examTotal: 5, total: 14, rank: 1, percentile: 100, grade: '4' })
  expect(by['คน0']).toMatchObject({ total: 10, rank: 2, grade: '3' })
  expect(by['คน1']).toMatchObject({ total: 7, rank: 3, grade: '2' })
  expect(by['คน3']).toMatchObject({ total: 0, rank: 4, grade: '1' })
})

it('นักเรียนเห็นเกรดตัวเองเฉพาะเมื่อครูเปิด และไม่เห็นของคนอื่น', async () => {
  const { cookie, classId, ss, setScore } = await setup()
  await setScore(ss[0].id, 9)
  await setScore(ss[1].id, 3)
  const c0 = await studentCookie(ss[0].id)
  expect(await json(await getJson('/api/student/grade', c0))).toEqual({ visible: false })
  await putJson(`/api/teacher/classes/${classId}/grading`, { bands: DEFAULT_BANDS, visible: true }, cookie)
  expect(await json(await getJson('/api/student/grade', c0))).toEqual({ visible: true, total: 9, maxTotal: 10, grade: '4', fullSet: false, fullSetBonus: false, examMinPct: 90, minExamPct: 80 })
  const mine = await json(await getJson('/api/student/grade', await studentCookie(ss[1].id)))
  expect(mine).toMatchObject({ total: 3 })
  expect(JSON.stringify(mine)).not.toContain('"9"')
})

it('ตั้งค่าเกรดผิดรูปแบบ → 400; นักเรียนเรียก API ครู → 401', async () => {
  const { cookie, classId, ss } = await setup()
  expect((await putJson(`/api/teacher/classes/${classId}/grading`, { bands: [{ grade: '4', min: 50 }, { grade: '3', min: 60 }], visible: true }, cookie)).status).toBe(400)
  expect((await getJson(`/api/teacher/classes/${classId}/grades`, await studentCookie(ss[0].id))).status).toBe(401)
  expect((await putJson('/api/teacher/classes/nope/grading', { bands: DEFAULT_BANDS, visible: true }, cookie)).status).toBe(404)
})

it('allClassGrades (รวมทุกห้อง) ให้เกรดตรงกับ classGrades ของแต่ละห้อง', async () => {
  const { allClassGrades, classGrades } = await import('../src/server/grades/service')
  const { getDb: gdb } = await import('../src/server/db/client')
  const { env: e } = await import('cloudflare:test')
  const { seedClass: sc, seedStudent: ss, loginTeacher: lt, postJson: pj, putJson: uj, json: js } = await import('./helpers')
  const d = gdb(e)
  const cookie = await lt()
  const classIds: string[] = []
  for (let k = 0; k < 2; k++) {
    const { classId } = await sc(d)
    classIds.push(classId)
    const st = []
    for (let i = 0; i < 5; i++) st.push(await ss(d, classId))
    const { ids } = await js(await pj('/api/teacher/score-items', { title: 'สอบ', category: 'quiz', maxScore: 10, takenOn: '2026-10-20', classIds: [classId] }, { cookie }))
    for (const [i, s] of st.entries()) await uj(`/api/teacher/score-items/${ids[0]}/scores/${s.id}`, { score: (i * 2 + k) % 11, absent: false, note: '' }, cookie)
  }
  const all = await allClassGrades(d)
  for (const id of classIds) {
    const one = await classGrades(d, id)
    for (const s of one.students) expect(all.get(id)?.get(s.id)).toBe(s.grade)
  }
})

/** ให้นักเรียนมีตัวละครซีซัน 1 จำนวน n ตัว (ไข่เปิดแล้ว) */
async function giveCharacters(studentId: string, n: number) {
  const { charactersOfSeason } = await import('../src/shared/characters')
  for (const [i, c] of charactersOfSeason(1).slice(0, n).entries())
    await env.DB.prepare(`INSERT INTO eggs (id, student_id, term_id, level, character_id, opened_at, created_at) VALUES (?, ?, 'term-1', ?, ?, 1, 1)`).bind(`egg-${studentId}-${i}`, studentId, i + 1, c.id).run()
}

it('กติกาครู: ครบ 16 ตัว + สอบทุกครั้ง ≥ 80% = เกรดสูงสุด · สอบไม่ถึง/15 ตัว ไม่ได้ · ปรับเกณฑ์/ปิดได้ · ใช้ทุกที่ที่คิดเกรด', async () => {
  const { cookie, classId, ss, setScore } = await setup()
  await setScore(ss[0].id, 10)
  await setScore(ss[1].id, 9) // ครบชุด + 90% → ได้
  await setScore(ss[2].id, 9) // 15 ตัว → ไม่ได้
  await setScore(ss[3].id, 6) // ครบชุด แต่ 60% → ไม่ได้
  for (const s of [ss[1], ss[3]]) await giveCharacters(s.id, 16)
  await giveCharacters(ss[2].id, 15)
  const rows = async () => {
    const g = await json(await getJson(`/api/teacher/classes/${classId}/grades`, cookie))
    return (id: string) => g.students.find((s: { id: string }) => s.id === id)
  }
  let row = await rows()
  expect(row(ss[1].id)).toMatchObject({ grade: '4', fullSet: true, fullSetBonus: true, examMinPct: 90 })
  expect(row(ss[2].id)).toMatchObject({ fullSet: false, fullSetBonus: false })
  expect(row(ss[3].id)).toMatchObject({ fullSet: true, fullSetBonus: false, examMinPct: 60 })
  expect(row(ss[3].id).grade).not.toBe('4')

  // สอบครั้งที่ 2: ss[1] ขาดสอบ = 0% → หลุด
  const { ids } = await json(await postJson('/api/teacher/score-items', { title: 'สอบ 2', category: 'quiz', maxScore: 20, takenOn: '2026-10-27', classIds: [classId] }, { cookie }))
  await putJson(`/api/teacher/score-items/${ids[0]}/scores/${ss[0].id}`, { score: 20, absent: false, note: '' }, cookie)
  await putJson(`/api/teacher/score-items/${ids[0]}/scores/${ss[1].id}`, { score: null, absent: true, note: '' }, cookie)
  row = await rows()
  expect(row(ss[1].id)).toMatchObject({ fullSetBonus: false, examMinPct: 0 })
  await putJson(`/api/teacher/score-items/${ids[0]}/scores/${ss[1].id}`, { score: 16, absent: false, note: '' }, cookie) // 80% พอดี
  row = await rows()
  expect(row(ss[1].id)).toMatchObject({ grade: '4', fullSetBonus: true, examMinPct: 80 })

  // นักเรียนเห็นเกรด/เหตุผล · หน้าตัวละครบอกกติกาพร้อมเกณฑ์สอบ
  await putJson(`/api/teacher/classes/${classId}/grading`, { bands: DEFAULT_BANDS, visible: true }, cookie)
  expect(await json(await getJson('/api/student/grade', await studentCookie(ss[1].id)))).toMatchObject({ grade: '4', fullSetBonus: true })
  const c3 = await studentCookie(ss[3].id)
  expect(await json(await getJson('/api/student/grade', c3))).toMatchObject({ fullSet: true, fullSetBonus: false, examMinPct: 0, minExamPct: 80 })
  expect((await json(await getJson('/api/student/progress', c3))).fullSetReward).toEqual({ grade: '4', minExamPct: 80 })

  // รวมทุกห้อง (หน้าติดตามนักเรียน) ตรงกัน
  const { allClassGrades } = await import('../src/server/grades/service')
  const all = (await allClassGrades(db())).get(classId)
  expect(all?.get(ss[1].id)).toBe('4')
  expect(all?.get(ss[3].id)).not.toBe('4')

  // ลดเกณฑ์สอบเป็น 0 (ไม่ใช้เงื่อนไขสอบ) → ss[3] ได้ · เกณฑ์ชื่อเกรดบนสุดอื่น
  await putJson(`/api/teacher/classes/${classId}/grading`, { bands: [{ grade: 'A', min: 80 }, { grade: 'B', min: 0 }], visible: true, fullSetMinExamPct: 0 }, cookie)
  expect((await json(await getJson('/api/student/grade', c3))).grade).toBe('A')

  // ปิดกติกา → กลับไปคิดตามคะแนน
  await putJson(`/api/teacher/classes/${classId}/grading`, { bands: DEFAULT_BANDS, visible: true, fullSetTopGrade: false }, cookie)
  row = await rows()
  expect(row(ss[1].id).fullSetBonus).toBe(false)
  expect((await json(await getJson('/api/student/progress', c3))).fullSetReward).toBeNull()
  expect((await putJson(`/api/teacher/classes/${classId}/grading`, { bands: DEFAULT_BANDS, visible: true, fullSetMinExamPct: 101 }, cookie)).status).toBe(400)
})

it('ครบชุดแต่ยังไม่มีการสอบ → ยังไม่ได้ (ต้องมีคะแนนสอบผ่านเกณฑ์) · เกณฑ์ 0 = ได้เลย', async () => {
  const { cookie, classId, ss } = await setup()
  await giveCharacters(ss[0].id, 16)
  const grade = async () => (await json(await getJson(`/api/teacher/classes/${classId}/grades`, cookie))).students.find((s: { id: string }) => s.id === ss[0].id)
  expect(await grade()).toMatchObject({ grade: null, fullSet: true, examMinPct: null, fullSetBonus: false })
  await putJson(`/api/teacher/classes/${classId}/grading`, { bands: DEFAULT_BANDS, visible: false, fullSetMinExamPct: 0 }, cookie)
  expect(await grade()).toMatchObject({ grade: '4', fullSetBonus: true })
})
