import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedAssignment, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

async function lateSubmission() {
  const teacher = await loginTeacher()
  const { classId } = await seedClass(db())
  const st = await seedStudent(db(), classId)
  const sc = await studentCookie(st.id)
  const due = Date.now() - 3600_000
  const asg = await seedAssignment(classId, { title: 'ใบงานสาย', maxScore: 10, dueAt: due })
  await putJson(`/api/student/assignments/${asg}/submission`, { text: 'ส่งช้า', imageKeys: [], clientRequestId: 'r1' }, sc)
  const [{ id }] = (await env.DB.prepare('SELECT id FROM submissions WHERE assignment_id = ?').bind(asg).all<{ id: string }>()).results
  return { teacher, classId, st, sc, asg, id, due }
}
const onTime = (id: string, v: boolean, cookie: string) => putJson(`/api/teacher/submissions/${id}/on-time`, { onTime: v }, cookie)
const badge = async (sc: string) => (await json(await getJson('/api/student/badges', sc))).find((b: { id: string }) => b.id === 'onTime10').progress

it('ครูแก้ส่งสาย → นับว่าตรงเวลา: สถานะ/เวลาที่ใช้คิด/เหรียญเปลี่ยน · เก็บเวลาจริงไว้ · ยกเลิกกลับได้', async () => {
  const { teacher, sc, asg, id, due } = await lateSubmission()
  expect((await json(await getJson(`/api/teacher/submissions/${id}`, teacher))).submission.status).toBe('late')
  expect(await badge(sc)).toBe(0)

  const r = await json(await onTime(id, true, teacher))
  expect(r.submittedAt).toBe(due)
  expect(r.excusedFrom).toBeGreaterThan(due)
  const d = (await json(await getJson(`/api/teacher/submissions/${id}`, teacher))).submission
  expect(d).toMatchObject({ status: 'submitted', submittedAt: due, excusedFrom: r.excusedFrom })
  expect(await badge(sc)).toBe(1)
  const mine = await json(await getJson(`/api/student/assignments/${asg}`, sc))
  expect(mine).toMatchObject({ status: 'submitted', submission: { excusedLate: true } })
  // กดซ้ำไม่เป็นไร
  expect((await onTime(id, true, teacher)).status).toBe(200)

  await onTime(id, false, teacher)
  expect((await json(await getJson(`/api/teacher/submissions/${id}`, teacher))).submission).toMatchObject({ status: 'late', submittedAt: r.excusedFrom, excusedFrom: null })
  expect(await badge(sc)).toBe(0)
})

it('งานที่ตรวจแล้ว: EXP ปรับเต็ม ↔ ครึ่ง ตามที่ครูแก้', async () => {
  const { teacher, sc, id } = await lateSubmission()
  await postJson(`/api/teacher/submissions/${id}/grade`, { score: 8, comment: '', annotatedKeys: [] }, { cookie: teacher })
  const exp = async () => (await json(await getJson('/api/student/exp', sc))).exp
  expect(await exp()).toBe(15)
  await onTime(id, true, teacher)
  expect(await exp()).toBe(30)
  expect((await json(await getJson(`/api/teacher/submissions/${id}`, teacher))).submission.status).toBe('graded')
  await onTime(id, false, teacher)
  expect(await exp()).toBe(15)
})

it('ส่งตรงเวลาอยู่แล้ว → 409 · นักเรียนเรียกไม่ได้ · ส่งใหม่หลังกำหนด = กลับเป็นสาย', async () => {
  const { teacher, classId, st, sc, asg, id } = await lateSubmission()
  const ok = await seedAssignment(classId, { dueAt: Date.now() + 86400_000 })
  await putJson(`/api/student/assignments/${ok}/submission`, { text: 'ทัน', imageKeys: [], clientRequestId: 'r2' }, sc)
  const [{ id: okId }] = (await env.DB.prepare('SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ?').bind(ok, st.id).all<{ id: string }>()).results
  expect((await onTime(okId, true, teacher)).status).toBe(409)
  expect((await onTime(id, true, sc)).status).toBe(401)

  await onTime(id, true, teacher)
  await putJson(`/api/student/assignments/${asg}/submission`, { text: 'แก้แล้ว', imageKeys: [], clientRequestId: 'r3' }, sc)
  expect((await json(await getJson(`/api/teacher/submissions/${id}`, teacher))).submission).toMatchObject({ status: 'late', excusedFrom: null })
})
