import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { del, getJson, json, loginTeacher, putJson, resetDb, seedAssignment, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

it('ครูกด "ไม่ส่งงาน": นักเรียนส่งไม่ได้อีก · ไม่ได้ EXP · ตารางทวงงานขึ้นปิดรับ · ยกเลิกแล้วส่งได้ · ส่งกระดาษแทนได้', async () => {
  const teacher = await loginTeacher()
  const { classId } = await seedClass(db())
  const s1 = await seedStudent(db(), classId)
  const s2 = await seedStudent(db(), classId)
  const asg = await seedAssignment(classId, { title: 'ใบงานหาย', maxScore: 10, dueAt: Date.now() - 86400_000 })
  const close = (sid: string, closed: boolean) => putJson(`/api/teacher/assignments/${asg}/not-submitted/${sid}`, { closed }, teacher)
  const c1 = await studentCookie(s1.id)
  const c2 = await studentCookie(s2.id)

  // s2 ส่งแล้ว → ปิดรับไม่ได้
  await putJson(`/api/student/assignments/${asg}/submission`, { text: 'ส่ง', imageKeys: [], clientRequestId: 'a' }, c2)
  expect((await close(s2.id, true)).status).toBe(409)

  expect((await close(s1.id, true)).status).toBe(200)
  const mine = await json(await getJson(`/api/student/assignments/${asg}`, c1))
  expect(mine).toMatchObject({ status: 'missing', closed: true })
  expect((await putJson(`/api/student/assignments/${asg}/submission`, { text: 'สาย', imageKeys: [], clientRequestId: 'b' }, c1)).status).toBe(409)
  const gb = await json(await getJson(`/api/teacher/classes/${classId}/gradebook`, teacher))
  expect(gb.students.find((x: { id: string }) => x.id === s1.id).cells[asg]).toMatchObject({ status: 'missing', closed: true })
  const sb = await json(await getJson('/api/student/grade/breakdown', c1))
  expect(sb.assignments[0]).toMatchObject({ status: 'closed', score: null })
  expect(sb.maxTotal).toBe(10)
  const exp = await json(await getJson('/api/student/exp/breakdown', c1))
  expect(exp.exp).toBe(0)

  // ยกเลิก → ส่งได้ (นับสาย)
  expect((await close(s1.id, false)).status).toBe(200)
  expect((await putJson(`/api/student/assignments/${asg}/submission`, { text: 'สาย', imageKeys: [], clientRequestId: 'c' }, c1)).status).toBe(200)
  expect(await json(await getJson(`/api/student/assignments/${asg}`, c1))).toMatchObject({ status: 'late', closed: false })

  // ส่งกระดาษแทนการปิดรับ
  const s3 = await seedStudent(db(), classId)
  await close(s3.id, true)
  expect((await putJson(`/api/teacher/assignments/${asg}/paper/${s3.id}`, { score: 5, late: true, comment: '' }, teacher)).status).toBe(200)
  expect(await json(await getJson(`/api/student/assignments/${asg}`, await studentCookie(s3.id)))).toMatchObject({ status: 'graded', closed: false })

  // ลบนักเรียน/ลบงานได้ (ข้อมูลปิดรับถูกลบตาม)
  const s4 = await seedStudent(db(), classId)
  await close(s4.id, true)
  expect((await del(`/api/teacher/students/${s4.id}`, teacher)).status).toBe(200)
  expect((await del(`/api/teacher/assignments/${asg}?force=1`, teacher)).status).toBe(200)
})
