import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedAssignment, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

it('นักเรียนดูที่มาคะแนนรวม: งานที่ตรวจแล้ว + สอบที่ครูเผยแพร่ (สอบที่ยังไม่เผยแพร่ไม่รวม) · เกรดตามที่ครูเปิด', async () => {
  const teacher = await loginTeacher()
  const { classId } = await seedClass(db())
  const s = await seedStudent(db(), classId)
  const sc = await studentCookie(s.id)
  const a1 = await seedAssignment(classId, { title: 'ใบงาน 1', maxScore: 10, dueAt: Date.now() - 86400_000 })
  await seedAssignment(classId, { title: 'ใบงาน 2 (ยังไม่ส่ง)', maxScore: 10, dueAt: Date.now() - 86400_000 })
  await seedAssignment(classId, { title: 'ใบงาน 3 (ยังไม่ถึงกำหนด)', maxScore: 10, dueAt: Date.now() + 86400_000 })
  await putJson(`/api/student/assignments/${a1}/submission`, { text: 'ตอบ', imageKeys: [], clientRequestId: 'x' }, sc)
  const [{ id: subId }] = (await env.DB.prepare('SELECT id FROM submissions WHERE assignment_id = ?').bind(a1).all<{ id: string }>()).results
  expect((await postJson(`/api/teacher/submissions/${subId}/grade`, { score: 8, comment: '', annotatedKeys: [] }, { cookie: teacher })).status).toBe(200)

  const { ids: [pub] } = await json(await postJson('/api/teacher/score-items', { title: 'สอบย่อย 1', category: 'quiz', maxScore: 20, takenOn: '2026-11-10', classIds: [classId] }, { cookie: teacher }))
  const { ids: [hidden] } = await json(await postJson('/api/teacher/score-items', { title: 'กลางภาค (ยังไม่เผยแพร่)', category: 'midterm', maxScore: 30, takenOn: '2026-11-12', classIds: [classId] }, { cookie: teacher }))
  await putJson(`/api/teacher/score-items/${pub}/scores/${s.id}`, { score: 15, absent: false, note: '' }, teacher)
  await putJson(`/api/teacher/score-items/${hidden}/scores/${s.id}`, { score: 25, absent: false, note: '' }, teacher)
  await putJson(`/api/teacher/score-items/${pub}/published`, { published: true }, teacher)

  const d = await json(await getJson('/api/student/grade/breakdown', sc))
  expect(d).toMatchObject({ assignmentTotal: 8, examTotal: 15, total: 23, maxTotal: 40 }) // งาน 1 (10) + งาน 2 เลยกำหนด (10) + สอบย่อย (20)
  expect(d.assignments.map((a: { title: string; status: string; score: number | null }) => [a.title, a.status, a.score])).toEqual([
    ['ใบงาน 1', 'graded', 8],
    ['ใบงาน 2 (ยังไม่ส่ง)', 'missing', null],
    ['ใบงาน 3 (ยังไม่ถึงกำหนด)', 'missing', null],
  ])
  expect(d.exams.map((e: { title: string }) => e.title)).toEqual(['สอบย่อย 1'])
  expect(d.grade).toEqual({ visible: false })
  expect((await getJson('/api/student/grade/breakdown', teacher)).status).toBe(401)

  // ที่มา EXP ของตัวเอง
  const e = await json(await getJson('/api/student/exp/breakdown', sc))
  expect(e.bySource[0]).toMatchObject({ source: 'assignment', count: 1 })
  expect(e.exp).toBe(e.bySource.reduce((n: number, x: { exp: number }) => n + x.exp, 0))
})
