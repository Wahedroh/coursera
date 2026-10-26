import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb, newId, now } from '../src/server/db/client'
import { submissions } from '../src/server/db/schema'
import { missingText } from '../src/shared/assignments'
import { getJson, json, loginTeacher, resetDb, seedAssignment, seedClass, seedStudent } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

it('gradebook มีทุกคน×ทุกงาน และไม่รวมคนที่ปิดใช้งาน', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db(), { name: 'ห้องทดสอบ ชั้น 1' })
  const s1 = await seedStudent(db(), classId, { zipgradeId: '1', firstName: 'ก', sortOrder: 2 })
  const s2 = await seedStudent(db(), classId, { zipgradeId: '2', firstName: 'ข', sortOrder: 1 })
  await seedStudent(db(), classId, { zipgradeId: '3', active: false })
  const a1 = await seedAssignment(classId, { title: 'งาน 1', dueAt: 1 })
  const a2 = await seedAssignment(classId, { title: 'งาน 2', dueAt: 2 })
  const subId = newId()
  await db().insert(submissions).values({ id: subId, assignmentId: a1, studentId: s1.id, status: 'graded', score: 7, submittedAt: now(), updatedAt: now() })
  const gb = await json(await getJson(`/api/teacher/classes/${classId}/gradebook`, cookie))
  expect(gb.class).toEqual({ id: classId, name: 'ห้องทดสอบ ชั้น 1' })
  expect(gb.assignments.map((a: { id: string }) => a.id)).toEqual([a1, a2])
  expect(gb.students.map((s: { zipgradeId: string }) => s.zipgradeId)).toEqual(['2', '1'])
  const st1 = gb.students.find((s: { id: string }) => s.id === s1.id)
  expect(st1.cells[a1]).toEqual({ status: 'graded', score: 7, submissionId: subId })
  expect(st1.cells[a2]).toEqual({ status: 'missing', score: null, submissionId: null })
  expect(gb.students.find((s: { id: string }) => s.id === s2.id).cells[a1].status).toBe('missing')
})

it('missingText ตรงรูปแบบ', () => {
  const gb = {
    class: { id: 'c', name: 'ห้อง' },
    assignments: [{ id: 'a', title: 'ใบงาน 4', dueAt: null, maxScore: 10 }],
    students: [
      { id: '1', zipgradeId: '11', title: 'เด็กหญิง', firstName: 'สมใจ', lastName: 'ใจดี', cells: { a: { status: 'missing' as const, score: null, submissionId: null } } },
      { id: '2', zipgradeId: '12', title: null, firstName: 'มานี', lastName: 'มีนา', cells: { a: { status: 'submitted' as const, score: null, submissionId: 'x' } } },
      { id: '3', zipgradeId: '13', title: 'เด็กชาย', firstName: 'ชูใจ', lastName: 'ใฝ่รู้', cells: { a: { status: 'returned' as const, score: null, submissionId: 'y' } } },
    ],
  }
  expect(missingText(gb, 'a')).toBe('ใบงาน 4 — ยังไม่ส่ง 2 คน\n1. เด็กหญิงสมใจ ใจดี (11)\n2. เด็กชายชูใจ ใฝ่รู้ (13) — ครูส่งกลับให้แก้')
})
