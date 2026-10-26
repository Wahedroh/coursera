import { env } from 'cloudflare:test'
import { beforeEach, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { rollCharacter } from '../src/server/points/service'
import { CHARACTERS } from '../src/shared/characters'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

async function setup() {
  const teacher = await loginTeacher()
  const { classId } = await seedClass(db())
  const a = await seedStudent(db(), classId, { firstName: 'เอ' })
  const b = await seedStudent(db(), classId, { firstName: 'บี' })
  const give = (id: string, times: number, delta = 10) =>
    Promise.all(Array.from({ length: times }, () => postJson('/api/teacher/points', { studentIds: [id], delta, reason: 'ตอบคำถาม' }, { cookie: teacher })))
  return { teacher, classId, a, b, give, ac: await studentCookie(a.id) }
}

it('progress รวม EXP/เลเวล และสร้างไข่ตามเลเวล', async () => {
  const { a, ac, give } = await setup()
  await give(a.id, 21)
  const p = await json(await getJson('/api/student/progress', ac))
  expect(p).toMatchObject({ exp: 210, level: 2, nextLevelAt: 300 })
  expect(p.eggs.map((e: { level: number; characterId: null }) => [e.level, e.characterId])).toEqual([[1, null], [2, null]])
  expect(p.history[0]).toMatchObject({ delta: 10, reason: 'ตอบคำถาม' })
  const again = await json(await getJson('/api/student/progress', ac))
  expect(again.eggs).toHaveLength(2)
})

it('เปิดไข่ได้ตัวละครจากแคตตาล็อก และเปิดพร้อมกันได้ครั้งเดียว', async () => {
  const { a, ac, give } = await setup()
  await give(a.id, 10)
  const { eggs } = await json(await getJson('/api/student/progress', ac))
  const [r1, r2] = await Promise.all([postJson(`/api/student/eggs/${eggs[0].id}/open`, {}, { cookie: ac }), postJson(`/api/student/eggs/${eggs[0].id}/open`, {}, { cookie: ac })])
  expect([r1.status, r2.status].sort()).toEqual([200, 409])
  const ok = r1.status === 200 ? r1 : r2
  expect(CHARACTERS.map((c) => c.id)).toContain((await json(ok)).characterId)
})

it('เปิดไข่ของคนอื่นไม่ได้', async () => {
  const { a, b, give } = await setup()
  await give(a.id, 10)
  const { eggs } = await json(await getJson('/api/student/progress', await studentCookie(a.id)))
  expect((await postJson(`/api/student/eggs/${eggs[0].id}/open`, {}, { cookie: await studentCookie(b.id) })).status).toBe(404)
})

it('rollCharacter ตามน้ำหนัก 60/25/12/3', () => {
  const rarity = (r: number) => CHARACTERS.find((c) => c.id === rollCharacter(() => r))!.rarity
  expect(rarity(0)).toBe('common')
  expect(rarity(0.59)).toBe('common')
  expect(rarity(0.61)).toBe('rare')
  expect(rarity(0.86)).toBe('epic')
  expect(rarity(0.98)).toBe('legendary')
  expect(CHARACTERS.filter((c) => c.rarity === 'common')).toHaveLength(8)
  expect(CHARACTERS).toHaveLength(16)
})

it('leaderboard ปิด 403 / เปิดแล้วเรียงถูก', async () => {
  const { teacher, classId, a, b, ac, give } = await setup()
  const res = await getJson('/api/student/leaderboard', ac)
  expect(res.status).toBe(403)
  expect((await json(res)).error.code).toBe('leaderboard_disabled')
  await give(a.id, 2)
  await give(b.id, 3)
  expect((await putJson(`/api/teacher/classes/${classId}/settings/leaderboard`, { enabled: true }, teacher)).status).toBe(200)
  const lb = await json(await getJson('/api/student/leaderboard', ac))
  expect(lb).toEqual([
    { rank: 1, firstName: 'บี', exp: 30, level: 0, isMe: false, avatar: expect.any(Object) },
    { rank: 2, firstName: 'เอ', exp: 20, level: 0, isMe: true, avatar: expect.any(Object) },
  ])
  expect((await json(await getJson(`/api/teacher/classes/${classId}/settings`, teacher))).leaderboardEnabled).toBe(true)
})
