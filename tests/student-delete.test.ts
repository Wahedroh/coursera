import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { getDb } from '../src/server/db/client'
import { todayBangkok } from '../src/shared/attendance'
import { del, getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie, TINY_JPEG, uploadFile } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const TABLES = ['sessions', 'submissions', 'point_events', 'attendance_records', 'scores', 'fee_charges', 'student_avatars', 'announcement_reads']

it('ลบนักเรียนถาวร: ข้อมูลทุกตารางและรูปงานของคนนั้นหาย คนอื่นไม่กระทบ', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const a = await seedStudent(db(), classId, { firstName: 'จะลบ', lastName: 'ทดสอบ' })
  const b = await seedStudent(db(), classId)
  const ca = await studentCookie(a.id)
  await studentCookie(b.id)
  const asg = (await json(await postJson('/api/teacher/assignments', { title: 'งาน', instructions: '', attachmentKeys: [], maxScore: 10, submitMode: 'both', dueAt: null, classIds: [classId] }, { cookie }))).ids[0]
  const { key } = await json(await uploadFile('kind=submission', TINY_JPEG, 'image/jpeg', ca))
  for (const c of [ca, await studentCookie(b.id)]) await putJson(`/api/student/assignments/${asg}/submission`, { text: 'x', imageKeys: c === ca ? [key] : [], clientRequestId: Math.random().toString() }, c)
  const item = (await json(await postJson('/api/teacher/score-items', { title: 'สอบ', category: 'quiz', maxScore: 10, takenOn: '2026-10-20', classIds: [classId] }, { cookie }))).ids[0]
  for (const s of [a, b]) await putJson(`/api/teacher/score-items/${item}/scores/${s.id}`, { score: 5, absent: false, note: '' }, cookie)
  const day = await json(await postJson(`/api/teacher/classes/${classId}/attendance`, { date: todayBangkok() }, { cookie }))
  await putJson(`/api/teacher/attendance/${day.day.id}/records/${a.id}`, { status: 'late' }, cookie)
  await postJson('/api/teacher/points', { studentIds: [a.id, b.id], delta: 1, reason: 'ตอบคำถาม' }, { cookie })
  const fee = (await json(await postJson('/api/teacher/fee-items', { title: 'ชีท', amount: 20, classIds: [classId] }, { cookie }))).ids[0]
  await postJson(`/api/teacher/fee-items/${fee}/charges/bulk`, { studentIds: [a.id, b.id] }, { cookie })
  await putJson('/api/student/avatar', { nickname: 'ลบ', config: { gender: 'm', skin: 0, hair: 'short', hairColor: 0, job: 'student', glasses: false } }, ca)
  const ann = (await json(await postJson('/api/teacher/announcements', { title: 'ประกาศ', body: '', pinned: false, expiresOn: null, classIds: [classId] }, { cookie }))).ids[0]
  await postJson(`/api/student/announcements/${ann}/read`, {}, { cookie: ca })
  expect(await env.BUCKET.get(key)).not.toBeNull()

  const res = await del(`/api/teacher/students/${a.id}`, cookie)
  expect(await json(res)).toEqual({ name: 'จะลบ ทดสอบ' })
  for (const t of TABLES) {
    const [{ n }] = await db().all<{ n: number }>(sql.raw(`SELECT count(*) AS n FROM ${t} WHERE student_id = '${a.id}'`))
    expect([t, n]).toEqual([t, 0])
  }
  expect(await env.BUCKET.get(key)).toBeNull()
  expect((await getJson('/api/student/assignments', ca)).status).toBe(401)
  const { students } = await json(await getJson(`/api/teacher/classes/${classId}/students`, cookie))
  expect(students.map((s: { id: string }) => s.id)).toEqual([b.id])
  const [{ n }] = await db().all<{ n: number }>(sql.raw(`SELECT count(*) AS n FROM scores WHERE student_id = '${b.id}'`))
  expect(n).toBe(1)
  expect((await del(`/api/teacher/students/${a.id}`, cookie)).status).toBe(404)
  expect((await del(`/api/teacher/students/${b.id}`, ca)).status).toBe(401)
})
