import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { del, getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie, TINY_JPEG, uploadFile } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)
const VIDEO = { title: 'ทบทวนบทที่ 1', description: 'ดูก่อนสอบ', url: 'https://youtu.be/dQw4w9WgXcQ?si=xyz' }

async function setup() {
  const cookie = await loginTeacher()
  const a = await seedClass(db())
  const b = await seedClass(db())
  const sa = await studentCookie((await seedStudent(db(), a.classId)).id)
  const sb = await studentCookie((await seedStudent(db(), b.classId)).id)
  return { cookie, a: a.classId, b: b.classId, sa, sb }
}

it('ครูเพิ่มคลิปให้หลายห้อง แปลงลิงก์เป็นรหัสคลิป', async () => {
  const { cookie, a, b } = await setup()
  const res = await postJson('/api/teacher/videos', { ...VIDEO, classIds: [a, b] }, { cookie })
  expect(res.status).toBe(200)
  expect((await json(res)).ids).toHaveLength(2)
  const list = await json(await getJson(`/api/teacher/classes/${a}/videos`, cookie))
  expect(list).toEqual([expect.objectContaining({ title: 'ทบทวนบทที่ 1', youtubeId: 'dQw4w9WgXcQ', published: true })])
  expect((await postJson('/api/teacher/videos', { ...VIDEO, url: 'https://vimeo.com/1', classIds: [a] }, { cookie })).status).toBe(400)
  expect((await postJson('/api/teacher/videos', { ...VIDEO, classIds: ['nope'] }, { cookie })).status).toBe(404)
})

it('นักเรียนเห็นเฉพาะคลิปที่แสดงของห้องตัวเอง', async () => {
  const { cookie, a, b, sa, sb } = await setup()
  const { ids } = await json(await postJson('/api/teacher/videos', { ...VIDEO, classIds: [a] }, { cookie }))
  const id = ids[0]
  expect(await json(await getJson('/api/student/videos', sa))).toEqual([expect.objectContaining({ id, title: 'ทบทวนบทที่ 1', youtubeId: 'dQw4w9WgXcQ' })])
  expect((await json(await getJson(`/api/student/videos/${id}`, sa))).youtubeId).toBe('dQw4w9WgXcQ')
  expect(await json(await getJson('/api/student/videos', sb))).toEqual([])
  expect((await getJson(`/api/student/videos/${id}`, sb)).status).toBe(404)
  await putJson(`/api/teacher/videos/${id}/published`, { published: false }, cookie)
  expect(await json(await getJson('/api/student/videos', sa))).toEqual([])
  const hidden = await getJson(`/api/student/videos/${id}`, sa)
  expect(hidden.status).toBe(404)
  expect(await hidden.text()).not.toContain('dQw4w9WgXcQ')
  void b
})

it('แก้และลบคลิป', async () => {
  const { cookie, a } = await setup()
  const { ids } = await json(await postJson('/api/teacher/videos', { ...VIDEO, classIds: [a] }, { cookie }))
  expect((await putJson(`/api/teacher/videos/${ids[0]}`, { ...VIDEO, title: 'บทที่ 1 (ใหม่)', url: 'https://www.youtube.com/watch?v=abcdefghijk' }, cookie)).status).toBe(200)
  expect((await json(await getJson(`/api/teacher/classes/${a}/videos`, cookie)))[0]).toMatchObject({ title: 'บทที่ 1 (ใหม่)', youtubeId: 'abcdefghijk' })
  expect((await del(`/api/teacher/videos/${ids[0]}`, cookie)).status).toBe(200)
  expect(await json(await getJson(`/api/teacher/classes/${a}/videos`, cookie))).toEqual([])
  expect((await del(`/api/teacher/videos/${ids[0]}`, cookie)).status).toBe(404)
})

it('สิทธิ์: นักเรียนเรียก API ครู 401, ไม่ล็อกอิน 401', async () => {
  const { a, sa } = await setup()
  expect((await getJson(`/api/teacher/classes/${a}/videos`, sa)).status).toBe(401)
  expect((await postJson('/api/teacher/videos', { ...VIDEO, classIds: [a] }, { cookie: sa })).status).toBe(401)
  expect((await getJson('/api/student/videos')).status).toBe(401)
})

it('คำถามท้ายคลิปเป็นรูปได้: เว้นตัวเลือกว่างได้เมื่อมีรูป · นักเรียนห้องนั้นเปิดรูปได้ ห้องอื่นไม่ได้ · ตอบแล้วได้ EXP', async () => {
  const { cookie, a, sa, sb } = await setup()
  const { key } = await json(await uploadFile('kind=quiz', TINY_JPEG, 'image/jpeg', cookie))
  // ไม่มีรูปและไม่มีข้อความ → 400 · ไม่มีรูปแต่ตัวเลือกว่าง → 400
  expect((await postJson('/api/teacher/videos', { ...VIDEO, classIds: [a], questions: [{ q: '', choices: ['ก', 'ข'], answer: 0 }] }, { cookie })).status).toBe(400)
  expect((await postJson('/api/teacher/videos', { ...VIDEO, classIds: [a], questions: [{ q: 'ข้อ 1', choices: ['', ''], answer: 0 }] }, { cookie })).status).toBe(400)
  const questions = [
    { q: '', image: key, choices: ['', '', '', ''], answer: 2 },
    { q: 'หน่วยของแรงคือ', choices: ['N', 'J'], answer: 0 },
  ]
  const { ids } = await json(await postJson('/api/teacher/videos', { ...VIDEO, classIds: [a], questions }, { cookie }))
  const [v] = await json(await getJson('/api/student/videos', sa))
  expect(v.quiz[0]).toEqual({ q: '', image: key, choices: ['', '', '', ''] })
  expect(v.quiz[1]).toEqual({ q: 'หน่วยของแรงคือ', choices: ['N', 'J'] })
  expect(JSON.stringify(v)).not.toContain('answer')
  expect((await getJson(`/api/files/${key}`, sa)).status).toBe(200)
  expect((await getJson(`/api/files/${key}`, sb)).status).toBe(404)
  // ซ่อนคลิป → นักเรียนเปิดรูปไม่ได้
  await putJson(`/api/teacher/videos/${ids[0]}/published`, { published: false }, cookie)
  expect((await getJson(`/api/files/${key}`, sa)).status).toBe(404)
  await putJson(`/api/teacher/videos/${ids[0]}/published`, { published: true }, cookie)

  const wrong = await json(await postJson(`/api/student/videos/${ids[0]}/watched`, { watchedSeconds: 90, durationSeconds: 100, answers: [1, 0] }, { cookie: sa }))
  expect(wrong).toMatchObject({ awarded: false })
  const ok = await json(await postJson(`/api/student/videos/${ids[0]}/watched`, { watchedSeconds: 90, durationSeconds: 100, answers: [2, 0] }, { cookie: sa }))
  expect(ok).toMatchObject({ awarded: true })
  // รูปที่ใช้ในคำถามคลิปไม่ถูกลบเป็นไฟล์ค้าง
  const { purgeOrphans } = await import('../src/server/storage/service')
  await purgeOrphans(db(), env.BUCKET, Date.now() + 3 * 86400_000)
  expect(await env.BUCKET.get(key)).not.toBeNull()
})

it('ความคืบหน้าการดูคลิป: เก็บเปอร์เซ็นต์สูงสุด · ครูเห็นรายชื่อ (ดูมากก่อน · ยังไม่ดูท้าย) · ได้ EXP แล้วนับว่าดูครบ', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const s1 = await seedStudent(db(), classId, { firstName: 'หนึ่ง', sortOrder: 1 })
  const s2 = await seedStudent(db(), classId, { firstName: 'สอง', sortOrder: 2 })
  const s3 = await seedStudent(db(), classId, { firstName: 'สาม', sortOrder: 3 })
  const { ids } = await json(await postJson('/api/teacher/videos', { ...VIDEO, classIds: [classId] }, { cookie }))
  const id = ids[0]
  const [c1, c2] = [await studentCookie(s1.id), await studentCookie(s2.id)]
  const progress = (c: string, watchedSeconds: number) => postJson(`/api/student/videos/${id}/progress`, { watchedSeconds, durationSeconds: 200 }, { cookie: c })

  expect(await json(await progress(c1, 60))).toEqual({ percent: 30 })
  expect(await json(await progress(c1, 20))).toEqual({ percent: 30 }) // ดูรอบใหม่น้อยกว่า: เก็บค่าสูงสุด
  expect(await json(await progress(c1, 150))).toEqual({ percent: 75 })
  await progress(c2, 30)
  expect((await progress(c2, -1)).status).toBe(400)
  // นักเรียนห้องอื่นบันทึกไม่ได้
  const other = await studentCookie((await seedStudent(db(), (await seedClass(db())).classId)).id)
  expect((await progress(other, 50)).status).toBe(404)

  let list = await json(await getJson(`/api/teacher/classes/${classId}/videos`, cookie))
  expect(list[0].views).toEqual({ started: 2, done: 1, total: 3 })
  let v = await json(await getJson(`/api/teacher/videos/${id}/viewers`, cookie))
  expect(v.viewers.map((x: { name: string; percent: number | null }) => [x.name.split(' ')[0], x.percent])).toEqual([
    ['หนึ่ง', 75],
    ['สอง', 15],
    ['สาม', null],
  ])
  expect([v.total, v.started, v.done]).toEqual([3, 2, 1])

  // ส่ง "ดูครบ" (ได้ EXP) → ความคืบหน้าอัปเดตด้วย · คนที่เคยได้ EXP โดยไม่มีบันทึก % ก็นับว่าดูครบ
  await postJson(`/api/student/videos/${id}/watched`, { watchedSeconds: 190, durationSeconds: 200 }, { cookie: c2 })
  await env.DB.prepare(`INSERT INTO point_events (id, student_id, delta, reason, source, ref_id, created_at) VALUES ('legacy', ?, 5, 'เก่า', 'video', ?, 1)`).bind(s3.id, `${id}:${s3.id}`).run()
  v = await json(await getJson(`/api/teacher/videos/${id}/viewers`, cookie))
  expect(v.viewers.map((x: { name: string; percent: number | null; rewarded: boolean }) => [x.name.split(' ')[0], x.percent, x.rewarded])).toEqual([
    ['สอง', 95, true],
    ['หนึ่ง', 75, false],
    ['สาม', null, true],
  ])
  list = await json(await getJson(`/api/teacher/classes/${classId}/videos`, cookie))
  expect(list[0].views).toEqual({ started: 3, done: 3, total: 3 })
  expect((await getJson(`/api/teacher/videos/${id}/viewers`, c1)).status).toBe(401)

  // ลบคลิป/ลบนักเรียนได้ (ความคืบหน้าถูกลบตาม)
  expect((await del(`/api/teacher/students/${s1.id}`, cookie)).status).toBe(200)
  expect((await del(`/api/teacher/videos/${id}`, cookie)).status).toBe(200)
})
