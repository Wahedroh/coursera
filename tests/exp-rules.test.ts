import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '../src/server/db/client'
import { rollCharacter } from '../src/server/points/service'
import { CHARACTERS } from '../src/shared/characters'
import { getJson, json, loginTeacher, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

describe('rollCharacter ไม่ซ้ำจนครบ', () => {
  it('สุ่ม 16 ครั้งได้ครบ 16 ตัวไม่ซ้ำ ไม่ว่าเลขสุ่มเป็นอะไร · ครบแล้วสุ่มได้ทุกตัว', () => {
    for (const seed of [0, 0.5, 0.999]) {
      const owned = new Set<string>()
      for (let i = 0; i < 16; i++) owned.add(rollCharacter(() => (seed + i * 0.137) % 1, owned))
      expect(owned.size).toBe(16)
    }
    const all = new Set(CHARACTERS.map((c) => c.id))
    expect(all.has(rollCharacter(Math.random, all))).toBe(true)
  })
  it('เหลือแต่ตัวตำนาน → ได้ตัวตำนานแน่นอน', () => {
    const owned = new Set(CHARACTERS.filter((c) => c.rarity !== 'legendary').map((c) => c.id))
    expect(rollCharacter(() => 0, owned)).toBe('dragon-gold')
  })
})

it('เปิดไข่ครบ 16 ใบ ได้ตัวละครครบ 16 ตัว (16 เลเวล = 640 EXP)', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const a = await seedStudent(db(), classId)
  const ca = await studentCookie(a.id)
  for (let i = 0; i < 64; i++) await postJson('/api/teacher/points', { studentIds: [a.id], delta: 10, reason: 'ตอบคำถาม' }, { cookie })
  const p = await json(await getJson('/api/student/progress', ca))
  expect(p).toMatchObject({ exp: 640, level: 16 })
  const got = []
  for (const e of p.eggs) got.push((await json(await postJson(`/api/student/eggs/${e.id}/open`, {}, { cookie: ca }))).characterId)
  expect(new Set(got).size).toBe(16)
})

it('EXP ของงานตั้งอัตโนมัติ 30 · ครูกำหนดเองได้ (ส่งสายได้ครึ่ง)', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const a = await seedStudent(db(), classId)
  const ca = await studentCookie(a.id)
  const base = { instructions: '', attachmentKeys: [], maxScore: 10, submitMode: 'text', classIds: [classId] }
  const auto = (await json(await postJson('/api/teacher/assignments', { ...base, title: 'อัตโนมัติ', dueAt: null }, { cookie }))).ids[0]
  expect((await json(await getJson(`/api/teacher/assignments/${auto}`, cookie))).expReward).toBe(30)
  const big = (await json(await postJson('/api/teacher/assignments', { ...base, title: 'โครงงาน', dueAt: Date.now() - 1000, expReward: 50 }, { cookie }))).ids[0]
  await putJson(`/api/student/assignments/${big}/submission`, { text: 'ส่ง', imageKeys: [], clientRequestId: 'x' }, ca)
  const gb = await json(await getJson(`/api/teacher/classes/${classId}/gradebook`, cookie))
  const sub = gb.students[0].cells[big].submissionId
  await postJson(`/api/teacher/submissions/${sub}/grade`, { score: 9, comment: '', annotatedKeys: [] }, { cookie })
  expect((await json(await getJson('/api/student/exp', ca))).exp).toBe(25)
  expect((await postJson('/api/teacher/assignments', { ...base, title: 'เกิน', dueAt: null, expReward: 500 }, { cookie })).status).toBe(400)
})

it('ทบทวนคลิปถึง 70% ได้ +5 EXP คลิปละครั้ง · ดูไม่ถึงไม่ได้ · ห้องอื่นไม่ได้', async () => {
  const cookie = await loginTeacher()
  const { classId } = await seedClass(db())
  const other = (await seedClass(db())).classId
  const a = await seedStudent(db(), classId)
  const ca = await studentCookie(a.id)
  const cb = await studentCookie((await seedStudent(db(), other)).id)
  const { ids } = await json(await postJson('/api/teacher/videos', { title: 'ทบทวนบท 1', description: '', url: 'https://youtu.be/dQw4w9WgXcQ', classIds: [classId] }, { cookie }))
  const v = ids[0]
  expect((await json(await getJson('/api/student/videos', ca)))[0].rewarded).toBe(false)
  expect((await postJson(`/api/student/videos/${v}/watched`, { watchedSeconds: 60, durationSeconds: 100 }, { cookie: ca })).status).toBe(400)
  expect(await json(await postJson(`/api/student/videos/${v}/watched`, { watchedSeconds: 70, durationSeconds: 100 }, { cookie: ca }))).toEqual({ awarded: true, exp: 5 })
  expect(await json(await postJson(`/api/student/videos/${v}/watched`, { watchedSeconds: 100, durationSeconds: 100 }, { cookie: ca }))).toEqual({ awarded: false, exp: 5 })
  expect((await json(await getJson('/api/student/exp', ca))).exp).toBe(5)
  expect((await json(await getJson(`/api/student/videos/${v}`, ca))).rewarded).toBe(true)
  expect((await postJson(`/api/student/videos/${v}/watched`, { watchedSeconds: 100, durationSeconds: 100 }, { cookie: cb })).status).toBe(404)
  const hist = (await json(await getJson('/api/student/progress', ca))).history
  expect(hist[0]).toMatchObject({ delta: 5, reason: 'ทบทวนคลิป: ทบทวนบท 1' })
})
