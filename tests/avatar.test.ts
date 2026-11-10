import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { AVATAR_H, AVATAR_W, avatarConfigSchema, avatarPixels, DEFAULT_AVATAR, HAIR_COLORS, HAIR_STYLES, HEADWEAR, HEADWEAR_COLORS, JOB_IDS, JOBS, OUTFIT_COLORS, SKINS } from '../src/shared/avatar'
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
  it('ทุกอาชีพ × ผ้าคลุม/หมวก × กระโปรงยาว อยู่ในกรอบ ไม่ซ้ำช่อง', () => {
    for (const job of JOB_IDS)
      for (const headwear of HEADWEAR)
        for (const [gender, longSkirt] of [['m', false], ['f', false], ['f', true]] as const) {
          const px = avatarPixels({ ...DEFAULT_AVATAR, job, headwear, gender, longSkirt, glasses: true })
          expect(px.every(([x, y]) => x >= 0 && x < AVATAR_W && y >= 0 && y < AVATAR_H)).toBe(true)
          expect(new Set(px.map(([x, y]) => `${x},${y}`)).size).toBe(px.length)
        }
    expect(JOB_IDS.length).toBe(26)
  })
  it('ผ้าคลุมซ่อนผมและหมวกอาชีพ เห็นใบหน้า · ไม่มีแก้มแดงทับผ้า · หมวกกะปิเยาะยังเห็นผมข้าง', () => {
    const c = HEADWEAR_COLORS[3]
    const px = avatarPixels({ ...DEFAULT_AVATAR, gender: 'f', hairColor: 4, hair: 'long', headwear: 'hijab', headwearColor: 3, job: 'police' })
    expect(px.some((p) => p[2] === HAIR_COLORS[4])).toBe(false)
    expect(at(px, 5, 1)).toBe(c)
    expect(at(px, 3, 6)).toBe(c)
    expect(at(px, 5, 8)).toBe(c)
    expect(at(px, 5, 6)).toBe(SKINS[0])
    expect(at(px, 4, 5)).toBe('#1E1B2E')
    const long = avatarPixels({ ...DEFAULT_AVATAR, headwear: 'hijab_long', headwearColor: 3 })
    expect(at(long, 5, 10)).toBe(c)
    const kopiah = avatarPixels({ ...DEFAULT_AVATAR, headwear: 'kopiah', headwearColor: 0, hairColor: 4 })
    expect(at(kopiah, 5, 1)).toBe(HEADWEAR_COLORS[0])
    expect(at(kopiah, 3, 4)).toBe(HAIR_COLORS[4])
  })
  it('กระโปรงยาวไม่เห็นขา · ชุดโต๊บของชายเป็นชุดยาว', () => {
    const f = avatarPixels({ ...DEFAULT_AVATAR, gender: 'f', longSkirt: true })
    expect(at(f, 4, 16)).toBe(JOBS.student.pants)
    expect(at(f, 2, 17)).toBe(JOBS.student.pants)
    const t = avatarPixels({ ...DEFAULT_AVATAR, job: 'thobe' })
    expect(at(t, 5, 15)).toBe(JOBS.thobe.pants)
  })
  it('ตัวละครที่บันทึกก่อนมีผ้าคลุม (ไม่มีฟิลด์ใหม่) ยังอ่านได้ และได้ค่าเริ่มต้น', () => {
    const { headwear: _h, headwearColor: _c, longSkirt: _l, ...old } = DEFAULT_AVATAR
    const r = avatarConfigSchema.safeParse(old)
    expect(r.success && r.data).toEqual(expect.objectContaining({ headwear: 'none', headwearColor: 0, longSkirt: false }))
    expect(avatarConfigSchema.safeParse({ ...DEFAULT_AVATAR, headwear: 'cap' }).success).toBe(false)
  })
  it('ตรวจค่าที่ไม่มีในรายการ', () => {
    expect(avatarConfigSchema.safeParse(DEFAULT_AVATAR).success).toBe(true)
    expect(avatarConfigSchema.safeParse({ ...DEFAULT_AVATAR, skin: 9 }).success).toBe(false)
    expect(avatarConfigSchema.safeParse({ ...DEFAULT_AVATAR, job: 'hacker' }).success).toBe(false)
  })
  it('เลือกสีเสื้อ กางเกง/กระโปรง รองเท้าเองได้ · -1 = ตามชุดอาชีพ · ค่าเก่าที่ไม่มีช่องนี้ = ตามชุด', () => {
    const base = avatarPixels({ ...DEFAULT_AVATAR, job: 'student' })
    expect(at(base, 4, 10)).toBe(JOBS.student.shirt)
    expect(at(base, 3, 15)).toBe(JOBS.student.pants)
    const px = avatarPixels({ ...DEFAULT_AVATAR, job: 'student', shirtColor: 10, pantsColor: 1, shoesColor: 0 })
    expect(at(px, 4, 10)).toBe(OUTFIT_COLORS[10])
    expect(at(px, 2, 9)).toBe(OUTFIT_COLORS[10]) // แขนเสื้อ
    expect(at(px, 3, 15)).toBe(OUTFIT_COLORS[1])
    expect(at(px, 3, 18)).toBe(OUTFIT_COLORS[0])
    // กระโปรงยาวก็เปลี่ยนสีได้ · ลวดลายของอาชีพยังอยู่ (แถบสีกลางเสื้อแพทย์)
    const f = avatarPixels({ ...DEFAULT_AVATAR, gender: 'f', longSkirt: true, pantsColor: 13 })
    expect(at(f, 2, 16)).toBe(OUTFIT_COLORS[13])
    expect(at(avatarPixels({ ...DEFAULT_AVATAR, job: 'doctor', shirtColor: 1 }), 5, 10)).toBe(JOBS.doctor.accent)
    const { shirtColor: _s, pantsColor: _p, shoesColor: _h, ...old } = DEFAULT_AVATAR
    expect(avatarConfigSchema.parse(old)).toMatchObject({ shirtColor: -1, pantsColor: -1, shoesColor: -1 })
    expect(avatarConfigSchema.safeParse({ ...DEFAULT_AVATAR, shirtColor: OUTFIT_COLORS.length }).success).toBe(false)
    expect(avatarConfigSchema.safeParse({ ...DEFAULT_AVATAR, shoesColor: -2 }).success).toBe(false)
  })
})

describe('API ตัวละคร', () => {
  const db = () => getDb(env)
  beforeEach(resetDb)
  const CFG = { gender: 'f', skin: 2, hair: 'ponytail', hairColor: 3, job: 'astronaut', glasses: true }
  // ส่งแบบเดิม (ไม่มีฟิลด์ผ้าคลุม) ได้ค่าเริ่มต้นกลับมา
  const SAVED = { ...CFG, headwear: 'none', headwearColor: 0, longSkirt: false, shirtColor: -1, pantsColor: -1, shoesColor: -1 }

  it('ค่าเริ่มต้น → บันทึก → อ่านกลับ', async () => {
    const { classId } = await seedClass(db())
    const c = await studentCookie((await seedStudent(db(), classId)).id)
    expect(await json(await getJson('/api/student/avatar', c))).toEqual({ nickname: '', config: DEFAULT_AVATAR, isDefault: true })
    expect((await putJson('/api/student/avatar', { nickname: '  ฟ้าใส  ', config: CFG }, c)).status).toBe(200)
    expect(await json(await getJson('/api/student/avatar', c))).toEqual({ nickname: 'ฟ้าใส', config: SAVED, isDefault: false })
    expect((await putJson('/api/student/avatar', { nickname: 'ฟ้า', config: { ...CFG, job: 'hacker' } }, c)).status).toBe(400)
    const hijab = { ...CFG, headwear: 'hijab_long', headwearColor: 4, longSkirt: true, job: 'nurse', shirtColor: 12, pantsColor: 2, shoesColor: -1 }
    expect((await putJson('/api/student/avatar', { nickname: 'ฟ้าใส', config: hijab }, c)).status).toBe(200)
    expect((await json(await getJson('/api/student/avatar', c))).config).toEqual(hijab)
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
    expect(board.find((r: { firstName: string }) => r.firstName === 'มานี').avatar).toEqual(SAVED)
    expect(board.find((r: { firstName: string }) => r.firstName === 'ปิติ').avatar).toEqual(DEFAULT_AVATAR)
    expect(JSON.stringify(board)).not.toContain('เทพฟิสิกส์')
  })
})
