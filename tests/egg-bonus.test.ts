import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, newId, now } from '../src/server/db/client'
import { eggs } from '../src/server/db/schema'
import { openEgg, openGift, rollBonus, rollCharacter } from '../src/server/points/service'
import { avatarBounds, avatarPixels, DEFAULT_AVATAR } from '../src/shared/avatar'
import { charactersOfSeason } from '../src/shared/characters'
import { BONUS_CHANCE, EGG_ITEMS, missingItems } from '../src/shared/eggItems'
import { getJson, json, postJson, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const db = () => getDb(env)
beforeEach(resetDb)

describe('ของแถมจากไข่', () => {
  it('โอกาส 75% · ไม่ซ้ำของที่มี · ครบทุกอย่างแล้วไม่ได้', () => {
    expect(BONUS_CHANCE).toBe(0.75)
    expect(rollBonus(() => 0.8, new Set())).toBeNull()
    const owned = new Set<string>()
    for (let i = 0; i < EGG_ITEMS.length; i++) {
      const got = rollBonus(() => ((i * 0.37) % 0.74), owned)
      expect(got).not.toBeNull()
      expect(owned.has(got!)).toBe(false)
      owned.add(got!)
    }
    expect(owned.size).toBe(EGG_ITEMS.length)
    expect(rollBonus(() => 0, owned)).toBeNull()
  })

  it('สัตว์วิเศษยังสุ่มเหมือนเดิม: ตัวลึกลับไม่อยู่ในชุดซีซัน', () => {
    for (const s of [1, 2]) expect(charactersOfSeason(s).some((c) => c.id.startsWith('secret-'))).toBe(false)
    expect(rollCharacter(() => 0.99)).toBe(rollCharacter(() => 0.99))
  })

  it('ชุดพิเศษ/อุปกรณ์ต้องมีก่อนจึงใส่ได้ · กรอบภาพขยายเฉพาะเมื่อมีของล้น', () => {
    expect(missingItems({ job: 'ninja', hand: 'sword', offhand: 'none' }, new Set(['hand:sword']))).toEqual(['ชุดนินจา'])
    expect(missingItems({ job: 'student', hand: 'none', offhand: 'none' }, new Set())).toEqual([])
    expect(avatarBounds(avatarPixels(DEFAULT_AVATAR))).toEqual({ x: 0, y: 0, w: 12, h: 19 })
    const b = avatarBounds(avatarPixels({ ...DEFAULT_AVATAR, job: 'wizard', hand: 'bow', offhand: 'shield' }))
    expect(b).toEqual({ x: -2, y: -2, w: 16, h: 21 })
  })
})

it('เปิดไข่ได้สัตว์วิเศษ + ของแถม · ไข่ที่เปิดก่อนหน้า = กล่องของขวัญ · ใส่ของที่ได้แล้วบันทึกได้', async () => {
  const { classId } = await seedClass(db())
  const s = await seedStudent(db(), classId)
  const sc = await studentCookie(s.id)
  // ไข่เก่าที่เปิดไปแล้วก่อนมีของแถม 2 ใบ + ไข่ใหม่ 1 ใบ
  await db().insert(eggs).values([
    { id: newId(), studentId: s.id, level: 1, characterId: 'owl-green', openedAt: now() - 2000, createdAt: now() - 3000 },
    { id: newId(), studentId: s.id, level: 2, characterId: 'cat-gray', openedAt: now() - 1000, createdAt: now() - 3000 },
  ])
  const fresh = newId()
  await db().insert(eggs).values({ id: fresh, studentId: s.id, level: 3, createdAt: now() })

  const r = await openEgg(db(), s.id, fresh, () => 0)
  expect(r.characterId).toBeTruthy()
  expect(r.bonus).toMatch(/^(hand|offhand|outfit|secret):/)

  let p = await json(await getJson('/api/student/progress', sc))
  expect(p.gifts).toBe(2)
  expect(p.items).toEqual([r.bonus])

  const g1 = await openGift(db(), s.id, () => 0.1)
  expect(g1.left).toBe(1)
  const g2 = await openGift(db(), s.id, () => 0.9) // ไม่ได้ของแถม
  expect(g2).toEqual({ bonus: null, left: 0 })
  expect((await postJson('/api/student/gifts/open', {}, { cookie: sc })).status).toBe(404)
  p = await json(await getJson('/api/student/progress', sc))
  expect(p.items).toHaveLength(2)
  // ตัวลึกลับไม่นับเป็นสัตว์วิเศษของชุด
  expect(p.eggs.every((e: { characterId: string }) => !e.characterId.startsWith('secret-'))).toBe(true)

  // บันทึกตัวละคร: ของที่ยังไม่มี = 400 · ของที่มีแล้วใส่ได้
  const av = await json(await getJson('/api/student/avatar', sc))
  expect(av.items).toEqual(p.items)
  const locked = await putJson('/api/student/avatar', { nickname: 'x', config: { ...DEFAULT_AVATAR, job: 'royal', hand: 'laser' } }, sc)
  const notOwned = ['outfit:royal', 'hand:laser'].filter((id) => !p.items.includes(id))
  if (notOwned.length) expect(locked.status).toBe(400)
  const [first] = p.items as string[]
  const [kind, key] = first.split(':')
  const cfg = { ...DEFAULT_AVATAR, ...(kind === 'outfit' ? { job: key } : kind === 'hand' ? { hand: key } : kind === 'offhand' ? { offhand: key } : {}) }
  expect((await putJson('/api/student/avatar', { nickname: 'x', config: cfg }, sc)).status).toBe(200)
})
