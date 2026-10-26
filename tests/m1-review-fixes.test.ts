import { env, SELF } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { getDb, newId, now } from '../src/server/db/client'
import { assignments, submissions } from '../src/server/db/schema'
import { getJson, json, loginTeacher, putJson, resetDb, seedAssignment, seedClass, seedStudent, studentCookie, TINY_JPEG, uploadFile } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

// I1: D1 รับตัวแปรได้ไม่เกิน 100 ตัวต่อคำสั่ง — ห้องที่มีงานมากต้องยังเปิดตารางได้
it('ห้องที่มี 120 งาน เปิดตารางทวงงานและรายการงานได้', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const s = await seedStudent(db(), classId)
  const t = now()
  const rows = Array.from({ length: 120 }, (_, i) => ({ id: newId(), classId, title: `งาน ${i}`, maxScore: 10, submitMode: 'both' as const, createdAt: t + i, updatedAt: t }))
  for (let i = 0; i < rows.length; i += 10) await db().insert(assignments).values(rows.slice(i, i + 10))
  await db().insert(submissions).values({ id: newId(), assignmentId: rows[119].id, studentId: s.id, status: 'submitted', submittedAt: t, updatedAt: t })
  const gb = await getJson(`/api/teacher/classes/${classId}/gradebook`, cookie)
  expect(gb.status).toBe(200)
  const body = await json(gb)
  expect(body.assignments).toHaveLength(120)
  expect(body.students[0].cells[rows[119].id].status).toBe('submitted')
  expect((await getJson(`/api/teacher/classes/${classId}/assignments`, cookie)).status).toBe(200)
})

// I2: ส่งใหม่หลังครูส่งกลับ ต้องล้างรูปที่ตรวจ/คะแนนเดิม ไม่งั้นครูเห็นงานเก่า
it('ส่งใหม่หลังส่งกลับแก้ ล้าง annotatedKeys, score, gradedAt', async () => {
  const { classId } = await seedClass(db())
  const s = await seedStudent(db(), classId)
  const a = await seedAssignment(classId)
  const id = newId()
  await db().insert(submissions).values({ id, assignmentId: a, studentId: s.id, status: 'returned', score: 5, gradedAt: 1, annotatedKeys: [`ann/${id}/old.png`], imageKeys: [`sub/${s.id}/old.jpg`], submittedAt: 1, updatedAt: 1 })
  const res = await putJson(`/api/student/assignments/${a}/submission`, { text: '', imageKeys: [`sub/${s.id}/new.jpg`], clientRequestId: 'r-new' }, await studentCookie(s.id))
  expect(res.status).toBe(200)
  const [row] = await db().select().from(submissions).where(eq(submissions.id, id))
  expect(row).toMatchObject({ status: 'submitted', imageKeys: [`sub/${s.id}/new.jpg`], annotatedKeys: [], score: null, gradedAt: null })
})

// ไฟล์ที่ผู้ใช้อัปโหลดต้องไม่ถูกเบราว์เซอร์ตีความเป็นอย่างอื่น
it('เสิร์ฟไฟล์พร้อม nosniff และ CSP sandbox', async () => {
  const { classId } = await seedClass(db())
  const s = await seedStudent(db(), classId)
  const cookie = await studentCookie(s.id)
  const { key } = await json(await uploadFile('kind=submission', TINY_JPEG, 'image/jpeg', cookie))
  const res = await SELF.fetch(`http://x/api/files/${key}`, { headers: { cookie } })
  expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  expect(res.headers.get('content-security-policy')).toBe("sandbox; default-src 'none'")
})
