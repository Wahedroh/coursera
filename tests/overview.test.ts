import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { OVERVIEW_KINDS } from '../src/shared/overview'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedAssignment, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

async function setup() {
  const cookie = await loginTeacher()
  const a = (await seedClass(db(), { name: 'ห้อง A' })).classId
  const b = (await seedClass(db(), { name: 'ห้อง B' })).classId
  const sa = await seedStudent(db(), a)
  await seedStudent(db(), a)
  await seedStudent(db(), b)
  return { cookie, a, b, sa }
}

it('ทุกเมนูเปิดภาพรวมทุกห้องได้ (ทุกห้องมีแถว) · เมนูไม่รู้จัก 404 · นักเรียนเรียกไม่ได้', async () => {
  const { cookie, a, b, sa } = await setup()
  for (const kind of OVERVIEW_KINDS) {
    const r = await getJson(`/api/teacher/overview/${kind}`, cookie)
    expect([kind, r.status]).toEqual([kind, 200])
    const o = await json(r)
    expect(o.classes.map((c: { classId: string }) => c.classId).sort()).toEqual([a, b].sort())
  }
  expect((await getJson('/api/teacher/overview/nope', cookie)).status).toBe(404)
  expect((await getJson('/api/teacher/overview/videos', await studentCookie(sa.id))).status).toBe(401)
})

it('ตารางทวงงาน/คลิป/คะแนนสอบ: รายการแยกห้องถูกต้อง พร้อมจำนวนส่ง/รอตรวจ', async () => {
  const { cookie, a, b, sa } = await setup()
  const asg = await seedAssignment(a, { title: 'ใบงาน A1', dueAt: Date.now() + 86400_000 })
  await seedAssignment(b, { title: 'ใบงาน B1' })
  await putJson(`/api/student/assignments/${asg}/submission`, { text: 'ส่ง', imageKeys: [], clientRequestId: 'o1' }, await studentCookie(sa.id))
  await postJson('/api/teacher/videos', { title: 'คลิปห้อง A', description: '', url: 'https://youtu.be/dQw4w9WgXcQ', classIds: [a] }, { cookie })
  await postJson('/api/teacher/score-items', { title: 'สอบย่อย 1', category: 'quiz', maxScore: 10, takenOn: '2026-11-10', classIds: [a, b] }, { cookie })

  const row = async (kind: string, id: string) => (await json(await getJson(`/api/teacher/overview/${kind}`, cookie))).classes.find((c: { classId: string }) => c.classId === id)
  const ga = await row('gradebook', a)
  expect(ga.items).toEqual([expect.objectContaining({ title: 'ใบงาน A1', meta: expect.stringContaining('ส่งแล้ว 1/2 · รอตรวจ 1'), tone: 'amber' })])
  expect(ga.stat).toBe('งานเทอมนี้ 1 ชิ้น')
  expect((await row('gradebook', b)).items.map((i: { title: string }) => i.title)).toEqual(['ใบงาน B1'])
  expect((await row('videos', a)).items[0]).toMatchObject({ title: 'คลิปห้อง A' })
  expect((await row('videos', b)).items).toEqual([])
  expect((await row('scores', b)).items[0]).toMatchObject({ title: 'สอบย่อย 1', meta: expect.stringContaining('กรอกแล้ว 0/1') })
})
