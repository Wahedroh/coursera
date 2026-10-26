import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { AVATAR_H, AVATAR_W, avatarConfigSchema, avatarPixels, DEFAULT_AVATAR, HAIR_COLORS, HAIR_STYLES, JOB_IDS, JOBS, SKINS } from '../src/shared/avatar'
import { getDb } from '../src/server/db/client'
import { getJson, json, loginTeacher, putJson, resetDb, seedClass, seedStudent, studentCookie } from './helpers'

const at = (px: [number, number, string][], x: number, y: number) => px.find((p) => p[0] === x && p[1] === y)?.[2]

describe('avatarPixels', () => {
  it('ทุกชุดผสมกันได้ อยู่ในกรอบภาพ ไม่มีช่องซ้ำ', () => {
    for (const job of JOB_IDS)
      for (const hair of HAIR_STYLES)
        for (const gender of ['m', 'f'] as const) {
          const px = avatarPixels({ ...DEFAULT_AVATAR, job, hair, gender, glasses: true })
          expect(px.every(([x, y]) => x >= 0 && x < AVATAR_W && y >= 0 && y < AVATAR_H)).toBe(true)
          expect(new Set(px.map(([x, y]) => `${x},${y}`)).size).toBe(px.length)
        }
  })
  it('ใช้สีผิว สีผม และชุดตามที่เลือก', () => {
    const px = avatarPixels({ ...DEFAULT_AVATAR, skin: 3, hairColor: 4, job: 'firefighter', hair: 'long' })
    expect(at(px, 4, 6)).toBe(SKINS[3])
    expect(at(px, 2, 5)).toBe(HAIR_COLORS[4])
    expect(at(px, 3, 9)).toBe(JOBS.firefighter.shirt)
  })
  it('หญิงมีกระโปรงและขาเป็นสีผิว; ชายเป็นกางเกง', () => {
    const f = avatarPixels({ ...DEFAULT_AVATAR, gender: 'f' })
    expect(at(f, 2, 14)).toBe(JOBS.student.pants)
    expect(at(f, 4, 16)).toBe(SKINS[0])
    const m = avatarPixels(DEFAULT_AVATAR)
    expect(at(m, 4, 16)).toBe(JOBS.student.pants)
    expect(at(m, 2, 14)).toBeUndefined()
  })
  it('หมวกทับผม; นักบินอวกาศไม่เห็นผม; แว่นตา', () => {
    const police = avatarPixels({ ...DEFAULT_AVATAR, job: 'police' })
    expect(at(police, 5, 1)).toBe('#F2C14E')
    const astro = avatarPixels({ ...DEFAULT_AVATAR, job: 'astronaut', hairColor: 4 })
    expect(astro.some((p) => p[2] === HAIR_COLORS[4])).toBe(false)
    expect(at(avatarPixels({ ...DEFAULT_AVATAR, glasses: true }), 5, 5)).toBe('#333333')
  })
  it('ตรวจค่าที่ไม่มีในรายการ', () => {
    expect(avatarConfigSchema.safeParse(DEFAULT_AVATAR).success).toBe(true)
    expect(avatarConfigSchema.safeParse({ ...DEFAULT_AVATAR, skin: 9 }).success).toBe(false)
    expect(avatarConfigSchema.safeParse({ ...DEFAULT_AVATAR, job: 'hacker' }).success).toBe(false)
  })
})

describe('API ตัวละคร', () => {
  const db = () => getDb(env)
  beforeEach(resetDb)
  const CFG = { gender: 'f', skin: 2, hair: 'ponytail', hairColor: 3, job: 'astronaut', glasses: true }

  it('ค่าเริ่มต้น → บันทึก → อ่านกลับ', async () => {
    const { classId } = await seedClass(db())
    const c = await studentCookie((await seedStudent(db(), classId)).id)
    expect(await json(await getJson('/api/student/avatar', c))).toEqual({ nickname: '', config: DEFAULT_AVATAR, isDefault: true })
    expect((await putJson('/api/student/avatar', { nickname: '  ฟ้าใส  ', config: CFG }, c)).status).toBe(200)
    expect(await json(await getJson('/api/student/avatar', c))).toEqual({ nickname: 'ฟ้าใส', config: CFG, isDefault: false })
    expect((await putJson('/api/student/avatar', { nickname: 'ฟ้า', config: { ...CFG, job: 'hacker' } }, c)).status).toBe(400)
    expect((await putJson('/api/student/avatar', { nickname: 'ก'.repeat(21), config: CFG }, c)).status).toBe(400)
    expect((await getJson('/api/student/avatar')).status).toBe(401)
    expect((await putJson('/api/student/avatar', { nickname: '', config: CFG }, await loginTeacher())).status).toBe(401)
  })

  it('กระดานจัดอันดับแสดงตัวละครของแต่ละคน (ไม่แสดงชื่อในเกม)', async () => {
    const cookie = await loginTeacher()
    const { classId } = await seedClass(db())
    const a = await seedStudent(db(), classId, { firstName: 'มานี' })
    const b = await seedStudent(db(), classId, { firstName: 'ปิติ' })
    await putJson(`/api/teacher/classes/${classId}/settings/leaderboard`, { enabled: true }, cookie)
    const ca = await studentCookie(a.id)
    await putJson('/api/student/avatar', { nickname: 'เทพฟิสิกส์', config: CFG }, ca)
    const board = await json(await getJson('/api/student/leaderboard', await studentCookie(b.id)))
    expect(board.find((r: { firstName: string }) => r.firstName === 'มานี').avatar).toEqual(CFG)
    expect(board.find((r: { firstName: string }) => r.firstName === 'ปิติ').avatar).toEqual(DEFAULT_AVATAR)
    expect(JSON.stringify(board)).not.toContain('เทพฟิสิกส์')
  })
})
