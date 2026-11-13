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
  expect(g.settings).toEqual({ bands: DEFAULT_BANDS, visible: false, fullSetTopGrade: true })
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
  expect(await json(await getJson('/api/student/grade', c0))).toEqual({ visible: true, total: 9, maxTotal: 10, grade: '4', fullSet: false })
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

it('กติกาครู: สะสมสัตว์วิเศษครบ 16 ตัว ได้เกรดสูงสุด · 15 ตัวยังไม่ได้ · ปิดกติกาได้ · ใช้ทุกที่ที่คิดเกรด', async () => {
  const { cookie, classId, ss, setScore } = await setup()
  await setScore(ss[0].id, 10)
  await setScore(ss[1].id, 6)
  await setScore(ss[2].id, 1)
  await setScore(ss[3].id, 0)
  await giveCharacters(ss[3].id, 16)
  await giveCharacters(ss[2].id, 15)
  const g = await json(await getJson(`/api/teacher/classes/${classId}/grades`, cookie))
  const row = (id: string) => g.students.find((s: { id: string }) => s.id === id)
  expect(row(ss[3].id)).toMatchObject({ grade: '4', fullSet: true, total: 0 })
  expect(row(ss[2].id)).toMatchObject({ fullSet: false })
  expect(row(ss[2].id).grade).not.toBe('4')

  // นักเรียนเห็นเกรด + รู้ว่าได้จากครบชุด · หน้าตัวละครบอกกติกา
  await putJson(`/api/teacher/classes/${classId}/grading`, { bands: DEFAULT_BANDS, visible: true }, cookie)
  const c3 = await studentCookie(ss[3].id)
  expect(await json(await getJson('/api/student/grade', c3))).toMatchObject({ grade: '4', fullSet: true })
  expect((await json(await getJson('/api/student/progress', c3))).fullSetReward).toBe('4')

  // รวมทุกห้อง (หน้าติดตามนักเรียน) ตรงกัน
  const { allClassGrades } = await import('../src/server/grades/service')
  expect((await allClassGrades(db())).get(classId)?.get(ss[3].id)).toBe('4')

  // เกณฑ์ 5 ระดับที่ครูเปลี่ยนชื่อเกรดบนสุด → ได้ช่วงบนสุด
  await putJson(`/api/teacher/classes/${classId}/grading`, { bands: [{ grade: 'A', min: 80 }, { grade: 'B', min: 0 }], visible: true }, cookie)
  expect((await json(await getJson('/api/student/grade', c3))).grade).toBe('A')

  // ปิดกติกา → กลับไปคิดตามคะแนน
  await putJson(`/api/teacher/classes/${classId}/grading`, { bands: DEFAULT_BANDS, visible: true, fullSetTopGrade: false }, cookie)
  const off = await json(await getJson(`/api/teacher/classes/${classId}/grades`, cookie))
  expect(off.settings.fullSetTopGrade).toBe(false)
  expect(off.students.find((s: { id: string }) => s.id === ss[3].id).grade).not.toBe('4')
  expect((await json(await getJson('/api/student/progress', c3))).fullSetReward).toBeNull()
})

it('ครบชุดแต่ยังไม่มีคะแนนใด ๆ ในห้อง → ได้เกรดสูงสุดเลย', async () => {
  const { cookie, classId, ss } = await setup()
  await giveCharacters(ss[0].id, 16)
  const g = await json(await getJson(`/api/teacher/classes/${classId}/grades`, cookie))
  expect(g.maxTotal).toBe(0)
  expect(g.students.find((s: { id: string }) => s.id === ss[0].id).grade).toBe('4')
  expect(g.students.find((s: { id: string }) => s.id === ss[1].id).grade).toBeNull()
})
